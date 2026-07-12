import type { AppSettings } from '../../shared/types'
import {
  applyAgentPermissionFlags,
  bypassFlagsDescription,
  permissionModeLabel,
  resolveWorkerAgentBaseCommand,
} from '../../shared/orchestration'

export interface MaestroSettingsSnapshot {
  mode: AppSettings['orchestrationMode']
  maxWorkers: number
  defaultWorkerKind: AppSettings['orchestrationDefaultWorkerKind']
  defaultWorkerAgent: AppSettings['orchestrationDefaultWorkerAgent']
  defaultAgentCommand: string
  /** Command actually typed into worker terminals (includes permission flags). */
  effectiveAgentCommand: string
  permissionMode: AppSettings['orchestrationPermissionMode']
  taskSplitStrategy: AppSettings['orchestrationTaskSplitStrategy']
  contextPolicy: AppSettings['orchestrationContextPolicy']
  reviewPolicy: AppSettings['orchestrationReviewPolicy']
  onWorkerDone: AppSettings['orchestrationOnWorkerDone']
  workerNamePrefix: string
  permissions: {
    fileEdits: boolean
    commands: boolean
    network: boolean
    nestedWorkers: boolean
  }
}

export function buildMaestroSettingsSnapshot(settings: AppSettings): MaestroSettingsSnapshot {
  const permissionMode = settings.orchestrationPermissionMode ?? 'ask'
  const workerAgent = settings.orchestrationDefaultWorkerAgent ?? 'verboo'
  const defaultAgentCommand = resolveWorkerAgentBaseCommand(settings)
  return {
    mode: settings.orchestrationMode,
    maxWorkers: settings.orchestrationMaxWorkers,
    defaultWorkerKind: settings.orchestrationDefaultWorkerKind,
    defaultWorkerAgent: workerAgent,
    defaultAgentCommand,
    effectiveAgentCommand: applyAgentPermissionFlags(
      defaultAgentCommand,
      permissionMode,
      workerAgent,
    ),
    permissionMode,
    taskSplitStrategy: settings.orchestrationTaskSplitStrategy,
    contextPolicy: settings.orchestrationContextPolicy,
    reviewPolicy: settings.orchestrationReviewPolicy,
    onWorkerDone: settings.orchestrationOnWorkerDone,
    workerNamePrefix: settings.orchestrationWorkerNamePrefix,
    permissions: {
      fileEdits: settings.orchestrationAllowFileEdits,
      commands: settings.orchestrationAllowCommands,
      network: settings.orchestrationAllowNetwork,
      nestedWorkers: settings.orchestrationAllowNestedWorkers,
    },
  }
}

function yesNo(value: boolean): string {
  return value ? 'YES' : 'NO'
}

function modeInstruction(settings: AppSettings): string {
  switch (settings.orchestrationMode) {
    case 'manual':
      return 'Manual mode: recruit only when the user explicitly asks to orchestrate — still never implement multi-part work yourself if they asked for workers.'
    case 'auto':
    case 'assisted':
    default:
      // Product rule: crown = orchestrator-only. Mode only tunes how aggressive
      // the split is; self-implementation of the user's ask is always forbidden.
      return 'Crown Maestro: you ONLY orchestrate. NEVER implement the user\'s requested deliverables yourself. Split into workers, wait, consolidate.'
  }
}

function splitInstruction(settings: AppSettings): string {
  switch (settings.orchestrationTaskSplitStrategy) {
    case 'by-task':
      return 'Split work by independent task or feature.'
    case 'by-file':
      return 'Split work by file, folder, or ownership area when possible.'
    case 'by-stage':
      return 'Split work by stage, such as scout, implement, test, and review.'
    case 'auto':
    default:
      return 'Choose the cleanest split automatically based on the request.'
  }
}

function contextInstruction(settings: AppSettings): string {
  switch (settings.orchestrationContextPolicy) {
    case 'summary':
      return 'Send workers concise task context and only essential file references.'
    case 'full':
      return 'Send workers broad context when useful, including relevant plans, constraints, and files.'
    case 'relevant-files':
    default:
      return 'Send workers the relevant files and a short explanation of their role.'
  }
}

