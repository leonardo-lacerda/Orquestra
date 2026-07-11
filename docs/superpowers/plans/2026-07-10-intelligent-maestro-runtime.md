# Intelligent Maestro Runtime — Phased Implementation Plan

| Field | Value |
|-------|-------|
| **Author** | Orquestra engineering |
| **Date** | 2026-07-10 |
| **Status** | Proposed |
| **Repo** | Orquestra (`cate`) |
| **Related** | [Launch readiness](./2026-07-10-orchestration-launch-readiness.md), [Orchestration settings](./2026-07-09-orchestration-settings.md), [Linked context](./2026-07-10-linked-context-arrows.md) |
| **Inspiration** | [The Maestri — Maestro Mode](https://www.themaestri.app/pt-br/docs/maestro); industry supervisor / adaptive-plan / maker-checker patterns |

---

## Overview

Transform the Maestro from an **agent-with-orchestration-prompts** into an **app-owned orchestration runtime** where:

1. The **LLM proposes** plans and reassignment copy.
2. The **runtime authorizes** recruit/reassign/wait/dismiss, dependency order, and capacity.
3. **Done means verifiable outcomes** (files/tests), not only PTY idle.
4. **Reuse > recruit > dismiss** is enforced in code, not only in instructions.

This plan is split into **6 phases**. Each phase is shippable alone, with verifiable acceptance criteria and tests. Later phases depend on earlier ones; do not skip Phase 1–2 if the goal is a “smarter” orchestrator rather than more prompt text.

### Success criteria (end of Phase 6)

1. A multi-file request (e.g. landing + calculator) produces a **structured plan**, dispatches only **ready** tasks, and **reuses** panels instead of spawning `html-2`.
2. `wait` completes only when **acceptance criteria** pass (or explicit fail/timeout).
3. Maestro **does not** write deliverable files while a run is active (hard gate where possible; at least FS-watch warn + block path for Pi).
4. After consolidate, workers are **dismissed** (or policy-kept) without canvas spam.
5. Crown shows **run graph + slot state** and survives reload via `.orquestra/runs/`.
6. Unit + CLI tests green; one documented manual soak on Win for each released phase.

---

## Current baseline (what we already have)

| Capability | Status |
|------------|--------|
| Crown enable, CLI, watcher, recruit/dismiss | Shipped |
| Unique short roles, maxWorkers hard reject | Shipped |
| ROLE.md + single-line inject + input clear | Shipped |
| Idle ignores inject/ROLE echo; completion summaries | Shipped |
| Reuse by stable `namesMap` / `html-2` → `html` | Shipped |
| Soft capacity (done panels still count until dismiss) | Shipped |
| Dismiss guidance in instructions + wait HINT | Shipped |
| Plan as validated DAG | **Missing** |
| Accept criteria beyond idle | **Missing** |
| Settings (split/review/context) as real behavior | **Missing** (text only) |
| Run persistence | **Missing** (in-memory store) |
| Blackboard SPEC/contracts | **Missing** |
| Role templates + multi-agent presets | **Missing** |
| Hard no-self-implement for verboo | **Missing** |

---

## Architecture target

```
┌──────────────────────────────────────────────────────────┐
│  Maestro Runtime (main + renderer)                       │
│  plan.json · slot manager · verifier · policy engine     │
└────────────┬───────────────────────────▲─────────────────┘
             │ dispatch / events          │ COMPLETION / accept
┌────────────▼───────────────────────────┴─────────────────┐
│  Maestro LLM (verboo / Claude / Pi)                      │
│  propose plan · interpret failures · user-facing summary │
└────────────┬─────────────────────────────────────────────┘
             │ ROLE.md + inject / reassign
┌────────────▼─────────────────────────────────────────────┐
│  Workers (function panels) + shared blackboard           │
└──────────────────────────────────────────────────────────┘
```

**Principle:** LLM proposes; runtime authorizes. Critical “never do X” rules live in the app.

---

## Phase 0 — Harden baseline & persist session state

**Goal:** Make current orchestration reliable across reload and observable in the crown. No new DAG yet.

**Duration estimate:** 3–5 days  
**Depends on:** nothing (current main)

### 0.1 Persist orchestration run + name map

| Deliverable | Detail |
|-------------|--------|
| On-disk run snapshot | `.orquestra/runs/latest.json` (and optional `runs/<id>.json`) |
| Contents | `maestroPtyId`, `panelId → { name, role, status, workerPtyId? }`, `updatedAt` |
| Load | On workspace open / crown re-arm, hydrate `orchestrationRunStore` + `workerNamesByMaestro` |
| Write | Debounced on recruit / reassign / done / dismiss |

**Files (expected):**

- `src/renderer/stores/orchestrationRunStore.ts` — extend + hydrate API
- `src/main/maestro/runStateFile.ts` (new) or reuse `jsonStateFile` pattern
- `src/renderer/hooks/useOrquestra.ts` — load/save hooks
- Crown / popover UI that already lists workers

### 0.2 Crown UX for reuse/dismiss

| Deliverable | Detail |
|-------------|--------|
| Per worker | status, last summary snippet, actions: **Reassign**, **Dismiss** |
| Capacity line | `open/max · reusable idle · running` |
| Copy | “Same --name reuses panel; dismiss when run done” |

### 0.3 Soft release consistency

| Deliverable | Detail |
|-------------|--------|
| Invariant | Idle/done → soft release PTY only; dismiss/exit → full release |
| Prune | Closed panels removed from maps on recruit and on panel close |
| Tests | Unit tests already cover soft vs full; extend for hydrate |

### 0.4 Acceptance criteria (Phase 0)

- [ ] Reload app mid-run: crown still lists workers with correct **function names** (`html`, not OSC title).
- [ ] Recruit `--name html` after idle still **reuses** panel (no `html-2`) with hydrated maps.
- [ ] Manual dismiss from crown closes panel and frees capacity.
- [ ] Unit tests for load/save of run snapshot.

### 0.5 Out of scope (Phase 0)

- DAG, accept criteria, auto-reassign, FS gates on Maestro.

---

## Phase 1 — Structured plan (DAG) + ready-only dispatch

**Goal:** Plan becomes a **validated object**; runtime only starts tasks whose dependencies are satisfied.

**Duration estimate:** 1–2 weeks  
**Depends on:** Phase 0 (persist run)

### 1.1 Plan schema

```ts
// src/shared/orchestration-plan.ts (new)
export interface OrchestrationTask {
  id: string              // function id: html | css | js | review
  name: string            // panel name (== id by default)
  role: string            // short unique prompt (max MAX_WORKER_ROLE_CHARS)
  deps: string[]          // task ids
  status: 'pending' | 'ready' | 'running' | 'done' | 'failed' | 'skipped'
  roleTemplate?: string   // Phase 4
  accept?: AcceptCriterion[]  // Phase 2; optional empty in Phase 1
}

export interface OrchestrationPlan {
  id: string
  goal: string
  createdAt: number
  tasks: OrchestrationTask[]
  version: 1
}
```

On disk: `.orquestra/runs/<runId>/plan.json`.

### 1.2 Plan production

| Path | Behavior |
|------|----------|
| A. LLM-assisted | Maestro tool `orquestra_plan` writes JSON via CLI; or Maestro prints JSON fenced block app parses |
| B. Deterministic helper | `buildDefaultPlan(userText, settings)` for known patterns (html/css/js calculator) + generic by-task split |
| Validation | Unique ids; no dep cycles; role length; task count ≤ maxWorkers (or queue excess) |

**Prefer A+B:** helper suggests skeleton; LLM may refine; app **rejects invalid plans**.

### 1.3 Ready-only dispatch

| Event | Runtime action |
|-------|----------------|
| Plan committed | Mark tasks with `deps=[]` as `ready` |
| Task done | Unlock dependents → `ready` |
| Recruit request for non-ready task | **Reject** with message listing unmet deps |
| `orquestra_dispatch` / auto | Recruit/reassign all `ready` not yet running (respect capacity) |

### 1.4 CLI / tools

```
node orquestra.js plan --file plan.json   # validate + install plan
node orquestra.js plan-status             # print DAG statuses
node orquestra.js dispatch                # start all ready tasks
```

Extension tools (Pi): `orquestra_plan`, `orquestra_dispatch`, keep recruit as low-level escape hatch.

### 1.5 Instructions update

- Maestro **must** call plan → dispatch → wait, not free-form recruit spam.
- Soft text still describes examples; hard validation is in CLI/app.

### 1.6 Files (expected)

- `src/shared/orchestration-plan.ts` + tests
- `src/main/maestro/planStore.ts` or IPC handlers
- `orquestra.js` + `scripts/maestro/orquestra.js` cases
- `useOrquestra.ts` — gate recruit on plan readiness (optional flag `planEnforced`)
- `maestroInstructions.ts` — plan-first = plan.json
- Crown: mini list of tasks with status badges

### 1.7 Acceptance criteria (Phase 1)

- [ ] Invalid plan (cycle / dup id / role too long) rejected with clear error.
- [ ] `css` with `deps:['html']` cannot start until `html` is `done`.
- [ ] Independent tasks dispatch in parallel (fan-out).
- [ ] Plan survives reload (with Phase 0 run dir).
- [ ] Unit tests: cycle detect, ready computation, dispatch order.

### 1.8 Out of scope (Phase 1)

- File existence accepts (Phase 2 can stub `accept: []` as “idle only”).

---

## Phase 2 — Acceptance criteria & honest wait

**Goal:** A task is **done** only if outcomes pass; wait surfaces structured green/red per task.

**Duration estimate:** 1–2 weeks  
**Depends on:** Phase 1

### 2.1 Accept criterion types (v1)

```ts
type AcceptCriterion =
  | { type: 'file_exists'; path: string }
  | { type: 'file_contains'; path: string; pattern: string; flags?: string }
  | { type: 'marker'; token?: string }           // ORQUESTRA_WORKER_DONE default
  | { type: 'command'; cmd: string; cwd?: string } // later; opt-in
```

### 2.2 Verifier service

| Location | `src/main/maestro/taskVerifier.ts` |
|----------|-------------------------------------|
| Input | workspace root + criteria + optional output summary |
| Output | `{ ok: boolean, results: { criterion, ok, detail }[] }` |
| When | On idle candidate, on exit, on explicit `orquestra verify <name>` |

**Idle policy change:**

1. Idle eligible (existing inject-echo rules) **and**
2. All accept criteria pass → write result `done`  
3. Else if idle eligible but accept fail → write `failed` with diagnostic **or** leave `running` and notify Maestro to reassign (config flag)

**Recommended default:** accept fail → status `failed` + summary includes missing files → Maestro reassigns.

### 2.3 Wait output (structured)

```
WAIT_COMPLETE
TASK:html:done:accept=2/2:summary=...
TASK:css:failed:accept=0/1:missing=styles.css
HINT: reassign css · dismiss when run finished
```

JSON schema extension on `worker-*.json`:

```json
{
  "status": "failed",
  "summary": "...",
  "accept": [{ "type": "file_exists", "path": "styles.css", "ok": false }]
}
```

### 2.4 Auto-reassign (bounded)

| Rule | Value |
|------|--------|
| Max auto reassigns per task | 1 (settings later) |
| Prompt | Template: “Previous attempt failed: {accept details}. Fix only that.” |
| After max | Escalate to Maestro/user; do not infinite loop |

### 2.5 Files (expected)

- `src/main/maestro/taskVerifier.ts` + tests
- Wire into `onWorkerIdle` / `onWorkerExit` in `terminal.ts`
- `orquestra.js wait` / extension wait to print accept lines
- Plan schema: populate default accepts from role (heuristic: “Create only X” → `file_exists X`)

### 2.6 Acceptance criteria (Phase 2)

- [ ] Worker that only echoes ROLE.md never becomes `done` if `file_exists` required.
- [ ] Creating the file then marker → `done` with accept 1/1.
- [ ] Failed accept → `failed` + one auto-reassign attempt (if enabled).
- [ ] Unit tests for each criterion type; integration test with temp workspace files.

### 2.7 Out of scope (Phase 2)

- Full test runners / flaky command accept (optional flag only).
- Visual crown graph (Phase 5).

---

## Phase 3 — Policy engine (settings become real)

**Goal:** `orchestrationTaskSplitStrategy`, `reviewPolicy`, `contextPolicy` **change runtime behavior**, not only instruction strings.

**Duration estimate:** 1–2 weeks  
**Depends on:** Phase 1–2

### 3.1 Split strategy → plan skeleton

| Setting | Runtime behavior |
|---------|------------------|
| `by-file` | Parse user text / workspace hints → one task per likely artifact (html/css/js paths) |
| `by-task` | Split by conjunctions / bullet list / “e”/“and” features |
| `by-stage` | Fixed pipeline: scout → implement → test → review (subset if small ask) |
| `auto` | Heuristic: if multi-extension artifacts mentioned → by-file; else by-task; pure Q&A → 0 tasks |

### 3.2 Review policy

| Setting | Runtime behavior |
|---------|------------------|
| `never` | No review task |
| `always` | Append `review` task deps=all implement tasks; accept = checklist file or marker |
| `on-changes` | After implement wave, if git dirty / result files show edits → spawn review |

### 3.3 Context policy

| Setting | Runtime behavior |
|---------|------------------|
| `summary` | ROLE.md = role only + SPEC pointer |
| `relevant-files` | App globs/hints + attaches paths into ROLE.md “Read these files” |
| `full` | Attach clipped plan + SPEC + linked context body (bounded chars) |

### 3.4 Files (expected)

- `src/main/maestro/planBuilder.ts` — `buildPlanFromSettings(userText, settings)`
- Hook into plan tool / crown “auto-plan”
- Tests per strategy with fixture prompts
- Update settings UI copy to say “enforced by runtime”

### 3.5 Acceptance criteria (Phase 3)

- [ ] Same user prompt + different split strategies → different plan shapes (snapshot tests).
- [ ] `reviewPolicy: always` always adds a review node with correct deps.
- [ ] `contextPolicy: relevant-files` ROLE.md contains at least one path when files exist.

---

## Phase 4 — Blackboard + role templates

**Goal:** Shared contracts so multi-worker quality rises; roles become typed templates.

**Duration estimate:** 2–3 weeks  
**Depends on:** Phase 1–3

### 4.1 Blackboard layout

```
.orquestra/runs/<runId>/
  plan.json
  shared/
    SPEC.md           # goal, UX, constraints
    CONTRACTS.md      # DOM ids, file names, public APIs between workers
  workers/<name>/ROLE.md
  results/            # or keep .orquestra-results at root for CLI compat
```

| Actor | Writes |
|-------|--------|
| Runtime / Maestro LLM (once) | SPEC.md, CONTRACTS.md at plan commit |
| Workers | Only their deliverable files (+ optional notes under shared if allowed) |
| Verifier | accept results into task status |

### 4.2 Role templates (catalog)

| Template id | Default accept | Prompt skeleton |
|-------------|----------------|-----------------|
| `implement.file` | file_exists | “Only create/edit {paths}. Obey CONTRACTS.md.” |
| `review.diff` | marker + optional checklist | “Do not implement; report issues.” |
| `test.unit` | command npm test (opt-in) | “Only tests.” |
| `scout.repo` | writes SCOUT.md | “Read-only exploration.” |

CLI: `recruit --template implement.file --name html --paths index.html`

### 4.3 Agent preset per template (optional stretch)

- Settings map template → agent command (`verboo`, `claude`, …)
- Maestri-like mixed teams later

### 4.4 Acceptance criteria (Phase 4)

- [ ] New run always creates `shared/SPEC.md` + `CONTRACTS.md`.
- [ ] Worker ROLE.md always references blackboard paths.
- [ ] Template `implement.file` rejects missing paths.
- [ ] Review template tasks never get file_edits permission if settings disallow.

---

## Phase 5 — Adaptive loop + crown run graph

**Goal:** Closed-loop scheduler; crown is the source of truth UI.

**Duration estimate:** 2–3 weeks  
**Depends on:** Phase 1–4

### 5.1 Runtime loop (pseudo)

```
while run.status === 'active':
  ready = tasks.filter(pending && depsSatisfied)
  dispatch(ready)  # reassign or recruit via slot manager
  event = waitAny(timeout)
  verify(event.task)
  if fail && retries left: reassign with diagnostic
  if fail && no retries: mark failed; optionally block dependents
  if all terminal: consolidate signal → Maestro; apply dismiss policy
```

Implement as:

- Main-process **run controller** interval/event driven, **or**
- Renderer orchestration service driven by worker status IPC

Prefer **main** for authority (wait/verify already main-adjacent).

### 5.2 Slot manager (explicit module)

```
src/main/maestro/slotManager.ts
  resolveSlot(task) → reassign | recruit | queue | reject
```

Rules (locked):

1. Same function id open → reassign  
2. Else if open < maxWorkers → recruit  
3. Else if idle/done unused function → dismiss oldest unused → recruit  
4. Else queue  

### 5.3 Crown run graph UI

| Element | Behavior |
|---------|----------|
| Nodes | tasks with status colors |
| Edges | deps |
| Panel | select task → role, accept results, reassign/dismiss |
| Capacity | open/max, queue length |

Files: `src/renderer/panels/OrchestrationPanel.tsx` or crown popover expansion.

### 5.4 Dismiss policy automation

| Setting / rule | Behavior |
|----------------|----------|
| After full success | Auto-dismiss all workers of the run (opt-in setting default **on** for assisted/auto) |
| On user “keep workers” | Skip auto-dismiss |
| Manual | Always available |

### 5.5 Acceptance criteria (Phase 5)

- [ ] Failed mid-task reassign does not open a second panel.
- [ ] At capacity, new function queues or dismisses unused idle, never silent no-op.
- [ ] Crown graph matches `plan.json` after reload.
- [ ] Auto-dismiss cleans canvas after successful consolidate (when enabled).

---

## Phase 6 — Hard orchestrator isolation & multi-agent mix

**Goal:** Maestro cannot self-implement on verboo; optional multi-CLI team.

**Duration estimate:** 2–4 weeks  
**Depends on:** Phase 5 recommended (can start FS gate earlier in parallel)

### 6.1 Anti-self-implement (all agent stacks)

| Approach | Pros | Cons |
|----------|------|------|
| A. Pi tool block (existing) | Works for Pi | Not verboo |
| B. FS watch on Maestro PTY cwd | Detect writes | After-the-fact |
| C. Proxy / restricted tools | Strong | Hard with raw PTY |
| D. Separate agent panel (ACP) for Maestro | Tool control | Product shift |

**Minimum for launch of “intelligent” claim:**

1. Keep Pi block.  
2. **Watchdog:** if crown maestro process writes deliverable paths during active run → quarantine file + writeToMaestro hard warning + mark run `policy_violation`.  
3. Instructions remain as secondary layer.

**Stretch:** Maestro-only allowlist of shell commands (orquestra + read-only).

### 6.2 Multi-agent presets

- Settings: template → command  
- Recruit passes agent into existing `resolveAgentPanelType`  
- Document Maestri-like mixed team examples

### 6.3 Isolation (optional floors)

- Optional worktree per worker (git worktree) for conflict-heavy tasks  
- Align with existing worktree features in Orquestra if present  

### 6.4 Acceptance criteria (Phase 6)

- [ ] Simulated Maestro write to `styles.css` during run triggers policy path (testable without full UI).
- [ ] Review template can spawn different agent command than implement.
- [ ] No regression in Phases 0–5 tests.

---

## Cross-cutting concerns

### Testing strategy

| Layer | What |
|-------|------|
| Unit | plan validation, ready set, verifier, slot manager, reuse resolve |
| CLI | plan / dispatch / wait / dismiss flows with temp dirs |
| Integration | temp workspace: plan → dispatch → fake worker result files → wait |
| Manual soak | Win: crown + verboo landing/calculator; reuse; dismiss; reload |

### Dual CLI copies

Keep `orquestra.js` and `scripts/maestro/orquestra.js` in sync (or single source + copy on enable — prefer single source long-term).

### Compatibility

- Keep `.orquestra-results/worker-<name>.json` schema **additive** (new fields ok).  
- Old free-form recruit remains for one phase as escape hatch behind setting `orchestrationPlanEnforced: boolean` (default true after Phase 1 stabilizes).

### Settings additions (suggested)

```ts
orchestrationPlanEnforced: boolean        // default true after Phase 1
orchestrationAutoReassignMax: number      // default 1
orchestrationAutoDismissOnSuccess: boolean
orchestrationAcceptRequired: boolean      // default true after Phase 2
```

### Documentation

- Update crown onboarding step  
- Changelog per phase  
- Soak checklist under `docs/superpowers/checklists/`

---

## Phase dependency graph

```
Phase 0  Persist + crown UX
   │
   ▼
Phase 1  Plan DAG + ready dispatch
   │
   ▼
Phase 2  Accept criteria + honest wait + bounded auto-reassign
   │
   ▼
Phase 3  Policy engine (split/review/context real)
   │
   ▼
Phase 4  Blackboard + role templates
   │
   ▼
Phase 5  Adaptive loop + slot manager + run graph UI
   │
   ▼
Phase 6  Isolation + multi-agent mix
```

Phases **0** and **6.1 watchdog** can partially overlap Phase 1–2 if staffing allows.

---

## Suggested delivery trains

| Train | Phases | User-visible win |
|-------|--------|------------------|
| **T1** | 0 | Reload-safe workers; clearer crown |
| **T2** | 1 + 2 | “Smart” order + real done |
| **T3** | 3 + 4 | Policies matter; multi-worker quality |
| **T4** | 5 + 6 | Hands-off run + trustworthy maestro |

---

## Risk register

| Risk | Mitigation |
|------|------------|
| LLM produces garbage plans | Strict schema validation + deterministic fallback builder |
| Accept too strict (false fail) | Start with file_exists only; tunable |
| Accept too weak | Don’t ship “intelligent” marketing until file_exists default on |
| verboo still self-implements | Phase 6 watchdog; don’t claim hard isolation before that |
| Over-architecture | Ship Phase 1–2 before templates/floors |
| Dual orquestra.js drift | Single source or generate on build |

---

## Non-goals (this program)

- Full Maestri note physics / peer agent chat protocol (can revisit post Phase 5).  
- Replacing verboo as default agent.  
- Autonomous multi-hour unattended coding without user in the loop (HITL stay available).  
- Cloud multi-tenant orchestration.

---

## Immediate next step (execution)

When implementation starts, open **Phase 0** as the first PR train:

1. `runStateFile` + hydrate namesMap/run store  
2. Crown capacity + dismiss/reassign actions  
3. Tests + soak note  

Then **Phase 1** plan schema + validate + ready gate — the first phase that makes the orchestrator structurally smarter than prompt text.

---

## Appendix A — Default plan example (landing calculator)

```json
{
  "version": 1,
  "goal": "Landing page to sell online calculator",
  "tasks": [
    {
      "id": "html",
      "name": "html",
      "role": "Create only index.html: hero, features, calc demo, pricing, footer. Link styles.css+app.js. No CSS/JS.",
      "deps": [],
      "accept": [{ "type": "file_exists", "path": "index.html" }]
    },
    {
      "id": "css",
      "name": "css",
      "role": "Create only styles.css: modern responsive calculator landing. No HTML/JS.",
      "deps": ["html"],
      "accept": [{ "type": "file_exists", "path": "styles.css" }]
    },
    {
      "id": "js",
      "name": "js",
      "role": "Create only app.js: calculator ops + DOM wiring matching index.html contracts. No HTML/CSS.",
      "deps": ["html"],
      "accept": [{ "type": "file_exists", "path": "app.js" }]
    },
    {
      "id": "review",
      "name": "review",
      "role": "Review html/css/js consistency; list bugs; do not rewrite all files.",
      "deps": ["html", "css", "js"],
      "accept": [{ "type": "marker" }]
    }
  ]
}
```

## Appendix B — Mapping study → phases

| Study pillar | Phase |
|--------------|-------|
| Persist / observe | 0 |
| Plan DAG | 1 |
| Accept / honest done | 2 |
| Settings as policy | 3 |
| Blackboard + templates | 4 |
| Adaptive loop + slots + UI | 5 |
| Isolation + multi-agent | 6 |
