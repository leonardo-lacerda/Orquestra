// =============================================================================
// ConnectionLayer — SVG overlay that draws bezier curves between connected
// terminal nodes for agent orchestration. Renders inside the world div so
// it transforms with pan/zoom.
// =============================================================================

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useCanvasStoreContext, useCanvasStoreApi } from '../stores/CanvasStoreContext'
import { useAppStore } from '../stores/appStore'
import type { CanvasNodeId, Point } from '../../shared/types'

// ---------------------------------------------------------------------------
// Pending connection state — managed globally so the handle components and
// the SVG layer share the same drag session without prop-drilling through
// the world div.
// ---------------------------------------------------------------------------

export interface PendingConnectionDrag {
  sourceNodeId: CanvasNodeId
  /** Current mouse position in canvas-space (updated on mousemove). */
  pointer: Point
}

let _pendingConnection: PendingConnectionDrag | null = null
let _pendingConnectionListeners: Array<() => void> = []

export function startPendingConnection(sourceNodeId: CanvasNodeId): void {
  _pendingConnection = { sourceNodeId, pointer: { x: 0, y: 0 } }
  _pendingConnectionListeners.forEach((fn) => fn())
}

export function updatePendingConnectionPointer(pointer: Point): void {
  if (!_pendingConnection) return
  _pendingConnection.pointer = pointer
  _pendingConnectionListeners.forEach((fn) => fn())
}

export function getPendingConnection(): PendingConnectionDrag | null {
  return _pendingConnection
}

export function subscribePendingConnection(listener: () => void): () => void {
  _pendingConnectionListeners.push(listener)
  return () => {
    _pendingConnectionListeners = _pendingConnectionListeners.filter((l) => l !== listener)
  }
}

export function endPendingConnection(): void {
  _pendingConnection = null
  _pendingConnectionListeners.forEach((fn) => fn())
}

