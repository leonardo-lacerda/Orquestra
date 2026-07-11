// =============================================================================
// sanitizeMaestroFlags — keep at most one panel.maestro per workspace.
// =============================================================================

import { useAppStore } from '../../stores/appStore'
import { clearMaestroArmed } from './ensureMaestroArmed'

/**
 * On hydrate: if multiple maestro flags exist, keep focused terminal or
 * stable panelId sort winner; clear the rest.
 * @returns kept panelId or null
 */
export function sanitizeMaestroFlags(
  workspaceId: string,
  focusedPanelId?: string | null,
): string | null {
  const store = useAppStore.getState()
  const ws = store.workspaces.find((w) => w.id === workspaceId)
  if (!ws) return null

  const maestros = Object.values(ws.panels).filter(
    (p) => p.type === 'terminal' && p.maestro === true,
  )
  if (maestros.length === 0) return null
  if (maestros.length === 1) return maestros[0].id

  let keep = maestros[0].id
  if (focusedPanelId && maestros.some((p) => p.id === focusedPanelId)) {
    keep = focusedPanelId
  } else {
    keep = [...maestros].sort((a, b) => a.id.localeCompare(b.id))[0].id
  }

  for (const p of maestros) {
    if (p.id !== keep) {
      store.setPanelMaestro(workspaceId, p.id, false)
      clearMaestroArmed(p.id)
    }
  }
  return keep
}
