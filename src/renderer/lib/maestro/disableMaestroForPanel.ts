// =============================================================================
// disableMaestroForPanel — shared disable (close path + crown toggle).
// =============================================================================

import { useAppStore } from '../../stores/appStore'
import { useOrchestrationRunStore } from '../../stores/orchestrationRunStore'
import { terminalRegistry } from '../terminal/terminalRegistry'
import { clearMaestroArmed } from './ensureMaestroArmed'

/**
 * Disable Maestro for a panel. When ptyId is known, calls main IPC.
 * When ptyId is missing, local-only cleanup (no empty-string IPC) — main
 * onMaestroPtyGone is the backstop for kill/exit.
 */
export async function disableMaestroForPanel(
  workspaceId: string,
  panelId: string,
): Promise<void> {
  const store = useAppStore.getState()
  const ws = store.workspaces.find((w) => w.id === workspaceId)
  const ptyId = terminalRegistry.ptyIdForPanel(panelId)
  clearMaestroArmed(panelId)
  store.setPanelMaestro(workspaceId, panelId, false)
  if (ptyId) {
    useOrchestrationRunStore.getState().clearMaestro(ptyId)
    await window.electronAPI?.terminalSetMaestro?.(ptyId, false, ws?.rootPath || '')
    return
  }
  // Local-only: no terminalSetMaestro('', …)
}
