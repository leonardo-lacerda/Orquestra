# Multi-Maestro isolation (one crown per workspace)

## Incident (2026-07-11)

While Maestro A (Grok) ran a logger orchestration, a second terminal (OpenAI Codex)
became the crown owner without an intentional “take over” confirm:

```
Orquestra enabled for rpty-1-local          # A
cmd recruit logger
Maestro takeover: rpty-1-local → rpty-4-local  # B steals crown
Orquestra enabled for rpty-4-local
```

Symptoms the user saw:

1. Codex received `[worker] logger failed…` injects with **no user prompt**
2. Grok still “wait”ed as if it owned the run
3. `Reassign failed: no open worker named "logger"` after cascade/dismiss churn
4. Accept false-negatives mixed with orphan PTY reaps

Root cause: **enable Maestro on B always stole the workspace watcher** and
cascaded A’s workers, then routed CLI commands + status injects to B.

## Architecture (single source of truth)

| Layer | Authority |
| --- | --- |
| `watcherByWorkspace[root].terminalId` | Who receives CLI command IPC (recruit/…) |
| `orquestraTerminals` | Which PTYs are live Maestros (inject allowlist) |
| `crown.json` → `terminalPtyId` | What `orquestra.js` stamps as `maestroId` |
| `panel.maestro` (renderer) | Crown UI intent (must match above after arm) |
| Worker `orchestratorId` | Which Maestro gets wait results / injects |

Invariant: **for each workspace rootPath, at most one live Maestro PTY.**

## Failure modes catalogued

| Mode | Mechanism | Mitigation |
| --- | --- | --- |
| Silent takeover | B `terminalSetMaestro(true)` while A live | `MAESTRO_BUSY` unless `forceTakeover` + UI confirm |
| Race arm | A and B enable concurrently | Per-workspace enable lock |
| Stale CLI after steal | Commands without / wrong `maestroId` | Strict drop `drop_missing` / `drop_stale` |
| Inject to demoted crown | Queue drained after steal | `shouldInjectToMaestro` vs `orquestraTerminals` |
| PTY restart | Same panel new pty id | **Rebind** workers (no cascade kill) |
| Intentional switch | User wants B | Confirm → `forceTakeover` → cascade A |
| Multi `panel.maestro` | Session restore | `sanitizeMaestroFlags` + always `clearOtherMaestroFlags` on arm |
| Workspace-wide Maestro docs | `CLAUDE.local.md` / skills visible to all agents | Busy check before rewrite; only arming crown updates crown.json |

## Residual risks (not fully eliminated)

1. **Any agent can still run `node orquestra.js`** if files exist on disk; only the
   crown-stamped command path is enforced. Non-crown agents should not enable the
   crown — skills in `.claude/` may still *suggest* orchestration.
2. **Remote/multi-window**: owner window rebinding is per watcher; two windows
   still share one crown per root.
3. **Accept path false-negatives** are independent (file path resolution) — fixed
   separately via basename search.

## Operator rules

1. One crown per workspace while a run is in flight.
2. Open Codex/Claude for implementation **without** enabling Maestro crown.
3. To switch Maestro: disable A’s crown, or confirm takeover on B (cancels A’s workers).

## Code map

- Policy (pure): `src/shared/orchestration/multiMaestroPolicy.ts`
- Enable / takeover / rebind: `src/main/ipc/terminal.ts` (`TERMINAL_SET_MAESTRO`)
- Arm UI: `ensureMaestroArmed` + `CanvasNode` crown toggle confirm
- Command poll + inject gates: same `terminal.ts`
