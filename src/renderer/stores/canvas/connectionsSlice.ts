// =============================================================================
// Connections slice — terminal-to-terminal pipe connections for agent
// orchestration. Stores visual connections between canvas nodes and syncs
// the underlying PTY pipe to the main process.
// =============================================================================

import type { CanvasConnectionType, TerminalConnection, CanvasNodeId } from '../../../shared/types'
import type { CanvasGet, CanvasSet, CanvasStoreActions, CanvasStoreState } from './storeTypes'
import { generateId } from './helpers'
import { terminalRegistry } from '../../lib/terminal/terminalRegistry'

type ConnectionsActions = Pick<
  CanvasStoreActions,
  | 'addConnection'
  | 'removeConnection'
  | 'setConnectionType'
  | 'removeConnectionsForNode'
  | 'getConnections'
  | 'loadConnections'
>

export function createConnectionsSlice(set: CanvasSet, get: CanvasGet): ConnectionsActions {
  _get = get
  return {
    addConnection(sourceNodeId: CanvasNodeId, targetNodeId: CanvasNodeId, connectionType?: CanvasConnectionType) {
      const state = get()
      // Prevent self-connections
      if (sourceNodeId === targetNodeId) return null

      // Prevent duplicate connections
      const existing = Object.values(state.connections).find(
        (c) => c.sourceNodeId === sourceNodeId && c.targetNodeId === targetNodeId,
      )
      if (existing) return existing.id

      const id = generateId()
      const type = connectionType ?? 'pipe'
      const connection: TerminalConnection = {
        id,
        sourceNodeId,
        targetNodeId,
        autoExecute: true,
        type,
        metadata: {
          createdAt: Date.now(),
        },
      }

      set({ connections: { ...state.connections, [id]: connection } })

      // Only sync PTY pipes for actual pipe connections. Context and orchestration
      // arrows are visual/data links and must not write into another terminal.
      if (isPipeConnection(connection)) {
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

      if (isPipeConnection(conn)) syncPipeToMain(conn, false)
    },

    setConnectionType(id: string, type: CanvasConnectionType) {
      const state = get()
      const connection = state.connections[id]
      if (!connection || (connection.type ?? 'pipe') === type) return
      if (isPipeConnection(connection)) syncPipeToMain(connection, false)
      const updated = { ...connection, type }
      set({ connections: { ...state.connections, [id]: updated } })
      if (isPipeConnection(updated)) syncPipeToMain(updated, true)
    },

    removeConnectionsForNode(nodeId: CanvasNodeId) {
      const state = get()
      const updated: Record<string, TerminalConnection> = {}
      for (const [id, conn] of Object.entries(state.connections)) {
        if (conn.sourceNodeId === nodeId || conn.targetNodeId === nodeId) {
          if (isPipeConnection(conn)) syncPipeToMain(conn, false)
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
      const normalized = normalizeConnections(connections)
      set({ connections: normalized })
      // Re-sync all pipes to main process on workspace load
      for (const conn of Object.values(normalized)) {
        if (isPipeConnection(conn)) syncPipeToMain(conn, true)
      }
    },
  }
}

function isPipeConnection(conn: TerminalConnection): boolean {
  return (conn.type ?? 'pipe') === 'pipe'
}

function normalizeConnections(connections: Record<string, TerminalConnection>): Record<string, TerminalConnection> {
  const normalized: Record<string, TerminalConnection> = {}
  for (const [id, conn] of Object.entries(connections)) {
    normalized[id] = {
      ...conn,
      type: conn.type ?? 'pipe',
      autoExecute: conn.autoExecute ?? true,
    }
  }
  return normalized
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
  if (!_get) return
  const state = _get()

  const sourceNode = state.nodes[conn.sourceNodeId]
  const targetNode = state.nodes[conn.targetNodeId]
  if (!sourceNode || !targetNode) return

  const sourceEntry = terminalRegistry.getEntry(sourceNode.panelId)
  const targetEntry = terminalRegistry.getEntry(targetNode.panelId)
  const sourcePtyId = sourceEntry?.ptyId
  const targetPtyId = targetEntry?.ptyId

  if (!sourcePtyId || !targetPtyId) return

  try {
    if (create) {
      await window.electronAPI.terminalPipeCreate(sourcePtyId, targetPtyId)
    } else {
      await window.electronAPI.terminalPipeDestroy(sourcePtyId, targetPtyId)
    }
  } catch {
    // silent — pipe is best-effort during layout churn
  }
}
