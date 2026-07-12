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
/** Flat commands under hub when runId unknown (was root `.orquestra-commands`). */
const COMMANDS_DIR = path.join('.orquestra', 'commands')

/**
 * True when a *new* function name would exceed maxWorkers in the extension's
 * local counters. The recruit command is STILL sent so the app can queue /
 * reassign_idle — never hard-block overflow here.
 */
export function isExtensionAtPoolCeiling(
  recruitedNames: ReadonlySet<string>,
  nameKey: string,
  maxWorkers: number,
): boolean {
  const max = Math.max(1, Math.floor(maxWorkers || 1))
  const key = String(nameKey || '').trim().toLowerCase()
  if (!key) return false
  return !recruitedNames.has(key) && recruitedNames.size >= max
}

/** Extension always forwards recruit to the app (renderer enforces pool/queue). */
export function shouldSendExtensionRecruitCommand(): true {
  return true
}

const MAESTRO_SYSTEM = `
# MAESTRO MODE — POOL + QUEUE, ORCHESTRATE ONLY (crown active)

You are A Maestro for YOUR run only. You do NOT implement the user's requested work.
Other Maestros may run in parallel in this repo — never dismiss/reassign their workers.

Workers are a small REUSABLE POOL (hard maxWorkers ceiling). Work is a QUEUE of tasks.
Reassign is the default next step; recruit only opens a free pool slot.

## Absolute
- NEVER create/edit the deliverables the user asked for (workers own implementation files).
- NEVER recruit before you write a PLAN of TASKS (backlog) from THIS user request.
- NEVER open one terminal per subtask. Prefer 1–2 slots; reassign through the backlog.
- maxWorkers is a HARD pool size, not a target. Extra recruits are queued — do not invent new names to bypass.
- NEVER give every worker the same role / same full user prompt.
- NEVER invent a plan or product the user did not ask for.
- ALWAYS pass --run <runId> (or rely on ORQUESTRA_RUN_ID) on orquestra CLI commands.
- ALWAYS wait after recruiting/reassigning, then only consolidate.
- If wait finishes quickly or workers look stuck: reassign — do NOT do their job yourself.
- Write/Edit tools are blocked. Bash is limited to orquestra CLI and read-only inspection.

## Workflow (mandatory order)
0. PLAN TASKS — ordered backlog + choose pool size K (usually 1–2)
1. RECRUIT only K stable slots (e.g. w1) with --name + --role
2. WAIT — node .orquestra/cli/orquestra.cjs wait --run <runId> --workers w1 --timeout 300
3. REASSIGN free slots to the next tasks (or let auto-drain pull the queue)
4. CONSOLIDATE — short summary of YOUR worker results only
5. DISMISS pool slots when done

## Bad vs good
- BAD: open 6–10 workers for one feature; implement files yourself after wait; control another Maestro's workers
- GOOD: one or two slots, reassign through tasks, wait, summarize
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

/**
 * Resolve this Maestro's run + PTY from env and per-run crown.
 * Prefer ORQUESTRA_RUN_ID + `.orquestra/runs/{runId}/crown.json` so after B
 * arms, A's extension still stamps A's maestroId (legacy crown.json is last-armed only).
 */
export function resolveMaestroIdentity(cwd: string): { maestroId?: string; runId?: string } {
  let runId = process.env.ORQUESTRA_RUN_ID?.trim() || undefined
  let maestroId: string | undefined

  // 1. Per-run crown when runId known
  if (runId) {
    try {
      const safeRun = runId.replace(/[/\\]/g, '_')
      const runCrownPath = path.join(cwd, '.orquestra', 'runs', safeRun, 'crown.json')
      if (fs.existsSync(runCrownPath)) {
        const crown = JSON.parse(fs.readFileSync(runCrownPath, 'utf-8')) as {
          terminalPtyId?: string
          runId?: string
        }
        if (crown.terminalPtyId) maestroId = crown.terminalPtyId
        if (crown.runId) runId = String(crown.runId)
        return { maestroId, runId }
      }
    } catch { /* fall through */ }
  }

  // 2. Registry: if only one run, use it; if ORQUESTRA_RUN_ID set, match entry
  let multiRun = false
  try {
    const regPath = path.join(cwd, '.orquestra', 'registry.json')
    if (fs.existsSync(regPath)) {
      const reg = JSON.parse(fs.readFileSync(regPath, 'utf-8')) as {
        runs?: Array<{ runId: string; maestroPtyId: string }>
      }
      const runs = Array.isArray(reg.runs) ? reg.runs : []
      multiRun = runs.length > 1
      if (runId) {
        const hit = runs.find((r) => r.runId === runId)
        if (hit?.maestroPtyId) return { maestroId: hit.maestroPtyId, runId: hit.runId }
      }
      if (runs.length === 1 && runs[0].maestroPtyId) {
        return { maestroId: runs[0].maestroPtyId, runId: runs[0].runId }
      }
    }
  } catch { /* fall through */ }

  // 3. Legacy crown.json (last-armed) — ONLY when a single run is active.
  // With multi-Maestro, last-armed crown would steal the other Maestro's identity
  // (second crown's recruits routed to first run / dropped as stale).
  if (!multiRun) {
    try {
      const crown = JSON.parse(fs.readFileSync(path.join(cwd, CROWN_MARKER), 'utf-8')) as {
        terminalPtyId?: string
        runId?: string
      }
      maestroId = crown.terminalPtyId
      if (!runId && crown.runId) runId = String(crown.runId)
    } catch { /* optional */ }
  }
  return { maestroId, runId }
}

function sendCommand(cwd: string, cmd: string, args: Record<string, unknown>): void {
  const { maestroId, runId } = resolveMaestroIdentity(cwd)
  // Prefer per-run commands dir when runId known (multi-Maestro isolation)
  const dir = runId
    ? path.join(cwd, '.orquestra', 'runs', runId.replace(/[/\\]/g, '_'), 'commands')
    : path.join(cwd, COMMANDS_DIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  // Multi-run without identity: still write, but stamp nothing wrong — demux
  // will drop_missing. Prefer ORQUESTRA_RUN_ID set at crown arm.
  const payload = JSON.stringify({
    cmd,
    args: { ...args, ...(runId ? { runId } : {}) },
    timestamp: Date.now(),
    ...(maestroId ? { maestroId } : {}),
    ...(runId ? { runId } : {}),
  })
  const filename = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
  fs.writeFileSync(path.join(dir, filename), payload)
}

function crownActive(cwd: string): boolean {
  try {
    if (process.env.ORQUESTRA_RUN_ID?.trim()) {
      const safeRun = process.env.ORQUESTRA_RUN_ID.trim().replace(/[/\\]/g, '_')
      if (fs.existsSync(path.join(cwd, '.orquestra', 'runs', safeRun, 'crown.json'))) return true
    }
    const regPath = path.join(cwd, '.orquestra', 'registry.json')
    if (fs.existsSync(regPath)) {
      const reg = JSON.parse(fs.readFileSync(regPath, 'utf-8')) as { runs?: unknown[] }
      if (Array.isArray(reg.runs) && reg.runs.length > 0) return true
    }
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
  if (
    c.includes('orquestra.js')
    || c.includes('orquestra.cjs')
    || c.includes('orquestra.cmd')
    || c.includes('.orquestra/cli/')
    || c.includes('.orquestra\\cli\\')
    || /\borquestra\b/.test(c)
  ) {
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

  // Soft guidance ~1000; hard block only absurd pastes. App also clamps.
  const MAX_ROLE = 1000
  const MAX_ROLE_HARD = 2250

  pi.registerTool({
    name: 'orquestra_recruit',
    label: 'Recruit Worker',
    description:
      'Recruit ONE worker slot after PLAN. Prefer pool (w1) + reassign. role=task for THIS step (~1000 chars soft). Never paste the full user brief.',
    promptSnippet: 'orquestra_recruit — name=slot/label, role=short unique task (after PLAN)',
    promptGuidelines: [
      'PLAN tasks first; recruit a small pool (usually 1–2 slots), reassign for next tasks.',
      'name is the slot or function id (w1, core, tests). role is ONLY this step — not the full user prompt.',
      'Keep roles under ~1000 chars. App truncates mild overage; do not paste the entire product brief.',
      'Recruit the smallest pool (usually 1–2), not maxWorkers.',
      'After recruits, orquestra_wait, then reassign or consolidate only.',
    ],
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Slot or function id (required). e.g. w1, core, api, tests',
        },
        role: {
          type: 'string',
          description:
            'Task for THIS step only (prefer ≤1000 chars). Not the full user prompt.',
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
      let role = String(params.role || '').trim()
      if (!name) {
        return ok(
          'ERROR: name (function id) is required. Example: name="api" role="Add POST /items handler only".',
        )
      }
      if (!role) {
        return ok('ERROR: role is required — short unique task for this function only.')
      }
      if (role.length < 20) {
        return ok(
          'ERROR: role is too vague. Write a specific unique job for this function (min ~20 chars), e.g. "Add POST /items validation and error responses".',
        )
      }
      if (role.length > MAX_ROLE_HARD) {
        return ok(
          `ERROR: role is ${role.length} chars (max ${MAX_ROLE_HARD}). Write a SHORT function-specific prompt only — not the full product brief.`,
        )
      }
      // Soft truncate — still send recruit so workers open (app also clamps).
      if (role.length > MAX_ROLE) {
        role = role.slice(0, MAX_ROLE - 1) + '…'
      }
      // Multi-Maestro: without run identity, recruits land in the wrong run or are dropped.
      const identity = resolveMaestroIdentity(cwd)
      if (!identity.runId || !identity.maestroId) {
        try {
          const regPath = path.join(cwd, '.orquestra', 'registry.json')
          if (fs.existsSync(regPath)) {
            const reg = JSON.parse(fs.readFileSync(regPath, 'utf-8')) as { runs?: unknown[] }
            if (Array.isArray(reg.runs) && reg.runs.length > 1) {
              return ok(
                'ERROR: multiple Maestro runs active but ORQUESTRA_RUN_ID is not set in this shell. '
                  + 'Re-enable the crown on this terminal (or run: set ORQUESTRA_RUN_ID=<your-run-id> / export). '
                  + 'Without it, recruit would steal or drop against the other Maestro.',
              )
            }
          }
        } catch { /* continue */ }
      }
      const nameKey = name.toLowerCase()
      const roleKey = role.toLowerCase().replace(/\s+/g, ' ')
      if (recruitedRoles.has(roleKey) && !recruitedNames.has(nameKey)) {
        return ok(
          'ERROR: this role text was already used for another function. Each function needs a DISTINCT short prompt.',
        )
      }
      // Always send recruit to the app — at pool capacity the renderer enqueues
      // (or reassign_idle). Do NOT hard-block here or overflow tasks are lost.
      const atPoolCeiling = isExtensionAtPoolCeiling(recruitedNames, nameKey, maxWorkers)
      if (shouldSendExtensionRecruitCommand()) {
        sendCommand(cwd, 'recruit', { role, name, agent: 'verboo' })
      }
      if (!atPoolCeiling) {
        recruitedNames.add(nameKey)
        recruitedRoles.add(roleKey)
      }
      const unique = recruitedNames.size
      const left = Math.max(0, maxWorkers - unique)
      if (atPoolCeiling) {
        return ok(
          `Function "${name}" recruit requested — pool at maxWorkers=${maxWorkers}. `
            + `App will QUEUE this task or reuse an idle slot (not open a ${maxWorkers + 1}th panel).\n`
            + `Role: ${role}\nDo not invent a new --name to bypass the pool. Prefer orquestra_reassign on a free worker, or wait for auto-drain.`,
        )
      }
      return ok(
        `Function "${name}" recruit requested (${unique} unique names, ceiling ${maxWorkers}, ${left} left).\n`
          + `Role: ${role}\nIf that name already exists, the app REUSES the panel (no second window).\n`
          + `For follow-ups prefer orquestra_reassign. Then orquestra_wait and READ completion summaries.`,
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
      'Block until named workers finish (polls .orquestra/runs/.../results or .orquestra/results). Returns each worker status + summary. Call after recruit/reassign, before consolidating.',
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
      const { runId } = resolveMaestroIdentity(cwd)

      const resultCandidates = (name: string): string[] => {
        const safe = path.basename(name).replace(/[/\\]/g, '_')
        const file = `worker-${safe}.json`
        const out: string[] = []
        if (runId) {
          out.push(path.join(cwd, '.orquestra', 'runs', runId.replace(/[/\\]/g, '_'), 'results', file))
        }
        out.push(path.join(cwd, '.orquestra', 'results', file))
        out.push(path.join(cwd, '.orquestra-results', file)) // pre-hub fallback
        return out
      }

      const readResult = (name: string): {
        status: string | null
        summary: string
        role: string
      } => {
        for (const fp of resultCandidates(name)) {
          if (!fs.existsSync(fp)) continue
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
            /* try next */
          }
        }
        return { status: null, summary: '', role: '' }
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
        `Wait timed out after ${timeoutSec}s. Check .orquestra/results (or runs/*/results) and reassign failed workers. Do not implement their work yourself.`,
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
5) After recruits: orquestra_wait (or node .orquestra/cli/orquestra.cjs wait). If wait is short or workers idle, reassign — do not code.
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
            'Maestro mode: bash is limited to node .orquestra/cli/orquestra.cjs ... and read-only inspection. Delegate implementation via orquestra_recruit.',
        }
      }
    }
  })
}
