# Plan: Multi-Maestro no mesmo projeto — isolamento de controle

| Field | Value |
|-------|-------|
| **Date** | 2026-07-11 |
| **Status** | Implemented (control-plane multi-Maestro) |
| **Problem** | Orquestrador 1 interfere nos workers / injects / wait do orquestrador 2 |
| **Not the problem** | Dois agents editarem o mesmo arquivo (aceito, como multi Claude Code no mesmo tree) |
| **Not this plan** | Worktree/branch obrigatório por Maestro (rejeitado pelo produto) |
| **Related** | [Isolation incident](./2026-07-11-multi-maestro-isolation.md), [Safer isolation research](./2026-07-11-multi-maestro-safer-isolation.md) (worktree path — **not** chosen) |

---

## 1. Goal

Permitir **N Maestros (crowns) vivos no mesmo workspace / mesmo canvas / mesmo working tree**, de forma que:

1. Cada Maestro só recruta, reassign, dismiss, wait e recebe inject dos **próprios** workers.  
2. Desligar ou matar Maestro A **não** cancela o time do Maestro B.  
3. Abrir Codex / segundo terminal **sem** crown não vira dono da orquestra do outro.  
4. Workers com o mesmo `--name` (`api`) em Maestros diferentes **não** colidem em results/wait.  
5. Comportamento legado (1 crown) continua disponível via flag / migração transparente.

### Success bar (dogfood no mesmo `Lading-page`)

| # | Cenário | Pass |
|---|---------|------|
| 1 | Crown A + Crown B ao mesmo tempo, ambas Active | ☐ |
| 2 | A recruits `logger`; B recruits `logger` → 2 panels, 2 waits independentes | ☐ |
| 3 | Worker de A completa → inject **só** no terminal A | ☐ |
| 4 | A dismiss all → workers de B intactos | ☐ |
| 5 | Disable crown A mid-run B → B continua | ☐ |
| 6 | Terminal sem crown não recebe inject de workers | ☐ |
| 7 | Reload app → ambas crowns re-armam sem roubar uma à outra | ☐ |
| 8 | Flag off / single-maestro mode → comportamento atual (1 crown) | ☐ |

---

## 2. Root cause (fix model)

Hoje o controle é **global por `workspacePath`**:

```
watcherByWorkspace[root]     → 1 terminalId
crown.json                   → 1 terminalPtyId
.orquestra-commands/         → 1 fila
.orquestra-results/worker-X  → nome global
cascade on enable/takeover   → mata workers do “outro”
sanitizeMaestroFlags         → no máximo 1 panel.maestro
```

O incidente Grok+Codex: enable em B **substituiu** o watcher e **cascaded** A; injects e cmds passaram a ir para B.

**Correção:** isolar o **control plane** por **identidade de Maestro/run**, não o filesystem do repo.

---

## 3. Target architecture

### 3.1 Identidade

| Concept | ID | Lifetime |
|---------|-----|----------|
| **Maestro instance** | `maestroId` = live PTY id (como hoje) + estável `runId` (uuid) | Enquanto crown armada |
| **Run** | `runId` | Criado no arm; encerra no disable/dismiss-all-final |
| **Worker** | `(runId, functionName)` e panelId | Até dismiss/close |

`runId` é a chave de disco e de wait.  
`maestroId` (PTY) pode **rebind** dentro do mesmo `runId` se o PTY do Maestro reiniciar (sem cascade de workers de outros runs).

### 3.2 Disco (mesmo repo, paths namespaced)

```
.orquestra/
  registry.json                 # lista de runs ativos { runId, maestroPtyId, panelId, createdAt }
  runs/
    {runId}/
      crown.json                # { runId, terminalPtyId, panelId, workspacePath }
      commands/                 # cmd-*.json só deste run
      results/                  # worker-{name}.json só deste run
      workers/{name}/ROLE.md
  # legado single-file (migração):
  # crown.json, commands/, results/ → viram run "legacy" ou migrados na 1ª arm
```

**Não** criar git worktree por Maestro neste plan.

### 3.3 Main process

