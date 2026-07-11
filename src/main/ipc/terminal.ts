// =============================================================================
// Terminal IPC handlers — terminal session layer over a runtime ProcessHost.
//
// The PTY mechanics (spawn/write/resize/kill, data/exit, visibility-driven
// idle-suspend, process-group teardown) live in the runtime's ProcessHost —
// local or remote, identically; this module never branches on where a terminal
// runs. It owns only the SESSION concerns that are main-process / window-aware:
//   - which window owns each terminal (cross-window transfer)
//   - 16ms output coalescing → IPC to the owner window
//   - disk logging / scrollback
// A terminal id is mapped to its runtime so write/resize/kill route correctly.
// =============================================================================

import { app, clipboard, ipcMain } from 'electron'
import fsp from 'fs/promises'
import fs from 'fs'
import path from 'path'
import {
  TERMINAL_CREATE,
  TERMINAL_WRITE,
  TERMINAL_RESIZE,
  TERMINAL_KILL,
  TERMINAL_DATA,
  TERMINAL_EXIT,
  TERMINAL_GET_CWD,
  TERMINAL_LOG_READ,
  TERMINAL_SCROLLBACK_SAVE,
  TERMINAL_SET_VISIBILITY,
  TERMINAL_CLIPBOARD_WRITE,
  TERMINAL_SET_MAESTRO,
  TERMINAL_PIPE_CREATE,
  TERMINAL_PIPE_DESTROY,
  MAESTRO_RECRUIT,
  MAESTRO_DISMISS,
  MAESTRO_CONNECT,
  MAESTRO_LIST,
  MAESTRO_REASSIGN,
  ORQUESTRA_TRACK_WORKER,
  ORQUESTRA_LIST_WORKERS,
  ORQUESTRA_NOTE_ROLE_INJECT,
  ORQUESTRA_WORKER_STATUS,
  WORKER_HAS_OUTPUT,
} from '../../shared/ipc-channels'
import type { OrquestraWorkerSummary } from '../../shared/types'
import {
  evaluateAcceptCriteria,
  formatAcceptResults,
  inferAcceptFromRole,
} from '../../shared/orchestration/accept'
import { getOrCreateLogger, removeLogger, flushAll as flushAllLoggers, disposeAll as disposeAllLoggers } from './terminalLogger'
import log from '../logger'
import { sendToWindow, windowFromEvent, onWindowClosed } from '../windowRegistry'
import { countTerminalData } from '../perf/perfMonitor'
import { parseLocator, type RuntimeId } from '../runtime/locator'
import { runtimes } from '../runtime/runtimeManager'
import type { Runtime } from '../runtime/types'
import { createStringDispatcher } from './batchedDispatcher'
import { validatePathStrict } from './pathValidation'
import { getAllSettings } from '../settingsFile'
import { buildMaestroInstructions, buildMaestroSettingsSnapshot } from '../maestro/maestroInstructions'
import { checkMaestroAssets, resolveMaestroCliDir } from '../maestro/maestroAssets'
import type { TerminalSetMaestroResult } from '../../shared/electron-api'

// Set true during app shutdown so PTY data/exit callbacks no-op instead of
// calling into a torn-down JS environment.
let shuttingDown = false

// Which window owns each terminal (windowId)
const terminalOwners: Map<string, number> = new Map()

// Which runtime hosts each terminal — routes write/resize/kill/getCwd.
const terminalRuntime: Map<string, RuntimeId> = new Map()

// Which PTY outputs are piped into which other PTYs (source -> Set<target>)
const terminalPipes: Map<string, Set<string>> = new Map()

// =============================================================================
// Maestro — file-based IPC for canvas manipulation from terminals
// =============================================================================

const orquestraTerminals = new Set<string>()

// Guards against creating duplicate watchers for the same workspace.
// Maps workspacePath → { timer, terminalId, ownerWindowId } so each workspace
// has at most one polling watcher. The terminalId stored here is the PTY ID of
// the first terminal that enabled orquestra in this workspace — it serves as
// the maestroId for all commands from that workspace's AI agent.
const watcherByWorkspace = new Map<string, {
  timer: NodeJS.Timeout
  cleanupTimer: NodeJS.Timeout
  terminalId: string
  ownerWindowId: number
}>()

export function setOrquestraTerminal(terminalId: string, enabled: boolean): void {
  if (enabled) {
    orquestraTerminals.add(terminalId)
  } else {
    orquestraTerminals.delete(terminalId)
    cascadeOrchestratorWorkers(terminalId, 'disabled')
  }
}

/**
 * Abort workers for an orchestrator: write failed results (unblocks wait),
 * notify renderer, then kill PTYs. Used by disable, takeover, and maestro exit.
 */
export function cascadeOrchestratorWorkers(
  orchestratorId: string,
  reason: 'disabled' | 'takeover' | 'maestro-exit',
): void {
  for (const [workerId, tracking] of [...workerTracking.entries()]) {
    if (tracking.orchestratorId !== orchestratorId) continue
    const summary =
      reason === 'takeover'
        ? 'Orchestrator taken over by another Maestro terminal.'
        : reason === 'maestro-exit'
          ? 'Maestro terminal exited.'
          : 'Orchestrator disabled.'
    if (tracking.workspacePath) {
      writeWorkerResultFile(tracking.workspacePath, {
        workerName: tracking.name,
        workerRole: tracking.role,
        status: 'failed',
        summary,
        timestamp: Date.now(),
        exitCode: 1,
      })
    }
    notifyWorkerStatus({
      workerId,
      orchestratorId,
      name: tracking.name,
      status: 'failed',
      exitCode: 1,
    })
    if (tracking.idleTimer) clearTimeout(tracking.idleTimer)
    const runtime = getRuntimeForTerminal(workerId)
    try { runtime?.process.kill?.(workerId) } catch { /* already dead */ }
    workerTracking.delete(workerId)
    log.debug('[worker] cascade %s: closed "%s"', reason, tracking.name)
  }
}

/** @deprecated Prefer cascadeOrchestratorWorkers — kept for call-site clarity. */
function closeWorkersForOrchestrator(orchestratorId: string): void {
  cascadeOrchestratorWorkers(orchestratorId, 'disabled')
}

/**
 * Maestro PTY gone (kill or exit): cascade workers, drop orquestra membership,
 * stop watcher if this id was the active maestro for a workspace.
 */
export function onMaestroPtyGone(terminalId: string): void {
  orquestraTerminals.delete(terminalId)
  cascadeOrchestratorWorkers(terminalId, 'maestro-exit')
  for (const [wsPath, entry] of [...watcherByWorkspace.entries()]) {
    if (entry.terminalId === terminalId) {
      // Delete crown markers for this workspace (best-effort)
      try {
        const crownMarker = path.join(wsPath, '.orquestra', 'crown.json')
        if (fs.existsSync(crownMarker)) fs.unlinkSync(crownMarker)
        const claudeLocalPath = path.join(wsPath, 'CLAUDE.local.md')
        if (fs.existsSync(claudeLocalPath)) fs.unlinkSync(claudeLocalPath)
      } catch {
        // best-effort marker cleanup
      }
      stopOrquestraWatcher(wsPath)
      log.debug('[worker] maestro terminal closed — cascade done')
    }
  }
}

// Periodic heartbeat: POSIX scanActivity when available; always reap tracking
// orphans whose runtime registration was already cleaned (Windows-friendly).
setInterval(async () => {
  const tracked = Array.from(workerTracking.entries())
  if (tracked.length === 0) return

  // Tracking-orphan reap: worker still tracked but PTY no longer in terminalRuntime
  for (const [workerId] of tracked) {
    if (!terminalRuntime.has(workerId)) {
      log.warn('[worker] orphan reap: %s has no runtime registration', workerId)
      onWorkerExit(workerId, 1)
    }
  }

  const stillTracked = Array.from(workerTracking.entries())
  if (stillTracked.length === 0) return

  const runtime = getRuntimeForTerminal(stillTracked[0][0])
  if (!runtime) return

  const ids = stillTracked.map(([id]) => id)
  const activity = await runtime.process.scanActivity(ids).catch(() => null)
  if (!activity || Object.keys(activity).length === 0) return // no data (Windows or unsupported)

  for (const [workerId] of stillTracked) {
    if (!(workerId in activity)) {
      log.warn('[worker] heartbeat: %s is dead, cleaning up', workerId)
      onWorkerExit(workerId, 1)
    }
  }
}, 60_000)