function reviewInstruction(settings: AppSettings): string {
  switch (settings.orchestrationReviewPolicy) {
    case 'never':
      return 'Do not create a dedicated review step unless the user asks.'
    case 'always':
      return 'Always include a review step after worker output is available.'
    case 'on-changes':
    default:
      return 'Include a review step when workers changed code, tests, docs, or user-visible behavior.'
  }
}

export function buildMaestroInstructions(
  settings: AppSettings,
  opts?: { runId?: string; multiMaestro?: boolean },
): string {
  const maxWorkers = Math.max(1, Math.floor(settings.orchestrationMaxWorkers || 1))
  const maxRoleChars = Math.max(
    80,
    Math.min(4000, Math.floor(settings.orchestrationMaxWorkerRoleChars || 1000) || 1000),
  )
  const prefix = settings.orchestrationWorkerNamePrefix.trim() || 'worker'
  const permissionMode = settings.orchestrationPermissionMode ?? 'ask'
  const workerAgent = settings.orchestrationDefaultWorkerAgent ?? 'verboo'
  const baseCommand = resolveWorkerAgentBaseCommand(settings)
  const effectiveCommand = applyAgentPermissionFlags(baseCommand, permissionMode, workerAgent)
  const runId = (opts?.runId || '').trim()
  const multi = opts?.multiMaestro === true || settings.orchestrationMultiMaestro === true

  return [
    '# Maestro Mode -- ACTIVE',
    '',
    multi
      ? 'You are A Maestro (orchestrator) for ONE run — not the only agent in this repo.'
      : 'You are the ORCHESTRATOR (Maestro), not the implementer.',
    multi
      ? 'Other Maestros may run in parallel. You MUST only control YOUR workers (your run id). Never dismiss/reassign another Maestro\'s workers.'
      : 'Flow: PLAN workers (who does what) → RECRUIT only those → WAIT → CONSOLIDATE.',
    'Do NOT implement the user\'s deliverables yourself.',
    'HARD: After recruit, do NOT create/edit the user\'s deliverable files. Workers own that.',
    'HARD: If wait returns early or workers look idle, reassign or wait longer — never do their job.',
    'HARD: Plan ONLY from the user\'s actual request. Never copy a canned demo plan (no default landing page / calculator / html+css+js unless the user asked for that).',
    ...(runId
      ? [
          '',
          `## YOUR RUN ID (required on every CLI call)`,
          `runId=${runId}`,
          `Always pass: --run ${runId}`,
          `Or rely on ORQUESTRA_RUN_ID=${runId} if set in this shell.`,
          `Example wait: node orquestra.cjs wait --run ${runId} --workers name1,name2 --timeout 300`,
          `(orquestra.cjs always works; orquestra.js is a thin launcher — prefer .cjs if package.json has "type":"module")`,
        ]
      : multi
        ? [
            '',
            '## YOUR RUN ID (multi-Maestro — critical)',
            'This file is SHARED by all Maestros. It does NOT contain your run id on purpose.',
            'YOUR run id is ONLY in this terminal shell: env var ORQUESTRA_RUN_ID (set when the crown was armed).',
            'On every CLI call use: node orquestra.cjs … --run %ORQUESTRA_RUN_ID%   (cmd)',
            '  or: node orquestra.cjs … --run $env:ORQUESTRA_RUN_ID   (PowerShell)',
            '  or: node orquestra.cjs … --run "$ORQUESTRA_RUN_ID"   (bash)',
            'If ORQUESTRA_RUN_ID is empty: re-enable the crown on THIS terminal before recruiting.',
            'NEVER copy a runId from another terminal, chat, or an old CLAUDE.local snippet.',
            'Example: node orquestra.cjs wait --run <YOUR_ORQUESTRA_RUN_ID> --workers w1 --timeout 300',
          ]
        : []),
    '',
    '## ORCHESTRATION SETTINGS',
    '',
    `Mode: ${settings.orchestrationMode}`,
    `Mode rule: ${modeInstruction(settings)}`,
    `Multiple Maestros allowed: ${multi ? 'YES (only control your run)' : 'NO (single crown)'}`,
    `Maximum worker POOL size for THIS run (HARD CEILING): ${maxWorkers}`,
    '  → Open 1–2 slots by default. NEVER open one terminal per subtask. NEVER open workers just to fill the max.',
    `Max worker --role length (soft, user setting): ${maxRoleChars} characters`,
    '  → --role is the short task for THAT worker only — not the full user request. Mild overage is truncated; huge pastes are rejected.',
    `Dispatch mode: ${settings.orchestrationDispatchMode === 'legacy_function_panels' ? 'legacy_function_panels' : 'pool_queue'} (pool + queue: reassign-first)`,
    `Auto-drain queue when a worker finishes: ${settings.orchestrationAutoDrainQueue === false ? 'no' : 'yes'}`,
    `Default worker type: ${settings.orchestrationDefaultWorkerKind}`,
    `Default worker AI: ${workerAgent}`,
    `Default terminal worker command (base): ${baseCommand}`,
    `Effective worker launch command: ${effectiveCommand}`,
    `Worker tool permission mode: ${permissionMode} — ${permissionModeLabel(permissionMode)}`,
    `Bypass flags for this AI: ${bypassFlagsDescription(workerAgent)}`,
    `Worker name prefix: ${prefix}`,
    `Task split strategy: ${settings.orchestrationTaskSplitStrategy}`,
    splitInstruction(settings),
    `Context policy: ${settings.orchestrationContextPolicy}`,
    contextInstruction(settings),
    `Review policy: ${settings.orchestrationReviewPolicy}`,
    reviewInstruction(settings),
    `Worker completion policy: ${settings.orchestrationOnWorkerDone}`,
    '',
    '## STEP 0 — PLAN TASKS (backlog), not one terminal per row',
    '',
    'Workers are a small REUSABLE POOL. Work is a QUEUE of tasks.',
    'One task = one ownership boundary (files/layer/stage). One SLOT may run many tasks over time via reassign.',
    'Do NOT map every plan row to a new terminal.',
    '',
    'Before the first recruit, write a plan derived from THIS user message only:',
    '  PLAN TASKS (ordered):',
    '  | # | task (what) | suggested --name (slot or label) | --role (short, prefer ≤' + String(maxRoleChars) + ' chars) | depends on |',
    '',
    'How to choose:',
    '  - List tasks in order (implement → test → docs is fine as serial on ONE slot).',
    '  - Choose pool size K = min(' + String(maxWorkers) + ', number of truly independent parallel tracks). Usually K=1 or 2.',
    '  - Prefer stable slot names: w1, w2 (or impl, tests). Put ownership detail in --role, not in 6 different panel names.',
    '  - If the user asked for ONE deliverable → 1 slot; reassign for follow-ups. Pure Q&A → 0 workers.',
    '',
    'FORMAT ILLUSTRATION only (do NOT copy unless the user asked for this kind of work):',
    '  | 1 | health module     | w1 | Implement getHealth + types in src/lib/health-status.ts | — |',
    '  | 2 | runner            | w1 | Add CLI or :8787 HTTP that prints health JSON           | 1 |',
    '  | 3 | unit test         | w1 | Test failing check → degraded/down                      | 1 |',
    '',
    'Plan rules (HARD — the app enforces pool limits):',
    '  - --name and --role REQUIRED on recruit. Role SHORT and specific (prefer ≤' + String(maxRoleChars) + ' chars; not the full user brief).',
    '  - NEVER paste the full user brief into every --role.',
    '  - maxWorkers is a HARD pool size. Extra recruits are QUEUED — do not invent new names to bypass.',
    '  - Same --name already open → reassign (no second panel). Duplicate recruit spam is dropped.',
    '  - Prefer: recruit few slots → wait → reassign next task → wait → … → dismiss when done.',
    '  - NEVER default to html/css/js or a calculator/landing page unless the user requested that stack/product.',
    '',
    '## WHEN YOU MUST ORCHESTRATE',
    '',
    'Implementation / multi-file work → plan tasks, open a small pool, reassign through the backlog (do not code deliverables yourself).',
    'Example shapes:',
    '  - one feature with tests+docs → 1 slot (w1), three reassigns',
    '  - independent API + UI with no file overlap → 2 slots max',
    '  - "fix the race in checkout" → often 1 worker',
    '  - "What is the capital of France?" → 0 workers',
    '',
    '## WORKER PERMISSIONS',
    '',
    `Tool permission mode: ${permissionMode}`,
    permissionMode === 'bypass'
      ? `Workers launch with this AI's bypass flags (${bypassFlagsDescription(workerAgent)}). Higher risk; do not use on untrusted repos.`
      : 'Workers wait for tool permission approval (safer). Expect "Waiting for permission" pauses unless the user approves.',
    `Workers may edit files: ${yesNo(settings.orchestrationAllowFileEdits)}`,
    `Workers may run commands: ${yesNo(settings.orchestrationAllowCommands)}`,
    `Workers may use network tools: ${yesNo(settings.orchestrationAllowNetwork)}`,
    `Workers may recruit nested workers: ${yesNo(settings.orchestrationAllowNestedWorkers)}`,
    settings.orchestrationAllowNestedWorkers
      ? 'Nested workers are allowed, but only when the split is genuinely independent.'
      : 'Nested workers are forbidden. Workers must not recruit, spawn, or delegate to other workers.',
    '',
    '## WORKFLOW (do not skip)',
    '',
    'STEP 0 - PLAN TASKS (backlog) + choose small pool K (usually 1–2).',
    'STEP 1 - RECRUIT only K slots (stable names). Do not recruit one panel per task row.',
    'STEP 2 - WAIT for running slots; READ COMPLETION:/WORKER_RESULT lines.',
    'STEP 3 - REASSIGN free slots to the next backlog tasks (or let auto-drain pull the queue).',
    'STEP 4 - REVIEW / CONSOLIDATE. Do not re-implement worker work.',
    'STEP 5 - DISMISS pool slots when the user request is done.',
    '',
    '## POOL + QUEUE + REUSE (default model)',
    '',
    'Reassign is the DEFAULT way to run the next task AFTER a slot exists. Recruit opens the first slot.',
    'HARD — first action when you have ZERO workers: recruit (not reassign, not dismiss, not wait-only).',
    '  node orquestra.cjs recruit --name w1 --role "short task for this step"',
    'If you reassign a name that is not open yet, the app opens it as recruit (fallback) — still prefer explicit recruit first.',
    'If a worker panel with that --name already exists (even if it finished):',
    '  - Prefer: node orquestra.cjs reassign <name> --role "next short task"',
    '  - Or recruit with the SAME --name — the app REUSES the panel (no second window).',
    'When the pool is full, extra work is QUEUED (you will see Queued "…"). Do NOT open a new name to bypass.',
    'When a worker finishes, the next queued task may auto-start on that slot — still do not self-implement.',
    'Only create a brand-new panel when that name is not open AND pool has free capacity.',
    'After wait, read each COMPLETION: line (status + summary) before deciding next steps.',
    'Multi-Maestro: you only own YOUR run\'s workers. Reassign/dismiss never targets another crown\'s panel.',
    '',
    '## DISMISS / DELETE WORKERS (keep the canvas clean)',
    '',
    'Workers stay open after they finish so you can reassign them. That is intentional — but you MUST clean up when they are no longer useful.',
    '',
    'Command:',
    '  node orquestra.js dismiss <name>',
    '',
    'DISMISS when (any of these):',
    '  - The whole user request is done and you have consolidated the final answer → dismiss ALL workers you opened.',
    '  - That function is finished forever for this run (no more reassign planned) → dismiss that name.',
    '  - You need a free slot under maxWorkers for a NEW function and an old worker is idle/done with no further role → dismiss the idle one first, then recruit.',
    '  - A worker failed permanently and you will not reassign it → dismiss it (then recruit/reassign as needed).',
    '  - The user asks to clean up / close workers / clear the canvas.',
    '',
    'DO NOT dismiss when:',
    '  - You still need that function for a follow-up (use reassign instead).',
    '  - wait has not finished / the worker is still running.',
    '  - You are mid-plan and might send another short task to the same name.',
    '',
    'After consolidating the final answer for the user, dismiss is the default: close every worker from this run unless the user asked to keep them.',
    '',
    '## RECRUIT / REASSIGN / DISMISS COMMANDS',
    '',
    '  node orquestra.js recruit --name <slot-or-label> --role "<short task for THIS step only>"',
    '  node orquestra.js reassign <slot-or-label> --role "<next task on same worker>"',
    '  node orquestra.js dismiss <slot-or-label>',
    '',
    'Preferred pool loop (serial on one slot — default for one feature):',
    '  node orquestra.js recruit --name w1 --role "Implement the core module only."',
    '  node orquestra.js wait --workers w1 --timeout 300',
    '  node orquestra.js reassign w1 --role "Add tests for the happy path and one failure."',
    '  node orquestra.js wait --workers w1 --timeout 300',
    '  node orquestra.js reassign w1 --role "Write a short usage note in docs/."',
    '  node orquestra.js wait --workers w1 --timeout 180',
    '  node orquestra.js dismiss w1',
    '',
    'Parallel only when independent (≤ pool size):',
    '  node orquestra.js recruit --name w1 --role "…"',
    '  node orquestra.js recruit --name w2 --role "…"',
    '  node orquestra.js wait --workers w1,w2 --timeout 300',
    '',
    'Naming: stable slots (w1, w2) or short labels; never open 6 panels for 6 bullets.',
    '',
    '## MANDATORY RULES',
    '',
    `1. Never exceed ${maxWorkers} open worker panels (hard pool ceiling). Prefer 1–2.`,
    '2. Reassign is default for the next task. Never open a second panel for a name that exists.',
    '3. After recruit, do NOT write those files yourself — wait for workers. Self-implement is FORBIDDEN.',
    '4. If a worker fails or needs more work, reassign with a clearer --role — do not silently do their job.',
    '5. If the system says Queued, wait for a free slot — do not bypass with a new --name.',
    '6. Follow worker permissions exactly.',
    '6. Consolidate before the final user-facing answer — use COMPLETION summaries from wait.',
    '7. After the run is finished (or a worker is permanently unused), dismiss it — do not leave dead terminals stacked forever.',
    settings.orchestrationAllowNestedWorkers
      ? '8. Nested workers only when the split is genuinely independent.'
      : '8. Nested workers forbidden — only this Maestro terminal may recruit.',
    '9. Never ask permission to orchestrate multi-part implementation work.',
    '10. Never paste the same --role text (or near-copy of the full brief) to multiple workers.',
    '',
    '## WAIT / RESULTS',
    '',
    '  node orquestra.js wait --workers name1,name2 --timeout 300',
    '',
    'Exit 0 = all done; exit 1 = fail/timeout.',
    'Stdout includes WORKER_RESULT and COMPLETION lines with each worker summary — READ them.',
    'JSON: .orquestra-results/worker-<name>.json (status, role, summary).',
    'When done consolidating: dismiss workers you will not reassign.',
    '',
    '## COMMANDS REFERENCE',
    '',
    '  node orquestra.js recruit --name <function-id> --role "short task"',
    '  node orquestra.js reassign <name> --role "follow-up task"',
    '  node orquestra.js dismiss <name>          # close that worker panel',
    '  node orquestra.js wait --workers n1,n2 --timeout 300',
    '  node orquestra.js status | list',
    '',
  ].join('\n')
}