| Hoje | Depois |
|------|--------|
| `watcherByWorkspace[root]` | `watcherByRun[runId]` **ou** um poller por root que varre `runs/*/commands` e demuxa |
| `orquestraTerminals: Set<pty>` | Mantém; cada PTY mapeia → `runId` via `maestroRunByPty` |
| Enable → takeover se outro live | **N enable paralelos**; sem cascade cross-run |
| Cascade on disable | Só workers com `orchestratorId`/`runId` deste Maestro |
| `writeWorkerResultFile` flat | `runs/{runId}/results/worker-{name}.json` |
| Inject se pty in set | Inject se pty is maestro **and** worker.runId matches |

### 3.4 CLI `orquestra.js`

- Resolve run: env `ORQUESTRA_RUN_ID` (preferido) **ou** lookup `registry.json` pelo cwd+process (stamp no arm).  
- `recruit` / `dismiss` / `reassign` / `wait` / `status` operam **só** em `runs/{runId}/`.  
- Payload cmd: `{ cmd, args, maestroId, runId, timestamp }`.  
- Main dropa se `runId`/`maestroId` não batem com registry ativo.

### 3.5 Renderer

- `panel.maestro` + `panel.orchestrationRunId` (persistir no panel state / session).  
- **Remover** “só um maestro” de `sanitizeMaestroFlags` (virar no-op ou sanitizar só flags órfãs sem PTY).  
- `clearOtherMaestroFlags` **só** no force takeover **do mesmo run** (PTY rebind), não entre runs.  
- `useOrquestra` maps: `workerNamesByMaestro` / run store já multi-key — passar a indexar por `runId` também.  
- Connections (setas): opcional colorir por `runId` (fase UX).  
- maxWorkers: **por run** (setting global = ceiling por Maestro).

### 3.6 Instruções de agent (anti-contaminação)

- Preferir inject / system no **terminal crown**, não depender de um único `CLAUDE.local.md` global para multi.  
- Fase 1: se multi ativo, `CLAUDE.local` pode ter seção genérica **sem** “you are THE only orchestrator”; detalhes do run no ROLE / inject.  
- Extension pi: `crownActive` = existe entry no registry para este PTY, não “qualquer crown.json”.

---

## 4. Non-goals

- Worktree/branch obrigatório por Maestro.  
- Isolar edição de arquivos entre runs.  
- Nested workers redesign.  
- Multi-workspace remote orchestration.  
- Mudar permission mode / bypass flags.

---

## 5. Feature flag

```ts
// AppSettings
orchestrationMultiMaestro: boolean  // default false até dogfood
// When false: preserve single-crown busy + sanitize (current behavior)
```

Ship flag **off** em PR1–2; dogfood on; default on em PR final ou beta.

---

## 6. Workstreams e ordem

```
PR1  Data model + disk layout + migration (flag off, single run path still works)
PR2  Main: multi-run registry, watchers, results, no cross cascade
PR3  CLI orquestra.js multi-run (wait/recruit/status)
PR4  Renderer: multi crown UI, maps, no sanitize-to-one
PR5  Agent extension + CLAUDE.local honesty
PR6  Tests + e2e dogfood + flag default
```

PRs 2–4 podem overlapping após PR1 types/paths.

---

# PR1 — Foundation: run paths + migration

### Work

1. Add types:
   - `OrchestrationRunId`, `MaestroRegistryEntry`, `MaestroRegistryFile`
   - helpers: `runDirRelative(runId)`, `runResultsDir`, `runCommandsDir`, `runCrownPath`
2. Implement pure path helpers in `src/shared/orchestration/runFiles.ts` (extend existing).
3. Migration helper:
   - If legacy `.orquestra/crown.json` exists and no `runs/`, on next arm create `runId`, move commands/results if present, write registry.
4. Keep writing **also** legacy paths when `orchestrationMultiMaestro === false` for back-compat **or** always use runs/ with one run (prefer always `runs/{id}` even single — simpler long-term).

**Recommendation:** always use `runs/{runId}/` even for single Maestro; registry length 0..N. Simplifies code paths.

### Files

