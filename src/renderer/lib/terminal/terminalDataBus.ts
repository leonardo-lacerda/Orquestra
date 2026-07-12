// =============================================================================
// terminalDataBus — single multiplexed IPC listener for TERMINAL_DATA / EXIT.
//
// Without this, each terminal registered its own ipcRenderer.on(TERMINAL_DATA)
// handler. With N terminals, every output chunk invoked N callbacks (N-1 no-ops).
// That alone is O(N) work per chunk before any xterm parsing — deadly at 8–12
// agent TUIs streaming in parallel.
//
// One listener dispatches by ptyId into a Map. Register/unregister is O(1).
// =============================================================================

type DataHandler = (data: string) => void
type ExitHandler = (exitCode: number) => void

const dataHandlers = new Map<string, DataHandler>()
const exitHandlers = new Map<string, ExitHandler>()

let dataUnsub: (() => void) | null = null
let exitUnsub: (() => void) | null = null

function ensureDataListener(): void {
  if (dataUnsub) return
  const api = window.electronAPI
  if (!api?.onTerminalData) return
  dataUnsub = api.onTerminalData((id: string, data: string) => {
    dataHandlers.get(id)?.(data)
  })
}

function ensureExitListener(): void {
  if (exitUnsub) return
  const api = window.electronAPI
  if (!api?.onTerminalExit) return
  exitUnsub = api.onTerminalExit((id: string, exitCode: number) => {
    exitHandlers.get(id)?.(exitCode)
  })
}

function teardownDataIfEmpty(): void {
  if (dataHandlers.size > 0 || !dataUnsub) return
  try { dataUnsub() } catch { /* ignore */ }
  dataUnsub = null
}

function teardownExitIfEmpty(): void {
  if (exitHandlers.size > 0 || !exitUnsub) return
  try { exitUnsub() } catch { /* ignore */ }
  exitUnsub = null
}

/** Route PTY output for `ptyId` to `handler`. Returns unsubscribe. */
export function registerTerminalDataHandler(ptyId: string, handler: DataHandler): () => void {
  dataHandlers.set(ptyId, handler)
  ensureDataListener()
  return () => {
    if (dataHandlers.get(ptyId) === handler) dataHandlers.delete(ptyId)
    teardownDataIfEmpty()
  }
}

/** Route PTY exit for `ptyId` to `handler`. Returns unsubscribe. */
export function registerTerminalExitHandler(ptyId: string, handler: ExitHandler): () => void {
  exitHandlers.set(ptyId, handler)
  ensureExitListener()
  return () => {
    if (exitHandlers.get(ptyId) === handler) exitHandlers.delete(ptyId)
    teardownExitIfEmpty()
  }
}

/** Test helpers */
export function __dataHandlerCountForTests(): number {
  return dataHandlers.size
}

export function __resetTerminalDataBusForTests(): void {
  dataHandlers.clear()
  exitHandlers.clear()
  if (dataUnsub) {
    try { dataUnsub() } catch { /* ignore */ }
    dataUnsub = null
  }
  if (exitUnsub) {
    try { exitUnsub() } catch { /* ignore */ }
    exitUnsub = null
  }
}