/** @deprecated Use resolveMaestroCliDir from maestroAssets — alias for tests/scripts. */
export function getOrquestraCliDir(): string {
  return resolveMaestroCliDir() ?? path.join(app.getAppPath(), 'scripts', 'maestro')
}

const COMMANDS_POLL_MS = 500
const PROCESSED_CLEANUP_MS = 5 * 60 * 1000 // clear dedup set every 5 min

/**
 * Start or rebind the single watcher per workspace.
 * Rebind updates terminalId/owner without restarting the poller (takeover).
 */
export function startOrquestraWatcher(workspacePath: string, ownerWindowId: number, terminalId: string): void {
  const existing = watcherByWorkspace.get(workspacePath)
  if (existing) {
    existing.terminalId = terminalId
    existing.ownerWindowId = ownerWindowId
    return
  }

  const commandsDir = path.join(workspacePath, '.orquestra-commands')
  if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true })

  // Clean up stale commands from previous crashes
  try {
    const stale = fs.readdirSync(commandsDir).filter(f => f.endsWith('.json'))
    for (const f of stale) {
      fs.unlinkSync(path.join(commandsDir, f))
    }
  } catch { /* dir may not exist yet */ }

  // Polling is more reliable than fs.watch — avoids duplicate events (Windows)
  // and missed events (macOS). Dedup via Set of filenames prevents processing
  // the same file twice.
  const processedFiles = new Set<string>()

  const poll = (): void => {
    const entry = watcherByWorkspace.get(workspacePath)
    if (!entry) return
    const maestroId = entry.terminalId
    const winId = entry.ownerWindowId

    let files: string[]
    try { files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.json')) }
    catch { return }

    for (const filename of files) {
      if (processedFiles.has(filename)) continue
      processedFiles.add(filename)

      const filePath = path.join(commandsDir, filename)
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const payload = JSON.parse(content)
        // Optional maestroId on command — drop mismatch (stale CLI from other crown)
        if (payload.maestroId && payload.maestroId !== maestroId) {
          fs.unlinkSync(filePath)
          continue
        }
        const { cmd, args } = payload
        // Log only worker lifecycle commands (not list/connect noise)
        if (cmd === 'recruit' || cmd === 'dismiss' || cmd === 'reassign') {
          const label = args?.name || args?.target || args?.role || ''
          log.info('[orquestra] cmd %s %s', cmd, label)
        }
        switch (cmd) {
          case 'recruit':  sendToWindow(winId, MAESTRO_RECRUIT, maestroId, args); break
          case 'dismiss':  sendToWindow(winId, MAESTRO_DISMISS, maestroId, args); break
          case 'connect':  sendToWindow(winId, MAESTRO_CONNECT, maestroId, args); break
          case 'list':     sendToWindow(winId, MAESTRO_LIST, maestroId, args); break
          case 'reassign': sendToWindow(winId, MAESTRO_REASSIGN, maestroId, args); break
        }
        fs.unlinkSync(filePath)
      } catch (err) { log.error('[worker] command error %s: %s', filename, err) }
    }
  }

  const timer = setInterval(poll, COMMANDS_POLL_MS)

  // Periodically evict old entries from the dedup set to avoid memory leak
  const cleanupTimer = setInterval(() => processedFiles.clear(), PROCESSED_CLEANUP_MS)

  watcherByWorkspace.set(workspacePath, { timer, cleanupTimer, terminalId, ownerWindowId })
}

export function stopOrquestraWatcher(workspacePath?: string): void {
  if (workspacePath) {
    // Stop watcher for a specific workspace
    const entry = watcherByWorkspace.get(workspacePath)
    if (entry) {
      clearInterval(entry.timer)
      clearInterval(entry.cleanupTimer)
      watcherByWorkspace.delete(workspacePath)
    }
    return
  }

  // Stop ALL watchers (app shutdown)
  for (const [, entry] of watcherByWorkspace) {
    clearInterval(entry.timer)
    clearInterval(entry.cleanupTimer)
  }
  watcherByWorkspace.clear()
}

// =============================================================================
// Worker Response Queue — detect when workers finish, report to orchestrator
// =============================================================================

interface WorkerResponse {
  workerName: string
  workerRole: string
  /** PTY inject label; result-file statuses are normalized separately. */
  status: 'completed' | 'failed' | 'idle'
  /** Full detail for result files / diagnostics. */
  summary: string
  /** One-line accept summary injected into Maestro (keeps agent context clean). */
  shortSummary: string
  timestamp: number
  exitCode?: number | null
}

export interface OrquestraWorkerStatusEvent {
  workerId: string
  orchestratorId: string
  name: string
  /** Canonical UI/result status after idle or exit. */
  status: 'done' | 'failed'
  exitCode: number | null
}

// Map: orchestrator ptyId → queue of responses
const responseQueues: Map<string, WorkerResponse[]> = new Map()

// Map: worker ptyId → tracking for idle/exit result files
const workerTracking: Map<string, {
  orchestratorId: string
  name: string
  role: string
  outputBuffer: string[]
  lastActivity: number
  firstOutputAt: number | null
  idleTimer: ReturnType<typeof setTimeout> | null
  workspacePath: string
  /** Exact PTY inject text (fingerprint) — echo of this must not count as work. */
  injectText: string | null
  /** ROLE.md body (fingerprint) — reading/echoing the brief is not work. */
  roleFileText: string | null
  /** When the task was submitted to the worker PTY. */
  roleInjectedAt: number | null
}> = new Map()

const WORKER_OUTPUT_LIMIT = 100  // keep last 100 lines
/** Quiet period after eligibility before idle→done (KD6). */
const WORKER_IDLE_TIMEOUT = 60_000
/** Min non-empty *meaningful* (non-echo) lines before idle can complete. */
const WORKER_MIN_OUTPUT_LINES = 3
/** Min time since first *meaningful* activity (or inject) before idle complete (ms). */
const WORKER_MIN_RUNTIME_MS = 10_000
/** Quiet period when completion marker detected on real work (ms). */
const WORKER_MARKER_IDLE_MS = 10_000
/** Min ms after role inject before a marker can count (avoids inject-echo DONE). */
const WORKER_POST_INJECT_MARKER_GRACE_MS = 5_000
const RESPONSE_QUEUE_MAX = 100   // max pending responses per orchestrator
const ORQUESTRA_RESULTS_DIR = '.orquestra-results'

const DONE_MARKERS = [
  /\bORQUESTRA_WORKER_DONE\b/i,
  /✅/,
  /task\s+complete/i,
  /tarefa\s+conclu/i,
  // Intentionally NO bare /\bDONE\b/ — too many false positives in English prompts.
]

function workerHasDoneMarker(lines: string[]): boolean {
  return lines.some((l) => DONE_MARKERS.some((re) => re.test(l)))
}

/** Line is only the completion token (no real deliverable work). */
export function isBareCompletionMarkerLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (/^ORQUESTRA_WORKER_DONE\.?$/i.test(t)) return true
  // Pure checkmark only — "✅ Task complete" is agent summary, not bare token.
  if (/^✅\.?$/.test(t)) return true
  return false
}

/**
 * True when a buffered output line is almost certainly an echo of the role
 * inject / ROLE.md body (or a wrapped chunk of it). Must not trigger idle-done.
 * Bare completion tokens are NOT treated as fingerprint echo (ROLE.md contains
 * the token as instructions; the agent still must emit it after real work).
 */
