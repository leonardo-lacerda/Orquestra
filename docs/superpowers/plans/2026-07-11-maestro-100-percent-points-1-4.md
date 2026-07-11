# Plan: Maestro 100% — Points 1–4 (Install, Loop, Completion, UX)

| Field | Value |
|-------|-------|
| **Date** | 2026-07-11 |
| **Status** | Ready to implement |
| **Scope** | Orchestrator only (not code signing, not Stripe checkout UI) |
| **Related** | [Launch readiness](./2026-07-10-orchestration-launch-readiness.md), [Runtime noise](./2026-07-10-orquestra-runtime-noise-and-worker-fail.md), soak checklist |

---

## Goal

Ship Maestro such that **five consecutive runs on a packaged install** pass the bar below. That is the definition of “100%” for this plan — not infinite polish.

### Success bar (5/5 runs on packaged Win RC)

1. Crown ON → workspace has `orquestra.js`, `.orquestra/crown.json`, `CLAUDE.local.md` with Maestro instructions  
2. Agent launches with exact **Launch** command (incl. bypass flags when set)  
3. Recruit 2–3 functions → panels on canvas (or reuse)  
4. Deliverables + completion marker → `node orquestra.js wait` exit 0  
5. Reassign one fix → done (no false failed mid-permission)  
6. Quit/reopen app → at most one Maestro flag; re-arms when PTY is live  
7. Second crown = takeover (previous not Active; cascade writes results)

### Already landed (do not re-implement)

| Item | Where |
|------|--------|
| Packaged CLI path + `checkMaestroAssets` | `maestroAssets.ts`, `electron-builder.yml` extraResources |
| Fail-closed enable (assets first, `setOrquestraTerminal` last) | `terminal.ts` TERMINAL_SET_MAESTRO |
| Partial copy rollback | `partial[]` unlink on catch |
| Takeover cascade + sanitize flags | `cascadeOrchestratorWorkers`, `sanitizeMaestroFlags` |
| Paused UI when flag but PTY dead | `CanvasNode` `maestroPaused` |
| Idle requires marker + waiting-for-permission | `isWorkerIdleEligible`, `looksLikeWaitingForUser` |
| Per-AI bypass flags + Maestro popover settings | `agentPermission.ts`, `MaestroSettingsPopover.tsx` |
| Command-file E2E (recruit only) | `e2e/orchestration-command-file.spec.ts` |
| Quiet lifecycle logs | `orquestraLog.ts` |

### Still open (this plan)

Packaged soak not executed as gate; restore re-arm incomplete; loop dogfood + wait/reassign not CI-hard; completion edge cases across agents; UX/run-list/CLAUDE.local honesty gaps.

---

## Workstreams (map to points 1–4)

```
WS1  Install / packaging soak + remaining restore gaps     → Point 1
WS2  End-to-end loop reliability (wait, reassign, inject) → Point 2
WS3  Completion model (accept / marker / agents)          → Point 3
WS4  Product UX (crown, run list, CLAUDE.local)           → Point 4
```

**Merge order:** WS1 → WS2 → WS3 → WS4 (WS3 can parallelize after WS2 unit surface exists; WS4 can start UI copy anytime but ship after WS1 restore is solid).

---

# WS1 — Install, restore, lifecycle (Point 1)

## 1.1 Packaging soak (manual + checklist gate)

**Work**

1. Run `npm run package:win` on a clean tree (committed release candidate).  
2. Install to a non-dev path.  
3. Execute [maestro packaging soak checklist](../checklists/2026-07-10-maestro-packaging-soak.md) **unchecked → checked**.  
4. Record failures in the checklist “Results” section (add at bottom if missing).

**Files**

- `docs/superpowers/checklists/2026-07-10-maestro-packaging-soak.md` (results)  
- Fix only if soak fails: `maestroAssets.ts`, `electron-builder.yml`, `terminal.ts` enable path

**Verify**

- [ ] All soak “Asset resolution” + “Loop” rows green on Win RC  
- [ ] Fail-closed: rename resources CLI dir → crown does not stay Active; error in popover or terminal inject  

## 1.2 Session restore re-arm

**Problem**

UI can show `panel.maestro === true` / Paused without re-calling `terminalSetMaestro`, so watcher + CLI copies + crown.json may be stale after restart.

**Work**

