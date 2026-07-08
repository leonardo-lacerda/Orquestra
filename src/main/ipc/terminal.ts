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
  WORKER_HAS_OUTPUT,
} from '../../shared/ipc-channels'
import { getOrCreateLogger, removeLogger, flushAll as flushAllLoggers, disposeAll as disposeAllLoggers } from './terminalLogger'
import log from '../logger'
import { sendToWindow, windowFromEvent, onWindowClosed } from '../windowRegistry'
import { countTerminalData } from '../perf/perfMonitor'
import { parseLocator, type RuntimeId } from '../runtime/locator'
import { runtimes } from '../runtime/runtimeManager'
import type { Runtime } from '../runtime/types'
import { createStringDispatcher } from './batchedDispatcher'
import { validatePathStrict } from './pathValidation'

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
let commandsPollTimer: NodeJS.Timeout | null = null

export function setOrquestraTerminal(terminalId: string, enabled: boolean): void {
  if (enabled) {
    orquestraTerminals.add(terminalId)
  } else {
    orquestraTerminals.delete(terminalId)
    // Cascading cleanup: close all workers that belong to this orquestrador
    closeWorkersForOrchestrator(terminalId)
  }
}

/** Close all workers tracked under the given orquestrador PTY ID. */
function closeWorkersForOrchestrator(orchestratorId: string): void {
  for (const [workerId, tracking] of workerTracking) {
    if (tracking.orchestratorId === orchestratorId) {
      const runtime = getRuntimeForTerminal(workerId)
      if (runtime) {
        try { runtime.process.kill?.(workerId) } catch { /* already dead */ }
      }
      workerTracking.delete(workerId)
      log.info('[orquestra] cascaded cleanup: worker %s (%s) closed', workerId, tracking.name)
    }
  }
}

// Periodic heartbeat: detect dead workers that weren't properly cleaned up.
// Uses scanActivity (POSIX ps). On Windows scanActivity returns {} so the
// heartbeat only fires where the host OS supports process scanning.
setInterval(async () => {
  const tracked = Array.from(workerTracking.entries())
  if (tracked.length === 0) return

  const runtime = getRuntimeForTerminal(tracked[0][0])
  if (!runtime) return

  const ids = tracked.map(([id]) => id)
  const activity = await runtime.process.scanActivity(ids).catch(() => null)
  if (!activity || Object.keys(activity).length === 0) return // no data (Windows or unsupported)

  for (const [workerId, tracking] of tracked) {
    if (!(workerId in activity)) {
      log.warn('[orquestra] heartbeat: worker %s (%s) is dead, cleaning up', workerId, tracking.name)
      onWorkerExit(workerId)
    }
  }
}, 60_000)

export function getOrquestraCliDir(): string {
  const appPath = app.getAppPath()
  return path.join(appPath, 'scripts', 'maestro')
}

const COMMANDS_POLL_MS = 500
const PROCESSED_CLEANUP_MS = 5 * 60 * 1000 // clear dedup set every 5 min

export function startOrquestraWatcher(workspacePath: string, ownerWindowId: number): void {
  const commandsDir = path.join(workspacePath, '.orquestra-commands')
  if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true })
  log.info('[orquestra] watching %s for commands', commandsDir)

  // Clean up stale commands from previous crashes
  try {
    const stale = fs.readdirSync(commandsDir).filter(f => f.endsWith('.json'))
    for (const f of stale) {
      fs.unlinkSync(path.join(commandsDir, f))
    }
    if (stale.length > 0) log.info('[orquestra] cleaned %d stale command(s)', stale.length)
  } catch { /* dir may not exist yet */ }

  // Polling is more reliable than fs.watch — avoids duplicate events (Windows)
  // and missed events (macOS). Dedup via Set of filenames prevents processing
  // the same file twice.
  const processedFiles = new Set<string>()

  const poll = (): void => {
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
        log.info('[orquestra] command: %s %o', filename, payload)
        const { cmd, args } = payload
        switch (cmd) {
          case 'recruit':  sendToWindow(ownerWindowId, MAESTRO_RECRUIT, 'maestro', args); break
          case 'dismiss':  sendToWindow(ownerWindowId, MAESTRO_DISMISS, 'maestro', args); break
          case 'connect':  sendToWindow(ownerWindowId, MAESTRO_CONNECT, 'maestro', args); break
          case 'list':     sendToWindow(ownerWindowId, MAESTRO_LIST, 'maestro', args); break
          case 'reassign': sendToWindow(ownerWindowId, MAESTRO_REASSIGN, 'maestro', args); break
        }
        log.info('[orquestra] dispatched %s', cmd)
        fs.unlinkSync(filePath)
      } catch (err) { log.error('[orquestra] error processing %s: %s', filename, err) }
    }
  }

  commandsPollTimer = setInterval(poll, COMMANDS_POLL_MS)

  // Periodically evict old entries from the dedup set to avoid memory leak
  const cleanupTimer = setInterval(() => processedFiles.clear(), PROCESSED_CLEANUP_MS)
  // Store the cleanup timer so it can be cleared on stop
  ;(commandsPollTimer as unknown as Record<string, unknown>)._cleanupTimer = cleanupTimer
}

