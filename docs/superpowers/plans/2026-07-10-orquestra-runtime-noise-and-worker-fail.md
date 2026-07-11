# Plan: Orquestra runtime noise, path errors, and false worker failures

| Field | Value |
|-------|-------|
| **Date** | 2026-07-10 |
| **Status** | Proposed |
| **Repo** | Orquestra (`cate`) |
| **Related** | Intelligent Maestro Runtime plan; `useOrquestra` hydrate/persist; `terminal.ts` worker finalize |

---

## Overview

During a real Maestro run (landing-page workspace under `Downloads\Lading-page`), work **does execute**, but the console and Maestro UI are flooded with errors that look like product failures. Separately, worker `js` shows **completed** then **failed** after reassign, which confuses the orchestrator.

This plan covers **diagnosis, fixes, and verification** for every signal the user reported.

---

## Observed symptoms (user report)

| # | Symptom | Example |
|---|---------|---------|
| A | `fs:readFile` ENOENT spam | `...\Lading-page\.orquestra\runs\latest.json` |
| B | `fs:stat` Access denied | path `"\Downloads\ladings\orquestra.js"` outside allowed directories |
| C | Worker `js` → completed, then reassign → **failed** | Maestro UI “Interjected” + `Task failed ... exit 1` |
| D | Noise log | `Project state saved to ...\.orquestra` |
| E | Maestro flooded with Interjected worker summaries + reassign notices | PTY inject of completion + reassign text into Maestro stdin |

Tasks still run (image shows reassign + wait continuing) — these are **reliability / observability** bugs, not total blockage.

---

## Root-cause analysis

### A. ENOENT on `latest.json` (expected missing file logged as error)

**Cause:**

1. `useOrquestra` hydrates / `loadActivePlan` / `persistOrchestrationSnapshot` call `fsReadFile` on  
   `.orquestra/runs/latest.json`.
2. File is **optional** until the first persist or `orquestra plan`.
3. Main `FS_READ_FILE` uses `wrapHandler`, which **always** `log.error` + rethrows.
4. Electron also prints `Error occurred in handler for 'fs:readFile'`.

**Not a broken workspace** — first-run / no-plan is normal.

**Fix direction:** treat optional snapshot read as soft-miss (no error log, return `null`); only write creates the path; never call read before ensure/exist check without soft handling.

### B. Access denied: `\Downloads\ladings\orquestra.js`

**Cause (high confidence):**

- Path is **not absolute with drive** (`\Downloads\...` not `C:\Users\Leo\Downloads\...`).
- Likely someone (agent, explorer, or path join) resolved a **relative** or **truncated** path (`ladings` vs `Lading-page`).
- `validatePathStrict` correctly rejects paths outside workspace roots.

**Fix direction:**

1. Find who stats `orquestra.js` (file tree, agent tools, session restore, open-file).
2. Ensure all FS IPC paths are **workspace-rooted absolute** (normalize via `path.resolve(workspaceRoot, rel)`).
3. Soft-fail / ignore optional `orquestra.js` probes outside root (CLI lives in workspace root when crown enabled — path must be `<root>/orquestra.js`).
4. Unit test: reject malformed drive-less absolute Windows paths in validation or normalize them only when under allowed roots.

### C. Worker completed then failed on reassign

**What the UI shows:**

1. Interjected: worker `js` **completed** (confirm `app.js` final + DONE).
2. Reassign notice injected into Maestro.
3. Later: worker `js` **failed** with summary that still contains **inject/echo fragments** (“You are the js worker… Waiting for permission… Update(app.js)”).
4. Maestro `wait` exits 1 → “Task failed”.

**Likely mechanisms (ordered):**

| Mechanism | Why it fits |
|-----------|-------------|
| **Accept gate fails** | `inferAcceptFromRole` may require a file path; reassign role is a **short fix** (“change class X to Y”) with no filename → only marker; if marker not in **meaningful** lines (filtered as echo/instruction) → `failed` |
| **Idle too early on reassign** | After reassign inject, buffer may still have old DONE + new inject echo → eligibility/marker path flaky; finalize runs with insufficient real work |
| **Process exit non-zero** | Agent CLI exits 1 mid-task; finalize marks failed even if partial edit |
| **False fail then real work** | Status `failed` written while agent still working (permission wait) |

**Fix direction:**

