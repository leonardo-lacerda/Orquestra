# Orchestration Settings Development Plan

Date: 2026-07-09

## Goal

Turn the Maestro/Orquestra terminal orchestration feature into a configurable, first-class product surface. The user should be able to control how terminal orchestration behaves, how many workers can be created, what permissions workers have, how tasks are split, and what happens when workers finish.

## Current State

- The crown button in `CanvasNode` toggles Maestro mode for terminal panels.
- `terminalSetMaestro` in the main process writes Maestro support files into the workspace.
- `CLAUDE.local.md` is generated with fixed orchestration instructions.
- `useOrquestra` listens for Maestro commands and creates worker terminal/agent panels.
- The current settings popover is small and mostly status-oriented.
- Orchestration behavior is not configurable by the user.

## Product Direction

Create a dedicated **Orchestration** settings section, separate from Terminal settings. Terminal settings configure the terminal surface; Orchestration settings configure the core multi-terminal workflow.

The crown popover should remain lightweight and operational:

- Current status
- Current mode
- Active worker count
- Quick access to full Orchestration settings
- Fast disable action

The full Settings window should own deeper configuration.

## Implementation Status

- Phase 1: Done.
- Phase 2: Done.
- Phase 3: Done.
- Phase 4: Done.
- Phase 5: Done.
- Phase 6: Done.
- Phase 7: Done. Worker state is exposed through `orquestraListWorkers`, and the crown popover uses tracked worker counts.
- Phase 8: V1 prompt-level policy is done; V2 runtime enforcement is still deferred.
- Phase 9: Partially done. Settings schema/defaults, prompt generation, worker-summary, and `useOrquestra` helper tests exist; full hook/E2E smoke coverage is still pending.
- Worker lifecycle: `close-on-success` now closes tracked worker panels when their PTY exits successfully. `hide` is still deferred because canvas does not yet expose a stable hide-without-destroy action.

## Phase 1: Settings Model

Add orchestration fields to `AppSettings`, `DEFAULT_SETTINGS`, and the settings schema.

Files:

- `src/shared/types.ts`
- `src/main/settingsFile.ts`
- `src/renderer/stores/settingsStore.ts`

Proposed settings:

```ts
orchestrationMode: 'manual' | 'assisted' | 'auto'
orchestrationMaxWorkers: number
orchestrationDefaultWorkerKind: 'terminal' | 'agent'
orchestrationDefaultAgentCommand: string
orchestrationTaskSplitStrategy: 'auto' | 'by-task' | 'by-file' | 'by-stage'
orchestrationContextPolicy: 'summary' | 'relevant-files' | 'full'
orchestrationReviewPolicy: 'never' | 'on-changes' | 'always'
orchestrationOnWorkerDone: 'keep-open' | 'hide' | 'close-on-success'
orchestrationWorkerNamePrefix: string
orchestrationAllowFileEdits: boolean
orchestrationAllowCommands: boolean
orchestrationAllowNetwork: boolean
orchestrationAllowNestedWorkers: boolean
```

Suggested defaults:

```ts
orchestrationMode: 'assisted'
orchestrationMaxWorkers: 4
orchestrationDefaultWorkerKind: 'terminal'
orchestrationDefaultAgentCommand: 'verboo'
orchestrationTaskSplitStrategy: 'auto'
orchestrationContextPolicy: 'relevant-files'
orchestrationReviewPolicy: 'on-changes'
orchestrationOnWorkerDone: 'keep-open'
orchestrationWorkerNamePrefix: 'worker'
orchestrationAllowFileEdits: true
orchestrationAllowCommands: true
orchestrationAllowNetwork: false
orchestrationAllowNestedWorkers: false
```

## Phase 2: Settings UI

Create a new settings section:

- `src/renderer/settings/OrchestrationSettings.tsx`

Add it to:

- `src/renderer/settings/SettingsWindow.tsx`
- `src/renderer/i18n/translations.ts`

Recommended UI groups:

### Mode

- Manual: user creates and connects workers.
- Assisted: Orquestra suggests and coordinates workers.
- Auto: Orquestra may create workers when tasks are clearly parallel.

### Workers

- Max workers
- Default worker type
- Default agent command
- Worker name prefix

### Delegation

- Task split strategy
- Context policy
- Review policy

### Permissions

- Allow file edits
- Allow commands
- Allow network
- Allow nested workers

### Completion

- Keep worker open
- Hide completed worker
- Close on success

## Phase 3: Crown Popover

Refine the existing Maestro popover in `CanvasNode`.

Recommended contents:

- Status: Active / Inactive
- Mode: Manual / Assisted / Auto
- Workers: active count / max workers
- Default worker: Terminal / Agent
- Button: Open Orchestration Settings
- Button: Disable Maestro

Implementation options:

- Keep the component in `CanvasNode` initially.
- If it grows, extract to `src/renderer/canvas/MaestroSettingsPopover.tsx`.

The popover should continue to render through a portal so it is not clipped by the tab bar or panel overflow.

## Phase 4: Maestro Prompt Generation

Extract the fixed prompt currently written in `terminalSetMaestro` into a dedicated builder.

