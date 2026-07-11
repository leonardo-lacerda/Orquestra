# Plan: Maestro pool + task queue (reassign-first)

| Field | Value |
|-------|-------|
| **Date** | 2026-07-11 |
| **Status** | Implemented (pool + queue + reassign-first) |
| **Problem** | Maestro opens one terminal per subtask → 6–12 PTYs, freeze, double-recruit |
| **Product goal** | Fixed worker **pool** (≤ maxWorkers, default 4) + **task queue**; same terminal runs next work via reassign |
| **Related** | [Multi-Maestro control-plane](./2026-07-11-multi-maestro-control-plane.md) (isolation stays; this plan is *how one Maestro uses workers*) |
| **Incident** | Lading-page dogfood: health prompt → recruits `core/test-docs/health/runner/tests/docs` each ×2, app unusable |

---

## 1. Goal

Change orchestration from **“one function = one new panel forever”** to:

1. **Pool** of at most `orchestrationMaxWorkers` live worker terminals per run (default **4**).  
2. Maestro plans a **task backlog**, not a 1:1 map of tasks → panels.  
3. Free slot → **reassign** next task; only **recruit** when pool has free capacity and name is new.  
4. At capacity with a new task → **enqueue** (system remembers), never open a 5th panel.  
5. Same `--name` already open → **always reassign**, never second panel.  
6. Burst / double CLI+extension recruit → **dedupe**, no duplicate panels.  
7. Multi-Maestro isolation unchanged: each run has its own pool + queue.

### Success bar (dogfood)

| # | Cenário | Pass |
|---|---------|------|
| 1 | Prompt “health detalhado” com maxWorkers=4 → **≤4** panels de worker abertos | ☐ |
| 2 | Plano com 6 tasks → 1–2 recruits + reassigns; backlog drenado | ☐ |
| 3 | `recruit` mesmo name 2× em <1s → 1 panel, 2ª vira reassign ou drop | ☐ |
| 4 | 4 slots cheios + 5ª task nova → queued, inject no Maestro; worker done → auto ou Maestro reassign | ☐ |
| 5 | Instruções do crown falam pool/fila, não “1 function = 1 terminal” | ☐ |
| 6 | Multi: run A pool cheio não bloqueia run B | ☐ |
| 7 | Flag/single path: maxWorkers=1 ainda serial via reassign | ☐ |

---

## 2. Root cause (mental model errado)

### O que o agent faz hoje

```
user prompt detalhado
  → PLAN com 6 “functions”
  → recruit ×6 (e CLI+tool ×2)
  → 12 PTYs / freeze
```

Instruções atuais reforçam: *“One worker = one FUNCTION”* e *recruit all planned names*, depois wait.  
`reassign` existe, mas é plano B.  
`resolveSlot` já devolve `queue`, mas o handler **só recusa** com mensagem — não enfileira de verdade.

### Modelo alvo

```
user prompt
  → TASKS ordenadas (+ deps)
  → K = min(maxWorkers, parallel independent work)   // often 1–2
  → recruit only K stable slots
  → loop: wait free → reassign next task → until backlog empty
  → consolidate
```

```
┌──────────────┐     recruit (≤K)      ┌─────────────┐
│ Task backlog │ ───────────────────► │ Worker pool │
│ t1 t2 t3 …   │ ◄── reassign when    │ w1…wK       │
│              │     slot free         │ max=4       │
└──────────────┘                       └─────────────┘
```

---

## 3. Design decisions

### 3.1 Pool vs function panels

| Concept | Meaning |
|---------|---------|
| **Slot** | Open worker panel + PTY (`impl`, `tests`, or stable `w1`…`w4`) |
| **Task** | Queue item: `{ id, name, role, deps?, status }` |
| **maxWorkers** | Hard size of pool, **not** “how many to open” |

Default `orchestrationMaxWorkers = 4` **stays**. Soft guidance in instructions: open **1–2** unless true parallelism.

### 3.2 Dispatch policy (new setting, optional)

```ts
// AppSettings
orchestrationDispatchMode: 'pool_queue' | 'legacy_function_panels'
// default: 'pool_queue'
```

- **`pool_queue`** (ship default): reassign-first, enqueue at capacity, anti-burst.  
- **`legacy_function_panels`**: previous behavior for rollback (still honor maxWorkers hard cap).

### 3.3 Where the queue lives

**Per run** (same multi-Maestro layout):

```
.orquestra/runs/{runId}/
  queue.json          # NEW — pending tasks for this Maestro
  plan.json           # existing / extend — full plan with deps
  results/…
  crown.json
```

```ts
// queue.json
{
  version: 1,
  runId: string,
  updatedAt: number,
  items: Array<{
    id: string           // uuid or stable hash(name+role+ts)
    name: string         // function / ownership label
    role: string
    status: 'queued' | 'dispatched' | 'cancelled'
    enqueuedAt: number
    source?: 'recruit_overflow' | 'maestro_plan' | 'dedupe_coalesce'
  }>
}
```