function usePendingConnection(): PendingConnectionDrag | null {
  const [pending, setPending] = useState<PendingConnectionDrag | null>(_pendingConnection)
  React.useEffect(() => {
    const listener = () => setPending(_pendingConnection ? { ..._pendingConnection } : null)
    _pendingConnectionListeners.push(listener)
    return () => {
      _pendingConnectionListeners = _pendingConnectionListeners.filter((l) => l !== listener)
    }
  }, [])
  return pending
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the center of the right edge of a node (output handle position). */
function nodeOutputPoint(
  nodes: Record<string, { origin: { x: number; y: number }; size: { width: number; height: number } }>,
  nodeId: string,
): Point | null {
  const node = nodes[nodeId]
  if (!node) return null
  return {
    x: node.origin.x + node.size.width,
    y: node.origin.y + node.size.height / 2,
  }
}

/** Get the center of the left edge of a node (input handle position). */
function nodeInputPoint(
  nodes: Record<string, { origin: { x: number; y: number }; size: { width: number; height: number } }>,
  nodeId: string,
): Point | null {
  const node = nodes[nodeId]
  if (!node) return null
  return {
    x: node.origin.x,
    y: node.origin.y + node.size.height / 2,
  }
}

/** Generate a smooth cubic bezier path between two points. */
function bezierPath(from: Point, to: Point): string {
  const dx = Math.abs(to.x - from.x)
  const cp = Math.max(dx * 0.5, 80) // control point offset
  return `M ${from.x} ${from.y} C ${from.x + cp} ${from.y}, ${to.x - cp} ${to.y}, ${to.x} ${to.y}`
}

// ---------------------------------------------------------------------------
// Animated dash keyframes (injected once)
// ---------------------------------------------------------------------------

let dashKeyframesInjected = false
function ensureDashKeyframes(): void {
  if (dashKeyframesInjected) return
  if (typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = `
    @keyframes connectionFlow {
      from { stroke-dashoffset: 16; }
      to { stroke-dashoffset: 0; }
    }
    .connection-line-active {
      animation: connectionFlow 0.6s linear infinite;
    }
  `
  document.head.appendChild(style)
  dashKeyframesInjected = true
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ConnectionLayer: React.FC = () => {
  ensureDashKeyframes()

  const connections = useCanvasStoreContext((s) => s.connections)
  const nodes = useCanvasStoreContext((s) => s.nodes)
  const removeConnection = useCanvasStoreContext((s) => s.removeConnection)
  const pending = usePendingConnection()
  const canvasApi = useCanvasStoreApi()

  // Right-click on a connection line → context menu to remove it
  const handleConnectionContextMenu = useCallback(
    async (e: React.MouseEvent, connectionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      if (!window.electronAPI) return
      const id = await window.electronAPI.showContextMenu([
        { id: 'disconnect', label: 'Disconnect' },
      ])
      if (id === 'disconnect') {
        removeConnection(connectionId)
      }
    },
    [removeConnection],
  )

  const connectionEntries = useMemo(
    () => Object.values(connections),
    [connections],
  )

  // Build SVG paths for established connections
  const paths = connectionEntries.map((conn) => {
    const from = nodeOutputPoint(nodes, conn.sourceNodeId)
    const to = nodeInputPoint(nodes, conn.targetNodeId)
    if (!from || !to) return null
    return { id: conn.id, d: bezierPath(from, to), type: conn.type ?? 'pipe' }
  }).filter(Boolean)

  // Build SVG path for the pending (in-progress) drag
  let pendingPath: string | null = null
  if (pending) {
    const from = nodeOutputPoint(nodes, pending.sourceNodeId)
    if (from) {
      pendingPath = bezierPath(from, pending.pointer)
    }
  }

  if (paths.length === 0 && !pendingPath) return null

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 50000,
      }}
    >
      <defs>
        {/* Arrowhead marker — blue for PTY pipe connections */}
        <marker
          id="connection-arrow"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--focus-blue, #4A9EFF)" />
        </marker>
        {/* Arrowhead marker — orange for orchestration connections */}
        <marker
          id="connection-arrow-orchestration"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#E8932A" />
        </marker>
        <marker
          id="connection-arrow-pending"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--focus-blue, #4A9EFF)" opacity="0.5" />
        </marker>
      </defs>

      {/* Established connections — PTY pipe (blue) */}
      {paths.filter(p => p!.type !== 'orchestration').map((p) => (
        <g key={p!.id}>
          {/* Hit area (wider invisible stroke for easier clicking) */}
          <path
            d={p!.d}
            fill="none"
            stroke="transparent"
            strokeWidth={12}
            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
            onContextMenu={(e) => handleConnectionContextMenu(e, p!.id)}
          />
          {/* Glow */}
          <path
            d={p!.d}
            fill="none"
            stroke="var(--focus-blue, #4A9EFF)"
            strokeWidth={4}
            opacity={0.15}
            strokeLinecap="round"
          />
          {/* Main line — animated dash */}
          <path
            d={p!.d}
            fill="none"
            stroke="var(--focus-blue, #4A9EFF)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="8 8"
            markerEnd="url(#connection-arrow)"
            className="connection-line-active"
          />
        </g>
      ))}

      {/* Established connections — orchestration (orange, dashed) */}
      {paths.filter(p => p!.type === 'orchestration').map((p) => (
        <g key={p!.id}>
          {/* Hit area */}
          <path
            d={p!.d}
            fill="none"
            stroke="transparent"
            strokeWidth={12}
            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
            onContextMenu={(e) => handleConnectionContextMenu(e, p!.id)}
          />
          {/* Glow */}
          <path
            d={p!.d}
            fill="none"
            stroke="#E8932A"
            strokeWidth={4}
            opacity={0.12}
            strokeLinecap="round"
          />
          {/* Main line — dashed, no animation */}
          <path
            d={p!.d}
            fill="none"
            stroke="#E8932A"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="6 4"
            markerEnd="url(#connection-arrow-orchestration)"
          />
        </g>
      ))}

      {/* Pending (in-progress drag) */}
      {pendingPath && (
        <path
          d={pendingPath}
          fill="none"
          stroke="var(--focus-blue, #4A9EFF)"
          strokeWidth={2}
          strokeDasharray="6 6"
          strokeLinecap="round"
          opacity={0.6}
          markerEnd="url(#connection-arrow-pending)"
          className="connection-line-active"
        />
      )}
    </svg>
  )
}

export default React.memo(ConnectionLayer)
