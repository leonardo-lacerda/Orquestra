// =============================================================================
// useOrquestra — Hook that listens for Maestro commands from terminals and
// executes canvas operations (recruit, dismiss, connect, list, reassign).
// =============================================================================

import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { terminalRegistry } from '../lib/terminal/terminalRegistry'
import { findCanvasNodeForPanel } from '../stores/canvasStore'
import { useOrchestrationRunStore } from '../stores/orchestrationRunStore'
import {
  applyAgentPermissionFlags,
  canDispatchTask,
  detectWorkerAgentFromCommand,
  latestRunSnapshotRelative,
  parseRunSnapshot,
  resolveSlot,
  resolveWorkerAgentBaseCommand,
  type OrchestrationPlan,
} from '../../shared/orchestration'
import { DEFAULT_SETTINGS, type AppSettings, type OrquestraWorkerSummary, type PanelType, type Point } from '../../shared/types'
import { orq, orqError, orqWarn } from '../lib/orquestraLog'

/**
 * True when recruit `--agent` names a panel kind, not a shell CLI to run.
 * Must NOT match free-text CLIs that merely contain the substring "agent".
 */
export function isRecruitPanelKindArg(agentArg: string | undefined): boolean {
  const normalized = agentArg?.toLowerCase().trim()
  if (!normalized || normalized === 'auto') return true
  if (normalized === 'terminal' || normalized === 'agent') return true
  // Legacy panel kinds only (exact token), never substrings like "my-agent".
  return false
}

/**
 * Resolve the shell command to start a worker agent.
 * Prefer preset AI (verboo/claude/codex/opencode); apply per-CLI bypass flags.
 *
 * `agentArg` from recruit may be a panel kind (`terminal`/`agent`/`auto`) or an
 * explicit CLI name/command (`verboo`, `claude`, `codex …`).
 *
 * Always applies permission mode from settings — even when recruit passes an
 * explicit CLI name like `verboo` (skills often do).
 */
export function resolveWorkerAgentCommand(
  agentArg: string | undefined,
  settings: Partial<AppSettings> | AppSettings | null | undefined,
): string {
  const s = settings ?? {}
  const permissionMode =
    s.orchestrationPermissionMode === 'bypass' ? 'bypass' : 'ask'
  const workerAgent =
    s.orchestrationDefaultWorkerAgent
    ?? DEFAULT_SETTINGS.orchestrationDefaultWorkerAgent

  const useDefault = isRecruitPanelKindArg(agentArg)

  // Explicit CLI from recruit (--agent codex) wins as the binary; otherwise
  // use the configured preset / custom command.
  const base = useDefault
    ? resolveWorkerAgentBaseCommand({
      orchestrationDefaultWorkerAgent: workerAgent,
      orchestrationDefaultAgentCommand:
        s.orchestrationDefaultAgentCommand
        ?? DEFAULT_SETTINGS.orchestrationDefaultAgentCommand,
    })
    : String(agentArg).trim()

  // When using defaults, trust the preset id for flags. When an explicit CLI
  // was passed, detect from that binary so flags match (codex ≠ claude).
  const agentHint = useDefault
    ? workerAgent
    : detectWorkerAgentFromCommand(base)

  const cmd = applyAgentPermissionFlags(base || '', permissionMode, agentHint)
  return cmd
}

const MAX_AGENT_RETRIES = 20 // 10s max waiting for terminal pty
const AGENT_POLL_MS = 500
const MAX_ROLE_WAIT = 15 // 15s max waiting for agent to produce output
const ROLE_POLL_MS = 1000

export function resolveAgentPanelType(agent: string | undefined, settings: AppSettings): PanelType {
  const normalized = agent?.toLowerCase().trim()
  if (!normalized || normalized === 'auto') return settings.orchestrationDefaultWorkerKind
  // Explicit panel kinds
  if (normalized === 'terminal') return 'terminal'
  if (normalized === 'agent') return 'agent'
  // Known worker AI CLIs always run in a terminal (not the built-in agent panel).
  const first = normalized.split(/\s+/)[0] ?? ''
  if (
    first === 'verboo'
    || first === 'claude'
    || first === 'claude-code'
    || first === 'codex'
    || first === 'opencode'
  ) {
    return 'terminal'
  }
  // Legacy: strings containing "agent" still mean the agent panel type.
  if (normalized.includes('agent')) return 'agent'
  // Free-text CLI command → terminal
  return 'terminal'
}

/** True when this PTY is already registered as a worker of another maestro. */
export function isWorkerPty(
  maestroId: string,
  workerPtyToPanel: Map<string, { maestroId: string; panelId: string }>,
): boolean {
  return workerPtyToPanel.has(maestroId)
}

/** Mutable tracking maps held by useOrquestra (refs). */
export interface WorkerTrackingMaps {
  workerPanelIds: Map<string, Set<string>>
  workerNamesByMaestro: Map<string, Map<string, string>>
  workerPtyToPanel: Map<string, { maestroId: string; panelId: string }>
}

/**
 * Free a worker's maxWorkers slot and identity maps after dismiss/exit (panel gone).
 * Used by TERMINAL_EXIT and dismiss. Idle completion uses softReleaseWorkerPty so the
 * open panel stays reusable for reassign and still counts toward maxWorkers capacity.
 */
export function releaseWorkerTracking(
  maps: WorkerTrackingMaps,
  opts: { maestroId: string; panelId: string; workerPtyId?: string },
): void {
  maps.workerPanelIds.get(opts.maestroId)?.delete(opts.panelId)
  maps.workerNamesByMaestro.get(opts.maestroId)?.delete(opts.panelId)
  if (opts.workerPtyId) {
    maps.workerPtyToPanel.delete(opts.workerPtyId)
  } else {
    for (const [ptyId, tracked] of maps.workerPtyToPanel) {
      if (tracked.panelId === opts.panelId) maps.workerPtyToPanel.delete(ptyId)
    }
  }
}

/**
 * Idle/done: drop PTY activity tracking only. Keep panel id + name so the
 * Maestro can reassign the same worker and maxWorkers still reflects open panels.
 */
export function softReleaseWorkerPty(
  maps: WorkerTrackingMaps,
  opts: { workerPtyId?: string; panelId?: string },
): void {
  if (opts.workerPtyId) {
    maps.workerPtyToPanel.delete(opts.workerPtyId)
  }
  if (opts.panelId) {
    for (const [ptyId, tracked] of maps.workerPtyToPanel) {
      if (tracked.panelId === opts.panelId) maps.workerPtyToPanel.delete(ptyId)
    }
  }
}