1. On **reassign**, reset worker tracking cleanly (clear buffer, new inject fingerprint, status `running`, wipe/overwrite result file to `running`).
2. Accept criteria for reassign: if role has **no file path**, use **marker-only** OR skip file_exists; do not fail solely because inject mentioned a path from a previous task.
3. Do not finalize idle until **post-inject** real work after `roleInjectedAt` (already partially done — audit reassign path uses `noteWorkerRoleInjected` + empty buffer).
4. Surface **clear fail reason** to Maestro: `accept=...` only, not dump of inject text; keep Interjected summary short.
5. Optional: after failed accept with agent still alive, status `running` + retry instead of terminal failed (policy flag).

### D. `Project state saved to ...`

**Cause:** `projectWorkspaceStore.ts` uses `log.debug('Project state saved to %s', ...)`.  
User log level includes debug → spam on every autosave.

**Fix:** remove or demote to trace / silence in production; never log full path on success at info/debug for routine saves.

### E. Maestro “Interjected” flood

**Cause:** `processNextResponse` in `terminal.ts` **PTY-writes** full worker summaries into the Maestro terminal (`[WORKER→ORQUESTRADOR]...`). Agent UIs show that as Interjected. Combined with `writeToMaestro` reassign notices, the Maestro context is polluted and may re-trigger tools.

**Fix direction:**

1. Prefer **short** status lines to Maestro (name + done/failed + one-line accept), not full summary dump.
2. Or: file-only completion (`.orquestra-results`) and only inject when Maestro is waiting (opt-in).
3. Reassign confirmation: log to console `[worker]` only; avoid double inject (result inject + reassign inject) within same second without delay.

---

## Implementation plan (phased)

### Phase 1 — Silence expected FS misses (ENOENT / optional snapshot)

**Work items**

1. Add `fsReadFileOptional` **or** change optional reads to:
   - `fsStat` / exists check that returns false without error, **or**
   - IPC that returns `null` on ENOENT without `log.error`.
2. Preferred minimal change: in `filesystem.ts` `FS_READ_FILE`, if error is ENOENT, rethrow a typed soft miss **or** return `null` and document; wrapHandler should **not** log ENOENT at error level for optional channels.
3. Safer split: new channel `FS_READ_FILE_IF_EXISTS` → returns `string | null`, logs nothing on missing.
4. Point `loadActivePlan` / hydrate / persist pre-read at the soft API.
5. Ensure first `persistOrchestrationSnapshot` **mkdir** parent dirs (write path already should).

**Files**

- `src/main/ipc/filesystem.ts`, `handlerError.ts` (or new soft wrapper)
- `src/preload/index.ts`, `electron-api.d.ts`
- `src/renderer/hooks/useOrquestra.ts`

**Verify**

- [ ] Unit: soft read missing file → `null`, no `log.error` call.
- [ ] Manual: open workspace with no `.orquestra/runs/` → crown hydrate → **zero** ENOENT spam in console.
- [ ] After first recruit → `latest.json` exists; subsequent reads quiet.

---

### Phase 2 — Fix bad path / Access denied on `orquestra.js`

**Work items**

1. Reproduce: log stack/caller when validatePath fails for `orquestra.js` (temporary debug) or search for relative `orquestra.js` joins.
2. Normalize: any workspace-relative file must use `path.join(workspaceRoot, 'orquestra.js')` with **absolute** root.
3. Reject or repair paths matching `/^\\(?![\\?])/` on Windows (drive-less absolute) before validate — map only if under a known allowed root.
4. File tree / agent open: if path outside workspace, show soft UI error once, not stack spam.

**Files**

- Call sites that `fsStat`/`fsRead` `orquestra.js`
- `pathValidation.ts` (optional guard + clearer message)
- File explorer open logic if relevant

**Verify**

- [ ] Unit: drive-less `\Downloads\...` does not produce repeated uncaught handler spam (either normalize under root or fail once cleanly).
- [ ] Manual: Maestro run in `Downloads\Lading-page` → no Access denied for `\Downloads\ladings\orquestra.js`.
- [ ] Crown-enabled workspace: `<root>/orquestra.js` is readable when present.

---

### Phase 3 — Honest reassign completion (false failed)

**Work items**

1. **`reassignExistingWorker` / trackWorker on reassign**
   - Reset tracking: new empty buffer, new `roleInjectedAt`, new inject fingerprint, result file `status: running`.
2. **`inferAcceptFromRole` for reassign**
   - Prefer explicit accept from ROLE.md / reassign args.
   - If no path in role → marker-only (or real-work lines ≥ N without requiring file).