1. On workspace load + when maestro panel PTY becomes live:  
   - `sanitizeMaestroFlags(wsId)` (already)  
   - If exactly one `panel.maestro` and `ptyId` alive and not already in `orquestraTerminals` (or crown.json out of sync): call `terminalSetMaestro(ptyId, true, rootPath)`.  
2. Debounce / guard against double-enable (idempotent enable is OK if fail-closed).  
3. If enable fails: set `maestroError` on panel or popover; do **not** leave silent green.

**Files (likely)**

- `src/renderer/canvas/CanvasNode.tsx` (or small hook `useMaestroRearm.ts`)  
- `src/renderer/lib/maestro/rearmMaestro.ts` (new pure-ish helper)  
- `src/renderer/lib/maestro/rearmMaestro.test.ts`  
- Optional: main IPC `orquestraIsMaestro(ptyId)` if needed to know main state

**Verify**

- [ ] Unit: sanitize keeps one flag; rearm only when PTY live  
- [ ] Manual: enable crown → quit app → reopen same workspace → start shell → crown Active + watcher receives command file  
- [ ] Manual: shell killed → Paused; new shell + rearm → Active  

## 1.3 Lifecycle harden (close / kill / takeover)

**Work**

1. Audit `disableMaestroForPanel` + `onMaestroPtyGone`: stop watcher, cascade results, clear markers.  
2. Ensure panel close of maestro calls disable **before** PTY dispose (void async + main backstop).  
3. Takeover: previous panel `maestro` cleared in renderer store (derive from main tookOverFrom or existing sanitize).  

**Files**

- `src/renderer/lib/maestro/disableMaestroForPanel.ts`  
- `src/main/ipc/terminal.ts` (`onMaestroPtyGone`, cascade)  
- `src/renderer/stores/appStore/panelSlice.ts` (close path if needed)

**Verify**

- [ ] Unit/integration: cascade writes `failed` result JSON for running workers  
- [ ] Manual: close maestro panel → no watcher poll; workers terminated with results  
- [ ] Manual: second crown → first not Active  

**WS1 done when:** soak checklist Win green + restore rearm manual path green.

---

# WS2 — End-to-end loop (Point 2)

## 2.1 Inject + launch command reliability

**Work**

1. Keep single source of launch: `resolveWorkerAgentCommand` (settings + bypass).  
2. Log only one line: `[orquestra] $ name <cmd>` (already).  
3. Harden inject timing: if `workerHasOutput` never true, still inject after MAX wait (already); add unit for timeout path.  
4. On reassign: `noteWorkerRoleInjected` + clear result file to `running` (audit `reassignExistingWorker` / `trackWorker`).  

**Files**

- `src/renderer/hooks/useOrquestra.ts`  
- `src/main/ipc/terminal.ts` (`trackWorker`, `noteWorkerRoleInjected`)  
- tests: `useOrquestra.test.ts`, `terminal.test.ts`

**Verify**

- [ ] Unit: bypass + explicit `--agent verboo` → flags present  
- [ ] Manual: Launch preview matches first line written to worker PTY  

## 2.2 Wait / results / multi-worker dogfood

**Work**

1. Confirm CLI wait schema matches `writeWorkerResultFile` (name, status, exitCode, accept).  
2. Document dogfood script: 3-worker landing page task (checklist step).  
3. Fix any wait hang (missing result on cascade/dismiss — already partially done; add test if gap).  

**Files**

- `scripts/maestro/orquestra.js` / root `orquestra.js` (keep in sync / identity test)  
- `src/main/ipc/terminal.ts` result writers  
- `docs/superpowers/checklists/2026-07-10-maestro-packaging-soak.md` (dogfood steps)

**Verify**

- [ ] Unit: onWorkerExit / onWorkerIdle write canonical JSON  
- [ ] Manual 5/5: wait exit 0 for 2–3 workers after real agent work  
- [ ] CLI tests still green: `scripts/maestro/orquestra.test.js`

## 2.3 E2E upgrade (honest)

**Work**

1. Keep A1 command-file recruit (`orchestration-command-file.spec.ts`).  
2. Add **A2b** optional: seed result files after command-file recruit → simulate wait exit 0 via CLI in e2e cwd (no real agent).  
3. Do **not** claim full agent E2E until optional tier exists; gate release on A1 + units + soak.

**Files**

- `e2e/orchestration-command-file.spec.ts`  
- optional `e2e/orchestration-wait-seeded.spec.ts`  
- `src/renderer/lib/e2eHarness.ts` if helpers needed