export function stopOrquestraWatcher(): void {
  if (commandsPollTimer) {
    clearInterval(commandsPollTimer)
    const cleanup = (commandsPollTimer as unknown as Record<string, unknown>)._cleanupTimer
    if (cleanup) clearInterval(cleanup as NodeJS.Timeout)
    commandsPollTimer = null
  }
}

// =============================================================================
// Worker Response Queue — detect when workers finish, report to orchestrator
// =============================================================================

interface WorkerResponse {
  workerName: string
  workerRole: string
  status: 'completed' | 'idle'
  summary: string
  timestamp: number
}

// Map: orchestrator ptyId → queue of responses
const responseQueues: Map<string, WorkerResponse[]> = new Map()

// Map: worker ptyId → { orchestratorId, name, role, outputBuffer, lastActivity, workspacePath }
const workerTracking: Map<string, {
  orchestratorId: string
  name: string
  role: string
  outputBuffer: string[]
  lastActivity: number
  idleTimer: ReturnType<typeof setTimeout> | null
  workspacePath: string
}> = new Map()

const WORKER_OUTPUT_LIMIT = 100  // keep last 100 lines
const WORKER_IDLE_TIMEOUT = 30000 // 30 seconds
const RESPONSE_QUEUE_MAX = 100   // max pending responses per orchestrator
const ORQUESTRA_RESULTS_DIR = '.orquestra-results'

/** Write a worker result JSON file so the orquestra.js CLI's `wait` command
 *  can poll for it. Files are stored in <workspace>/.orquestra-results/. */
function writeWorkerResultFile(workspacePath: string, result: {
  workerName: string; workerRole: string; status: string; summary: string; timestamp: number
}): void {
  try {
    const resultsDir = path.join(workspacePath, ORQUESTRA_RESULTS_DIR)
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true })
    // Sanitize worker name: strip path separators to prevent traversal
    // outside .orquestra-results/
    const safeName = path.basename(result.workerName).replace(/[/\\]/g, '_')
    const filePath = path.join(resultsDir, `worker-${safeName}.json`)
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2))
  } catch (err) {
    log.error('[orquestra] failed to write result file: %s', err)
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
    idleTimer: null as ReturnType<typeof setTimeout> | null,
    workspacePath,
  })
  log.info('[orquestra] Tracking worker %s → orchestrator %s', workerId, orchestratorId)
}

/** Feed worker output for tracking. Call this from onData. */
export function feedWorkerOutput(workerId: string, data: string): void {
  const tracking = workerTracking.get(workerId)
  if (!tracking) return

  tracking.lastActivity = Date.now()

  // Buffer cleaned lines
  const cleaned = stripAnsi(data)
  const lines = cleaned.split(new RegExp(String.fromCharCode(13, 10), "g")).filter((l: string) => l.trim())
  tracking.outputBuffer.push(...lines)

  // Keep only last N lines
  if (tracking.outputBuffer.length > WORKER_OUTPUT_LIMIT) {
    tracking.outputBuffer = tracking.outputBuffer.slice(-WORKER_OUTPUT_LIMIT)
  }

  // Reset idle timer
  if (tracking.idleTimer) clearTimeout(tracking.idleTimer)
  tracking.idleTimer = setTimeout(() => {
    onWorkerIdle(workerId)
  }, WORKER_IDLE_TIMEOUT)
}

/** Called when a worker process exits. */
export function onWorkerExit(workerId: string): void {
  const tracking = workerTracking.get(workerId)
  if (!tracking) return

  if (tracking.idleTimer) clearTimeout(tracking.idleTimer)

  const summary = tracking.outputBuffer.slice(-30).join('\n')
  const result = {
    workerName: tracking.name,
    workerRole: tracking.role,
    status: 'completed' as const,
    summary,
    timestamp: Date.now(),
  }
  if (tracking.workspacePath) writeWorkerResultFile(tracking.workspacePath, result)
  enqueueResponse(tracking.orchestratorId, result)

  workerTracking.delete(workerId)
  log.info('[orquestra] Worker %s exited, response enqueued + result file written', workerId)
}