- `src/shared/orchestration/types.ts`
- `src/shared/orchestration/runFiles.ts` (+ tests)
- `src/shared/types.ts` — `orchestrationMultiMaestro`, panel optional `orchestrationRunId`
- `src/main/settingsFile.ts`, `DEFAULT_SETTINGS`

### Verify

- [x] Unit: path helpers round-trip (`runFiles.test.ts`)
- [x] Unit: per-run paths + registry layout (isolation + runFiles)
- [x] Single-maestro arm still creates usable layout (`runs/{runId}/` always)

---

# PR2 — Main: multi Maestro enable / cascade / inject

### Work

1. Replace `watcherByWorkspace` with:
   ```ts
   // runId → { timer?, commandsDir, terminalId, ownerWindowId, workspacePath }
   watcherByRun: Map<string, RunWatcher>
   // ptyId → runId
   maestroRunByPty: Map<string, string>
   // workspacePath → Set<runId>  (index)
   runsByWorkspace: Map<string, Set<string>>
   ```
2. **Poller:** one interval per workspace that scans `runs/*/commands/*.json` **or** one timer per run (prefer one per workspace, demux by folder — fewer timers).
3. `TERMINAL_SET_MAESTRO` enable:
   - Always create new `runId` (or resume panel.orchestrationRunId if re-arm same panel).
   - **Never** cascade other runs.
   - Rebind: only if same `runId` and old pty dead → update `terminalPtyId` in crown + map.
   - Remove `MAESTRO_BUSY` between different runs; keep busy only for **same panel** double-arm race (lock).
4. Disable / maestro exit:
   - Cascade **only** workers where `tracking.runId === thisRunId` (or orchestratorId maps to run).
5. `trackWorker` / result files: include `runId`; path under `runs/{runId}/results/`.
6. `processNextResponse`: inject only if pty still maestro for that runId.
7. Update `multiMaestroPolicy.ts`:
   - `isMaestroBusy` → only same-run re-arm conflicts, not “another maestro in workspace”.
   - Command disposition: match `(runId, maestroId)` pair.

### Files

- `src/main/ipc/terminal.ts` (large)
- `src/shared/orchestration/multiMaestroPolicy.ts` + tests
- `src/main/ipc/terminal.test.ts` — new cases multi-run

### Verify

- [x] Unit/integration: two runs same worker name → different result files  
- [x] Cascade A does not delete tracking for B (`multiMaestro.isolation.test.ts`)  
- [x] Result file for A’s worker ≠ path of B’s worker  
- [x] Policy: inject only live owner; cascade run-scoped (`multiMaestroPolicy.test.ts`) 

---

# PR3 — CLI `orquestra.js` multi-run

### Work

1. On start, resolve `runId`:
   - `process.env.ORQUESTRA_RUN_ID`
   - else read registry + match (optional: file `.orquestra/active-run` written per shell — prefer env set when Maestro launches agent / when crown arms, inject `export` or set in pty env via spawn)
2. **Critical:** when arming Maestro, ensure worker and maestro shells see `ORQUESTRA_RUN_ID` (main spawn env or write `runs/{id}/env` sourced by inject — prefer **env on terminal:create / write to crown and CLI reads crown by scanning registry for cwd**).

   Simplest robust approach for CLI:
   - `orquestra.js` reads `.orquestra/registry.json`, finds entry whose `terminalPtyId` is unknown to CLI…
   - CLI cannot know ptyId easily.
   - **Better:** write `.orquestra/runs/{runId}/crown.json` and also **workspace-relative pointer file per maestro panel is wrong**.
   - **Practical:** on recruit, renderer already uses IPC not only CLI; for CLI wait/recruit from Maestro agent:
     - Arm writes `ORQUESTRA_RUN_ID` into a small file `.orquestra/maestro-env/{hash}.json` — messy.
     - **Preferred:** `crown.json` multi-file only under runs/; CLI walks `runs/*/crown.json` and uses the one with `terminalPtyId` matching… still need pty.
     - **Best for agent-driven CLI:** when Maestro is armed, main writes `.orquestra/active/{stablePanelId}.run` or injects into shell profile — actually **set env on PTY** if runtime supports `process.setEnv` — check node-pty: often need to write `set ORQUESTRA_RUN_ID=` into shell on Windows.

   **Ship approach:**
   1. Arm writes `runs/{runId}/crown.json`.
   2. Arm does `terminalWrite` one line that is shell-noop documentation OR sets env via:
      - Windows PowerShell: `[Environment]::SetEnvironmentVariable` is process — for child cmds, write to a file `runs/{runId}/.env.run` and teach CLI:
   3. CLI: if `ORQUESTRA_RUN_ID` unset, pick **newest** run where `crown.json` mtime is latest and status active — **ambiguous with multi**.
   
   **Final:**  
   - Renderer/IPC path (useOrquestra) always passes runId in command payload (already via main stamp).  
   - For agent typing `node orquestra.js`: on arm, main writes **all** command payloads with runId; agent extension `sendCommand` reads crown from **panel-specific** path.  
   - Extension: read `registry.json` entries; for tools, require `runId` from crown file written at `.orquestra/panel-crown/{panelId}.json` mapping panel→runId.  
   - Simpler: **single file** `.orquestra/crowns/{maestroPtyId}.json` + registry; CLI accepts `--run <id>` and agents get runId in Maestro instructions inject: `Your run id is X; always pass --run X`.