/** Strip trailing -N so html-2 / html match the same function slot. */
export function normalizeWorkerFunctionId(name: string): string {
  const n = name.trim().toLowerCase()
  if (!n) return ''
  return n.replace(/-\d+$/, '') || n
}

/** Find an open worker panel by current UI title (case-insensitive). */
export function findWorkerPanelByName(
  panels: Record<string, { id: string; title?: string }>,
  name: string,
): { id: string; title?: string } | undefined {
  const want = name.trim().toLowerCase()
  if (!want) return undefined
  return Object.values(panels).find((p) => {
    const t = (p.title || '').replace(/\s•\s*$/, '').trim().toLowerCase()
    return t === want
  })
}

/**
 * Resolve a reusable worker panel for recruit/reassign.
 *
 * CRITICAL: agent CLIs often overwrite the panel title via OSC (e.g. "Fix
 * calculator HTML…"), so title-only lookup fails and Orquestra used to spawn
 * html-2 while html was still open. Prefer the stable namesMap (panelId→function
 * id) set at recruit time.
 */
export function resolveReusableWorkerPanel(opts: {
  requestedName: string
  panels: Record<string, { id: string; title?: string }>
  /** panelId → stable function id (html, css, …) */
  namesMap: Map<string, string> | Iterable<[string, string]>
  runEntries?: Iterable<{ panelId: string; name: string; status?: string }>
}): { panelId: string; functionName: string } | null {
  const want = opts.requestedName.trim().toLowerCase()
  if (!want) return null
  const wantBase = normalizeWorkerFunctionId(want)
  const names =
    opts.namesMap instanceof Map
      ? opts.namesMap
      : new Map(opts.namesMap)

  const panelStillOpen = (panelId: string) => Boolean(opts.panels[panelId])

  const nameMatches = (fname: string) => {
    const f = fname.trim().toLowerCase()
    if (!f) return false
    if (f === want || f === wantBase) return true
    if (normalizeWorkerFunctionId(f) === wantBase) return true
    // requested html-2 while map has html, or vice versa
    if (normalizeWorkerFunctionId(want) === normalizeWorkerFunctionId(f)) return true
    return false
  }

  // 1. Stable function ids (survives OSC title changes) — prefer exact, then base
  let baseHit: { panelId: string; functionName: string } | null = null
  for (const [panelId, fname] of names) {
    if (!panelStillOpen(panelId)) continue
    const f = fname.trim().toLowerCase()
    if (f === want) return { panelId, functionName: fname }
    if (!baseHit && nameMatches(fname)) {
      baseHit = { panelId, functionName: fname }
    }
  }
  if (baseHit) return baseHit

  // 2. Run-store entries (same session)
  if (opts.runEntries) {
    for (const e of opts.runEntries) {
      if (!panelStillOpen(e.panelId)) continue
      if (nameMatches(e.name)) {
        return { panelId: e.panelId, functionName: e.name }
      }
    }
  }

  // 3. Current panel title (only works before agent renames the tab)
  const byTitle = findWorkerPanelByName(opts.panels, opts.requestedName)
  if (byTitle) return { panelId: byTitle.id, functionName: opts.requestedName }

  // 4. Title equals base function id
  const byBaseTitle = findWorkerPanelByName(opts.panels, wantBase)
  if (byBaseTitle) return { panelId: byBaseTitle.id, functionName: wantBase }

  return null
}

/** Active worker slot count for a maestro (feeds evaluateRecruitGuard maxWorkers). */
export function activeWorkerSlotCount(
  workerPanelIds: Map<string, Set<string>>,
  maestroId: string,
): number {
  return workerPanelIds.get(maestroId)?.size ?? 0
}

/**
 * Max chars for --role. Forces Maestro to write a short function-specific
 * prompt instead of pasting the full product brief into every worker.
 */
export const MAX_WORKER_ROLE_CHARS = 220

/** Terminal-facing messages for hard recruit rejects (single source of truth). */
export const ORQUESTRA_RECRUIT_MSG = {
  nestedDisabled:
    '[orquestra] Nested workers are disabled. Only the Maestro terminal may recruit.',
  nestedNonMaestro:
    '[orquestra] Nested workers are disabled. Enable Maestro (crown) on this terminal first, or turn on nested workers in Settings.',
  workerLimit: (active: number, max: number) =>
    `[orquestra] Worker limit reached (${active}/${max}). Reassign an existing worker or dismiss one before recruiting more.`,
  emptyRole:
    '[orquestra] Recruit rejected: --role is required. Each worker needs a unique, specific task for its function.',
  missingName:
    '[orquestra] Recruit rejected: --name is required (function id). Example: --name html --role "Create only index.html structure".',
  roleTooLong: (len: number, max: number) =>
    `[orquestra] Recruit rejected: --role is ${len} chars (max ${max}). Write a SHORT function-specific prompt only — not the full product brief. Example: --name css --role "Create only styles.css for the calculator UI".`,
  duplicateRole: (rolePreview: string) =>
    `[orquestra] Recruit rejected: role is not unique ("${rolePreview}"). Each function needs its own distinct prompt.`,
  duplicateName: (name: string) =>
    `[orquestra] Recruit rejected: --name "${name}" is already an active worker. Each function needs a unique name (html, css, js, …).`,
  similarRole: (otherPreview: string) =>
    `[orquestra] Recruit rejected: role is too similar to an active worker ("${otherPreview}"). Give each function a clearly different prompt (different file/ownership).`,
} as const