**Verify**

- [ ] `npm run test:e2e -- e2e/orchestration-command-file.spec.ts` green  
- [ ] CI or local script documents soak as release gate  

**WS2 done when:** inject/launch/reassign units green + dogfood multi-worker wait 0 + A1 E2E green.

---

# WS3 — Completion model (Point 3)

## 3.1 Align markers and accept

**Work**

1. Single completion token: `ORQUESTRA_WORKER_DONE` (`DEFAULT_COMPLETION_TOKEN`).  
2. Idle eligibility: prefer same token as accept when `requireCompletionMarker` (optional tighten: only count `ORQUESTRA_WORKER_DONE` / configured token, not loose `✅` alone — or keep ✅ but only re-arm if accept marker fails).  
3. `onlyMarkerBlocking` path stays: never terminal-failed solely for missing marker while files OK.  
4. Short Maestro inject only (`formatMaestroWorkerInject`) — already; keep accept line in result JSON.

**Files**

- `src/main/ipc/terminal.ts`  
- `src/shared/orchestration/accept.ts`  
- `src/shared/orchestration/accept.test.ts`, `terminal.test.ts`

**Verify**

- [ ] Unit: waiting for permission → not eligible  
- [ ] Unit: min lines without marker → not eligible  
- [ ] Unit: real work + ORQUESTRA_WORKER_DONE + file → done  
- [ ] Unit: ✅ only + file exists → still running (re-arm) if accept requires ORQUESTRA token  

## 3.2 Multi-agent matrix (manual)

**Work**

1. Matrix table in soak checklist:

| AI | Ask | Bypass launch string |
|----|-----|----------------------|
| verboo | no flag | `--dangerously-skip-permissions` |
| claude | no flag | `--dangerously-skip-permissions` |
| codex | no flag | `--dangerously-bypass-approvals-and-sandbox` |
| opencode | no flag | `--auto` |

2. One recruit each on bypass; confirm first PTY line.  
3. One reassign under permission prompt (ask mode): must stay running.

**Verify**

- [ ] Checklist matrix filled for agents you ship as “supported”  
- [ ] Unsupported custom CLI: document “no invented bypass flags”

## 3.3 Fail reason clarity

**Work**

1. Result JSON always includes `accept[]`.  
2. Maestro inject: `[orquestra] name → failed: accept=1/2 marker missing` (already short).  
3. Optional: write last fail reason into run store for crown “Run” list.

**Files**

- `terminal.ts` finalize + processNextResponse  
- `orchestrationRunStore.ts` if surfacing reason  

**Verify**

- [ ] Unit: short inject has no multiline inject dump  
- [ ] Manual: failed worker summary in Maestro is one line  

**WS3 done when:** units for idle/accept green + matrix for shipped AIs checked + no known false-fail repro.

---

# WS4 — Product UX (Point 4)

## 4.1 Crown / popover state machine

**States**

| State | Condition | UI |
|-------|-----------|-----|
| Off | `!panel.maestro` | No gear / purple crown inactive |
| Active | maestro + PTY live + main armed | Green + tip |
| Paused | maestro + PTY dead | Paused + note restart shell |
| Error | last enable failed | Red + error string |

**Work**

1. Persist last enable error on panel or module map `maestroErrorByPanelId`.  
2. Popover header already shows status; ensure Error path from `terminalSetMaestro` `{ ok:false }`.  
3. On successful rearm, clear error.

**Files**

- `CanvasNode.tsx`, `MaestroSettingsPopover.tsx`  
- `handleToggleMaestro` error handling  

**Verify**

- [ ] Manual: force ASSETS_MISSING (or mock) → Error not Active  
- [ ] Manual: recover → Active  

## 4.2 Run list honesty

**Work**

1. Run list from `orchestrationRunStore` (already).  
2. On reload: either hydrate from `.orquestra/runs/latest.json` (exists) **or** empty list with popover copy: “Run list resets; disk results under `.orquestra-results/`”.  
3. Do not show zombie `running` after restart without rearm (clear recruiting/running on sanitize load).  

**Files**

- `orchestrationRunStore.ts`  
- `useOrquestra.ts` hydrate  
- `MaestroSettingsPopover.tsx` empty-state copy  

**Verify**

- [ ] Unit: hydrate snapshot  
- [ ] Manual: reload → no false “running” badges without live workers  

