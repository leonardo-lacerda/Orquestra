// =============================================================================
// Logger — centralized logging for the main process, backed by electron-log.
// Writes to ~/Library/Logs/Orquestra/main.log (macOS) with 5MB rotation.
// Renderer processes use electron-log/renderer which sends logs here via IPC.
// =============================================================================

import log from 'electron-log/main'

// Enable renderer→main IPC so renderer logs land in the same file
log.initialize()

// File transport: persist info+ to disk
log.transports.file.level = 'info'
log.transports.file.maxSize = 5 * 1024 * 1024 // 5MB per file
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

// Console transport: info+ in dev (debug floods orchestration/terminal noise).
// File still gets info+. Set ORQUESTRA_LOG_DEBUG=1 for full console debug.
// Packaged macOS apps launched from Finder have no attached stdout/stderr.
const wantDebug = process.env.ORQUESTRA_LOG_DEBUG === '1' || process.env.ORQUESTRA_LOG_DEBUG === 'true'
log.transports.console.level =
  process.env.NODE_ENV === 'development'
    ? (wantDebug ? 'debug' : 'info')
    : false

// Guard against EIO on broken stderr even in dev (parent terminal closed).
process.stderr?.on?.('error', () => {})
process.stdout?.on?.('error', () => {})

// Catch uncaughtException + unhandledRejection globally
log.errorHandler.startCatching()

export default log