Also keep in-memory + `latest.json.queue` (task ids) for UI later — disk is source of truth for crash/reload.

### 3.4 Slot algorithm (shipped pure functions)

Extend / lock `resolveSlot` + new helpers:

| Event | Decision |
|-------|----------|
| recruit, name matches open slot | **`reassign`** that panel |
| recruit, name new, `open < max` | **`recruit`** |
| recruit, name new, `open === max`, idle/done unused exists | **`dismiss_then_recruit`** *or* prefer **`reassign` idle slot** (prefer reassign idle over dismiss) |
| recruit, name new, all slots busy | **`enqueue`** (persist + tell Maestro) |
| recruit duplicate (same name+role, < N ms) | **`drop_duplicate`** |
| worker → done/failed | **`drain_queue`**: if queue head ready, auto-reassign free slot (phase 2) |

**Prefer reassign idle/done slot to a new task name** over dismiss+new panel (keeps agent warm, less spawn cost).

### 3.5 Atomic capacity (anti-burst)

Problem: 6 recruits in the same tick all see `openCount=0`.

Fix:

- Per-maestro **reservation counter** (or Set of `pendingRecruitKeys`) incremented **synchronously** when a recruit is accepted, before async panel create.  
- Count: `livePanels + pendingReserves`.  
- Release reserve when panel tracked or recruit fails.  
- Unit-test: 6 parallel `decideRecruit` with max=4 → 4 accept + 2 queue.

### 3.6 Dedupe

Key: `normalize(name) + '|' + normalizeRoleKey(role)` within window **2s** (or until previous finished routing).

- Second hit → log + inject “already recruiting X” / coalesce into reassign if panel already up.  
- Applies to both CLI command files and extension `sendCommand` path after demux (main or renderer — pick one choke point: **renderer onMaestroRecruit** is enough if all cmds land there).

### 3.7 Maestro instructions (behavior contract)

Rewrite STEP 0–2 in `maestroInstructions.ts`:

