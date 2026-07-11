// =============================================================================
// orquestra-maestro — Pi extension for terminal orchestration (Maestro crown).
//
// When .orquestra/crown.json exists:
// 1. Tools: orquestra_recruit / wait / dismiss / list / reassign
// 2. before_agent_start: inject orchestrator-only system rules
// 3. input hook: force multi-task prompts into orchestrate-never-implement mode
// 4. tool_call: block Write/Edit and non-orquestra bash (Maestro never implements)
// =============================================================================

import type {
  ExtensionAPI,
  ExtensionContext,
  AgentToolUpdateCallback,
  AgentToolResult,
} from '@earendil-works/pi-coding-agent'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { hasMultipleTasks, isPureQuestion } from './multiTask'

const CROWN_MARKER = '.orquestra/crown.json'
const COMMANDS_DIR = '.orquestra-commands'

const MAESTRO_SYSTEM = `
# MAESTRO MODE — PLAN FIRST, ORCHESTRATE ONLY (crown active)

You are the Maestro. You do NOT implement the user's requested work.

## Absolute
- NEVER create/edit the deliverables the user asked for (no HTML/CSS/JS/code files from you).
- NEVER recruit before you write a PLAN of workers (name + unique role each).
- NEVER use maxWorkers as a target. It is a CEILING. Typical plans have 2–4 workers.
- NEVER give every worker the same role / same full user prompt.
- ALWAYS wait after recruiting, then only consolidate.
- If wait finishes quickly or workers look stuck: reassign — do NOT do their job yourself.
- Write/Edit tools are blocked. Bash is limited to orquestra CLI and read-only inspection.

## Workflow (mandatory order)
0. PLAN — function table: --name (function id) + --role (short unique prompt)
1. RECRUIT — one recruit per plan line (both --name and --role required)
2. WAIT — orquestra_wait / node orquestra.js wait for those names (be patient)
3. CONSOLIDATE — short summary of worker results only

## Bad vs good
- BAD: open 10 workers with the same role text; or implement styles.css yourself after wait
- GOOD: calculator → 3 workers: html | css | js with different short roles → wait → summarize

## Example
User: "Cria HTML, CSS e JS de uma calculadora"
PLAN: html / css / js (3 only)
→ recruit each with a DISTINCT short role → wait → summarize
`.trim()

function readMaxWorkers(cwd: string): number {
  try {
    const crown = JSON.parse(fs.readFileSync(path.join(cwd, CROWN_MARKER), 'utf-8')) as {
      settings?: { maxWorkers?: number }
    }
    const n = Math.floor(Number(crown.settings?.maxWorkers) || 4)
    return Math.max(1, Math.min(16, n))
  } catch {
    return 4
  }
}