Proposed file:

- `src/main/maestro/maestroInstructions.ts`

Proposed API:

```ts
export function buildMaestroInstructions(settings: AppSettings): string
```

The generated instructions should include:

- Orchestration mode
- Max worker count
- Task split strategy
- Context policy
- Review policy
- Completion policy
- Worker permissions
- Nested worker policy

The main process should call this builder when enabling Maestro mode.

## Phase 5: Crown Marker Snapshot

Extend `.orquestra/crown.json` so the workspace records the orchestration configuration active when Maestro was enabled.

Example:

```json
{
  "terminalPtyId": "...",
  "activatedAt": 123,
  "workspacePath": "...",
  "settings": {
    "mode": "assisted",
    "maxWorkers": 4,
    "defaultWorkerKind": "terminal",
    "taskSplitStrategy": "auto",
    "contextPolicy": "relevant-files",
    "reviewPolicy": "on-changes",
    "permissions": {
      "fileEdits": true,
      "commands": true,
      "network": false,
      "nestedWorkers": false
    }
  }
}
```

This helps debugging, workspace portability, and future worker introspection.

## Phase 6: Recruit Behavior

Update `useOrquestra` to honor settings during worker creation.

File:

- `src/renderer/hooks/useOrquestra.ts`

Behavior changes:

- Respect `orchestrationMaxWorkers`.
- Use `orchestrationDefaultWorkerKind` when `args.agent` is missing or `auto`.
- Use `orchestrationDefaultAgentCommand` for terminal workers.
- Apply `orchestrationWorkerNamePrefix` when no explicit name is provided.
- Append worker permission rules to the role message.
- Prevent nested recruitment when `orchestrationAllowNestedWorkers` is false.

## Phase 7: Worker State And Counts

Expose tracked workers so UI can show accurate counts.

Potential IPC:

```ts
orquestraListWorkers(orchestratorId?: string): Promise<WorkerSummary[]>
```

Possible worker shape:

```ts
interface WorkerSummary {
  workerId: string
  orchestratorId: string
  name: string
  role: string
  workspacePath: string
  status: 'starting' | 'running' | 'waiting' | 'done' | 'failed' | 'unknown'
}
```

Use this for:

- Crown popover counts
- Future Orchestration panel
- Debugging worker lifecycle issues

## Phase 8: Permission Enforcement

Implement permissions in two stages.

### V1: Prompt-Level Enforcement

Fast and low-risk.

- Include permission rules in the Maestro prompt.
- Include permission rules in worker role messages.
- Make nested worker policy explicit.

### V2: Runtime Enforcement

Stronger but higher-risk.

- Block or confirm dangerous commands.
- Gate network access where possible.
- Provide read-only worker mode.
- Prevent worker-initiated recruit calls when nested workers are disabled.

V1 should ship first.

## Phase 9: Tests

Add focused tests around settings, prompt generation, and worker behavior.

Recommended tests:

- `settingsFile.test.ts`
  - New settings load with defaults.
  - Invalid types are rejected.
  - Hand-edited settings merge correctly.

- `maestroInstructions.test.ts`
  - Mode appears in generated instructions.
  - Worker limit appears in generated instructions.
  - Permissions appear correctly.
  - Nested worker policy appears correctly.

- `useOrquestra` tests
  - Max workers is respected.
  - Default worker kind is respected.
  - Default agent command is used.
  - Worker prefix is applied.

- E2E smoke
  - Open terminal.
  - Click crown.
  - Click Maestro settings.
  - Click Open Orchestration Settings.
  - Confirm the Orchestration section is visible.

## MVP Scope

Ship these first:

- Dedicated Orchestration settings section
- Mode
- Max workers
- Default worker type
- Default agent command
- Worker permissions
- Review policy
- Crown popover opening the new section
- Prompt generation based on settings
- `useOrquestra` respecting max workers and default worker type

Defer:

- Full worker history UI
- Runtime-level command/network enforcement
- Auto-hide/close worker lifecycle behavior
- Advanced worker status dashboard

## Implementation Order

1. Add shared setting types and defaults.
2. Extend settings schema validation.
3. Add translations.
4. Build `OrchestrationSettings`.
5. Register the new section in `SettingsWindow`.
6. Update the crown popover to open the Orchestration section.
7. Extract `buildMaestroInstructions`.
8. Use settings in `terminalSetMaestro`.
9. Use settings in `useOrquestra`.
10. Add tests.
11. Run typecheck and targeted tests.

## Risks

- Too many settings can make the first version feel heavy.
- Prompt-level permissions are useful but not true security enforcement.
- Worker counting needs a clear source of truth to avoid misleading UI.
- Auto mode should be conservative to avoid creating surprising numbers of terminals.
- Settings should be robust to hand-edited JSON.

## Open Questions

- Should Orchestration mode be global, workspace-specific, or both?
- Should workers default to terminal panels or Orquestra agent panels?
- Should network be off by default for safety?
- Should review policy create a dedicated reviewer worker or ask the maestro terminal to review?
- Should completed workers be visually grouped/collapsed on the canvas?
