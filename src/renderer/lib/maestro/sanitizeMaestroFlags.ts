// =============================================================================
// sanitizeMaestroFlags — multi-Maestro aware crown flag hygiene.
// =============================================================================

import { useAppStore } from '../../stores/appStore'
import { clearMaestroArmed } from './ensureMaestroArmed'

function multiMaestroEnabled(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSettingsStore } = require('../../stores/settingsStore') as typeof import('../../stores/settingsStore')
    return useSettingsStore.getState().orchestrationMultiMaestro !== false
  } catch {
    return true
  }
}

/**
 * On hydrate:
 * - Multi-Maestro ON: keep all maestro flags (N crowns OK). Only clear non-terminal flags.
 * - Multi-Maestro OFF: keep at most one (focused or stable panelId sort).
 * @returns kept panelId (single mode) or first maestro id (multi) or null
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

  if (multiMaestroEnabled()) {
    // Allow multiple crowns — no forced collapse to one.
    return maestros[0].id
  }

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