1. Plan **TASKS** (ordered backlog), not “one terminal per row”.  
2. Choose **pool size K** = min(maxWorkers, #independent parallel tracks); default bias **1–2**.  
3. Recruit **only K** stable names.  
4. Drain: `wait` → `reassign` free → next task.  
5. Never open a panel just to fill maxWorkers.  
6. If system says queued → do not invent new names to bypass; wait for free slot.  

Remove / replace HARD line: *“One worker = one FUNCTION (file/ownership boundary)”* → *“One **task** = one ownership boundary; one **slot** may run many tasks over time via reassign.”*

### 3.8 Soft target vs hard max

| | |
|--|--|
| Hard | `maxWorkers` — never more open panels |
| Soft | Instructions + optional `orchestrationPreferredPoolSize` (default 2) — agent guidance only in phase 1 |

Phase 1: soft via copy only. Phase 2 optional setting.

---

## 4. Non-goals

- Worktree per worker / per task.  
- Changing multi-Maestro run isolation (already shipped).  
- Full visual queue UI (phase 3 only: status line / badge).  
- Auto-splitting user prompts with a separate planner model (Maestro agent still plans).  
- Killing maxWorkers default away from 4.  
- Nested workers redesign.

---

## 5. Workstreams (PRs)

```
PR1  Policy + pure decision layer (slot, queue, dedupe, reserve) + tests
PR2  Wire recruit/reassign path: enforce reassign-first, enqueue, atomic reserve
PR3  Queue persistence per run + drain on worker done (auto-reassign optional flag)
PR4  Maestro instructions + CLI help + extension tool descriptions
PR5  Dogfood + metrics logs + docs; optional UI badge
```

PRs 1→2 sequential; 3 after 2; 4 can overlap 2–3; 5 last.

---

# PR1 — Pure policy layer

### Work

1. Add `src/shared/orchestration/poolQueuePolicy.ts` (or extend `slotManager.ts`):

```ts
export type RecruitDisposition =
  | { action: 'reassign'; panelId: string; functionName: string }
  | { action: 'recruit'; functionName: string }
  | { action: 'reassign_idle'; panelId: string; functionName: string } // rename slot to new task
  | { action: 'enqueue'; functionName: string; reason: 'at_capacity' }
  | { action: 'drop_duplicate'; functionName: string }
  | { action: 'reject'; reason: string }

export function disposeRecruit(input: {
  requestedName: string
  role: string
  openPanels: SlotPanel[]          // include status + lastActivity?
  maxWorkers: number
  pendingReserves: number          // in-flight recruits not yet in openPanels
  recentKeys: ReadonlySet<string>  // dedupe window
  dedupeKey: string
  preferReassignIdle: boolean      // default true in pool_queue
}): RecruitDisposition
```

2. Rules order:  
   duplicate → reassign same name → recruit if `open+pending < max` → reassign idle/done → enqueue.

3. `formatRecruitDisposition` for Maestro messages (PT/EN as today: English injects OK).

4. Unit matrix in `poolQueuePolicy.test.ts` / extend `slotManager.test.ts`.

### Files

- `src/shared/orchestration/slotManager.ts` (or new `poolQueuePolicy.ts`)  
- `src/shared/orchestration/types.ts` — extend `SlotDecision` if needed  
- tests alongside

### Verify

- [ ] max=4, 0 open, 6 dispose calls with pending increment simulation → 4 recruit + 2 enqueue  
- [ ] same name open → always reassign  
- [ ] duplicate key → drop_duplicate  
- [ ] all busy, no idle → enqueue  

---

# PR2 — Wire renderer recruit path

### Work

1. `useOrquestra` `onMaestroRecruit`:

   - Build `openPanels` + `pendingReserves` for this `maestroId`.  
   - Call `disposeRecruit` (not half-used `resolveSlot` only).  
   - **`reassign` / `reassign_idle`**: call existing `reassignExistingWorker` (or inject path); do **not** `createTerminal`.  
   - **`recruit`**: reserve++, create panel, track, reserve-- on settle.  
   - **`enqueue`**: append `queue.json` + inject clear message:  
     `[orquestra] Queued "docs" (pool 4/4). Will run when a worker finishes — or reassign a free name.`  
   - **`drop_duplicate`**: soft message, no panel.  
   - Remove path that allows parallel same-name panels (guard already partial — make absolute).

2. Race: use module/ref Map `recruitReserveByMaestro: Map<maestroId, number>` updated sync before any await.

3. When `slot.action === 'queue'` today only warns — replace with real enqueue.

4. `dismiss_then_recruit`: prefer **reassign_idle** first (rename function in namesMap + new role) so we don't tear down warm agents.

### Files

- `src/renderer/hooks/useOrquestra.ts`  
- `src/renderer/stores/orchestrationRunStore.ts` — optional queue fields  
- tests: pure dispose + integration-style with mocked store if feasible

### Verify

- [ ] Simulated burst of 6 recruits max=4 → ≤4 createPanel calls  
- [ ] Second recruit same name → reassignExistingWorker once  
- [ ] Dogfood log: no double `core` panels  

---

# PR3 — Persist queue + drain

### Work

1. Path helpers: `runQueuePathRelative(runId)` in `runFiles.ts`.  
2. Main or renderer write/read `queue.json` (prefer **renderer** if recruit already there; main if want CLI `orquestra queue list` — renderer first is OK).  
3. On worker status **done** / **failed** (from `onOrquestraWorkerStatus` or noteWorkerDone):

   - If `orchestrationAutoDrainQueue !== false` (default **true** under pool_queue):  
     - Pop first `queued` item whose deps satisfied (or no deps).  
     - `reassign` free slot (prefer slot that just finished).  
   - Else: only inject Maestro “queue head ready; reassign X”.

4. CLI (optional small):

   - `orquestra queue` / `orquestra status` shows `queued: n` + names.  
   - `orquestra recruit` when enqueued prints `queued` exit 0 (not error).

5. Plan file: if Maestro writes plan via existing plan path, sync task list → queue items on first recruit wave (nice-to-have; can be PR3.1).

### Files

- `src/shared/orchestration/runFiles.ts`  
- `src/renderer/hooks/useOrquestra.ts` (drain)  
- `scripts/maestro/orquestra.js` (+ root copy)  
- `src/shared/types.ts` — `orchestrationAutoDrainQueue?: boolean` (default true)

### Verify

- [ ] queue.json grows at capacity, shrinks on drain  
- [ ] Worker done with non-empty queue → next task injected without new panel  
- [ ] Multi-run: queue paths under different runIds  

---

# PR4 — Agent surface (instructions + tools)

### Work

1. Rewrite `buildMaestroInstructions` sections STEP 0–2 + capacity wording (see §3.7).  
2. Extension `orquestra-maestro` tool descriptions: recruit = “open slot or queue”; prefer reassign.  
3. Skill markdown (`scripts/maestro/orquestra-skill.md` if present): pool/queue examples.  
4. Settings UI: short description under Max workers: *“Pool size. Tasks queue when full; workers are reused via reassign.”*  
5. Optional: `orchestrationDispatchMode` toggle Advanced only.

### Files

- `src/main/maestro/maestroInstructions.ts` (+ tests if snapshot strings)  
- `src/agent/extensions/orquestra-maestro/*`  
- `src/renderer/settings/OrchestrationSettings.tsx` / i18n  
- skill docs

### Verify

- [ ] Arm crown → instructions contain “pool”, “reassign”, “queue”, no “one worker = one function forever”  
- [ ] Preferred example uses reassign loop  

---

# PR5 — Dogfood, telemetry, polish

### Work

1. Dogfood Lading-page with **same** detailed health prompt; capture counts.  
2. Log lines: `[orquestra] pool 2/4 recruit|reassign|enqueue|drain name=… run=…`  
3. Optional canvas badge on Maestro node: `2 run · 1 q` (minimal).  
4. Update this plan checkboxes + short note in multi-maestro plan “worker usage model”.  
5. Document risk: agent may still open K=4 with weak tasks — soft preferred pool size if needed.

### Verify (manual)

- [ ] Health prompt ≤4 workers, completes via reassign  
- [ ] Logger + health dual Maestro still isolated  
- [ ] App stays responsive  

---

## 6. Message copy (inject to Maestro)

| Event | Message |
|-------|---------|
| reassign | `[orquestra] Reusing worker "{name}" (pool {n}/{max}).` |
| enqueue | `[orquestra] Queued "{name}" — pool full ({n}/{max}). Free a worker or wait; do not recruit under a new name to bypass.` |
| drop_duplicate | `[orquestra] Ignored duplicate recruit for "{name}".` |
| drain | `[orquestra] Drained queue → reassigned "{name}" on free slot.` |
| at cap reject (legacy) | keep current text only if mode=legacy |

---

## 7. Settings summary

| Key | Default | Notes |
|-----|---------|-------|
| `orchestrationMaxWorkers` | `4` | unchanged hard ceiling |
| `orchestrationDispatchMode` | `'pool_queue'` | new |
| `orchestrationAutoDrainQueue` | `true` | new; drain on worker done |
| `orchestrationPreferredPoolSize` | `2` | optional PR4/5; instructions only if not wired hard |

---

## 8. Test matrix (must pass before claim done)

| Test | Layer |
|------|--------|
| dispose: 6 burst max 4 → 4 recruit + 2 enqueue | pure |
| same name → reassign | pure + recruit handler |
| dedupe window | pure |
| openCount includes pendingReserves | pure / unit |
| queue.json write/read round-trip | fs unit |
| drain assigns next role to finished panel | unit with mocks |
| multi-run queues isolated | unit paths |
| instructions snapshot contains pool/queue rules | string test |

---

## 9. Rollout

1. Land PR1–2 behind default `pool_queue` (no flag off unless regression).  
2. Internal dogfood one day.  
3. PR3 auto-drain on.  
4. If agent still opens 4 useless slots: tighten preferred pool + reject “filler” names in guard (follow-up).

---

## 10. Risks

| Risk | Mitigation |
|------|------------|
| Agent invents new names to bypass queue | Inject forbids; same-capacity still enqueue; instructions HARD |
| Reassign into busy agent mid-tool | Only reassign when status done/failed/idle (existing wait contract) |
| Auto-drain surprises Maestro | Message on drain; setting to disable |
| Idle reassign renames function, confuses wait --workers oldname | Wait accepts panel’s current name; Maestro uses stable slot names (`w1`) *or* wait by current name after reassign |
| Double path CLI+extension | Dedupe keys in recruit handler |

**Wait naming tip for instructions:** prefer stable slot ids (`w1`, `w2`) and put ownership in `--role`; **or** reassign keeps `--name` as task label and wait uses latest names from `status`. Prefer **stable slot names** (`w1`…`wK`) in pool_queue mode for simpler wait loops.

---

## 11. Recommended slot naming (pool_queue)

```
recruit --name w1 --role "Implement health module + types in src/lib/health-status.ts"
wait --workers w1
reassign w1 --role "Add CLI/HTTP runner on 8787"
wait --workers w1
reassign w1 --role "Unit test failing check → degraded/down"
…
```

Parallel only when independent:

```
recruit w1 --role "…"
recruit w2 --role "…"   # only if no file overlap / no deps
wait --workers w1,w2
```

---

## 12. Implementation order (checklist)

- [x] PR1 pure `disposeRecruit` + tests  
- [x] PR2 wire useOrquestra + reserves + reassign_idle  
- [x] PR3 queue.json + drain  
- [x] PR4 instructions / settings defaults  
- [ ] PR5 dogfood Lading-page manual (optional; unit suite is gating) 

**Estimate:** PR1–2 = core fix for freeze (1–2 days); PR3–4 = product feel; PR5 = prove.

---

## 13. Out of scope follow-ups

- Smart planner that caps tasks before agent  
- Shared global pool across Maestros (rejected — multi-Maestro isolation)  
- Cost/token budgets per run  
- Killing workers that are “idle too long” automatically beyond dismiss unused  

---

## 14. One-line product statement

> **Workers are a small reusable pool; work is a queue of tasks. Reassign is the default; recruit is rare; a fifth terminal is a bug.**
