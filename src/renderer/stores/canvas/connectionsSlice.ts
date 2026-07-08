// =============================================================================
// Connections slice — terminal-to-terminal pipe connections for agent
// orchestration. Stores visual connections between canvas nodes and syncs
// the underlying PTY pipe to the main process.
// =============================================================================

import type { TerminalConnection, CanvasNodeId } from '../../../shared/types'
import type { CanvasGet, CanvasSet, CanvasStoreActions, CanvasStoreState } from './storeTypes'
import { generateId } from './helpers'
import { terminalRegistry } from '../../lib/terminal/terminalRegistry'

type ConnectionsActions = Pick<
  CanvasStoreActions,
  | 'addConnection'
  | 'removeConnection'
  | 'removeConnectionsForNode'
  | 'getConnections'
  | 'loadConnections'
>

export function createConnectionsSlice(set: CanvasSet, get: CanvasGet): ConnectionsActions {
  _get = get
  return {
    addConnection(sourceNodeId: CanvasNodeId, targetNodeId: CanvasNodeId, connectionType?: 'pipe' | 'orchestration') {
      const state = get()
      // Prevent self-connections
      if (sourceNodeId === targetNodeId) return null

      // Prevent duplicate connections
      const existing = Object.values(state.connections).find(
        (c) => c.sourceNodeId === sourceNodeId && c.targetNodeId === targetNodeId,
      )
      if (existing) return existing.id

      const id = generateId()
      const connection: TerminalConnection = {
        id,
        sourceNodeId,
        targetNodeId,
        autoExecute: true,
        type: connectionType ?? 'pipe',
      }

      set({ connections: { ...state.connections, [id]: connection } })

      // Only sync PTY pipe for actual pipe connections, not visual-only orchestration arrows
      if (connectionType !== 'orchestration') {
        syncPipeToMain(connection, true)
      }

      return id
    },

    removeConnection(id: string) {
      const state = get()
      const conn = state.connections[id]
      if (!conn) return

      const { [id]: _removed, ...rest } = state.connections
      set({ connections: rest })

      syncPipeToMain(conn, false)
    },

    removeConnectionsForNode(nodeId: CanvasNodeId) {
      const state = get()
      const updated: Record<string, TerminalConnection> = {}
      for (const [id, conn] of Object.entries(state.connections)) {
        if (conn.sourceNodeId === nodeId || conn.targetNodeId === nodeId) {
          syncPipeToMain(conn, false)
        } else {
          updated[id] = conn
        }
      }
      set({ connections: updated })
    },

    getConnections(nodeId: CanvasNodeId) {
      const state = get()
      return Object.values(state.connections).filter(
        (c) => c.sourceNodeId === nodeId || c.targetNodeId === nodeId,
      )
    },

    loadConnections(connections: Record<string, TerminalConnection>) {
      set({ connections })
      // Re-sync all pipes to main process on workspace load
      for (const conn of Object.values(connections)) {
        syncPipeToMain(conn, true)
      }
    },
  }
}

// ---------------------------------------------------------------------------
// PTY pipe sync — resolve node → panel → ptyId and call main process
// ---------------------------------------------------------------------------

function resolvePtyId(nodeId: string): string | null {
  if (!_get) return null
  const state = _get()
  const node = state.nodes[nodeId]
  if (!node) return null

  // The node's panelId points to the primary panel. For a terminal panel,
  // look up the ptyId from the terminal registry.
  const entry = terminalRegistry.getEntry(node.panelId)
  return entry?.ptyId || null
}

// We need a reference to get() for resolvePtyId. Store it at slice creation.
let _get: CanvasGet
export function createConnectionsSliceWithGet(set: CanvasSet, get: CanvasGet): ConnectionsActions {
  _get = get
  return createConnectionsSlice(set, get)
}

async function syncPipeToMain(conn: TerminalConnection, create: boolean): Promise<void> {
  if (!_get) { console.warn('[connections] no _get'); return }
  const state = _get()

  const sourceNode = state.nodes[conn.sourceNodeId]
  const targetNode = state.nodes[conn.targetNodeId]
  if (!sourceNode || !targetNode) {
    console.warn('[connections] node not found', { src: conn.sourceNodeId, tgt: conn.targetNodeId })
    return
  }

  const sourceEntry = terminalRegistry.getEntry(sourceNode.panelId)
  const targetEntry = terminalRegistry.getEntry(targetNode.panelId)
  const sourcePtyId = sourceEntry?.ptyId
  const targetPtyId = targetEntry?.ptyId

  console.log('[connections] syncPipe:', {
    create,
    srcPanel: sourceNode.panelId,
    tgtPanel: targetNode.panelId,
    srcPty: sourcePtyId ?? '(null)',
    tgtPty: targetPtyId ?? '(null)',
  })

  if (!sourcePtyId || !targetPtyId) {
    console.warn('[connections] SKIP - ptyId missing')
    return
  }

  try {
    if (create) {
      await window.electronAPI.terminalPipeCreate(sourcePtyId, targetPtyId)
      console.log('[connections] pipe CREATED:', sourcePtyId, '->', targetPtyId)
    } else {
      await window.electronAPI.terminalPipeDestroy(sourcePtyId, targetPtyId)
      console.log('[connections] pipe DESTROYED:', sourcePtyId, '->', targetPtyId)
    }
  } catch (err) {
    console.warn('[connections] pipe FAILED:', err)
  }
}
