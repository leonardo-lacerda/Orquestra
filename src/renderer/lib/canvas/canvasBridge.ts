// =============================================================================
// Canvas Bridge — implements CanvasOperations by delegating to a canvas store.
// Connects the appStore (which manages panel lifecycle) to the canvas store
// (which manages visual layout) without a direct import dependency.
// =============================================================================

import type { StoreApi } from 'zustand'
import type { CanvasStore } from '../../stores/canvasStore'
import type { PanelType, Point, Size, CanvasNodeId, CanvasNodeState } from '../../../shared/types'
import { findNodeDockStore } from '../../panels/nodeDockRegistry'
import { collectPanelIds, removePanelFromDockLayout } from '../../../shared/collectPanelIds'

// -----------------------------------------------------------------------------
// Canvas operations callback — the contract createCanvasOps implements, letting
// the appStore (panel lifecycle) drive a canvas store (visual layout) without a
// direct import dependency on canvasStore.
// -----------------------------------------------------------------------------

export interface CanvasOperations {
  addNodeAndFocus: (panelId: string, panelType: PanelType, position?: Point, size?: Size) => void
  /** Begin interactive ghost placement. Returns true if ghosts are shown (the
   *  caller must NOT also place the node). `onCancelled` rolls the panel back. */
  beginPlacement: (
    panelId: string,
    panelType: PanelType,
    onCancelled: (panelId: string) => void,
    size?: Size,
  ) => boolean
  removeNodeForPanel: (panelId: string) => void
  loadWorkspaceCanvas: (
    nodes: Record<CanvasNodeId, CanvasNodeState>,
    viewportOffset: Point,
    zoomLevel: number,
    connections?: Record<string, import('../../../shared/types').TerminalConnection>,
    drawings?: import('../../../shared/types').DrawingElement[],
  ) => void
  clearAllNodes: () => void
  focusPanelNode: (panelId: string) => void
  /** Access the underlying store API (needed by session restore) */
  storeApi: StoreApi<CanvasStore>
}

export function createCanvasOps(storeApi: StoreApi<CanvasStore>): CanvasOperations {
  return {
    storeApi,

    addNodeAndFocus(panelId: string, panelType: PanelType, position?: Point, size?: Size) {
      const nodeId = storeApi.getState().addNode(panelId, panelType, position, size)
      storeApi.getState().focusAndCenter(nodeId)
    },

    beginPlacement(
      panelId: string,
      panelType: PanelType,
      onCancelled: (panelId: string) => void,
      size?: Size,
    ) {
      return storeApi.getState().beginPlacement(panelId, panelType, onCancelled, size)
    },

    removeNodeForPanel(panelId: string) {
      const state = storeApi.getState()
      // Prefer seed match; also find multi-tab nodes where panelId is only in dockLayout.
      let nodeId = state.nodeForPanel(panelId)
      if (!nodeId) {
        for (const n of Object.values(state.nodes)) {
          if (n.animationState === 'exiting') continue
          const layout = findNodeDockStore(n.id)?.getState().zones.center.layout ?? n.dockLayout
          if (layout && collectPanelIds(layout).includes(panelId)) {
            nodeId = n.id
            break
          }
        }
      }
      if (!nodeId) return
      const node = state.nodes[nodeId]
      if (!node || node.animationState === 'exiting') return

      // Headless close (Maestro dismiss, close-on-success, petTools, shortcuts)
      // calls closePanel WITHOUT first undocking the mini-dock tab. The old path
      // early-returned whenever layout still listed the panel, leaving a ghost
      // canvas shell titled "Panel" with orphan orchestration arrows. Always
      // strip the panel from live + projected layout, then drop the node if empty.
      const liveStore = findNodeDockStore(nodeId)
      if (liveStore) {
        try {
          liveStore.getState().undockPanel(panelId)
        } catch {
          /* ignore */
        }
      }

      const layoutAfter = liveStore
        ? liveStore.getState().zones.center.layout
        : removePanelFromDockLayout(node.dockLayout, panelId)

      const remaining = collectPanelIds(layoutAfter)
      if (remaining.length === 0) {
        // removeNode also drops connections (arrows into the husk).
        state.setNodeDockLayout(nodeId, null)
        state.removeNode(nodeId)
        return
      }

      // Multi-tab node: keep the shell, project the stripped layout. If the seed
      // panelId was the one closed, re-point it so orphan-sweep / titles resolve.
      state.setNodeDockLayout(nodeId, layoutAfter)
      if (node.panelId === panelId) {
        storeApi.setState((s) => {
          const cur = s.nodes[nodeId]
          if (!cur || cur.panelId !== panelId) return s
          return {
            nodes: {
              ...s.nodes,
              [nodeId]: { ...cur, panelId: remaining[0], dockLayout: layoutAfter },
            },
          }
        })
      }
    },

    loadWorkspaceCanvas(
      nodes: Record<CanvasNodeId, CanvasNodeState>,
      viewportOffset: Point,
      zoomLevel: number,
      connections?: Record<string, import('../../../shared/types').TerminalConnection>,
      drawings?: import('../../../shared/types').DrawingElement[],
    ) {
      storeApi.getState().loadWorkspaceCanvas(nodes, viewportOffset, zoomLevel, connections, drawings)
    },

    clearAllNodes() {
      const s = storeApi.getState()
      for (const nodeId of Object.keys(s.nodes)) {
        s.removeNode(nodeId)
      }
    },

    focusPanelNode(panelId: string) {
      const state = storeApi.getState()
      const nodeId = state.nodeForPanel(panelId)
      if (nodeId) {
        state.focusAndCenter(nodeId)
      }
    },
  }
}
