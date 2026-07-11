// =============================================================================
// Pure re-arm decision (no IPC) — same rules production uses in CanvasNode.
// =============================================================================

export type MaestroCrownUiState = 'off' | 'active' | 'paused' | 'error'

/**
 * Whether we should call terminalSetMaestro for restore/re-arm.
 * Requires panel maestro intent + live PTY + workspace root.
 * armKey already applied → skip (idempotent).
 */
export function shouldAttemptMaestroRearm(opts: {
  panelMaestroFlag: boolean
  ptyId: string | null | undefined
  ptyAlive: boolean
  rootPath: string | null | undefined
  /** `${panelId}:${ptyId}` last successfully armed */
  lastArmKey: string | null | undefined
  panelId: string
}): boolean {
  if (!opts.panelMaestroFlag) return false
  if (!opts.ptyId || !opts.ptyAlive) return false
  if (!opts.rootPath?.trim()) return false
  const key = `${opts.panelId}:${opts.ptyId}`
  if (opts.lastArmKey === key) return false
  return true
}

/** Derive crown UI state without false Active when enable failed. */
export function maestroCrownUiState(opts: {
  panelMaestroFlag: boolean
  ptyAlive: boolean
  error: string | null | undefined
  /** Main arm succeeded for current live pty */
  armedForLivePty: boolean
}): MaestroCrownUiState {
  if (opts.error?.trim()) return 'error'
  if (!opts.panelMaestroFlag) return 'off'
  if (!opts.ptyAlive) return 'paused'
  // Flag true + live PTY but not yet armed → treat as paused until rearm succeeds
  // (avoids green Active when main watcher/assets are not up).
  if (!opts.armedForLivePty) return 'paused'
  return 'active'
}
