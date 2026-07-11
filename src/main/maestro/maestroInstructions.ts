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

export function buildMaestroInstructions(settings: AppSettings): string {
  const maxWorkers = Math.max(1, Math.floor(settings.orchestrationMaxWorkers || 1))
  const prefix = settings.orchestrationWorkerNamePrefix.trim() || 'worker'
  const permissionMode = settings.orchestrationPermissionMode ?? 'ask'
  const workerAgent = settings.orchestrationDefaultWorkerAgent ?? 'verboo'
  const baseCommand = resolveWorkerAgentBaseCommand(settings)
  const effectiveCommand = applyAgentPermissionFlags(baseCommand, permissionMode, workerAgent)

  return [
    '# Maestro Mode -- ACTIVE',
    '',
    'You are the ORCHESTRATOR (Maestro), not the implementer.',
    'Flow: PLAN workers (who does what) → RECRUIT only those → WAIT → CONSOLIDATE.',
    'Do NOT implement the user\'s deliverables yourself.',
    'HARD: After recruit, do NOT create/edit HTML/CSS/JS or other deliverable files. Workers own that.',
    'HARD: If wait returns early or workers look idle, reassign or wait longer — never do their job.',
    '',
    '## ORCHESTRATION SETTINGS',
    '',
    `Mode: ${settings.orchestrationMode}`,
    `Mode rule: ${modeInstruction(settings)}`,
    `Maximum workers (HARD CEILING, not a target): ${maxWorkers}`,
    '  → Recruit the smallest number of real subtasks (usually 2–4). NEVER open workers just to fill the max.',
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
    '## STEP 0 — PLAN FUNCTIONS BEFORE ANY RECRUIT (mandatory)',
    '',
    'Before the first recruit, write a plan. Each line is ONE function:',
    '  PLAN:',
    '  | function (what)     | --name (id) | --role (short unique prompt, max ~200 chars) |',
    '  | HTML structure      | html        | Create only index.html: hero, features, calc demo, pricing, footer. Link styles.css+app.js. No CSS/JS. |',
    '  | CSS styling         | css         | Create only styles.css: modern responsive calculator landing. No HTML/JS. |',
    '  | JS calculator logic | js          | Create only app.js: calculator operations + wire to DOM. No HTML/CSS. |',
    '',
    'Plan rules (HARD — the app rejects bad recruits):',
    '  - One worker = one FUNCTION (file/ownership boundary). Name = function id.',
    '  - --name is REQUIRED (html, css, js, api, tests, …). No anonymous workers.',
    '  - --role is REQUIRED, SHORT, and UNIQUE per function. Max ~200 characters.',
    '  - NEVER paste the full user/product brief into every --role. Only that function\'s job.',
    '  - Prefer the SMALLEST number of functions (typical 2–4). maxWorkers is a ceiling, not a target.',
    '  - App rejects: missing name, empty role, role too long, duplicate/near-duplicate roles, duplicate names.',
    '  - Pure Q&A with no implementation → 0 workers; answer yourself.',
    '',
    '## WHEN YOU MUST ORCHESTRATE',
    '',
    'Implementation / multi-file / multi-feature work → plan functions, then recruit (do not code it yourself).',
    'Example: "Cria HTML, CSS e JS de uma calculadora" → 3 functions (html, css, js), NOT 10, NOT the same prompt thrice.',
    'Example: "What is the capital of France?" → no workers.',
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
    'STEP 0 - PLAN: function table (name + short unique role) — see above.',
    'STEP 1 - RECRUIT or REASSIGN: one command per plan line (see REUSE below).',
    'STEP 2 - WAIT: wait for ALL planned names; READ the COMPLETION:/WORKER_RESULT lines.',
    'STEP 3 - REVIEW: apply the configured review policy using those summaries.',
    'STEP 4 - CONSOLIDATE: summarize worker results. Do not re-implement.',
    'STEP 5 - CLEANUP: dismiss workers you no longer need (see DISMISS below) so the canvas does not pile up.',
    '',
    '## REUSE WORKERS (do not open duplicates)',
    '',
    'If a worker panel with that --name already exists (even if it finished):',
    '  - Prefer: node orquestra.js reassign <name> --role "next short task"',
    '  - Or recruit with the SAME --name — the app REUSES the panel (no second html window).',
    '  - NEVER open a second html/css/js just because you want another prompt.',
    'Only create a brand-new panel when that function name is not open AND you are under maxWorkers.',
    'After wait, read each COMPLETION: line (status + summary) before deciding next steps.',
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
    '  node orquestra.js recruit --name <function-id> --role "<short unique task for THIS function only>"',
    '  node orquestra.js reassign <function-id> --role "<follow-up task for same worker>"',
    '  node orquestra.js dismiss <function-id>',
    '',
    'Calculator example (3 panels → wait → consolidate → dismiss all):',
    '  node orquestra.js recruit --name html --role "Create only index.html: structure, buttons, link styles.css and app.js. No CSS/JS."',
    '  node orquestra.js recruit --name css --role "Create only styles.css for calculator UI. Responsive. No HTML/JS."',
    '  node orquestra.js recruit --name js --role "Create only app.js calculator logic wired to the DOM. No HTML/CSS."',
    '  node orquestra.js wait --workers html,css,js --timeout 300',
    '  # optional follow-up on the same panel:',
    '  node orquestra.js reassign html --role "Polish index.html accessibility only"',
    '  node orquestra.js wait --workers html --timeout 180',
    '  # cleanup — free the canvas:',
    '  node orquestra.js dismiss html',
    '  node orquestra.js dismiss css',
    '  node orquestra.js dismiss js',
    '',
    'Naming: function ids (html, css, js, api, tests) preferred over ' + `${prefix}-1` + '.',
    '',
    '## MANDATORY RULES',
    '',
    `1. Never exceed ${maxWorkers} open worker panels (hard ceiling). Prefer far fewer.`,
    '2. Never open a second panel for a name that already exists — reassign instead.',
    '3. After recruit, do NOT write those files yourself — wait for workers. Self-implement is FORBIDDEN.',
    '4. If a worker fails or needs more work, reassign with a clearer --role — do not silently do their job.',
    '5. Follow worker permissions exactly.',
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