## 4.3 Completion policy UX

**Work**

1. `close-on-success` already closes on accept done — document in popover completion section.  
2. Do not implement `hide` for launch (still omit).  
3. Footer copy: bypass applies next recruit only.

**Verify**

- [ ] Manual: close-on-success closes panel when status done  

## 4.4 CLAUDE.local.md safety

**Work**

1. Prefer managed block markers:

```markdown
<!-- ORQUESTRA-MAESTRO-START -->
... generated ...
<!-- ORQUESTRA-MAESTRO-END -->
```

2. Enable: replace only between markers; if no markers, write full file **once** and add markers.  
3. Disable: remove managed block only (or delete file only if entirely managed).  
4. Release note if residual risk remains.

**Files**

- `src/main/ipc/terminal.ts` (write/remove CLAUDE.local)  
- `src/main/maestro/maestroInstructions.ts` (wrap markers)  
- unit tests for splice helpers  

**Verify**

- [ ] Unit: user content outside markers preserved on re-enable  
- [ ] Unit: disable removes managed block only  

**WS4 done when:** state machine clear, run list not lying, CLAUDE.local managed, copy honest.

---

## PR breakdown (implementation order)

| PR | Scope | Depends |
|----|--------|---------|
| **PR-A** | WS1.2 rearm + WS1.3 audit fixes | — |
| **PR-B** | WS2 inject/reassign/result units + dogfood checklist updates | PR-A optional |
| **PR-C** | WS3 marker/accept tighten + fail reason | PR-B |
| **PR-D** | WS4 crown error state + run list + CLAUDE.local markers | PR-A |
| **PR-E** | WS1.1 soak evidence + WS2 E2E A2b optional + release notes | PR-A–D |

Parallel: PR-C and PR-D after PR-A.

---

## Explicit non-goals (still not “100% enterprise”)

- OS sandbox for file/network toggles  
- Remote/SSH workers  
- Real agent in Playwright (live LLM)  
- Code signing / Stripe UI  
- Linux soak as gate  
- Multi-maestro namespaces  

Document these in release notes as **not supported**.

---

## Test & release gates

| Gate | Command / action | Required |
|------|------------------|----------|
| Unit | `vitest` terminal + useOrquestra + accept + maestroAssets | Yes |
| CLI | `node scripts/maestro/orquestra.test.js` (or project test script) | Yes |
| E2E A1 | `orchestration-command-file.spec.ts` | Yes |
| Soak Win | checklist fully checked | Yes for “100%” claim |
| Dogfood | 5/5 bar at top of this doc | Yes |
| Mac soak | same checklist | If shipping Mac |
| Signing | — | Not this plan |

---

## Effort estimate (one engineer, focused)

| WS | Calendar |
|----|----------|
| WS1 | 1–2 days (rearm + lifecycle + soak) |
| WS2 | 1–2 days (dogfood fixes + tests) |
| WS3 | 0.5–1 day (units + matrix) |
| WS4 | 1 day (markers + UX) |
| **Total** | **~4–6 focused days** to claim Maestro 100% under the bar above |

---

## First implementation slice (start here)

1. **`useMaestroRearm` / rearm on PTY live** (WS1.2) — highest product gap vs existing packaging code.  
2. **`CLAUDE.local` managed markers** (WS4.4) — high user trust.  
3. **Tighten ✅ vs ORQUESTRA_WORKER_DONE** (WS3.1) — fewer false completes.  
4. **Run soak** (WS1.1) — truth on packaged path.  

---

## Appendix — Key file index

| Area | Path |
|------|------|
| Assets | `src/main/maestro/maestroAssets.ts` |
| Enable/disable | `src/main/ipc/terminal.ts` |
| Instructions | `src/main/maestro/maestroInstructions.ts` |
| Recruit/inject | `src/renderer/hooks/useOrquestra.ts` |
| Crown UI | `src/renderer/canvas/CanvasNode.tsx`, `MaestroSettingsPopover.tsx` |
| Run store | `src/renderer/stores/orchestrationRunStore.ts` |
| Accept/idle | `src/shared/orchestration/accept.ts`, `terminal.ts` idle helpers |
| Permission flags | `src/shared/orchestration/agentPermission.ts` |
| E2E | `e2e/orchestration-*.spec.ts`, `e2eHarness.ts` |
| Soak | `docs/superpowers/checklists/2026-07-10-maestro-packaging-soak.md` |