export function isInjectEchoLine(line: string, fingerprint: string | null | undefined): boolean {
  if (!fingerprint?.trim()) return false
  // Never classify the bare completion token as "ROLE.md echo" — that would
  // strip the only signal that work finished after real deliverable lines.
  if (isBareCompletionMarkerLine(line)) return false
  const n = line.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!n || n.length < 8) return false
  const fp = fingerprint.toLowerCase().replace(/\s+/g, ' ')
  if (fp.includes(n)) return true
  if (n.includes(fp) && fp.length >= 16) return true
  // Wrapped long text: first 24+ chars of the line appear inside fingerprint
  const head = n.slice(0, Math.min(n.length, 48))
  if (head.length >= 24 && fp.includes(head)) return true
  // ROLE.md multi-line: match any substantial fingerprint line fragment
  for (const chunk of fingerprint.split(/\r?\n/)) {
    const c = chunk.trim().toLowerCase().replace(/\s+/g, ' ')
    if (c.length < 16) continue
    // Skip instruction chunks that only teach the completion token
    if (isCompletionInstructionEcho(chunk)) continue
    if (n.includes(c) || c.includes(n)) return true
  }
  return false
}

/**
 * Instruction lines that *mention* the completion token (from ROLE.md / inject
 * policy) without being the agent finishing work.
 */
export function isCompletionInstructionEcho(line: string): boolean {
  const n = line.toLowerCase()
  if (!n.includes('orquestra_worker_done') && !n.includes('completion token')) return false
  return (
    n.includes('when finished')
    || n.includes('print')
    || n.includes('exactly')
    || n.includes('own line')
    || n.includes('from your role')
    || n.includes('role.md')
    || n.includes('signal completion')
  )
}

/**
 * Lines that look like real agent work (not inject/ROLE.md echo, not bare
 * marker, not completion-instruction prose).
 */
export function meaningfulWorkerLines(
  outputBuffer: string[],
  injectText?: string | null,
  roleFileText?: string | null,
): string[] {
  return outputBuffer.filter((l) => {
    const t = l.trim()
    if (!t) return false
    if (isInjectEchoLine(t, injectText)) return false
    if (isInjectEchoLine(t, roleFileText)) return false
    if (isCompletionInstructionEcho(t)) return false
    return true
  })
}

/**
 * Real deliverable activity: meaningful lines that are not solely a completion
 * marker. Required before marker-based idle can fire (prevents ROLE.md echo
 * containing ORQUESTRA_WORKER_DONE from completing the worker).
 */
export function realWorkLines(
  outputBuffer: string[],
  injectText?: string | null,
  roleFileText?: string | null,
): string[] {
  return meaningfulWorkerLines(outputBuffer, injectText, roleFileText).filter(
    (l) => !isBareCompletionMarkerLine(l),
  )
}

/** Agent mid-flight (permission UI, tool pending) — do not treat quiet as finished. */
export function looksLikeWaitingForUser(lines: string[]): boolean {
  return lines.some((l) =>
    /waiting for permission|awaiting permission|needs? permission|permission required|waiting for approval|approve to continue/i
      .test(l),
  )
}

/**
 * Idle eligibility (KD6 + inject/ROLE echo guard):
 * - Never complete with only inject/ROLE.md/instruction echo in the buffer.
 * - Markers only count with at least one real work line, after post-inject grace.
 * - Min-lines path alone does NOT complete when a completion marker is expected
 *   (avoids false failed while agent is mid-tool / waiting for permission).
 */
export function isWorkerIdleEligible(tracking: {
  outputBuffer: string[]
  firstOutputAt: number | null
  injectText?: string | null
  roleFileText?: string | null
  roleInjectedAt?: number | null
  /** When true (default), min-lines quiet without DONE is not enough to finalize. */
  requireCompletionMarker?: boolean
}, now = Date.now()): { eligible: boolean; timeoutMs: number } {
  const inject = tracking.injectText ?? null
  const roleFile = tracking.roleFileText ?? null
  const work = realWorkLines(tracking.outputBuffer, inject, roleFile)
  const meaningful = meaningfulWorkerLines(tracking.outputBuffer, inject, roleFile)
  const injectedAt = tracking.roleInjectedAt ?? null
  const requireMarker = tracking.requireCompletionMarker !== false

  // Inject sent but only echo / banner / ROLE dump → never done.
  if (injectedAt != null && work.length === 0) {
    return { eligible: false, timeoutMs: WORKER_IDLE_TIMEOUT }
  }

  if (work.length === 0 || tracking.firstOutputAt == null) {
    return { eligible: false, timeoutMs: WORKER_IDLE_TIMEOUT }
  }

  // Mid permission / approval UI: keep waiting (re-arm long idle).
  if (looksLikeWaitingForUser(tracking.outputBuffer)) {
    return { eligible: false, timeoutMs: WORKER_IDLE_TIMEOUT }
  }

  // Marker path: need real work + marker (not ROLE.md instruction alone).
  if (workerHasDoneMarker(meaningful)) {
    if (injectedAt != null && now - injectedAt < WORKER_POST_INJECT_MARKER_GRACE_MS) {
      return { eligible: false, timeoutMs: WORKER_MARKER_IDLE_MS }
    }
    return { eligible: true, timeoutMs: WORKER_MARKER_IDLE_MS }
  }

  // Without a completion marker: do NOT become idle-eligible on quiet alone.
  // Otherwise "Waiting for permission" silence → onWorkerIdle → accept fails → false FAILED.
  if (requireMarker) {
    return { eligible: false, timeoutMs: WORKER_IDLE_TIMEOUT }
  }

  const anchor = injectedAt ?? tracking.firstOutputAt
  const runtimeOk = now - anchor >= WORKER_MIN_RUNTIME_MS
  if (work.length >= WORKER_MIN_OUTPUT_LINES && runtimeOk) {
    return { eligible: true, timeoutMs: WORKER_IDLE_TIMEOUT }
  }
  return { eligible: false, timeoutMs: WORKER_IDLE_TIMEOUT }
}

/**
 * Normalize worker result status for the wait CLI schema.
 * Canonical terminal statuses: running | done | failed | timeout
 * (completed ≡ done; idle ≡ done — agent went quiet after finishing work)
 */
export function normalizeWorkerResultStatus(status: string): string {
  const s = String(status || '').toLowerCase()
  if (s === 'completed' || s === 'idle') return 'done'
  return s
}

/** Write a worker result JSON file so the orquestra.js CLI's `wait` command
 *  can poll for it. Files are stored in <workspace>/.orquestra-results/.
 *
 *  Canonical schema (keep aliases for older CLIs):
 *    name, workerName, role, workerRole, status, exitCode, summary, timestamp, updatedAt
 *  status: running | done | failed | timeout
 *    (completed/idle are normalized to done on write)
 */
export function writeWorkerResultFile(workspacePath: string, result: {
  workerName: string
  workerRole: string
  status: string
  summary: string
  timestamp: number
  exitCode?: number | null
  accept?: Array<{ type: string; ok: boolean; detail: string; path?: string }>
}): void {
  try {
    const resultsDir = path.join(workspacePath, ORQUESTRA_RESULTS_DIR)
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true })
    // Sanitize worker name: strip path separators to prevent traversal
    // outside .orquestra-results/
    const safeName = path.basename(result.workerName).replace(/[/\\]/g, '_')
    const filePath = path.join(resultsDir, `worker-${safeName}.json`)
    const status = normalizeWorkerResultStatus(result.status)
    const success = status === 'done'
    const payload = {
      name: result.workerName,
      workerName: result.workerName,
      role: result.workerRole,
      workerRole: result.workerRole,
      status,
      exitCode: result.exitCode ?? (success ? 0 : status === 'failed' || status === 'timeout' ? 1 : null),
      summary: result.summary ?? '',
      timestamp: result.timestamp,
      updatedAt: result.timestamp,
      ...(result.accept ? { accept: result.accept } : {}),
    }
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2))
  } catch (err) {
    log.error('[worker] failed to write result file: %s', err)
  }
}

/** Notify the owner window so the crown run tracker can leave `running`. */
function notifyWorkerStatus(event: OrquestraWorkerStatusEvent): void {
  const windowId =
    terminalOwners.get(event.workerId)
    ?? terminalOwners.get(event.orchestratorId)
  if (windowId == null) return
  try {
    sendToWindow(windowId, ORQUESTRA_WORKER_STATUS, event)
  } catch (err) {
    // silent — status still written to disk
  }
}