3. **`finalizeWorkerCompletion`**
   - Require post-inject real work; ignore prior task’s DONE in buffer (already fingerprint-based — ensure re-track clears buffer).
4. **Short Maestro inject** for worker status:
   ```
   [worker] js → failed: missing path or marker (accept 0/1)
   ```
   not multi-line inject dump.
5. Document fail reasons in `COMPLETION` / result JSON only.

**Files**

- `src/renderer/hooks/useOrquestra.ts` (`reassignExistingWorker`)
- `src/main/ipc/terminal.ts` (`trackWorker`, `finalizeWorkerCompletion`, `processNextResponse`)
- `src/shared/orchestration/accept.ts` (reassign-friendly criteria)

**Verify**

- [ ] Unit: trackWorker → inject → buffer only inject → idle → not done when file required.
- [ ] Unit: reassign clears previous DONE so old marker alone does not complete new task.
- [ ] Unit: reassign role without filename + marker after real lines → done.
- [ ] Manual: reassign `js` to fix one class name → wait exit 0 when file updated + marker; no false fail while “Waiting for permission”.

---

### Phase 4 — Log hygiene

**Work items**

1. Remove or silence `Project state saved to %s` (`projectWorkspaceStore.ts`).
2. Confirm FS optional reads do not hit wrapHandler error path (Phase 1).
3. Keep only `[worker]` / `[agent]` lifecycle logs (already partially done).

**Verify**

- [ ] Autosave workspace → no “Project state saved” in console at default log level.
- [ ] Worker run still logs: new terminal → agent start → task sent → status.

---

### Phase 5 — Maestro inject policy (Interjected flood)

**Work items**

1. Shorten `processNextResponse` message (1 line).
2. Debounce / coalesce multiple worker events.
3. Optional setting: `orchestrationInjectStatusToMaestro: boolean` (default true short form).
4. Do not inject full role text back into Maestro on fail.

**Verify**

- [ ] Complete 3 workers → Maestro sees at most one short line per worker, not multi-line inject blocks.
- [ ] Reassign + wait still works without Maestro treating inject as a new user task chaos.

---

## Suggested implementation order

```
Phase 1 (ENOENT quiet)     — half day, high user relief
Phase 4 (Project state log) — minutes
Phase 3 (reassign false fail) — 1–2 days, correctness
Phase 5 (Interjected short) — half day
Phase 2 (path access denied) — half–1 day (find caller)
```

---

## Test plan (automated)

| Test | Asserts |
|------|---------|
| `fs optional read` | Missing `latest.json` → null, no error log mock |
| `accept reassign no path` | Marker + real lines → ok |
| `accept reassign after prior DONE` | Cleared tracking; old DONE insufficient |
| `finalizeWorkerCompletion` | Same for idle and exit |
| `processNextResponse` message | Length / single-line format |
| Path join | `orquestra.js` under workspace is absolute |

## Test plan (manual soak — Win)

1. Open `Downloads\Lading-page` (or any folder **without** `.orquestra/runs`).
2. Enable crown → console: **no** ENOENT for `latest.json`.
3. Recruit 2–3 workers → work completes → short status only.
4. Reassign one worker with a small fix role → wait **exit 0** when change lands.
5. Confirm no Access denied spam for `orquestra.js`.
6. Confirm no “Project state saved” spam.

---

## Success criteria

1. Fresh workspace: zero ENOENT handler errors for missing run snapshot.
2. No drive-less `\Downloads\...` access-denied spam during normal Maestro use.
3. Reassign does not flip **completed → failed** without a real accept failure reason visible in one line.
4. Console shows worker lifecycle only; no project autosave noise.
5. Maestro terminal not flooded with multi-line Interjected dumps.

---

## Non-goals

- Changing agent permission UX (“Waiting for permission”).
- Full FS sandbox redesign.
- Silencing all Electron IPC errors (only expected soft misses).

---

## Risks

| Risk | Mitigation |
|------|------------|
| Soft ENOENT hides real bugs | Only for known optional paths / explicit API |
| Marker-only reassign too weak | Prefer path in role when editing a known file |
| Short Maestro inject breaks old habits | Keep full detail in result JSON + `wait` COMPLETION |

---

## Immediate next step when implementing

Start **Phase 1 + Phase 4** (noise), then **Phase 3** (false failed reassign) — those match the user’s screenshot and logs most closely.
