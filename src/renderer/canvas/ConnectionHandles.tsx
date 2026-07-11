import React, { useCallback, useEffect, useState } from 'react'
import type { CanvasNodeId, PanelType } from '../../shared/types'
import {
  inferCanvasConnectionType,
} from '../../shared/canvasConnections'
import {
  startPendingConnection,
  updatePendingConnectionPointer,
  endPendingConnection,
  getPendingConnection,
  subscribePendingConnection,
} from './ConnectionLayer'
import { viewToCanvas } from '../lib/canvas/coordinates'
import { useCanvasStoreApi } from '../stores/CanvasStoreContext'

interface ConnectionHandlesProps {
  nodeId: CanvasNodeId
  panelType: PanelType
  canStartConnection: boolean
  canEndConnection: boolean
  nodeOrigin: { x: number; y: number }
  nodeSize: { width: number; height: number }
}

const HANDLE_RADIUS = 10
const HANDLE_COLOR = 'var(--focus-blue, #4A9EFF)'

let pulseInjected = false
function ensurePulse(): void {
  if (pulseInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = `
    @keyframes connectionTargetPulse {
      0%   { opacity: 0.4; transform: translateY(-50%) scale(1); }
      50%  { opacity: 1;   transform: translateY(-50%) scale(1.35); }
      100% { opacity: 0.4; transform: translateY(-50%) scale(1); }
    }
  `
  document.head.appendChild(style)
  pulseInjected = true
}

const ConnectionHandles: React.FC<ConnectionHandlesProps> = ({
  nodeId,
  panelType,
  canStartConnection,
  canEndConnection,
}) => {
  ensurePulse()
  const canvasApi = useCanvasStoreApi()
  const [hasPendingDrag, setHasPendingDrag] = useState(false)

  useEffect(() => {
    return subscribePendingConnection(() => {
      const pending = getPendingConnection()
      const connectionType = pending ? inferCanvasConnectionType(pending.sourcePanelType, panelType) : null
      setHasPendingDrag(!!pending && pending.sourceNodeId !== nodeId && !!connectionType)
    })
  }, [nodeId, panelType])

  const handleOutputMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      startPendingConnection(nodeId, panelType)

      const handleMouseMove = (ev: MouseEvent) => {
        const store = canvasApi.getState()
        const container = document.querySelector('[data-canvas-container]')
        if (!container) return
        const rect = container.getBoundingClientRect()
        const viewPoint = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
        const canvasPoint = viewToCanvas(viewPoint, store.zoomLevel, store.viewportOffset)
        updatePendingConnectionPointer(canvasPoint)
      }

      const handleMouseUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)

        const target = ev.target as HTMLElement
        const inputHandle = target.closest('[data-connection-input]')
        if (inputHandle) {
          const targetNodeId = inputHandle.getAttribute('data-connection-input')
          const targetPanelType = inputHandle.getAttribute('data-connection-input-type') as PanelType | null
          const connectionType = inferCanvasConnectionType(panelType, targetPanelType ?? undefined)
          if (targetNodeId && targetNodeId !== nodeId && connectionType) {
            canvasApi.getState().addConnection(nodeId, targetNodeId, connectionType)
          }
        }

        endPendingConnection()
        document.body.classList.remove('connecting-terminal')
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.classList.add('connecting-terminal')
    },
    [nodeId, panelType, canvasApi],
  )

  const handleInputClick = useCallback(
    (e: React.MouseEvent) => {
      const pending = getPendingConnection()
      const connectionType = pending ? inferCanvasConnectionType(pending.sourcePanelType, panelType) : null
      if (pending && pending.sourceNodeId !== nodeId && connectionType) {
        e.stopPropagation()
        canvasApi.getState().addConnection(pending.sourceNodeId, nodeId, connectionType)
        endPendingConnection()
      }
    },
    [nodeId, panelType, canvasApi],
  )

  if (!canStartConnection && !canEndConnection) return null

  const handleBase: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    width: HANDLE_RADIUS * 2,
    height: HANDLE_RADIUS * 2,
    borderRadius: '50%',
    cursor: 'crosshair',
    zIndex: 100000,
    pointerEvents: 'auto',
  }

  return (
    <>
      {canStartConnection && (
        <div
          data-connection-output={nodeId}
          data-connection-output-type={panelType}
          onMouseDown={handleOutputMouseDown}
          style={{
            ...handleBase,
            right: -HANDLE_RADIUS,
            transform: 'translateY(-50%)',
            background: HANDLE_COLOR,
            border: '2px solid var(--surface-0, #1e1e1e)',
            opacity: 0.85,
            transition: 'opacity 150ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85' }}
        />
      )}

      {canEndConnection && (
        <div
          data-connection-input={nodeId}
          data-connection-input-type={panelType}
          onClick={handleInputClick}
          style={{
            ...handleBase,
            left: -HANDLE_RADIUS,
            transform: 'translateY(-50%)',
            background: hasPendingDrag ? HANDLE_COLOR : 'var(--surface-3, #444)',
            border: `2px solid ${HANDLE_COLOR}`,
            opacity: hasPendingDrag ? 1 : 0.6,
            cursor: hasPendingDrag ? 'pointer' : 'crosshair',
            animation: hasPendingDrag ? 'connectionTargetPulse 1s ease-in-out infinite' : 'none',
          }}
          onMouseEnter={(e) => {
            if (!hasPendingDrag) e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            if (!hasPendingDrag) e.currentTarget.style.opacity = '0.6'
          }}
        />
      )}
    </>
  )
}

export default React.memo(ConnectionHandles)