// ANSI strip regex
const ANSI_RE = /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|[\[\]()#;?]*[0-9;]*[A-Za-z~<>=]|.)/g

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

/** Register a worker to be tracked for its orchestrator. */
export function trackWorker(workerId: string, orchestratorId: string, name: string, role: string, workspacePath: string = ''): void {
  workerTracking.set(workerId, {
    orchestratorId,
    name,
    role,
    outputBuffer: [] as string[],
    lastActivity: Date.now(),
    firstOutputAt: null,
    idleTimer: null as ReturnType<typeof setTimeout> | null,
    workspacePath,
    injectText: null,
    roleFileText: null,
    roleInjectedAt: null,
  })
  if (workspacePath) {
    writeWorkerResultFile(workspacePath, {
      workerName: name,
      workerRole: role,
      status: 'running',
      summary: 'Worker recruited — waiting for completion.',
      timestamp: Date.now(),
      exitCode: null,
    })
  }
  log.debug('[worker] tracking %s (%s) → maestro %s', name, workerId, orchestratorId)
}

/**
 * Record that the renderer submitted a role/task into this worker PTY.
 * Idle completion must ignore inject + ROLE.md echoes and wait for real work.
 */
export function noteWorkerRoleInjected(
  workerId: string,
  injectText: string,
  roleFileText?: string | null,
): void {
  const tracking = workerTracking.get(workerId)
  if (!tracking) {
    log.warn('[worker] role inject: unknown pty %s', workerId)
    return
  }
  tracking.injectText = injectText
  if (roleFileText != null && roleFileText.trim()) {
    tracking.roleFileText = roleFileText
  }
  tracking.roleInjectedAt = Date.now()
  // Cancel any idle timer armed on pre-inject banner noise.
  if (tracking.idleTimer) {
    clearTimeout(tracking.idleTimer)
    tracking.idleTimer = null
  }
  log.debug('[worker] role inject recorded for %s', tracking.name)
}

export function listTrackedWorkers(orchestratorId?: string): OrquestraWorkerSummary[] {
  return Array.from(workerTracking.entries())
    .filter(([, tracking]) => !orchestratorId || tracking.orchestratorId === orchestratorId)
    .map(([workerId, tracking]) => ({
      workerId,
      orchestratorId: tracking.orchestratorId,
      name: tracking.name,
      role: tracking.role,
      workspacePath: tracking.workspacePath,
      status: tracking.outputBuffer.length > 0 ? 'running' : 'starting',
      outputLineCount: tracking.outputBuffer.length,
      lastActivity: tracking.lastActivity,
    }))
}

/** Feed worker output for tracking. Call this from onData. */
export function feedWorkerOutput(workerId: string, data: string): void {
  const tracking = workerTracking.get(workerId)
  if (!tracking) return

  tracking.lastActivity = Date.now()

  // Buffer cleaned lines
  const cleaned = stripAnsi(data)
  const lines = cleaned.split(new RegExp(String.fromCharCode(13, 10), "g")).filter((l: string) => l.trim())
  if (lines.length > 0 && tracking.firstOutputAt == null) {
    tracking.firstOutputAt = Date.now()
  }
  tracking.outputBuffer.push(...lines)

  // Keep only last N lines
  if (tracking.outputBuffer.length > WORKER_OUTPUT_LIMIT) {
    tracking.outputBuffer = tracking.outputBuffer.slice(-WORKER_OUTPUT_LIMIT)
  }

  // Reset idle timer only when eligible (KD6); otherwise keep waiting for more output
  if (tracking.idleTimer) clearTimeout(tracking.idleTimer)
  const { eligible, timeoutMs } = isWorkerIdleEligible(tracking)
  if (!eligible) return
  tracking.idleTimer = setTimeout(() => {
    const still = workerTracking.get(workerId)
    if (!still) return
    const again = isWorkerIdleEligible(still)
    if (!again.eligible) {
      // Re-evaluate on next feed
      return
    }
    onWorkerIdle(workerId)
  }, timeoutMs)
}

/**
 * Called when a worker process exits.
 * Uses the real process exit code so wait/CLI and the crown tracker see failures.
 */
/**
 * Build a Maestro-readable completion summary from worker output.
 * Prefers real work lines over inject/ROLE.md echo; keeps the last few
 * useful lines so wait/CLI can surface what the worker finished.
 */
export function extractWorkerCompletionSummary(
  outputBuffer: string[],
  opts?: {
    injectText?: string | null
    roleFileText?: string | null
    role?: string
    maxChars?: number
  },
): string {
  const maxChars = opts?.maxChars ?? 600
  const work = realWorkLines(
    outputBuffer,
    opts?.injectText ?? null,
    opts?.roleFileText ?? null,
  )
  const markerLine = meaningfulWorkerLines(
    outputBuffer,
    opts?.injectText ?? null,
    opts?.roleFileText ?? null,
  ).find((l) => DONE_MARKERS.some((re) => re.test(l)))

  const tail = work.slice(-8)
  if (markerLine && !tail.some((l) => l.includes(markerLine.trim()))) {
    tail.push(markerLine.trim())
  }
  let body = tail.join(' | ').replace(/\s+/g, ' ').trim()
  if (!body) {
    body = outputBuffer
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(-5)
      .join(' | ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  const rolePrefix = opts?.role?.trim() ? `role=${opts.role.trim().slice(0, 80)}; ` : ''
  const text = rolePrefix + (body || '(no summary)')
  return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text
}

/**
 * Shared accept + summary path for idle and process exit (criterion 3).
 * Exit code 0 alone is not enough when file accept fails.
 */
export function finalizeWorkerCompletion(
  tracking: {
    orchestratorId: string
    name: string
    role: string
    outputBuffer: string[]
    workspacePath: string
    injectText: string | null
    roleFileText: string | null
  },
  opts?: { exitCode?: number | null },
): {
  status: 'done' | 'failed'
  summary: string
  shortSummary: string
  exitCode: number
  acceptOk: boolean
  accept: Array<{ type: string; ok: boolean; detail: string; path?: string }>
} {
  const summaryBase = extractWorkerCompletionSummary(tracking.outputBuffer, {
    injectText: tracking.injectText,
    roleFileText: tracking.roleFileText,
    role: tracking.role,
  })
  const criteria = inferAcceptFromRole(tracking.role || '')
  const meaningful = meaningfulWorkerLines(
    tracking.outputBuffer,
    tracking.injectText,
    tracking.roleFileText,
  )
  const acceptEval = tracking.workspacePath
    ? evaluateAcceptCriteria(
      {
        workspaceRoot: tracking.workspacePath,
        criteria,
        outputLines: meaningful,
      },
      fs,
    )
    : { ok: true, results: [] as Array<{ type: string; ok: boolean; detail: string; path?: string }> }

  const processFailed = opts?.exitCode != null && opts.exitCode !== 0
  const acceptOk = acceptEval.ok && !processFailed
  const acceptLine = formatAcceptResults(acceptEval.results)
  // Short summary for Maestro inject — accept line only (no inject/permission dump)
  const shortSummary = acceptLine + (processFailed ? ` | exit ${opts?.exitCode}` : '')
  const summary = `${summaryBase} | ${acceptLine}`
    + (processFailed ? ` | process exit ${opts?.exitCode}` : '')
  return {
    status: acceptOk ? 'done' : 'failed',
    summary,
    shortSummary,
    exitCode: acceptOk ? 0 : (processFailed ? Number(opts?.exitCode) : 1),
    acceptOk,
    accept: acceptEval.results,
  }
}

/** One-line Maestro PTY inject — avoids flooding agent context with Interjected dumps. */
export function formatMaestroWorkerInject(response: {
  workerName: string
  status: string
  shortSummary: string
}): string {
  const st = response.status === 'done' || response.status === 'completed'
    ? 'completed'
    : response.status === 'failed'
      ? 'failed'
      : response.status
  const detail = (response.shortSummary || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  return detail
    ? `[worker] ${response.workerName} → ${st}: ${detail}`
    : `[worker] ${response.workerName} → ${st}`
}

export function onWorkerExit(workerId: string, exitCode: number = 0): void {
  const tracking = workerTracking.get(workerId)
  if (!tracking) return

  if (tracking.idleTimer) clearTimeout(tracking.idleTimer)

  const code = typeof exitCode === 'number' && Number.isFinite(exitCode) ? exitCode : 1
  const finalized = finalizeWorkerCompletion(tracking, { exitCode: code })
  const result = {
    workerName: tracking.name,
    workerRole: tracking.role,
    status: finalized.status,
    summary: finalized.summary,
    timestamp: Date.now(),
    exitCode: finalized.exitCode,
    accept: finalized.accept,
  }
  if (tracking.workspacePath) writeWorkerResultFile(tracking.workspacePath, result)
  enqueueResponse(tracking.orchestratorId, {
    workerName: result.workerName,
    workerRole: result.workerRole,
    status: finalized.status === 'done' ? 'completed' : 'failed',
    summary: result.summary,
    shortSummary: finalized.shortSummary,
    timestamp: result.timestamp,
    exitCode: result.exitCode,
  })
  notifyWorkerStatus({
    workerId,
    orchestratorId: tracking.orchestratorId,
    name: tracking.name,
    status: finalized.status,
    exitCode: result.exitCode,
  })

  workerTracking.delete(workerId)
  log.info('[orquestra] %s exit %s → %s', tracking.name, code, finalized.status)
}

/**
 * Called when a worker is idle (no output for WORKER_IDLE_TIMEOUT).
 * Writes done only when accept criteria pass (file_exists / marker); otherwise
 * failed — so inject/ROLE echo alone cannot complete a file-gated task.
 */
export function onWorkerIdle(workerId: string): void {
  const tracking = workerTracking.get(workerId)
  if (!tracking) return

  // Still mid-task (permission UI / no DONE yet): re-arm idle, stay running.
  const again = isWorkerIdleEligible(tracking)
  if (!again.eligible) {
    if (tracking.idleTimer) clearTimeout(tracking.idleTimer)
    tracking.idleTimer = setTimeout(() => onWorkerIdle(workerId), again.timeoutMs)
    return
  }

  const finalized = finalizeWorkerCompletion(tracking)

  // Accept failed only because marker missing while agent may still run → keep running.
  const markerMissing = finalized.accept.some(
    (a) => a.type === 'marker' && !a.ok,
  )
  const onlyMarkerBlocking =
    !finalized.acceptOk
    && markerMissing
    && finalized.accept.filter((a) => a.type !== 'marker').every((a) => a.ok)
  if (onlyMarkerBlocking) {
    if (tracking.idleTimer) clearTimeout(tracking.idleTimer)
    tracking.idleTimer = setTimeout(() => onWorkerIdle(workerId), WORKER_IDLE_TIMEOUT)
    log.debug('[worker] %s quiet but no DONE yet — still running', tracking.name)
    return
  }

  const result = {
    workerName: tracking.name,
    workerRole: tracking.role,
    status: finalized.status,
    summary: finalized.summary,
    timestamp: Date.now(),
    exitCode: finalized.exitCode,
    accept: finalized.accept,
  }
  if (tracking.workspacePath) writeWorkerResultFile(tracking.workspacePath, result)
  enqueueResponse(tracking.orchestratorId, {
    workerName: result.workerName,
    workerRole: result.workerRole,
    status: finalized.status === 'done' ? 'completed' : 'failed',
    summary: result.summary,
    shortSummary: finalized.shortSummary,
    timestamp: result.timestamp,
    exitCode: result.exitCode,
  })
  notifyWorkerStatus({
    workerId,
    orchestratorId: tracking.orchestratorId,
    name: tracking.name,
    status: finalized.status,
    exitCode: result.exitCode,
  })

  workerTracking.delete(workerId)
  log.info('[orquestra] %s idle → %s', tracking.name, finalized.status)
}

/** Enqueue a response for an orchestrator. */
function enqueueResponse(orchestratorId: string, response: WorkerResponse): void {
  if (!responseQueues.has(orchestratorId)) {
    responseQueues.set(orchestratorId, [])
  }
  const queue = responseQueues.get(orchestratorId)!
  if (queue.length >= RESPONSE_QUEUE_MAX) {
    queue.shift() // drop oldest to prevent unbounded growth
  }
  queue.push(response)

  // Try to inject immediately
  processNextResponse(orchestratorId)
}

/** Process the next response in the queue for an orchestrator. */
function processNextResponse(orchestratorId: string): void {
  const queue = responseQueues.get(orchestratorId)
  if (!queue || queue.length === 0) return

  const response = queue.shift()!
  const cr = String.fromCharCode(13)
  // Short one-liner only — full summary stays in .orquestra-results JSON.
  const message = formatMaestroWorkerInject({
    workerName: response.workerName,
    status: response.status,
    shortSummary: response.shortSummary || response.summary,
  }) + '\n'

  // Guard: orchestrator terminal may have been closed since the response was queued
  try { writeTerminal(orchestratorId, message + cr) }
  catch (err) {
    log.warn('[worker] maestro gone, drop response: %s', err)
    return
  }
  // silent — worker status already logged

  // Process next after a delay (don't flood the orchestrator)
  if (queue.length > 0) {
    setTimeout(() => processNextResponse(orchestratorId), 3000)
  }
}

function runtimeForTerminal(id: string): Runtime | null {
  const cid = terminalRuntime.get(id)
  if (!cid) return null
  try {
    return runtimes.resolve(cid)
  } catch {
    return null
  }
}

/** Resolve the runtime hosting a terminal — used by the shell process monitor
 *  (shell.ts) to route ps/lsof scans to the terminal's host (local or daemon). */
export function getRuntimeForTerminal(id: string): Runtime | null {
  return runtimeForTerminal(id)
}

// =============================================================================
// Terminal transfer buffering — holds PTY output during cross-window migration
// =============================================================================

interface TerminalTransferState {
  buffer: Buffer[]
  bufferSize: number
  /** null while buffering ahead of a destination that doesn't exist yet
   *  (detach buffers BEFORE the new window is created). */
  targetWindowId: number | null
  /** Fallback timer (cleared on ack / retarget / completion / abort). */
  timer: ReturnType<typeof setTimeout>
}

const transferStates = new Map<string, TerminalTransferState>()
const MAX_TRANSFER_BUFFER = 64 * 1024
const TRANSFER_TIMEOUT_MS = 5000

/** Hand ownership to `targetWindowId`, flush the buffered output there, and end
 *  the transfer. Used by both the explicit ack and the fallback paths. The
 *  source's view is already gone by the time we transfer (detach releases the
 *  source xterm), so output always follows the panel to the target. */
function completeTerminalTransfer(ptyId: string, targetWindowId: number): void {
  const state = transferStates.get(ptyId)
  if (!state) return
  clearTimeout(state.timer)
  transferStates.delete(ptyId)
  terminalOwners.set(ptyId, targetWindowId)
  for (const chunk of state.buffer) {
    try { sendToWindow(targetWindowId, TERMINAL_DATA, ptyId, chunk.toString()) } catch { /* target gone */ }
  }
}

/** End a transfer WITHOUT moving ownership: flush the held output back to the
 *  current owner (the move never happened — window creation failed, the target
 *  died, or no destination ever arrived). The source xterm is still attached in
 *  the abort scenarios, so the bytes land where the panel still lives. */
export function abortTerminalTransfer(ptyId: string): void {
  const state = transferStates.get(ptyId)
  if (!state) return
  clearTimeout(state.timer)
  transferStates.delete(ptyId)
  const ownerId = terminalOwners.get(ptyId)
  if (ownerId == null) return
  for (const chunk of state.buffer) {
    try { sendToWindow(ownerId, TERMINAL_DATA, ptyId, chunk.toString()) } catch { /* owner gone */ }
  }
}

/** Start holding PTY output ahead of a move whose destination window does not
 *  exist yet (detach buffers BEFORE createWindow). Until a destination arrives
 *  via setTerminalTransferTarget, the fallback timer ABORTS back to the current
 *  owner — there is no window the transfer could legitimately complete toward. */
export function beginTerminalBuffering(ptyId: string): void {
  const existing = transferStates.get(ptyId)
  if (existing) clearTimeout(existing.timer)
  const timer = setTimeout(() => abortTerminalTransfer(ptyId), TRANSFER_TIMEOUT_MS)
  transferStates.set(ptyId, {
    buffer: existing?.buffer ?? [],
    bufferSize: existing?.bufferSize ?? 0,
    targetWindowId: null,
    timer,
  })
}

/** Point a transfer at its destination window, starting one if none is armed.
 *  Carries any already-buffered bytes forward and re-arms the fallback timer to
 *  COMPLETE toward the target (a missing ack must not strand the PTY on a dead
 *  source — ownership follows the panel). */
export function setTerminalTransferTarget(ptyId: string, targetWindowId: number): void {
  const existing = transferStates.get(ptyId)
  if (existing) clearTimeout(existing.timer)
  const timer = setTimeout(() => completeTerminalTransfer(ptyId, targetWindowId), TRANSFER_TIMEOUT_MS)
  transferStates.set(ptyId, {
    buffer: existing?.buffer ?? [],
    bufferSize: existing?.bufferSize ?? 0,
    targetWindowId,
    timer,
  })
}

/** Begin a transfer whose destination is already known (cross-window drop,
 *  dock-back): buffer + target in one step. */
export function beginTerminalTransfer(ptyId: string, targetWindowId: number): void {
  setTerminalTransferTarget(ptyId, targetWindowId)
}

export function acknowledgeTerminalTransfer(ptyId: string): void {
  const state = transferStates.get(ptyId)
  if (!state) return
  // An ack can only come from a wired receiver, which requires a destination —
  // ignore a stray ack while the transfer is still target-less.
  if (state.targetWindowId == null) return
  completeTerminalTransfer(ptyId, state.targetWindowId)
}

/** A window was destroyed. Any transfer whose SOURCE was that window is
 *  completed to its target now (the running PTY follows the panel instead of
 *  pointing at a dead owner); any transfer whose TARGET died is aborted back
 *  to the still-live owner. */
export function handleWindowClosedTerminalTransfers(windowId: number): void {
  for (const [ptyId, state] of [...transferStates]) {
    if (state.targetWindowId === windowId) {
      abortTerminalTransfer(ptyId)
    } else if (terminalOwners.get(ptyId) === windowId) {
      if (state.targetWindowId != null) {
        completeTerminalTransfer(ptyId, state.targetWindowId)
      } else {
        // Owner died while the transfer had no destination yet — nowhere to
        // flush, drop the held bytes with the window.
        clearTimeout(state.timer)
        transferStates.delete(ptyId)
      }
    }
  }

  // Kill any terminals owned by this window that are NOT in transfer.
  // Without this, orphan PTYs leak on the daemon when the renderer crashes.
  for (const [id, owner] of [...terminalOwners]) {
    if (owner === windowId) {
      log.info('[terminal] cleaning up orphan pty %s (window %d closed)', id, windowId)
      killTerminal(id)
    }
  }
}

export function getTerminalOwner(terminalId: string): number | undefined {
  return terminalOwners.get(terminalId)
}

export function handleCrossWindowDropTerminalTransfer(ptyId: string | undefined, targetWindowId: number): void {
  if (!ptyId) return
  beginTerminalTransfer(ptyId, targetWindowId)
}

export function reassignTerminalWindow(terminalId: string, newWindowId: number): void {
  terminalOwners.set(terminalId, newWindowId)
}

// =============================================================================
// Spawn / lifecycle — routed through the resolved runtime's ProcessHost.
// =============================================================================

function cleanupTerminal(id: string): void {
  terminalOwners.delete(id)
  terminalRuntime.delete(id)
  // Clean up pipe routes
  terminalPipes.delete(id)
  for (const targets of terminalPipes.values()) {
    targets.delete(id)
  }
}

async function spawnTerminal(
  options: { cols: number; rows: number; cwd?: string; shell?: string; workspaceId?: string },
  ownerWindowId: number,
): Promise<string> {
  const { runtimeId, path: cwdPath } = parseLocator(options.cwd ?? '')
  const runtime = runtimes.resolve(runtimeId)

  // Resolve the cwd through the runtime: the local one validates against its
  // allowed roots, the remote one trusts the locator path (its daemon validates).
  // An empty cwd is defaulted to the host's home dir inside the ProcessHost, so
  // there's nothing host-specific to decide here. The owning workspace id scopes
  // validation to that workspace's roots when supplied.
  const cwd = options.cwd ? runtime.validateCwd(cwdPath, ownerWindowId, options.workspaceId) : ''

  // Instant-exit diagnostics (#401): a shell that exits cleanly within this
  // window without ever emitting a byte never became an interactive session
  // (shell startup files exiting, or a PTY that couldn't be allocated). Log it
  // with the resolved shell so the next report carries the cause; the renderer
  // shows the user-facing hint.
  const INSTANT_EXIT_THRESHOLD_MS = 1000
  const spawnedAt = Date.now()
  let sawData = false
  let resolvedShell = ''

  // Per-terminal output coalescing (16ms) → owner window. Owner is read at flush
  // time so a cross-window transfer reroutes in-flight output. The PTY only ever
  // invokes onData with this terminal's own id, so the id captured on first data
  // is the one used at flush.
  let terminalId = ''
  const dispatcher = createStringDispatcher(16, (dataBuffer) => {
    const windowId = terminalOwners.get(terminalId)
    if (windowId != null) {
      try { sendToWindow(windowId, TERMINAL_DATA, terminalId, dataBuffer) } catch { /* window gone */ }
    }
  })

  const onData = (id: string, data: string): void => {
    if (shuttingDown) return
    terminalId = id
    sawData = true
    countTerminalData(data.length)
    getOrCreateLogger(id).append(data)
    feedWorkerOutput(id, data)

    const transferState = transferStates.get(id)
    if (transferState) {
      const chunk = Buffer.from(data)
      transferState.buffer.push(chunk)
      transferState.bufferSize += chunk.length
      while (transferState.bufferSize > MAX_TRANSFER_BUFFER && transferState.buffer.length > 1) {
        transferState.bufferSize -= transferState.buffer.shift()!.length
      }
      return
    }

    // Forward output to piped terminals
    const targets = terminalPipes.get(id)
    if (targets) {
      for (const targetId of targets) {
        const rt = runtimeForTerminal(targetId)
        if (rt) {
          try { rt.process.write(targetId, data) } catch {
            log.warn('[terminal] pipe write failed: target %s may have exited', targetId)
          }
        }
      }
    }

    dispatcher.push(data)
  }

  const onExit = (id: string, exitCode: number): void => {
    onWorkerExit(id, exitCode)
    onMaestroPtyGone(id)
    if (shuttingDown) return
    if (exitCode === 0 && !sawData && Date.now() - spawnedAt < INSTANT_EXIT_THRESHOLD_MS) {
      log.warn(
        '[terminal] %s exited immediately (code 0) with no output — shell %s likely exited from its startup files or no PTY could be allocated',
        id,
        resolvedShell || '(unknown)',
      )
    }
    const windowId = terminalOwners.get(id)
    cleanupTerminal(id)
    if (windowId != null) sendToWindow(windowId, TERMINAL_EXIT, id, exitCode)
  }

  // The requested shell is the client's preference; each ProcessHost resolves it
  // for its own host (the local resolver, or the daemon's first-existing-of
  // [requested, $SHELL, bash, sh]) — so a path that only exists on the client is
  // handled there, not branched on here.
  const handle = await runtime.process.create({ cols: options.cols, rows: options.rows, cwd, shell: options.shell }, onData, onExit)
  resolvedShell = handle.shell ?? ''

  terminalRuntime.set(handle.id, runtimeId)
  terminalOwners.set(handle.id, ownerWindowId)
  if (handle.notice) {
    try { sendToWindow(ownerWindowId, TERMINAL_DATA, handle.id, handle.notice) } catch { /* window gone */ }
  }
  return handle.id
}

function writeTerminal(id: string, data: string): void {
  runtimeForTerminal(id)?.process.write(id, data)
}

function resizeTerminal(id: string, cols: number, rows: number): void {
  runtimeForTerminal(id)?.process.resize(id, cols, rows)
}

function killTerminal(id: string): void {
  const logger = getOrCreateLogger(id)
  logger.flush()
  removeLogger(id)
  runtimeForTerminal(id)?.process.kill(id)
  onMaestroPtyGone(id)
  cleanupTerminal(id)
}

export function registerHandlers(): void {
  // Complete/abandon in-flight terminal transfers when a window closes so a
  // running PTY's ownership follows the panel instead of orphaning on a dead window.
  onWindowClosed(handleWindowClosedTerminalTransfers)

  ipcMain.handle(
    TERMINAL_CREATE,
    async (event, options: { cols: number; rows: number; cwd?: string; shell?: string }): Promise<string> => {
      const win = windowFromEvent(event)
      const windowId = win?.id ?? -1
      return spawnTerminal(options, windowId)
    },
  )

  ipcMain.handle(TERMINAL_WRITE, async (_event, terminalId: string, data: string) => {
    writeTerminal(terminalId, data)
  })

  ipcMain.handle(TERMINAL_RESIZE, async (_event, terminalId: string, cols: number, rows: number) => {
    resizeTerminal(terminalId, cols, rows)
  })

  ipcMain.handle(TERMINAL_KILL, async (_event, terminalId: string) => {
    killTerminal(terminalId)
  })

  ipcMain.handle(TERMINAL_SET_VISIBILITY, async (_event, terminalId: string, visible: boolean) => {
    runtimeForTerminal(terminalId)?.process.setVisibility(terminalId, visible)
  })

  ipcMain.handle(TERMINAL_CLIPBOARD_WRITE, async (_event, text: string): Promise<void> => {
    if (typeof text !== 'string') {
      log.warn('[terminal] rejected non-string clipboard write payload')
      return
    }
    clipboard.writeText(text)
  })

  ipcMain.handle(TERMINAL_GET_CWD, async (_event, ptyId: string): Promise<string | null> => {
    const runtime = runtimeForTerminal(ptyId)
    if (!runtime) return null
    return runtime.process.getCwd(ptyId)
  })

  // Scrollback/log file names are derived from ids supplied by the renderer
  // (and, on restore, from hand-editable session.json) and joined into log-dir
  // paths. Accept only a plain single-segment file name so a crafted id cannot
  // escape the log directory via path separators or dot-dot.
  function isSafeLogFileId(id: unknown): id is string {
    return (
      typeof id === 'string' &&
      id.length > 0 &&
      id.length <= 256 &&
      !id.includes('/') &&
      !id.includes('\\') &&
      !id.includes('\0') &&
      id !== '.' &&
      id !== '..'
    )
  }

  ipcMain.handle(TERMINAL_LOG_READ, async (_event, readKey: string): Promise<string | null> => {
    // readKey is the stable panelId from the caller (replayTerminalLog passes
    // data.replayFromId = panel.id). The scrollback file was saved with the
    // same panel.id key, so it survives restarts unlike ptyId.
    if (!isSafeLogFileId(readKey)) {
      log.warn('[terminal] rejected unsafe terminal id for log read: %s', String(readKey))
      return null
    }
    const { TerminalLogger } = await import('./terminalLogger')
    const logDir = TerminalLogger.getLogDir()
    const scrollbackPath = path.join(logDir, `${readKey}.scrollback`)
    try {
      const data = await fsp.readFile(scrollbackPath, 'utf-8')
      if (data) return data
    } catch { /* fall through to raw log */ }

    const existing = getOrCreateLogger(readKey)
    const data = existing.readAll()
    if (!terminalRuntime.has(readKey)) {
      removeLogger(readKey)
    }
    return data || null
  })

  ipcMain.handle(TERMINAL_SCROLLBACK_SAVE, async (_event, saveKey: string, content: string): Promise<void> => {
    // saveKey is panel.id (stable) — NOT ptyId (transient). This ensures
    // scrollback survives app restarts where ptyIds are regenerated.
    if (!isSafeLogFileId(saveKey)) {
      log.warn('[terminal] rejected unsafe terminal id for scrollback save: %s', String(saveKey))
      return
    }
    // Limit scrollback size to 10MB to prevent disk-fill DoS.
    // Truncate safely at a UTF-8 character boundary to avoid corrupting
    // multi-byte characters or ANSI escape sequences mid-stream.
    const MAX_SCROLLBACK_BYTES = 10 * 1024 * 1024
    if (Buffer.byteLength(content, 'utf-8') > MAX_SCROLLBACK_BYTES) {
      log.warn('[terminal] scrollback content too large (%d bytes), truncating', Buffer.byteLength(content, 'utf-8'))
      content = Buffer.from(content).subarray(0, MAX_SCROLLBACK_BYTES).toString('utf-8')
    }
    const { TerminalLogger } = await import('./terminalLogger')
    const logDir = TerminalLogger.getLogDir()
    await fsp.mkdir(logDir, { recursive: true })
    await fsp.writeFile(path.join(logDir, `${saveKey}.scrollback`), content, 'utf-8')
  })

  // Maestro mode toggle
  ipcMain.handle(ORQUESTRA_TRACK_WORKER, async (_event, workerId: string, orchestratorId: string, name: string, role: string, workspacePath?: string): Promise<void> => {
    trackWorker(workerId, orchestratorId, name, role, workspacePath || '')
  })

  ipcMain.handle(
    ORQUESTRA_NOTE_ROLE_INJECT,
    async (_event, workerId: string, injectText: string, roleFileText?: string): Promise<void> => {
      noteWorkerRoleInjected(
        workerId,
        typeof injectText === 'string' ? injectText : '',
        typeof roleFileText === 'string' ? roleFileText : null,
      )
    },
  )

  // Worker readiness check — used by useOrquestra to detect when the agent
  // inside a worker terminal has started producing output (replaces the
  // hardcoded 8s delay with an adaptive check).
  ipcMain.handle(ORQUESTRA_LIST_WORKERS, async (_event, orchestratorId?: string): Promise<OrquestraWorkerSummary[]> => {
    return listTrackedWorkers(orchestratorId)
  })

  ipcMain.handle(WORKER_HAS_OUTPUT, async (_event, workerPtyId: string): Promise<boolean> => {
    const w = workerTracking.get(workerPtyId)
    return w !== undefined && w.outputBuffer.length > 0
  })

  ipcMain.handle(
    TERMINAL_SET_MAESTRO,
    async (
      _event,
      terminalId: string,
      enabled: boolean,
      workspacePath?: string,
    ): Promise<TerminalSetMaestroResult> => {
      // ----- DISABLE -----
      if (!enabled) {
        setOrquestraTerminal(terminalId, false)
        if (workspacePath) {
          try {
            const crownMarker = path.join(workspacePath, '.orquestra', 'crown.json')
            if (fs.existsSync(crownMarker)) fs.unlinkSync(crownMarker)
            const claudeLocalPath = path.join(workspacePath, 'CLAUDE.local.md')
            if (fs.existsSync(claudeLocalPath)) fs.unlinkSync(claudeLocalPath)
          } catch (err) {
            log.error('[terminal] failed to remove crown markers: %s', err)
          }
          const entry = watcherByWorkspace.get(workspacePath)
          if (entry?.terminalId === terminalId) {
            stopOrquestraWatcher(workspacePath)
          }
        } else {
          // Still stop watcher if this terminal is the active maestro for any ws
          for (const [wsPath, entry] of [...watcherByWorkspace.entries()]) {
            if (entry.terminalId === terminalId) stopOrquestraWatcher(wsPath)
          }
        }
        log.info('[terminal] Orquestra disabled for %s', terminalId)
        return { ok: true }
      }

      // ----- ENABLE (transactional — no early orquestraTerminals.add) -----
      // 0. Live PTY required
      if (!terminalRuntime.has(terminalId)) {
        log.warn('[terminal] Maestro enable rejected: PTY %s not live', terminalId)
        return { ok: false, error: 'Terminal is not running', code: 'PTY_GONE' }
      }

      // 1. Resolve workspace path
      if (!workspacePath) {
        try {
          const runtime = getRuntimeForTerminal(terminalId)
          if (runtime) {
            const cwd = await runtime.process.getCwd(terminalId)
            if (cwd) workspacePath = cwd
          }
        } catch { /* best-effort */ }
      }
      if (!workspacePath) {
        return { ok: false, error: 'No workspace path for Maestro', code: 'NO_WORKSPACE' }
      }

      // 3. Assets
      const assets = checkMaestroAssets()
      if (!assets.ok || !assets.cliDir || !assets.extensionDir) {
        log.error('[terminal] Maestro assets missing: %s', assets.missing.join(', '))
        return {
          ok: false,
          error: `Maestro assets missing: ${assets.missing.join(', ')}`,
          code: 'ASSETS_MISSING',
        }
      }

      // 4. Path validation
      try {
        await validatePathStrict(workspacePath)
      } catch {
        log.warn('[terminal] invalid workspace path for maestro: %s', workspacePath)
        return { ok: false, error: 'Invalid workspace path', code: 'INVALID_PATH' }
      }

      const orchestrationSettings = getAllSettings()
      const cliPath = assets.cliDir
      const extSrcDir = assets.extensionDir
      const partial: string[] = []

      try {
        // 5. Copy required files (fail if any missing — no silent skip)
        const cliJsSrc = path.join(cliPath, 'orquestra.js')
        const cliJsDst = path.join(workspacePath, 'orquestra.js')
        fs.copyFileSync(cliJsSrc, cliJsDst)
        partial.push(cliJsDst)

        const commandsDir = path.join(workspacePath, '.claude', 'commands')
        if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true })
        const workerSkillSrc = path.join(cliPath, 'orquestra-worker-skill.md')
        const workerSkillDst = path.join(commandsDir, 'worker.md')
        fs.copyFileSync(workerSkillSrc, workerSkillDst)
        partial.push(workerSkillDst)

        const cliCmdDir = path.join(workspacePath, '.orquestra-commands')
        if (!fs.existsSync(cliCmdDir)) fs.mkdirSync(cliCmdDir, { recursive: true })

        const orquestraDir = path.join(workspacePath, '.orquestra')
        if (!fs.existsSync(orquestraDir)) fs.mkdirSync(orquestraDir, { recursive: true })

        const piAgentDir = path.join(orquestraDir, 'pi-agent')
        if (!fs.existsSync(piAgentDir)) fs.mkdirSync(piAgentDir, { recursive: true })
        const extDstDir = path.join(piAgentDir, 'extensions', 'orquestra-maestro')
        if (!fs.existsSync(extDstDir)) fs.mkdirSync(extDstDir, { recursive: true })
        for (const file of ['index.ts', 'package.json', 'multiTask.ts'] as const) {
          const src = path.join(extSrcDir, file)
          if (!fs.existsSync(src)) {
            throw new Error(`Missing maestro extension file: ${file}`)
          }
          const dst = path.join(extDstDir, file)
          fs.copyFileSync(src, dst)
          partial.push(dst)
        }

        // Project skill injection — Claude/Verboo slash & project skills
        const skillSrc = path.join(cliPath, 'orquestra-skill.md')
        if (fs.existsSync(skillSrc)) {
          const skillCmdDst = path.join(commandsDir, 'orquestra.md')
          fs.copyFileSync(skillSrc, skillCmdDst)
          partial.push(skillCmdDst)
          const skillDir = path.join(workspacePath, '.claude', 'skills', 'orquestra')
          if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true })
          const skillMd = path.join(skillDir, 'SKILL.md')
          fs.copyFileSync(skillSrc, skillMd)
          partial.push(skillMd)
        }

        // 6. Takeover: cascade previous maestro workers + rebind (full KD4)
        const existing = watcherByWorkspace.get(workspacePath)
        const previousPty =
          existing && existing.terminalId !== terminalId ? existing.terminalId : null
        if (previousPty) {
          cascadeOrchestratorWorkers(previousPty, 'takeover')
          orquestraTerminals.delete(previousPty)
          log.info('[terminal] Maestro takeover: %s → %s', previousPty, terminalId)
        }

        // 7. crown.json + CLAUDE.local.md
        const crownMarker = path.join(orquestraDir, 'crown.json')
        fs.writeFileSync(crownMarker, JSON.stringify({
          terminalPtyId: terminalId,
          activatedAt: Date.now(),
          workspacePath,
          settings: buildMaestroSettingsSnapshot(orchestrationSettings),
        }, null, 2))
        partial.push(crownMarker)

        const claudeLocalPath = path.join(workspacePath, 'CLAUDE.local.md')
        const maestroInstructions = buildMaestroInstructions(orchestrationSettings)
        fs.writeFileSync(claudeLocalPath, maestroInstructions)
        partial.push(claudeLocalPath)
        void import('./linkedContext')
          .then((m) => m.reapplyLinkedContextClaudeInstructionsLocal(workspacePath!))
          .catch(() => { /* non-fatal */ })

        // 8. Start or rebind watcher
        const winId = terminalOwners.get(terminalId)
        if (winId != null) {
          startOrquestraWatcher(workspacePath, winId, terminalId)
        } else {
          log.warn('[terminal] Maestro enable: no owner window for %s — watcher deferred', terminalId)
        }

        // 9. Only now mark maestro-enabled
        setOrquestraTerminal(terminalId, true)
        log.info('[terminal] Orquestra enabled for %s', terminalId)
        return { ok: true, tookOverFrom: previousPty ?? undefined }
      } catch (err) {
        log.error('[terminal] Maestro enable copy/setup failed: %s', err)
        for (const p of partial) {
          try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* best effort */ }
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          code: 'COPY_FAILED',
        }
      }
    },
  )

  ipcMain.handle(TERMINAL_PIPE_CREATE, async (_event, sourcePtyId: string, targetPtyId: string) => {
    log.debug('[terminal] pipe create: %s -> %s', sourcePtyId, targetPtyId)
    if (!terminalRuntime.has(sourcePtyId)) {
      throw new Error(`pipe create failed: source PTY ${sourcePtyId} not found`)
    }
    if (!terminalRuntime.has(targetPtyId)) {
      throw new Error(`pipe create failed: target PTY ${targetPtyId} not found`)
    }
    if (terminalRuntime.get(sourcePtyId) !== terminalRuntime.get(targetPtyId)) {
      throw new Error(`pipe create failed: source and target PTY are on different runtimes`)
    }
    let targets = terminalPipes.get(sourcePtyId)
    if (!targets) {
      targets = new Set()
      terminalPipes.set(sourcePtyId, targets)
    }
    targets.add(targetPtyId)
    log.debug('[terminal] pipe created: %s -> %s', sourcePtyId, targetPtyId)
  })

  ipcMain.handle(TERMINAL_PIPE_DESTROY, async (_event, sourcePtyId: string, targetPtyId: string) => {
    log.debug('[terminal] pipe destroy: %s -> %s', sourcePtyId, targetPtyId)
    const targets = terminalPipes.get(sourcePtyId)
    if (targets) {
      targets.delete(targetPtyId)
      if (targets.size === 0) terminalPipes.delete(sourcePtyId)
    }
    log.debug('[terminal] pipe destroyed: %s -> %s', sourcePtyId, targetPtyId)
  })
}

/**
 * Tear down all terminals on app quit. Local terminals now live in the local
 * runtime daemon subprocess, so disposing the runtime connections sends each
 * daemon SIGTERM and closes its stdin — its ProcessHost then group-kills its ptys
 * (reaping dev servers/watchers) and exits. Remote daemons are torn down the same
 * way. Fire-and-forget: quit must not block on a remote socket.
 */
export function killAllTerminals(): void {
  shuttingDown = true
  stopOrquestraWatcher()
  disposeAllLoggers()
  void runtimes.disposeAll()
  terminalOwners.clear()
  terminalRuntime.clear()
  terminalPipes.clear()
  orquestraTerminals.clear()
}

export { flushAllLoggers }