3. Update Maestro instructions (`maestroInstructions.ts`): include `runId` and `node orquestra.js wait --run <id> ...`.  
4. Update `scripts/maestro/orquestra.js` + root `orquestra.js` copy source.  
5. Update `orquestra.test.js` / integration tests.

### Files

- `scripts/maestro/orquestra.js`
- `src/main/maestro/maestroInstructions.ts` (+ tests)
- `src/agent/extensions/orquestra-maestro/index.ts`
- `scripts/maestro/orquestra.test.js`

### Verify

- [x] CLI resolves `--run` / `ORQUESTRA_RUN_ID`; multi registry requires explicit run  
- [x] recruit without --run fails when multi registry length > 1  
- [x] Instructions contain run id after arm (`maestroInstructions.ts`) 

---

# PR4 — Renderer multi-crown

### Work

1. `ensureMaestroArmed`:
   - Create/resume `runId`; pass to main.
   - **Stop** calling `clearOtherMaestroFlags` for other panels (only clear if same panel re-arm).
   - On success set `panel.orchestrationRunId`.
2. `sanitizeMaestroFlags`: change to remove flags for panels with no possible PTY / dead runs; **allow many true**.
3. `CanvasNode` crown toggle: remove “take over other Maestro” confirm between different runs; keep confirm only if re-arming would replace **same** run’s dead state (optional).
4. `useOrquestra`:
   - Key maps by `runId` or maestroId consistently.
   - `onMaestroRecruit(maestroId, args)` → resolve runId from maestroId.
   - Dismiss/cascade only local run.
   - Capacity `maxWorkers` counted **per run**.
5. Session save/restore: persist `orchestrationRunId` + `maestro` on panel; re-arm each independently.
6. `disableMaestroForPanel`: end run, write terminal status failed only for that run’s workers.

### Files

- `src/renderer/lib/maestro/ensureMaestroArmed.ts` + tests  
- `src/renderer/lib/maestro/sanitizeMaestroFlags.ts` + tests  
- `src/renderer/lib/maestro/disableMaestroForPanel.ts`  
- `src/renderer/canvas/CanvasNode.tsx`  
- `src/renderer/hooks/useOrquestra.ts` + tests  
- `src/renderer/stores/orchestrationRunStore.ts` (runId field on workers)  
- session serialize if panels persist custom fields  

### Verify

- [x] sanitize after hydrate keeps both crowns (`sanitizeMaestroFlags.test.ts`)  
- [x] resolveReusableWorkerPanel does not reuse other run by title (same-name recruit)  
- [ ] Two crowns Active in UI (manual dogfood) 

---

# PR5 — Agent surface honesty

### Work

1. Pi extension: crown active iff this session’s run is in registry (pass runId via env or crown file the extension can read — write `.orquestra/runs/{id}/crown.json` and set `ORQUESTRA_RUN_ID` in agent launch if possible).  
2. `maestroInstructions`: wording “you are **a** Maestro for run {id}, not the only agent in the repo”.  
3. Avoid single global “disable all orchestration” on second arm.  
4. Optional: do not rewrite full CLAUDE.local on every arm when multi — append run block or skip if multi flag (document tradeoff).