/** Called when a worker is idle (no output for 30s). */
function onWorkerIdle(workerId: string): void {
  const tracking = workerTracking.get(workerId)
  if (!tracking) return

  const summary = tracking.outputBuffer.slice(-20).join('\n')
  const result = {
    workerName: tracking.name,
    workerRole: tracking.role,
    status: 'idle' as const,
    summary,
    timestamp: Date.now(),
  }
  if (tracking.workspacePath) writeWorkerResultFile(tracking.workspacePath, result)
  enqueueResponse(tracking.orchestratorId, result)

  workerTracking.delete(workerId)
  log.info('[orquestra] Worker %s idle, response enqueued + result file written', workerId)
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
  const marker = response.status === 'completed' ? '✓' : '⏳'
  const cr = String.fromCharCode(13)
  const message = '[WORKER\u2192ORQUESTRADOR] Worker "' + response.workerName + '" ' + response.status + ':\n' + response.summary + '\n'

  // Guard: orchestrator terminal may have been closed since the response was queued
  try { writeTerminal(orchestratorId, message + cr) }
  catch (err) {
    log.warn('[orquestra] orchestrator %s gone, dropping response: %s', orchestratorId, err)
    return
  }
  log.info('[orquestra] Injected response from %s into %s', response.workerName, orchestratorId)

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
          try { rt.process.write(targetId, data) } catch { /* target may have exited */ }
        }
      }
    }

    dispatcher.push(data)
  }

  const onExit = (id: string, exitCode: number): void => {
    onWorkerExit(id)
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
    log.info('[terminal] WRITE to %s: %d bytes, preview: %s', terminalId, data.length, data.slice(0, 80))
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

  ipcMain.handle(TERMINAL_LOG_READ, async (_event, terminalId: string): Promise<string | null> => {
    if (!isSafeLogFileId(terminalId)) {
      log.warn('[terminal] rejected unsafe terminal id for log read: %s', String(terminalId))
      return null
    }
    const { TerminalLogger } = await import('./terminalLogger')
    const logDir = TerminalLogger.getLogDir()
    const scrollbackPath = path.join(logDir, `${terminalId}.scrollback`)
    try {
      const data = await fsp.readFile(scrollbackPath, 'utf-8')
      if (data) return data
    } catch { /* fall through to raw log */ }

    const existing = getOrCreateLogger(terminalId)
    const data = existing.readAll()
    if (!terminalRuntime.has(terminalId)) {
      removeLogger(terminalId)
    }
    return data || null
  })

  ipcMain.handle(TERMINAL_SCROLLBACK_SAVE, async (_event, ptyId: string, content: string): Promise<void> => {
    if (!isSafeLogFileId(ptyId)) {
      log.warn('[terminal] rejected unsafe terminal id for scrollback save: %s', String(ptyId))
      return
    }
    // Limit scrollback size to 10MB to prevent disk-fill DoS
    const MAX_SCROLLBACK_BYTES = 10 * 1024 * 1024
    if (Buffer.byteLength(content, 'utf-8') > MAX_SCROLLBACK_BYTES) {
      log.warn('[terminal] scrollback content too large (%d bytes), truncating', Buffer.byteLength(content, 'utf-8'))
      content = content.slice(0, MAX_SCROLLBACK_BYTES)
    }
    const { TerminalLogger } = await import('./terminalLogger')
    const logDir = TerminalLogger.getLogDir()
    await fsp.mkdir(logDir, { recursive: true })
    await fsp.writeFile(path.join(logDir, `${ptyId}.scrollback`), content, 'utf-8')
  })

  // Maestro mode toggle
  ipcMain.handle(ORQUESTRA_TRACK_WORKER, async (_event, workerId: string, orchestratorId: string, name: string, role: string, workspacePath?: string): Promise<void> => {
    trackWorker(workerId, orchestratorId, name, role, workspacePath || '')
  })

  // Worker readiness check — used by useOrquestra to detect when the agent
  // inside a worker terminal has started producing output (replaces the
  // hardcoded 8s delay with an adaptive check).
  ipcMain.handle(WORKER_HAS_OUTPUT, async (_event, workerPtyId: string): Promise<boolean> => {
    const w = workerTracking.get(workerPtyId)
    return w !== undefined && w.outputBuffer.length > 0
  })

  ipcMain.handle(TERMINAL_SET_MAESTRO, async (_event, terminalId: string, enabled: boolean, workspacePath?: string): Promise<void> => {
    setOrquestraTerminal(terminalId, enabled)
    // If the renderer didn't supply a workspace path (e.g. no workspace is
    // selected), fall back to the terminal's CWD. Without a valid path the
    // crown markers, APPEND_SYSTEM.md, and orchestrator.js won't be written
    // and maestro mode is effectively broken.
    if (enabled && !workspacePath) {
      try {
        const runtime = getRuntimeForTerminal(terminalId)
        if (runtime) {
          const cwd = await runtime.process.getCwd(terminalId)
          if (cwd) workspacePath = cwd
        }
      } catch { /* best-effort — leave workspacePath as-is */ }
    }
    if (enabled) {
      const cliPath = getOrquestraCliDir()
      // Copy orquestra.js + skill file to workspace
      if (workspacePath) {
        // Validate the workspace path — same boundary as all other IPC
        // file operations. The renderer should only be able to write
        // maestro files inside an allowed workspace root.
        try {
          await validatePathStrict(workspacePath)
        } catch {
          log.warn('[terminal] invalid workspace path for maestro: %s', workspacePath)
          return
        }
        try {
          // Copy orquestra.js to workspace root
          const cliJsSrc = path.join(cliPath, 'orquestra.js')
          const cliJsDst = path.join(workspacePath, 'orquestra.js')
          if (fs.existsSync(cliJsSrc)) fs.copyFileSync(cliJsSrc, cliJsDst)

          // Copy worker skill to .claude/commands/worker.md
          const commandsDir = path.join(workspacePath, '.claude', 'commands')
          if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true })
          const workerSkillSrc = path.join(cliPath, 'orquestra-worker-skill.md')
          const workerSkillDst = path.join(commandsDir, 'worker.md')
          if (fs.existsSync(workerSkillSrc)) fs.copyFileSync(workerSkillSrc, workerSkillDst)

          // Create .orquestra-commands directory
          const cliCmdDir = path.join(workspacePath, '.orquestra-commands')
          if (!fs.existsSync(cliCmdDir)) fs.mkdirSync(cliCmdDir, { recursive: true })

          // Write crown marker so the orquestra-maestro Pi extension can
          // auto-inject the orchestration prompt into this workspace.
          const orquestraDir = path.join(workspacePath, '.orquestra')
          if (!fs.existsSync(orquestraDir)) fs.mkdirSync(orquestraDir, { recursive: true })
          const crownMarker = path.join(orquestraDir, 'crown.json')
          fs.writeFileSync(crownMarker, JSON.stringify({
            terminalPtyId: terminalId,
            activatedAt: Date.now(),
            workspacePath,
          }, null, 2))

          // Ensure pi-agent dir exists for the maestro extension copy below
          const piAgentDir = path.join(orquestraDir, 'pi-agent')
          if (!fs.existsSync(piAgentDir)) fs.mkdirSync(piAgentDir, { recursive: true })

          // Copy maestro Pi extension to pi-agent/extensions/orquestra-maestro/
          // so Pi auto-discovers the custom tools (orquestra_recruit, etc.)
          // when the user runs verboo in this workspace's terminal.
          const extSrcDir = path.join(app.getAppPath(), 'src', 'agent', 'extensions', 'orquestra-maestro')
          const extDstDir = path.join(piAgentDir, 'extensions', 'orquestra-maestro')
          if (fs.existsSync(extSrcDir)) {
            if (!fs.existsSync(extDstDir)) fs.mkdirSync(extDstDir, { recursive: true })
            ;['index.ts', 'package.json'].forEach((file) => {
              const src = path.join(extSrcDir, file)
              const dst = path.join(extDstDir, file)
              if (fs.existsSync(src)) fs.copyFileSync(src, dst)
            })
          }

          // Write CLAUDE.local.md in the workspace root so standalone
          // `verboo` auto-loads the maestro instructions (Verboo reads
          // CLAUDE.md / CLAUDE.local.md from the project root). This is the
          // primary mechanism — it works without env vars or Pi mechanisms.
          const claudeLocalPath = path.join(workspacePath, 'CLAUDE.local.md')
          const maestroInstructions = [
            '# Maestro Mode -- ACTIVE',
            '',
            'You are operating in MAESTRO MODE. This overrides your default "do the work yourself" behavior.',
            '',
            '## WORKFLOW (execute in order, do not skip steps)',
            '',
            '**STEP 1 — ANALYZE**: Does the request have 2+ independent sub-tasks?',
            '  - "Create an HTML page and also an API" → YES, 2 sub-tasks',
            '  - "Build HTML, CSS, and JS" → YES, 3 sub-tasks',
            '  - "I need 3 files: index.html, style.css, app.js" → YES, 3 sub-tasks',
            '  - "Cria um Dockerfile e um docker-compose" → YES, 2 sub-tasks',
            '  - "What is the capital of France?" → NO, single question',
            '',
            '**STEP 2 — RECRUIT**: For each sub-task, run recruit:',
            '  node orquestra.js recruit --role "<task>" --name <name>',
            '  Each recruit command = one worker = one sub-task.',
            '  Do NOT combine sub-tasks into one recruit command.',
            '',
            '**STEP 3 — WAIT**: After recruiting ALL workers, run:',
            '  node orquestra.js wait --workers <name1>,<name2> --timeout 300',
            '  This command BLOCKS until every worker finishes or times out.',
            '  [MANDATORY] Do NOT proceed past this command while it is running.',
            '  [MANDATORY] Do NOT cancel the wait command.',
            '  [MANDATORY] Do NOT check files, read output, or do any work yourself while waiting.',
            '',
            '**STEP 4 — REVIEW**: After wait returns, read results:',
            '  - Check .orquestra-results/worker-<name>.json for each worker',
            '  - If all workers completed (DONE): consolidate their output',
            '  - If any worker failed/timed out (IDLE): reassign with `reassign --name <name> --role "fix: ..."`',
            '  - [MANDATORY] Never fix a failed worker yourself. Always reassign.',
            '',
            '**STEP 5 — CONSOLIDATE**: Combine all worker outputs into a cohesive response.',
            '',
            '## MANDATORY RULES',
            '',
            '1. [MANDATORY] Always analyze BEFORE acting. Always run steps 1-5 above.',
            '2. [MANDATORY] Never do the work yourself after delegating.',
            '3. [MANDATORY] Never ask permission to orchestrate. Just do it.',
            '4. [MANDATORY] Never cancel or skip the `wait` command.',
            '5. [MANDATORY] If a worker fails, reassign. Never fix it yourself.',
            '6. [MANDATORY] Single simple tasks: execute directly. No orchestration needed.',
            '',
            '## COMMANDS REFERENCE',
            '  orquestra.js recruit --role "desc" --name <name>    Recruit a worker',
            '  orquestra.js wait --workers n1,n2 --timeout 300     Wait for workers (blocks)',
            '  orquestra.js status                                 Show worker results as JSON',
            '  orquestra.js list                                   List workers on canvas',
            '  orquestra.js dismiss <name>                         Remove a worker',
            '  orquestra.js reassign <name> --role "new task"      Change worker task',
            '',
          ].join('\n')
          fs.writeFileSync(claudeLocalPath, maestroInstructions)

          log.info('[terminal] Orquestra files copied to %s', workspacePath)
        } catch (err) { log.error('[terminal] failed to copy Orquestra files: %s', err) }
      }
      const winId = terminalOwners.get(terminalId)
      if (winId && workspacePath) startOrquestraWatcher(workspacePath, winId)
      log.info('[terminal] Orquestra enabled for %s', terminalId)
    } else {
      // Crown disabled — clean up markers
      if (workspacePath) {
        try {
          const crownMarker = path.join(workspacePath, '.orquestra', 'crown.json')
          if (fs.existsSync(crownMarker)) fs.unlinkSync(crownMarker)
          // Remove CLAUDE.local.md so Verboo stops seeing maestro instructions
          const claudeLocalPath = path.join(workspacePath, 'CLAUDE.local.md')
          if (fs.existsSync(claudeLocalPath)) fs.unlinkSync(claudeLocalPath)
        } catch (err) { log.error('[terminal] failed to remove crown markers: %s', err) }
      }
      log.info('[terminal] Orquestra disabled for %s', terminalId)
    }
  })

  ipcMain.handle(TERMINAL_PIPE_CREATE, async (_event, sourcePtyId: string, targetPtyId: string) => {
    log.info('[terminal] pipe create: %s -> %s', sourcePtyId, targetPtyId)
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
    log.info('[terminal] pipe created: %s -> %s', sourcePtyId, targetPtyId)
  })

  ipcMain.handle(TERMINAL_PIPE_DESTROY, async (_event, sourcePtyId: string, targetPtyId: string) => {
    log.info('[terminal] pipe destroy: %s -> %s', sourcePtyId, targetPtyId)
    const targets = terminalPipes.get(sourcePtyId)
    if (targets) {
      targets.delete(targetPtyId)
      if (targets.size === 0) terminalPipes.delete(sourcePtyId)
    }
    log.info('[terminal] pipe destroyed: %s -> %s', sourcePtyId, targetPtyId)
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