function sendCommand(cwd: string, cmd: string, args: Record<string, unknown>): void {
  const dir = path.join(cwd, COMMANDS_DIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  let maestroId: string | undefined
  try {
    const crown = JSON.parse(fs.readFileSync(path.join(cwd, CROWN_MARKER), 'utf-8')) as {
      terminalPtyId?: string
    }
    maestroId = crown.terminalPtyId
  } catch { /* optional */ }
  const payload = JSON.stringify({
    cmd,
    args,
    timestamp: Date.now(),
    ...(maestroId ? { maestroId } : {}),
  })
  const filename = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
  fs.writeFileSync(path.join(dir, filename), payload)
}

function crownActive(cwd: string): boolean {
  try {
    return fs.existsSync(path.join(cwd, CROWN_MARKER))
  } catch {
    return false
  }
}

function ok(text: string): AgentToolResult<unknown> {
  return { content: [{ type: 'text' as const, text }], details: undefined }
}

/** Allow bash only for orchestration CLI / read-only inspection. */
function isAllowedMaestroBash(command: string): boolean {
  const c = command.trim().toLowerCase()
  if (!c) return false
  if (c.includes('orquestra.js') || c.includes('orquestra.cmd') || /\borquestra\b/.test(c)) {
    return true
  }
  // read-only-ish inspection
  if (/^(dir|ls|type|cat|get-content|pwd|cd)\b/.test(c)) return true
  return false
}

const BLOCK_IMPLEMENTATION_TOOLS = new Set([
  'write',
  'Write',
  'edit',
  'Edit',
  'MultiEdit',
  'create_file',
  'str_replace',
  'apply_patch',
  'notebook_edit',
])

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd()
  if (!crownActive(cwd)) return

  // Session guards: unique names/roles; ceiling from crown settings
  const recruitedNames = new Set<string>()
  const recruitedRoles = new Set<string>()
  const maxWorkers = readMaxWorkers(cwd)

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------

  const MAX_ROLE = 220

  pi.registerTool({
    name: 'orquestra_recruit',
    label: 'Recruit Worker',
    description:
      'Recruit ONE worker for ONE named function after PLAN. name=function id (html/css/js), role=short unique prompt for that function only (max ~220 chars). Never paste the full user brief to every worker.',
    promptSnippet: 'orquestra_recruit — name=function, role=short unique task (after PLAN)',
    promptGuidelines: [
      'PLAN first as a function table: name (id) + short unique role, then recruit only those.',
      'name is the function id (html, css, js). role is ONLY that function\'s job — short, unique.',
      'Never paste the full product brief into every role. Max ~220 chars per role.',
      'Recruit the smallest number of functions (usually 2–4), not maxWorkers.',
      'After recruits, orquestra_wait, then consolidate only.',
    ],
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Function id for this worker (required). e.g. html, css, js, api, tests',
        },
        role: {
          type: 'string',
          description:
            'Short unique task for THIS function only (max ~220 chars). Not the full user prompt.',
        },
      },
      required: ['role', 'name'],
    },
    execute: async (
      _id: string,
      params: { role: string; name: string },
      _signal: AbortSignal | undefined,
      _update: AgentToolUpdateCallback<unknown> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<unknown>> => {
      const name = String(params.name || '').trim()
      const role = String(params.role || '').trim()
      if (!name) {
        return ok(
          'ERROR: name (function id) is required. Example: name="html" role="Create only index.html structure".',
        )
      }
      if (!role) {
        return ok('ERROR: role is required — short unique task for this function only.')
      }
      if (role.length < 20) {
        return ok(
          'ERROR: role is too vague. Write a specific unique job for this function (min ~20 chars), e.g. "Create only index.html structure and buttons".',
        )
      }
      if (role.length > MAX_ROLE) {
        return ok(
          `ERROR: role is ${role.length} chars (max ${MAX_ROLE}). Write a SHORT function-specific prompt only — not the full product brief. Example: "Create only styles.css for calculator UI. Responsive. No HTML/JS."`,
        )
      }
      const nameKey = name.toLowerCase()
      const roleKey = role.toLowerCase().replace(/\s+/g, ' ')
      if (recruitedRoles.has(roleKey) && !recruitedNames.has(nameKey)) {
        return ok(
          'ERROR: this role text was already used for another function. Each function needs a DISTINCT short prompt.',
        )
      }
      // Same name already recruited earlier: reuse via recruit (app reassigns) — do not block.
      if (!recruitedNames.has(nameKey) && recruitedNames.size >= maxWorkers) {
        return ok(
          `ERROR: already at maxWorkers=${maxWorkers}. Reassign an existing worker (orquestra_reassign) instead of opening a new panel.`,
        )
      }

      // Same name again → app reuses panel; still send recruit (renderer reassigns).
      sendCommand(cwd, 'recruit', { role, name, agent: 'verboo' })
      recruitedNames.add(nameKey)
      recruitedRoles.add(roleKey)
      const left = maxWorkers - recruitedNames.size
      return ok(
        `Function "${name}" recruit requested (${recruitedNames.size} unique names, ceiling ${maxWorkers}, ${left} left).\nRole: ${role}\nIf that name already exists, the app REUSES the panel (no second window).\nFor follow-ups prefer orquestra_reassign. Then orquestra_wait and READ completion summaries.`,
      )
    },
  })

  pi.registerTool({
    name: 'orquestra_reassign',
    label: 'Reassign Worker',
    description:
      'Send a new task to an EXISTING worker by name (reuse panel). Prefer this over recruiting a second html/css/js.',
    promptSnippet: 'orquestra_reassign — new prompt on same worker panel',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Existing worker function id (html, css, js, …)' },
        role: { type: 'string', description: 'New short unique task for this worker' },
      },
      required: ['name', 'role'],
    },
    execute: async (
      _id: string,
      params: { name: string; role: string },
      _signal: AbortSignal | undefined,
      _update: AgentToolUpdateCallback<unknown> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<unknown>> => {
      const name = String(params.name || '').trim()
      const role = String(params.role || '').trim()
      if (!name) return ok('ERROR: name is required (existing worker id).')
      if (!role || role.length < 12) {
        return ok('ERROR: role must be a short specific follow-up task (min ~12 chars).')
      }
      if (role.length > MAX_ROLE) {
        return ok(`ERROR: role is ${role.length} chars (max ${MAX_ROLE}). Keep follow-ups short.`)
      }
      sendCommand(cwd, 'reassign', { target: name, role })
      return ok(
        `Reassign sent to "${name}".\nRole: ${role}\nThen orquestra_wait with workers=${name} and read the completion summary.`,
      )
    },
  })

  pi.registerTool({
    name: 'orquestra_wait',
    label: 'Wait for Workers',
    description:
      'Block until named workers finish (polls .orquestra-results). Returns each worker status + summary. Call after recruit/reassign, before consolidating.',
    promptSnippet: 'orquestra_wait — wait and read completion summaries',
    parameters: {
      type: 'object',
      properties: {
        workers: {
          type: 'string',
          description: 'Comma-separated worker names (e.g. html,css,js)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout seconds (default 300)',
        },
      },
      required: ['workers'],
    },
    execute: async (
      _id: string,
      params: { workers: string; timeout?: number },
      _signal: AbortSignal | undefined,
      _update: AgentToolUpdateCallback<unknown> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<unknown>> => {
      const names = String(params.workers || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const timeoutSec = Math.max(1, Number(params.timeout) || 300)
      const deadline = Date.now() + timeoutSec * 1000
      const resultsDir = path.join(cwd, '.orquestra-results')

      const readResult = (name: string): {
        status: string | null
        summary: string
        role: string
      } => {
        const safe = path.basename(name).replace(/[/\\]/g, '_')
        const fp = path.join(resultsDir, `worker-${safe}.json`)
        if (!fs.existsSync(fp)) return { status: null, summary: '', role: '' }
        try {
          const j = JSON.parse(fs.readFileSync(fp, 'utf-8')) as {
            status?: string
            summary?: string
            role?: string
            workerRole?: string
          }
          return {
            status: String(j.status || '').toLowerCase(),
            summary: String(j.summary || '').replace(/\s+/g, ' ').slice(0, 400),
            role: String(j.role || j.workerRole || '').slice(0, 120),
          }
        } catch {
          return { status: null, summary: '', role: '' }
        }
      }

      const terminal = new Set(['done', 'completed', 'failed', 'timeout'])
      while (Date.now() < deadline) {
        const snaps = names.map((n) => ({ name: n, ...readResult(n) }))
        if (snaps.every((s) => s.status && terminal.has(s.status))) {
          const lines = snaps.map((s) => {
            const sum = s.summary || '(no summary)'
            return `- ${s.name}: ${s.status}`
              + (s.role ? ` | role: ${s.role}` : '')
              + `\n  summary: ${sum}`
          })
          const anyFail = snaps.some((s) => s.status === 'failed' || s.status === 'timeout')
          return ok(
            `Wait complete${anyFail ? ' (with failures)' : ''}.\n`
            + `${lines.join('\n')}\n`
            + 'Use these summaries to consolidate. For more work on the same panel: orquestra_reassign. '
            + 'When the run is finished (or a worker is no longer needed): orquestra_dismiss to free the canvas. '
            + 'Do not re-implement. Do not open a second panel with the same name.',
          )
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      return ok(
        `Wait timed out after ${timeoutSec}s. Check .orquestra-results and reassign failed workers. Do not implement their work yourself.`,
      )
    },
  })

  pi.registerTool({
    name: 'orquestra_dismiss',
    label: 'Dismiss Worker',
    description:
      'Close/delete a worker panel by name to free the canvas and maxWorkers slots. '
      + 'Use after the run is consolidated, when that function needs no more reassign, '
      + 'when freeing a slot for a new function, or when the user asks to clean up. '
      + 'Do NOT dismiss a worker you still plan to reassign.',
    promptSnippet: 'orquestra_dismiss — close finished/unused worker (cleanup)',
    promptGuidelines: [
      'After consolidating the final answer, dismiss workers from this run so terminals do not accumulate.',
      'Dismiss idle/done workers when you need a free maxWorkers slot for a new function.',
      'Prefer reassign over dismiss when the same function still has follow-up work.',
      'Never dismiss a worker that is still running / waiting.',
    ],
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Worker function id to close (html, css, js, …)',
        },
      },
      required: ['name'],
    },
    execute: async (
      _id: string,
      params: { name: string },
      _signal: AbortSignal | undefined,
      _update: AgentToolUpdateCallback<unknown> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<unknown>> => {
      const name = String(params.name || '').trim()
      if (!name) return ok('ERROR: name is required to dismiss a worker.')
      sendCommand(cwd, 'dismiss', { target: name })
      recruitedNames.delete(name.toLowerCase())
      return ok(
        `Worker "${name}" dismissed (panel closed, slot freed).\n`
        + 'You may recruit a new function into that capacity, or finish if the run is done.',
      )
    },
  })

  pi.registerTool({
    name: 'orquestra_list',
    label: 'List Workers',
    description: 'List active workers on the canvas.',
    promptSnippet: 'orquestra_list — list workers',
    parameters: { type: 'object', properties: {} },
    execute: async (): Promise<AgentToolResult<unknown>> => {
      sendCommand(cwd, 'list', {})
      return ok('Worker list requested (see Maestro terminal / canvas).')
    },
  })

  pi.registerTool({
    name: 'orquestra_reassign',
    label: 'Reassign Worker',
    description: 'Change a worker task without implementing it yourself.',
    promptSnippet: 'orquestra_reassign — change worker role',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        role: { type: 'string', description: 'New role/task' },
      },
      required: ['name', 'role'],
    },
    execute: async (
      _id: string,
      params: { name: string; role: string },
      _signal: AbortSignal | undefined,
      _update: AgentToolUpdateCallback<unknown> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<unknown>> => {
      sendCommand(cwd, 'reassign', { target: params.name, role: params.role })
      return ok(`Worker "${params.name}" reassigned: ${params.role}`)
    },
  })

  // -------------------------------------------------------------------------
  // System prompt — always on while crown is active
  // -------------------------------------------------------------------------

  pi.on('before_agent_start', async (event) => {
    if (!crownActive(cwd)) return
    return {
      systemPrompt: `${event.systemPrompt}\n\n${MAESTRO_SYSTEM}`,
    }
  })

  // -------------------------------------------------------------------------
  // Input transform — force orchestration framing for multi-part / impl work
  // -------------------------------------------------------------------------

  pi.on('input', async (event) => {
    if (event.source !== 'interactive') return
    if (!crownActive(cwd)) return
    if (isPureQuestion(event.text) && !hasMultipleTasks(event.text)) return

    // Any implementation-shaped request (including single-file "cria um botão")
    // or multi-task: force orchestrator framing.
    const multi = hasMultipleTasks(event.text)
    const force =
      multi ||
      /\b(criar|crie|implement|build|make|write|code|desenvolv|faz|faça|generate|gere)\b/i.test(
        event.text,
      )

    if (!force) return

    return {
      action: 'transform' as const,
      text: `<maestro_mandate>
CROWN ACTIVE — ORCHESTRATOR ONLY. PLAN BEFORE RECRUIT.

1) First output a PLAN listing each worker:
   - name (short, unique)
   - role (unique, specific — what ONLY they do; not the full user message)
2) Recruit ONLY those planned workers (usually 2–4). maxWorkers is a ceiling, NOT a target.
3) NEVER open 10 workers with the same role / same prompt.
4) NEVER implement the deliverables yourself (no Write/Edit of project files).
5) After recruits: orquestra_wait (or node orquestra.js wait). If wait is short or workers idle, reassign — do not code.
6) Consolidate only after real worker results.

${multi ? 'Multi-part request → one worker per real part (e.g. html, css, js = 3).' : 'Implementation request → plan the minimal worker set, then recruit.'}
</maestro_mandate>

${event.text}`,
    }
  })

  // -------------------------------------------------------------------------
  // Hard block implementation tools — Maestro never executes the deliverable
  // -------------------------------------------------------------------------

  pi.on('tool_call', async (event) => {
    if (!crownActive(cwd)) return
    const toolName = event.toolName

    if (BLOCK_IMPLEMENTATION_TOOLS.has(toolName)) {
      return {
        block: true,
        reason:
          'Maestro mode: you must not edit/create project files yourself. Use orquestra_recruit to delegate implementation, then orquestra_wait, then consolidate.',
      }
    }

    if (
      toolName === 'bash' ||
      toolName === 'Bash' ||
      toolName === 'shell' ||
      toolName === 'Shell'
    ) {
      const command = ((event.input as { command?: string } | undefined)?.command ?? '').toString()
      if (!isAllowedMaestroBash(command)) {
        return {
          block: true,
          reason:
            'Maestro mode: bash is limited to node orquestra.js ... and read-only inspection. Delegate implementation via orquestra_recruit.',
        }
      }
    }
  })
}