/** Normalize role text for uniqueness checks (case/whitespace insensitive). */
export function normalizeRoleKey(role: string): string {
  return role.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * True when `role` collides with an existing active worker role.
 * Exact match after normalize — blocks the "10 workers, same prompt" failure mode.
 */
export function isDuplicateRole(role: string, existingRoles: Iterable<string>): boolean {
  const key = normalizeRoleKey(role)
  if (!key) return false
  for (const existing of existingRoles) {
    if (normalizeRoleKey(existing) === key) return true
  }
  return false
}

/** Content words (≥3 chars) for soft similarity. */
function roleWordSet(role: string): Set<string> {
  return new Set(
    normalizeRoleKey(role)
      .split(/[^a-z0-9_.-]+/)
      .filter((w) => w.length >= 3),
  )
}

/**
 * Jaccard similarity on content words. High score = near-duplicate brief
 * pasted into multiple workers with only a prefix change.
 */
export function roleSimilarity(a: string, b: string): number {
  const wa = roleWordSet(a)
  const wb = roleWordSet(b)
  if (wa.size === 0 || wb.size === 0) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  const union = wa.size + wb.size - inter
  return union === 0 ? 0 : inter / union
}

/** Reject near-duplicates of long product briefs (exact match handled separately). */
export const ROLE_SIMILARITY_REJECT = 0.72

export function findTooSimilarRole(
  role: string,
  existingRoles: Iterable<string>,
  threshold = ROLE_SIMILARITY_REJECT,
): string | null {
  const key = normalizeRoleKey(role)
  if (key.length < 40) return null // short specialized roles rarely need this
  for (const existing of existingRoles) {
    if (normalizeRoleKey(existing) === key) continue
    if (roleSimilarity(role, existing) >= threshold) return existing
  }
  return null
}

/**
 * Hard recruit policy used by the live onMaestroRecruit path.
 * Nested/maxWorkers/name/role uniqueness are enforced here (not only in prompts).
 */
export function evaluateRecruitGuard(input: {
  allowNestedWorkers: boolean
  callerIsWorkerPty: boolean
  /** null = panel unknown (skip maestro-flag check); false = non-maestro panel */
  panelMaestroFlag: boolean | null
  activeWorkerCount: number
  maxWorkers: number
  /** Raw --role from recruit; empty is rejected. */
  role?: string
  /** Function id from --name (required when provided as empty string check). */
  name?: string
  /** Require non-empty --name (function id). Default true when name is passed. */
  requireName?: boolean
  /** Roles of recruiting/running workers under this maestro (for uniqueness). */
  existingRoles?: Iterable<string>
  /** Active worker names under this maestro. */
  existingNames?: Iterable<string>
}): { allow: true } | { allow: false; message: string } {
  if (!input.allowNestedWorkers && input.callerIsWorkerPty) {
    return { allow: false, message: ORQUESTRA_RECRUIT_MSG.nestedDisabled }
  }
  if (!input.allowNestedWorkers && input.panelMaestroFlag === false) {
    return { allow: false, message: ORQUESTRA_RECRUIT_MSG.nestedNonMaestro }
  }
  const maxWorkers = Math.max(1, Math.floor(input.maxWorkers || 1))
  if (input.activeWorkerCount >= maxWorkers) {
    return {
      allow: false,
      message: ORQUESTRA_RECRUIT_MSG.workerLimit(input.activeWorkerCount, maxWorkers),
    }
  }

  const requireName = input.requireName !== false && input.name !== undefined
  const name = (input.name ?? '').trim()
  if (requireName && !name) {
    return { allow: false, message: ORQUESTRA_RECRUIT_MSG.missingName }
  }
  if (name && input.existingNames) {
    const taken = new Set([...input.existingNames].map((n) => n.toLowerCase()))
    if (taken.has(name.toLowerCase())) {
      return { allow: false, message: ORQUESTRA_RECRUIT_MSG.duplicateName(name) }
    }
  }

  const role = (input.role ?? '').trim()
  if (input.role !== undefined && !role) {
    return { allow: false, message: ORQUESTRA_RECRUIT_MSG.emptyRole }
  }
  if (role.length > MAX_WORKER_ROLE_CHARS) {
    return {
      allow: false,
      message: ORQUESTRA_RECRUIT_MSG.roleTooLong(role.length, MAX_WORKER_ROLE_CHARS),
    }
  }
  if (role && input.existingRoles) {
    if (isDuplicateRole(role, input.existingRoles)) {
      const preview = role.length > 80 ? role.slice(0, 77) + '…' : role
      return { allow: false, message: ORQUESTRA_RECRUIT_MSG.duplicateRole(preview) }
    }
    const similar = findTooSimilarRole(role, input.existingRoles)
    if (similar) {
      const preview = similar.length > 80 ? similar.slice(0, 77) + '…' : similar
      return { allow: false, message: ORQUESTRA_RECRUIT_MSG.similarRole(preview) }
    }
  }
  return { allow: true }
}

/** Workspace-relative path for a maestro panel's linked-context bundle. */
export function maestroLinkedContextRelativePath(maestroPanelId: string): string {
  return `.orquestra/context/${maestroPanelId}/latest.md`
}

/** Allocate a unique worker tab name under this maestro (case-insensitive). */
export function allocateUniqueWorkerName(
  requested: string | undefined,
  prefix: string,
  existingNames: Iterable<string>,
  nextIndex: number,
): string {
  const taken = new Set([...existingNames].map((n) => n.toLowerCase()))
  const base = (requested?.trim() || `${prefix}-${nextIndex}`).trim() || `${prefix}-${nextIndex}`
  if (!taken.has(base.toLowerCase())) return base
  let i = 2
  while (taken.has(`${base}-${i}`.toLowerCase())) i++
  return `${base}-${i}`
}

/**
 * Canonical completion token workers should print *after* finishing work.
 * MUST NOT appear in inject text — idle treats inject echo as non-work, but
 * putting the token in the inject historically caused false done in ~10–19s.
 */
export const WORKER_COMPLETION_TOKEN = 'ORQUESTRA_WORKER_DONE'

/** Workspace-relative path for a worker's ROLE.md (Maestri-style role at rest). */
export function workerRoleFileRelativePath(workerName: string): string {
  const safe = (workerName.trim() || 'worker').replace(/[/\\]/g, '_').replace(/\.\./g, '_')
  return `.orquestra/workers/${safe}/ROLE.md`
}

/** Full ROLE.md body written on recruit — includes completion token (file only). */
export function buildWorkerRoleFileContent(workerName: string, role: string): string {
  const name = workerName.trim() || 'worker'
  const task = role.trim()
  return [
    `# Worker function: ${name}`,
    '',
    '## Your only job',
    task,
    '',
    '## Rules',
    '- Start immediately. Use your tools to create/edit the files for this job.',
    '- Do not wait for other workers. Do not recruit other workers.',
    '- Complete ONLY this function\'s deliverable.',
    '',
    '## When finished',
    `Print a short summary, then on its own line exactly: ${WORKER_COMPLETION_TOKEN}`,
    '',
  ].join('\n')
}

/**
 * Build the worker task message for PTY inject / reassign.
 *
 * CRITICAL:
 * - Single short line (no multi-line Enter fragmentation).
 * - MUST NOT contain WORKER_COMPLETION_TOKEN / ORQUESTRA_WORKER_DONE (false idle).
 * - Imperative so the agent executes, not only acknowledges.
 */
export function workerRoleWithPolicy(
  role: string,
  settings: AppSettings,
  workerName?: string,
  roleFilePath?: string,
): string {
  const task = role.trim().replace(/\s+/g, ' ')
  const fn = workerName?.trim()
  const fileHint = roleFilePath?.trim()
    ? ` Full brief: ${roleFilePath.trim()}.`
    : ''
  // Function id first; pure task second; explicit "start now / use tools".
  const head = fn
    ? `You are the "${fn}" worker. Do this job now: ${task}.${fileHint}`
    : `Do this job now: ${task}.${fileHint}`

  const bits: string[] = [
    head,
    'Start immediately. Use your tools to write the files or complete the work — do not only plan or echo the task.',
    'Do not wait for other workers.',
  ]
  if (!settings.orchestrationAllowNestedWorkers) {
    bits.push('Do not recruit other workers.')
  }
  if (!settings.orchestrationAllowFileEdits) {
    bits.push('Do not modify files — describe changes only.')
  }
  if (!settings.orchestrationAllowCommands) {
    bits.push('Do not run shell commands.')
  }
  // Tell workers to signal completion without embedding the token in inject
  // (token is in ROLE.md; idle only accepts the token from real agent output).
  bits.push('When finished, print a short summary and the completion token from your ROLE.md on its own line.')
  return bits.join(' ')
}

/** PTY control bytes used when injecting worker tasks. */
export const PTY_CR = String.fromCharCode(13) // Enter — submit
export const PTY_CTRL_U = String.fromCharCode(21) // clear line (readline / most agent TUIs)
export const PTY_CTRL_A = String.fromCharCode(1) // start of line
export const PTY_CTRL_K = String.fromCharCode(11) // kill to end of line
export const PTY_ESC = String.fromCharCode(27) // leave multi-line / cancel partial

/**
 * Clear residual text left in an agent CLI input field after submit.
 * Without this, verboo/etc. often keep the inject visible in the composer
 * so it looks like the prompt can be sent again.
 */
export function clearWorkerInputField(ptyId: string): void {
  // Esc exits multi-line compose; Ctrl+A+K and Ctrl+U wipe leftover buffer.
  window.electronAPI?.terminalWrite?.(
    ptyId,
    PTY_ESC + PTY_CTRL_A + PTY_CTRL_K + PTY_CTRL_U + PTY_CTRL_U,
  )
}

/**
 * Write a one-line task into a worker PTY, submit it (Enter), then clear the
 * input field so the prompt does not stay in the composer.
 * Notifies main with inject + optional ROLE.md fingerprints so idle ignores echo.
 */
export function injectWorkerTaskToPty(
  ptyId: string,
  taskLine: string,
  roleFileText?: string | null,
): void {
  const line = flattenRoleForTerminalInject(taskLine)
  if (!line) return

  // Type task + Enter in one write (submit as a single user message).
  window.electronAPI?.terminalWrite?.(ptyId, line + PTY_CR)

  // Fingerprints for idle: ignore inject + ROLE.md if they echo into the buffer.
  void window.electronAPI?.orquestraNoteRoleInject?.(
    ptyId,
    line,
    roleFileText?.trim() ? roleFileText : undefined,
  )

  // Second Enter shortly after — some CLIs only submit on a clean trailing CR.
  setTimeout(() => {
    window.electronAPI?.terminalWrite?.(ptyId, PTY_CR)
  }, 150)

  // Clear the input composer so the task is not left as re-sendable draft text.
  setTimeout(() => {
    clearWorkerInputField(ptyId)
  }, 350)

  // One more clear after the TUI has painted the submitted turn.
  setTimeout(() => {
    clearWorkerInputField(ptyId)
  }, 700)
}

/**
 * Flatten any multi-line text into one PTY-safe agent message.
 * Defensive: even if callers pass newlines, inject stays one Enter.
 */
export function flattenRoleForTerminalInject(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Deterministic recruit inject: function-tagged short task only.
 * Linked context path is optional and kept short (no body dump).
 * Never includes WORKER_COMPLETION_TOKEN.
 */
export function buildRecruitRoleText(
  role: string,
  settings: AppSettings,
  linked?: { relativePath: string; content?: string | null },
  workerName?: string,
  roleFilePath?: string,
): string {
  let text = workerRoleWithPolicy(role, settings, workerName, roleFilePath)
  // Prefer pure task — only mention context path if present (agents can open it).
  if (linked?.relativePath) {
    text += ` Optional context: ${linked.relativePath}`
  }
  return flattenRoleForTerminalInject(text)
}

function writeToMaestro(maestroId: string, message: string): void {
  const cr = String.fromCharCode(13)
  window.electronAPI?.terminalWrite?.(maestroId, message + cr)
}

export function formatWorkerListForTerminal(workers: OrquestraWorkerSummary[]): string {
  if (workers.length === 0) return '[orquestra] Workers: none'
  const lines = workers.map((worker) => {
    const role = worker.role.trim() ? ` - ${worker.role.trim()}` : ''
    return `- ${worker.name} [${worker.status}] (${worker.workerId})${role}`
  })
  return ['[orquestra] Workers:', ...lines].join('\n')
}

/**
 * Submit a new task to an existing worker panel (reuse — no new terminal).
 * Writes ROLE.md, re-tracks the PTY, injects the task, updates run store.
 */
export async function reassignExistingWorker(opts: {
  maestroId: string
  panelId: string
  name: string
  role: string
  settings: AppSettings
  workspaceRoot: string
  workspaceId: string
}): Promise<{ ok: true; ptyId: string } | { ok: false; reason: string }> {
  const ptyId = terminalRegistry.ptyIdForPanel(opts.panelId)
  if (!ptyId) return { ok: false, reason: 'Worker terminal PTY not ready' }
  if (!opts.role.trim()) return { ok: false, reason: 'Role is empty' }

  const roleFileRel = workerRoleFileRelativePath(opts.name)
  const roleFileBody = buildWorkerRoleFileContent(opts.name, opts.role)
  if (opts.workspaceRoot) {
    const absRole = opts.workspaceRoot.replace(/[/\\]+$/, '')
      + '/' + roleFileRel.replace(/\\/g, '/')
    try {
      await window.electronAPI?.fsWriteFile?.(absRole, roleFileBody, opts.workspaceId)
    } catch {
      // best-effort
    }
  }

  const inject = buildRecruitRoleText(
    opts.role,
    opts.settings,
    undefined,
    opts.name,
    roleFileRel,
  )
  // Re-track as running so wait/idle work again for this task.
  await window.electronAPI?.orquestraTrackWorker?.(
    ptyId,
    opts.maestroId,
    opts.name,
    opts.role,
    opts.workspaceRoot || '',
  )
  injectWorkerTaskToPty(ptyId, inject, roleFileBody)
  useOrchestrationRunStore.getState().noteRecruit({
    maestroPtyId: opts.maestroId,
    panelId: opts.panelId,
    name: opts.name,
    role: opts.role,
  })
  useOrchestrationRunStore.getState().noteWorkerReady(opts.panelId, ptyId)
  return { ok: true, ptyId }
}

/** Calculate a position for a new worker, offset from the orquestrador node.
 *  Workers are placed to the right of the orquestrador in a 2-column grid. */
function workerPosition(maestroId: string, recruitCountRef: React.MutableRefObject<Map<string, number>>, maestroPanelId: string): Point {
  const count = recruitCountRef.current.get(maestroId) || 0
  const col = count % 2
  const row = Math.floor(count / 2)

  // Try to find the orquestrador's canvas position for a smarter offset
  const orquestrador = findCanvasNodeForPanel(maestroPanelId)
  if (orquestrador) {
    const node = orquestrador.store.getState().nodes[orquestrador.nodeId]
    if (node) {
      return { x: node.origin.x + 600 + col * 500, y: node.origin.y + row * 350 }
    }
  }

  // Fallback: absolute grid
  return { x: 600 + col * 500, y: 100 + row * 350 }
}

/** Persist run snapshot under workspace .orquestra/runs/latest.json (best-effort). */
export async function persistOrchestrationSnapshot(
  workspaceRoot: string,
  workspaceId: string,
  maestroPtyId: string,
  namesMap: Map<string, string>,
): Promise<void> {
  if (!workspaceRoot || !window.electronAPI?.fsWriteFile) return
  const names: Record<string, string> = {}
  for (const [k, v] of namesMap) names[k] = v
  const state = useOrchestrationRunStore.getState()
  // If store lost plan, try keep any plan already on disk (soft read — missing is fine)
  if (!state.plan) {
    try {
      const absRead = workspaceRoot.replace(/[/\\]+$/, '')
        + '/' + latestRunSnapshotRelative().replace(/\\/g, '/')
      const text = window.electronAPI.fsReadFileIfExists
        ? await window.electronAPI.fsReadFileIfExists(absRead, workspaceId)
        : null
      if (text) {
        const prev = parseRunSnapshot(JSON.parse(text))
        if (prev?.plan) state.setPlan(prev.plan)
      }
    } catch { /* ignore */ }
  }
  const snap = useOrchestrationRunStore.getState().toSnapshot(maestroPtyId, names)
  const rel = latestRunSnapshotRelative()
  const abs = workspaceRoot.replace(/[/\\]+$/, '') + '/' + rel.replace(/\\/g, '/')
  try {
    await window.electronAPI.fsWriteFile(abs, JSON.stringify(snap, null, 2), workspaceId)
  } catch {
    // best-effort
  }
}

/** Load plan from store or .orquestra/runs/latest.json for ready-only dispatch. */
export async function loadActivePlan(
  workspaceRoot: string,
  workspaceId: string,
): Promise<OrchestrationPlan | null> {
  const state = useOrchestrationRunStore.getState()
  if (state.plan) return state.plan
  if (!workspaceRoot || !window.electronAPI?.fsReadFileIfExists) return null
  try {
    const abs = workspaceRoot.replace(/[/\\]+$/, '')
      + '/' + latestRunSnapshotRelative().replace(/\\/g, '/')
    const text = await window.electronAPI.fsReadFileIfExists(abs, workspaceId)
    if (!text) return null
    const snap = parseRunSnapshot(JSON.parse(text))
    if (snap?.plan) {
      state.setPlan(snap.plan)
      return snap.plan
    }
  } catch { /* ignore */ }
  return null
}

export function useOrquestra(): void {
  const recruitCountRef = useRef<Map<string, number>>(new Map())
  const workerPanelIdsRef = useRef<Map<string, Set<string>>>(new Map())
  /** panelId → display name (for uniqueness + dismiss by title) */
  const workerNamesByMaestroRef = useRef<Map<string, Map<string, string>>>(new Map())
  const workerPtyToPanelRef = useRef<Map<string, { maestroId: string; panelId: string }>>(new Map())

  // One maestro flag per workspace after hydrate (pre-single-maestro sessions).
  useEffect(() => {
    const wsId = useAppStore.getState().selectedWorkspaceId
    if (!wsId) return
    void import('../lib/maestro/sanitizeMaestroFlags').then(({ sanitizeMaestroFlags }) => {
      sanitizeMaestroFlags(wsId)
    })
  }, [])

  // Hydrate function-name maps + run store from .orquestra/runs/latest.json
  useEffect(() => {
    const store = useAppStore.getState()
    const ws =
      store.workspaces.find((w) => w.id === store.selectedWorkspaceId)
      ?? store.workspaces[0]
    if (!ws?.rootPath || !window.electronAPI?.fsReadFileIfExists) return
    const abs = ws.rootPath.replace(/[/\\]+$/, '')
      + '/' + latestRunSnapshotRelative().replace(/\\/g, '/')
    void window.electronAPI.fsReadFileIfExists(abs, ws.id).then((text) => {
      if (!text) return
      try {
        const snap = parseRunSnapshot(JSON.parse(text))
        if (!snap) return
        useOrchestrationRunStore.getState().hydrateFromSnapshot(snap)
        const maestroKey = snap.maestroPtyId || 'unknown'
        const namesMap = workerNamesByMaestroRef.current.get(maestroKey) ?? new Map<string, string>()
        for (const [panelId, name] of Object.entries(snap.namesByPanelId)) {
          if (ws.panels[panelId]) {
            namesMap.set(panelId, name)
            const set = workerPanelIdsRef.current.get(maestroKey) ?? new Set<string>()
            set.add(panelId)
            workerPanelIdsRef.current.set(maestroKey, set)
          }
        }
        workerNamesByMaestroRef.current.set(maestroKey, namesMap)
      } catch {
        // ignore corrupt snapshot
      }
    }).catch(() => { /* access / I/O only — missing is null */ })
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.onMaestroRecruit) return

    const unsubs = [
      // --- Recruit ---
      window.electronAPI.onMaestroRecruit(async (maestroId, args) => {
        const store = useAppStore.getState()
        const settings = useSettingsStore.getState()
        const runStore = useOrchestrationRunStore.getState()
        // Prefer selected workspace (multi-workspace safe), fall back to first.
        const ws =
          store.workspaces.find((w) => w.id === store.selectedWorkspaceId)
          ?? store.workspaces[0]
        if (!ws) return

        const orchestratorPanelId = terminalRegistry.panelIdForPty(maestroId)
        const orchPanel = orchestratorPanelId ? ws.panels[orchestratorPanelId] : undefined
        const workerPanelIds = workerPanelIdsRef.current.get(maestroId) ?? new Set<string>()
        workerPanelIdsRef.current.set(maestroId, workerPanelIds)
        const namesMap = workerNamesByMaestroRef.current.get(maestroId) ?? new Map<string, string>()
        workerNamesByMaestroRef.current.set(maestroId, namesMap)

        const maxWorkers = Math.max(1, Math.floor(settings.orchestrationMaxWorkers || 1))
        const requestedName = (args.name || '').trim()
        const allRunEntries = runStore.listForMaestro(maestroId)

        // Ready-only dispatch when a plan is installed (criterion 2).
        const activePlan = await loadActivePlan(ws.rootPath || '', ws.id)
        if (requestedName && activePlan) {
          const gate = canDispatchTask(activePlan, requestedName)
          if (!gate.allow) {
            writeToMaestro(maestroId, `[orquestra] ${gate.reason}`)
            orqWarn(`plan blocked ${requestedName}: ${gate.reason}`)
            return
          }
        }

        // REUSE (preferred path): stable function id → same panel even if the
        // agent renamed the tab (OSC title). Prevents html-2 while html is idle.
        if (requestedName && args.role) {
          const reusable = resolveReusableWorkerPanel({
            requestedName,
            panels: ws.panels,
            namesMap,
            runEntries: allRunEntries,
          })
          if (reusable) {
            const stableName = reusable.functionName || requestedName
            // Restore tab title to function id so later lookups stay easy.
            store.updatePanelTitle(ws.id, reusable.panelId, stableName)
            const reused = await reassignExistingWorker({
              maestroId,
              panelId: reusable.panelId,
              name: stableName,
              role: args.role,
              settings,
              workspaceRoot: ws.rootPath || '',
              workspaceId: ws.id,
            })
            if (reused.ok) {
              workerPanelIds.add(reusable.panelId)
              namesMap.set(reusable.panelId, stableName)
              workerPtyToPanelRef.current.set(reused.ptyId, {
                maestroId,
                panelId: reusable.panelId,
              })
              writeToMaestro(
                maestroId,
                `[orquestra] Reused worker "${stableName}" (no new panel). Role: ${args.role.slice(0, 120)}`,
              )
              orq(`~ ${stableName} reuse → task`)
              void persistOrchestrationSnapshot(ws.rootPath || '', ws.id, maestroId, namesMap)
              return
            }
            // PTY gone — drop stale maps and allow a real new panel below.
            orqWarn(`~ ${stableName} reuse failed: ${reused.reason}`)
            releaseWorkerTracking(
              {
                workerPanelIds: workerPanelIdsRef.current,
                workerNamesByMaestro: workerNamesByMaestroRef.current,
                workerPtyToPanel: workerPtyToPanelRef.current,
              },
              { maestroId, panelId: reusable.panelId },
            )
          }
        }

        // Prune maps for panels that were closed outside dismiss.
        for (const panelId of [...workerPanelIds]) {
          if (!ws.panels[panelId]) {
            releaseWorkerTracking(
              {
                workerPanelIds: workerPanelIdsRef.current,
                workerNamesByMaestro: workerNamesByMaestroRef.current,
                workerPtyToPanel: workerPtyToPanelRef.current,
              },
              { maestroId, panelId },
            )
          }
        }

        const activeEntries = allRunEntries
          .filter((w) => w.status === 'recruiting' || w.status === 'running')
        // Capacity via slot manager (reuse already handled; may queue / dismiss unused).
        const openCount = workerPanelIds.size
        const slotPanels = [...namesMap.entries()]
          .filter(([panelId]) => Boolean(ws.panels[panelId]))
          .map(([panelId, functionName]) => {
            const entry = allRunEntries.find((w) => w.panelId === panelId)
            return {
              panelId,
              functionName,
              status: entry?.status ?? 'done',
            }
          })
        const slot = resolveSlot({
          requestedName: requestedName || 'worker',
          openPanels: slotPanels,
          maxWorkers,
          allowDismissUnused: true,
        })
        if (slot.action === 'queue' || (slot.action === 'reject')) {
          const openNames = [...namesMap.values()].join(', ') || '(unknown)'
          writeToMaestro(
            maestroId,
            `[orquestra] Worker limit reached (${openCount}/${maxWorkers}). `
            + `Reuse an existing panel with the same --name (or reassign/dismiss). Open: ${openNames}.`,
          )
          orqWarn(`capacity ${openCount}/${maxWorkers} — open: ${openNames}`)
          return
        }
        if (slot.action === 'dismiss_then_recruit') {
          // Free an idle/done unused panel so a new function can start.
          const dismissId = slot.dismissPanelId
          releaseWorkerTracking(
            {
              workerPanelIds: workerPanelIdsRef.current,
              workerNamesByMaestro: workerNamesByMaestroRef.current,
              workerPtyToPanel: workerPtyToPanelRef.current,
            },
            { maestroId, panelId: dismissId },
          )
          runStore.noteDismiss(dismissId)
          if (ws.panels[dismissId]) {
            store.closePanel(ws.id, dismissId)
          }
          writeToMaestro(
            maestroId,
            `[orquestra] Dismissed idle worker to free a slot for "${requestedName}".`,
          )
        }

        // Recompute after possible dismiss — openCount before dismiss would
        // always trip maxWorkers and block the intended recruit.
        const openCountAfter = workerPanelIds.size
        const guard = evaluateRecruitGuard({
          allowNestedWorkers: settings.orchestrationAllowNestedWorkers,
          callerIsWorkerPty: isWorkerPty(maestroId, workerPtyToPanelRef.current),
          // Only apply maestro-flag check when we resolved a panel; unknown panel → null.
          panelMaestroFlag: orchPanel ? orchPanel.maestro === true : null,
          activeWorkerCount: openCountAfter,
          maxWorkers,
          role: args.role || '',
          name: args.name ?? '',
          requireName: true,
          // Only block duplicate names among *actively running* workers; done ones
          // are handled by the reuse path above.
          existingRoles: activeEntries.map((w) => w.role),
          existingNames: activeEntries.map((w) => w.name),
        })
        if (!guard.allow) {
          writeToMaestro(maestroId, guard.message)
          orqWarn(`recruit rejected: ${guard.message}`)
          return
        }

        const panelType = resolveAgentPanelType(args.agent, settings)
        const count = (recruitCountRef.current.get(maestroId) || 0) + 1
        recruitCountRef.current.set(maestroId, count)
        const prefix = settings.orchestrationWorkerNamePrefix.trim() || 'worker'
        // Prefer exact requested function id. Do NOT invent html-2 when html is free
        // in namesMap — allocateUnique only if that exact name is already running.
        const runningNames = activeEntries.map((w) => w.name)
        const name = runningNames.some((n) => n.toLowerCase() === requestedName.toLowerCase())
          ? allocateUniqueWorkerName(args.name, prefix, namesMap.values(), count)
          : (requestedName || allocateUniqueWorkerName(args.name, prefix, namesMap.values(), count))
        const agentCmd = panelType === 'terminal'
          ? resolveWorkerAgentCommand(args.agent, settings)
          : ''
        const position = workerPosition(maestroId, recruitCountRef, orchestratorPanelId || '')

        let panelId: string | null = null
        if (panelType === 'agent') {
          panelId = store.createAgent(ws.id, position)
        } else {
          panelId = store.createTerminal(ws.id, undefined, position)
        }

        if (panelId) {
          workerPanelIds.add(panelId)
          namesMap.set(panelId, name)
          store.updatePanelTitle(ws.id, panelId, name)
          runStore.noteRecruit({
            maestroPtyId: maestroId,
            panelId,
            name,
            role: args.role || '',
          })
          void persistOrchestrationSnapshot(ws.rootPath || '', ws.id, maestroId, namesMap)
          orq(`+ ${name} (${panelType})`)

          // Add visual orchestration arrow: maestro → worker
          if (orchestratorPanelId) {
            const orquestrador = findCanvasNodeForPanel(orchestratorPanelId)
            const worker = findCanvasNodeForPanel(panelId)
            if (orquestrador && worker) {
              requestAnimationFrame(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (orquestrador.store.getState() as any).addConnection?.(
                  orquestrador.nodeId,
                  worker.nodeId,
                  'orchestration',
                )
              })
            }
          }

          // Wait for terminal to initialize (with max retries)
          const startAgent = (retries = 0) => {
            if (retries > MAX_AGENT_RETRIES) {
              orqError(`${name} no PTY — failed to start`)
              useOrchestrationRunStore.getState().noteWorkerDone(panelId!, 'failed')
              return
            }
            const ptyId = terminalRegistry.ptyIdForPanel(panelId!)
            if (!ptyId) {
              setTimeout(() => startAgent(retries + 1), AGENT_POLL_MS)
              return
            }

            // Persist ROLE.md (Maestri-style role at rest) before starting agent.
            const roleFileRel = workerRoleFileRelativePath(name)
            const roleFileBody = args.role
              ? buildWorkerRoleFileContent(name, args.role)
              : ''
            if (ws.rootPath && roleFileBody) {
              const absRole = ws.rootPath.replace(/[/\\]+$/, '')
                + '/' + roleFileRel.replace(/\\/g, '/')
              void window.electronAPI?.fsWriteFile?.(absRole, roleFileBody, ws.id).catch(() => {
                // best-effort
              })
            }

            if (agentCmd) {
              const cr = String.fromCharCode(13)
              // Full launch string (includes bypass flags when mode=bypass).
              window.electronAPI?.terminalWrite?.(ptyId, agentCmd + cr)
              orq(`$ ${name} ${agentCmd}`)
            }

            window.electronAPI?.orquestraTrackWorker?.(ptyId, maestroId, name, args.role || '', ws.rootPath || '')
            workerPtyToPanelRef.current.set(ptyId, { maestroId, panelId: panelId! })
            useOrchestrationRunStore.getState().noteWorkerReady(panelId!, ptyId)

            // After first agent output, wait extra settle so CLI is at the prompt
            // (not mid-banner/npm) before injecting the task.
            let sawOutput = false
            let settlePasses = 0
            const sendRole = (attempts = 0) => {
              if (!args.role) return
              window.electronAPI?.workerHasOutput?.(ptyId).then(async (hasOutput) => {
                if (hasOutput && !sawOutput && attempts < MAX_ROLE_WAIT) {
                  sawOutput = true
                  // Agent produced banner — give it time to reach interactive prompt.
                  setTimeout(() => sendRole(attempts + 1), 3000)
                  return
                }
                // Extra settle passes after first output so npm/boot finishes.
                if (hasOutput && settlePasses < 2 && attempts < MAX_ROLE_WAIT) {
                  settlePasses++
                  setTimeout(() => sendRole(attempts + 1), 2000)
                  return
                }
                if (hasOutput || attempts >= MAX_ROLE_WAIT) {
                  // Short function-specific task + forced Enter submit (not paste-only).
                  // No completion token in inject — see WORKER_COMPLETION_TOKEN.
                  const markedRole = buildRecruitRoleText(
                    args.role,
                    settings,
                    undefined,
                    name,
                    roleFileRel,
                  )
                  injectWorkerTaskToPty(ptyId, markedRole, roleFileBody || null)
                  orq(`→ ${name} task injected`)
                } else {
                  setTimeout(() => sendRole(attempts + 1), ROLE_POLL_MS)
                }
              })
            }
            // First poll after agentCmd has time to start (boot + npm).
            setTimeout(() => sendRole(0), 5000)
          }
          setTimeout(() => startAgent(0), 1000)
        }
      }),

      // --- Dismiss ---
      window.electronAPI.onMaestroDismiss((_maestroId, args) => {
        const store = useAppStore.getState()
        const ws =
          store.workspaces.find((w) => w.id === store.selectedWorkspaceId)
          ?? store.workspaces[0]
        if (!ws) return
        const target = args.target
        const panel = Object.values(ws.panels).find(
          (p) => p.title === target || p.title?.replace(/\s•\s*$/, '') === target || p.id === target,
        )
        if (panel) {
          releaseWorkerTracking(
            {
              workerPanelIds: workerPanelIdsRef.current,
              workerNamesByMaestro: workerNamesByMaestroRef.current,
              workerPtyToPanel: workerPtyToPanelRef.current,
            },
            { maestroId: _maestroId, panelId: panel.id },
          )
          useOrchestrationRunStore.getState().noteDismiss(panel.id)
          const worker = findCanvasNodeForPanel(panel.id)
          if (worker) {
            const conns = worker.store.getState().getConnections(worker.nodeId)
            for (const conn of conns) {
              if (conn.type === 'orchestration') {
                worker.store.getState().removeConnection(conn.id)
              }
            }
          }
          store.closePanel(ws.id, panel.id)
          orq(`- ${target} dismissed`)
        }
      }),

      // --- Connect ---
      window.electronAPI.onMaestroConnect((_maestroId, args) => {
        const store = useAppStore.getState()
        const ws =
          store.workspaces.find((w) => w.id === store.selectedWorkspaceId)
          ?? store.workspaces[0]
        if (!ws) return
        store.createEditor(ws.id, args.path)
      }),

      // --- List ---
      window.electronAPI.onMaestroList(async (_maestroId, _args) => {
        const workers = await window.electronAPI?.orquestraListWorkers?.(_maestroId).catch(() => null)
        const message = formatWorkerListForTerminal(workers ?? [])
        writeToMaestro(_maestroId, message)
      }),

      // --- Reassign ---
      window.electronAPI.onMaestroReassign(async (_maestroId, args) => {
        const store = useAppStore.getState()
        const settings = useSettingsStore.getState()
        const ws =
          store.workspaces.find((w) => w.id === store.selectedWorkspaceId)
          ?? store.workspaces[0]
        if (!ws || !args.role) return
        const namesMap = workerNamesByMaestroRef.current.get(_maestroId) ?? new Map<string, string>()
        workerNamesByMaestroRef.current.set(_maestroId, namesMap)
        const runEntries = useOrchestrationRunStore.getState().listForMaestro(_maestroId)
        const resolved = resolveReusableWorkerPanel({
          requestedName: args.target,
          panels: ws.panels,
          namesMap,
          runEntries,
        })
        // Fallback: raw title/id match
        const panel = resolved
          ? ws.panels[resolved.panelId]
          : Object.values(ws.panels).find(
            (p) => p.title === args.target || p.title?.replace(/\s•\s*$/, '') === args.target || p.id === args.target,
          )
        if (!panel) {
          writeToMaestro(_maestroId, `[orquestra] Reassign failed: no open worker named "${args.target}"`)
          return
        }
        const workerName = resolved?.functionName
          || namesMap.get(panel.id)
          || args.target
        store.updatePanelTitle(ws.id, panel.id, workerName)
        const result = await reassignExistingWorker({
          maestroId: _maestroId,
          panelId: panel.id,
          name: workerName,
          role: args.role,
          settings,
          workspaceRoot: ws.rootPath || '',
          workspaceId: ws.id,
        })
        if (result.ok) {
          namesMap.set(panel.id, workerName)
          const workerPanelIds = workerPanelIdsRef.current.get(_maestroId) ?? new Set<string>()
          workerPanelIdsRef.current.set(_maestroId, workerPanelIds)
          workerPanelIds.add(panel.id)
          workerPtyToPanelRef.current.set(result.ptyId, { maestroId: _maestroId, panelId: panel.id })
          writeToMaestro(
            _maestroId,
            `[orquestra] Reassigned "${workerName}" → new task. Wait with: node orquestra.js wait --workers ${workerName}`,
          )
          orq(`~ ${workerName} reassign`)
        } else {
          writeToMaestro(_maestroId, `[orquestra] Reassign failed: ${result.reason}`)
          orqWarn(`reassign ${args.target}: ${result.reason}`)
        }
      }),

      // PTY gone: soft-release only. Status/plan sync is authoritative from
      // onOrquestraWorkerStatus (includes accept), NOT raw exitCode.
      window.electronAPI.onTerminalExit?.((terminalId, _exitCode) => {
        const tracked = workerPtyToPanelRef.current.get(terminalId)
        if (!tracked) return

        softReleaseWorkerPty(
          {
            workerPanelIds: workerPanelIdsRef.current,
            workerNamesByMaestro: workerNamesByMaestroRef.current,
            workerPtyToPanel: workerPtyToPanelRef.current,
          },
          { workerPtyId: terminalId, panelId: tracked.panelId },
        )
        // Do NOT noteWorkerDone(exitCode===0) here — that overwrites accept-failed.
      }) ?? (() => {}),

      // Idle completion and exit result-file writes (authoritative for wait + crown + plan).
      // Keep open panels reusable (soft release) — do not free maxWorkers slots on idle.
      window.electronAPI.onOrquestraWorkerStatus?.((event) => {
        const maps: WorkerTrackingMaps = {
          workerPanelIds: workerPanelIdsRef.current,
          workerNamesByMaestro: workerNamesByMaestroRef.current,
          workerPtyToPanel: workerPtyToPanelRef.current,
        }
        const runStore = useOrchestrationRunStore.getState()
        const status = event.status === 'done' || event.status === 'failed'
          ? event.status
          : 'failed'
        const namesMap = maps.workerNamesByMaestro.get(event.orchestratorId)

        const applyDone = (panelId: string, functionName: string) => {
          runStore.noteWorkerDone(panelId, status, {
            functionName,
            summary: undefined,
          })
          // Persist plan unlock so multi-wave dispatch survives reload
          const store = useAppStore.getState()
          const ws =
            store.workspaces.find((w) => w.id === store.selectedWorkspaceId)
            ?? store.workspaces[0]
          if (ws?.rootPath) {
            const nm = namesMap ?? new Map<string, string>()
            void persistOrchestrationSnapshot(ws.rootPath, ws.id, event.orchestratorId, nm)
          }
          // close-on-success only when accept path said done (not raw exit 0)
          const settings = useSettingsStore.getState()
          if (settings.orchestrationOnWorkerDone === 'close-on-success' && status === 'done') {
            if (ws?.panels[panelId]) {
              releaseWorkerTracking(maps, {
                maestroId: event.orchestratorId,
                panelId,
                workerPtyId: event.workerId,
              })
              store.closePanel(ws.id, panelId)
              orq(`× ${functionName} closed`)
            }
          }
        }

        const tracked = maps.workerPtyToPanel.get(event.workerId)
        if (!tracked) {
          const workers = runStore.listForMaestro(event.orchestratorId)
          const byName = workers.find((w) => w.name === event.name)
          if (byName) {
            softReleaseWorkerPty(maps, { workerPtyId: event.workerId, panelId: byName.panelId })
            applyDone(byName.panelId, event.name || byName.name)
            orq(`✓ ${event.name || byName.name} → ${status}`)
          }
          return
        }
        softReleaseWorkerPty(maps, {
          workerPtyId: event.workerId,
          panelId: tracked.panelId,
        })
        const fname = namesMap?.get(tracked.panelId) || event.name
        applyDone(tracked.panelId, fname)
        orq(`✓ ${event.name || fname} → ${status}`)
      }) ?? (() => {}),
    ]

    return () => unsubs.forEach((u) => u?.())
  }, [])
}
