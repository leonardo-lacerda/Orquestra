// =============================================================================
// ConnectionHandles — circles on the edges of terminal/agent nodes
// that allow the user to drag-to-connect terminals for agent orchestration.
//
// Right edge = output (source), Left edge = input (target).
// Dragging from output to another node's input creates a connection.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react'
import type { CanvasNodeId } from '../../shared/types'
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
  isConnectable: boolean
  nodeOrigin: { x: number; y: number }
  nodeSize: { width: number; height: number }
}

const HANDLE_RADIUS = 10
const HANDLE_COLOR = 'var(--focus-blue, #4A9EFF)'

// Pulse keyframes (injected once)
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
  isConnectable,
}) => {
  ensurePulse()
  const canvasApi = useCanvasStoreApi()
  const [hasPendingDrag, setHasPendingDrag] = useState(false)

  // Subscribe to pending connection state so input handles pulse during drag
  useEffect(() => {
    return subscribePendingConnection(() => {
      const p = getPendingConnection()
      setHasPendingDrag(!!p && p.sourceNodeId !== nodeId)
    })
  }, [nodeId])

  // Output handle (right edge) — drag start
  const handleOutputMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      startPendingConnection(nodeId)

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
          if (targetNodeId && targetNodeId !== nodeId) {
            canvasApi.getState().addConnection(nodeId, targetNodeId)
          }
        }

        endPendingConnection()
        document.body.classList.remove('connecting-terminal')
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.classList.add('connecting-terminal')
    },
    [nodeId, canvasApi],
  )

  // Input handle click — complete a pending connection (from context menu flow)
  const handleInputClick = useCallback(
    (e: React.MouseEvent) => {
      const pending = getPendingConnection()
      if (pending && pending.sourceNodeId !== nodeId) {
        e.stopPropagation()
        canvasApi.getState().addConnection(pending.sourceNodeId, nodeId)
        endPendingConnection()
      }
    },
    [nodeId, canvasApi],
  )

  if (!isConnectable) return null

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
      {/* Output handle — right edge */}
      <div
        data-connection-output={nodeId}
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

      {/* Input handle — left edge. Pulses when a drag is in progress from another node. */}
      <div
        data-connection-input={nodeId}
        onClick={handleInputClick}
        style={{
          ...handleBase,
          left: -HANDLE_RADIUS,
          transform: 'translateY(-50%)',
          background: hasPendingDrag ? HANDLE_COLOR : 'var(--surface-3, #444)',
          border: `2px solid ${HANDLE_COLOR}`,
          opacity: hasPendingDrag ? 1 : 0.6,
          cursor: hasPendingDrag ? 'pointer' : 'crosshair',
          animation: hasPendingDrag
            ? 'connectionTargetPulse 1s ease-in-out infinite'
            : 'none',
        }}
        onMouseEnter={(e) => {
          if (!hasPendingDrag) e.currentTarget.style.opacity = '1'
        }}
        onMouseLeave={(e) => {
          if (!hasPendingDrag) e.currentTarget.style.opacity = '0.6'
        }}
      />
    </>
  )
}

export default React.memo(ConnectionHandles)
