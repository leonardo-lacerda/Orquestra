// =============================================================================
// ensureMaestroArmed — restore / re-arm Maestro when panel.maestro && live PTY.
// =============================================================================

import type { TerminalSetMaestroResult } from '../../../shared/electron-api'
import { useAppStore } from '../../stores/appStore'
import { useOrchestrationRunStore } from '../../stores/orchestrationRunStore'
import { terminalRegistry } from '../terminal/terminalRegistry'

/** Last successfully armed pty id per panelId. */
const armedPtyByPanel = new Map<string, string>()

export function isLivePty(panelId: string, ptyId: string): boolean {
  const entry = terminalRegistry.getEntry(panelId)
  return !!entry && entry.ptyId === ptyId && entry.alive === true
}

export function clearMaestroArmed(panelId: string): void {
  armedPtyByPanel.delete(panelId)
}

export function getArmedPty(panelId: string): string | undefined {
  return armedPtyByPanel.get(panelId)
}

export function clearOtherMaestroFlags(workspaceId: string, keepPanelId: string): void {
  const store = useAppStore.getState()
  const ws = store.workspaces.find((w) => w.id === workspaceId)
  if (!ws) return
  for (const panel of Object.values(ws.panels)) {
    if (panel.id !== keepPanelId && panel.maestro) {
      store.setPanelMaestro(workspaceId, panel.id, false)
      clearMaestroArmed(panel.id)
    }
  }
}

/**
 * Ensure main-process Maestro is armed for this live PTY.
 * Short-circuits only when already armed for this id AND registry still alive.
 */
export async function ensureMaestroArmed(opts: {
  workspaceId: string
  panelId: string
  ptyId: string
  rootPath: string
}): Promise<TerminalSetMaestroResult> {
  if (
    armedPtyByPanel.get(opts.panelId) === opts.ptyId
    && isLivePty(opts.panelId, opts.ptyId)
  ) {
    return { ok: true }
  }
  if (!isLivePty(opts.panelId, opts.ptyId)) {
    clearMaestroArmed(opts.panelId)
    return { ok: false, error: 'Terminal not running', code: 'PTY_GONE' }
  }
  if (!window.electronAPI?.terminalSetMaestro) {
    return { ok: false, error: 'Maestro API unavailable', code: 'COPY_FAILED' }
  }
  const result = await window.electronAPI.terminalSetMaestro(
    opts.ptyId,
    true,
    opts.rootPath,
  )
  if (result.ok) {
    armedPtyByPanel.set(opts.panelId, opts.ptyId)
    // setPanelMaestro is a no-op when already true (avoids update-depth loops).
    useAppStore.getState().setPanelMaestro(opts.workspaceId, opts.panelId, true)
    if (result.tookOverFrom) {
      clearOtherMaestroFlags(opts.workspaceId, opts.panelId)
      useOrchestrationRunStore.getState().clearMaestro(result.tookOverFrom)
      // No terminalWrite notice — stdin inject is executed by the shell as a command.
    }
  } else {
    armedPtyByPanel.delete(opts.panelId)
    if (result.code === 'ASSETS_MISSING' || result.code === 'COPY_FAILED') {
      useAppStore.getState().setPanelMaestro(opts.workspaceId, opts.panelId, false)
    }
  }
  return result
}

/** Registry marked this panel's PTY dead while maestro intent remains. */
export function onMaestroRegistryExit(panelId: string): void {
  clearMaestroArmed(panelId)
}