### Files

- `src/agent/extensions/orquestra-maestro/*`  
- `src/main/maestro/maestroInstructions.ts`  
- `scripts/maestro/orquestra-skill.md`  

### Verify

- [x] Extension `resolveMaestroIdentity` + sendCommand stamp runId/per-run crown  
- [x] Multi wording in maestroInstructions (“A Maestro for ONE run”) 

---

# PR6 — Tests, e2e, flag, docs

### Work

1. Unit matrix (must-have):

| Test | Layer |
|------|--------|
| two runs two result paths same worker name | shared/main |
| cascade run A leaves B | main |
| command drop wrong runId | multiMaestroPolicy + poll |
| inject only owner | main |
| sanitize keeps two flags | renderer |
| CLI wait scoped | orquestra.test.js |

2. E2E (if harness allows two crowns):
   - arm A, arm B, command-file recruit each, assert two panels and no cross dismiss.

3. Update docs:
   - Mark worktree plan as **rejected for this product goal**.  
   - User-facing short note in Maestro popover: “Multiple crowns allowed; each owns its workers only.”

4. Dogfood checklist (manual):

```markdown
[ ] Two crowns on Lading-page canvas
[ ] Parallel logger-style tasks different goals
[ ] Kill crown A → B still waiting/running
[ ] No inject lines on non-maestro Codex terminal
```

5. Flip `orchestrationMultiMaestro` default to `true` after dogfood **or** leave false and enable in settings for beta.

### Files

- tests above  
- `docs/superpowers/plans/2026-07-11-multi-maestro-control-plane.md` (this file) status → Done  
- Settings UI toggle “Allow multiple Maestros”  

---

## 7. API / type sketch

```ts
// shared
interface MaestroRegistryEntry {
  runId: string
  maestroPtyId: string
  panelId?: string
  workspacePath: string
  createdAt: number
  updatedAt: number
}

interface MaestroRegistryFile {
  version: 1
  runs: MaestroRegistryEntry[]
}

// Worker tracking (main)
interface WorkerTracking {
  orchestratorId: string  // pty
  runId: string
  name: string
  role: string
  workspacePath: string
  // ...existing
}

// PanelState
orchestrationRunId?: string
```

```ts
// CLI
node orquestra.js recruit --run <runId> --name api --role "..."
node orquestra.js wait --run <runId> --workers api,tests --timeout 300
// If ORQUESTRA_RUN_ID set, --run optional
```

```ts
// IPC enable result
{ ok: true, runId: string, reboundFrom?: string }
// no tookOverFrom cross-run
```

---

## 8. Risk register

| Risk | Mitigation |
|------|------------|
| CLI without runId in multi | Fail closed with message; instructions always include runId |
| Legacy scripts hardcode results dir | Migration + dual-read one release |
| CLAUDE.local still confuses non-maestro agents | PR5 wording; crown-gated extension |
| maxWorkers double-count | Count per runId only |
| Session restore two flags race | Re-arm serialized per panel; registry file lock |
| E2E flake | Prefer unit for cascade; one e2e smoke |

---

## 9. Implementation order (checklist for executor)

- [x] PR1 paths + types + settings flag  
- [x] PR2 main multi-run (core fix)  
- [x] PR3 CLI  
- [x] PR4 renderer crowns  
- [x] PR5 agent copy  
- [x] PR6 tests + automated isolation suite (manual dogfood optional) 

**Do not** implement worktree-per-maestro in this plan.  
**Do not** keep workspace-global takeover as default.

---

## 10. Definition of done

1. Success bar §1 all checked on real app.  
2. Unit tests for cascade isolation and result path isolation green in CI.  
3. Flag documented; single-maestro mode still works.  
4. This plan status → **Done** with link to PRs/commits.

---

## 11. One-sentence product promise

> **Vários Maestros no mesmo projeto e no mesmo canvas; cada um só controla os próprios workers — como várias sessões Claude no mesmo repo, sem um rádio roubar o time do outro.**
