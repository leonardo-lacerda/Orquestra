import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useCanvasStoreContext } from '../stores/CanvasStoreContext'
import { useAppStore } from '../stores/appStore'
import type { CanvasConnectionType, CanvasNodeId, PanelType, Point } from '../../shared/types'
import { useTranslation } from '../i18n/useTranslation'

export interface PendingConnectionDrag {
  sourceNodeId: CanvasNodeId
  sourcePanelType?: PanelType
  pointer: Point
}

let _pendingConnection: PendingConnectionDrag | null = null
let _pendingConnectionListeners: Array<() => void> = []

export function startPendingConnection(sourceNodeId: CanvasNodeId, sourcePanelType?: PanelType): void {
  _pendingConnection = { sourceNodeId, sourcePanelType, pointer: { x: 0, y: 0 } }
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

function bezierPath(from: Point, to: Point): string {
  const dx = Math.abs(to.x - from.x)
  const cp = Math.max(dx * 0.5, 80)
  return `M ${from.x} ${from.y} C ${from.x + cp} ${from.y}, ${to.x - cp} ${to.y}, ${to.x} ${to.y}`
}

function connectionStyle(type: CanvasConnectionType): {
  markerId: string
  color: string
  dashArray: string
  animated: boolean
  glowOpacity: number
} {
  switch (type) {
    case 'orchestration':
      return { markerId: 'connection-arrow-orchestration', color: '#E8932A', dashArray: '6 4', animated: false, glowOpacity: 0.12 }
    case 'context':
      return { markerId: 'connection-arrow-context', color: '#30D5C8', dashArray: '3 6', animated: false, glowOpacity: 0.18 }
    case 'output':
      return { markerId: 'connection-arrow-output', color: '#42C96F', dashArray: '', animated: false, glowOpacity: 0.18 }
    case 'review':
      return { markerId: 'connection-arrow-review', color: '#E9C46A', dashArray: '5 4', animated: false, glowOpacity: 0.16 }
    default:
      return { markerId: 'connection-arrow', color: 'var(--focus-blue, #4A9EFF)', dashArray: '8 8', animated: true, glowOpacity: 0.15 }
  }
}

let dashKeyframesInjected = false
function ensureDashKeyframes(): void {
  if (dashKeyframesInjected || typeof document === 'undefined') return
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

const ConnectionLayer: React.FC = () => {
  const { t } = useTranslation()
  ensureDashKeyframes()

  const connections = useCanvasStoreContext((s) => s.connections)
  const nodes = useCanvasStoreContext((s) => s.nodes)
  const removeConnection = useCanvasStoreContext((s) => s.removeConnection)
  const setConnectionType = useCanvasStoreContext((s) => s.setConnectionType)
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId)
  const workspace = useAppStore((s) => s.workspaces.find((w) => w.id === s.selectedWorkspaceId))
  const pending = usePendingConnection()
  const [contextStatuses, setContextStatuses] = useState<Record<string, { status: 'ok' | 'warning' | 'error'; error?: string }>>({})

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        connectionIds?: string[]
        targetNodeId?: string
        status: 'ok' | 'warning' | 'error'
        error?: string
      }>).detail
      const ids = detail.connectionIds ?? Object.values(connections)
        .filter((connection) => connection.targetNodeId === detail.targetNodeId)
        .map((connection) => connection.id)
      setContextStatuses((current) => {
        const next = { ...current }
        for (const id of ids) next[id] = { status: detail.status, error: detail.error }
        return next
      })
    }
    window.addEventListener('linked-context:status', handler)
    return () => window.removeEventListener('linked-context:status', handler)
  }, [connections])

  const handleConnectionContextMenu = useCallback(
    async (e: React.MouseEvent, connectionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      if (!window.electronAPI) return
      const connection = connections[connectionId]
      const isContext = (connection?.type ?? 'pipe') === 'context'
      const isPipe = (connection?.type ?? 'pipe') === 'pipe'
      const isOutput = connection?.type === 'output'
      const id = await window.electronAPI.showContextMenu([
        ...(isContext
          ? [
              { id: 'refresh', label: t('connection.refreshContext') },
              { id: 'open-bundle', label: t('connection.openBundle') },
              { id: 'open-source', label: t('connection.openSource') },
              { type: 'separator' as const },
            ]
          : []),
        ...(isOutput ? [{ id: 'send-output', label: t('connection.sendOutput') }] : []),
        ...(isPipe ? [{ id: 'convert-context', label: t('connection.useAsContext') }] : []),
        { id: 'disconnect', label: t('connection.disconnect') },
      ])
      if ((id === 'refresh' || id === 'open-bundle') && connection) {
        window.dispatchEvent(new CustomEvent('linked-context:refresh', {
          detail: { targetNodeId: connection.targetNodeId, connectionId, action: id },
        }))
      }
      if (id === 'send-output' && connection) {
        window.dispatchEvent(new CustomEvent('linked-output:refresh', {
          detail: { connectionId },
        }))
      }
      if (id === 'convert-context' && connection) setConnectionType(connectionId, 'context')
      if (id === 'open-source' && connection && workspace) {
        const sourceNode = nodes[connection.sourceNodeId]
        const sourcePanel = sourceNode ? workspace.panels[sourceNode.panelId] : undefined
        if (sourcePanel?.filePath) {
          useAppStore.getState().createEditor(selectedWorkspaceId, sourcePanel.filePath)
        } else if (sourcePanel?.type === 'browser' && sourcePanel.url) {
          useAppStore.getState().createBrowser(selectedWorkspaceId, sourcePanel.url)
        }
      }
      if (id === 'disconnect') {
        removeConnection(connectionId)
      }
    },
    [connections, nodes, removeConnection, selectedWorkspaceId, setConnectionType, workspace],
  )

  const connectionEntries = useMemo(
    () => Object.values(connections),
    [connections],
  )

  const paths = connectionEntries.map((conn) => {
    const from = nodeOutputPoint(nodes, conn.sourceNodeId)
    const to = nodeInputPoint(nodes, conn.targetNodeId)
    if (!from || !to) return null
    return { id: conn.id, d: bezierPath(from, to), type: conn.type ?? 'pipe' }
  }).filter(Boolean)

  let pendingPath: string | null = null
  if (pending) {
    const from = nodeOutputPoint(nodes, pending.sourceNodeId)
    if (from) pendingPath = bezierPath(from, pending.pointer)
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
        <marker id="connection-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--focus-blue, #4A9EFF)" />
        </marker>
        <marker id="connection-arrow-orchestration" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#E8932A" />
        </marker>
        <marker id="connection-arrow-context" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#30D5C8" />
        </marker>
        <marker id="connection-arrow-output" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#42C96F" />
        </marker>
        <marker id="connection-arrow-review" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#E9C46A" />
        </marker>
        <marker id="connection-arrow-pending" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--focus-blue, #4A9EFF)" opacity="0.5" />
        </marker>
      </defs>

      {paths.map((p) => {
        const style = connectionStyle(p!.type)
        const contextStatus = contextStatuses[p!.id]
        const statusColor = contextStatus?.status === 'error'
          ? '#FF5F57'
          : contextStatus?.status === 'warning'
            ? '#E9C46A'
            : style.color
        return (
          <g key={p!.id} data-connection-id={p!.id} data-connection-type={p!.type}>
            {contextStatus?.error && <title>{contextStatus.error}</title>}
            <path
              d={p!.d}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onContextMenu={(e) => handleConnectionContextMenu(e, p!.id)}
            />
            <path
              d={p!.d}
              fill="none"
              stroke={statusColor}
              strokeWidth={4}
              opacity={style.glowOpacity}
              strokeLinecap="round"
            />
            <path
              d={p!.d}
              fill="none"
              stroke={statusColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={style.dashArray}
              markerEnd={`url(#${style.markerId})`}
              className={style.animated ? 'connection-line-active' : undefined}
            />
          </g>
        )
      })}

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
