// =============================================================================
// DrawingLayer — SVG overlay for whiteboard-style annotations on the canvas.
// Fixes: per-element arrowheads, capture-phase context menu, text tool,
// select/move/resize, delete key.
// =============================================================================

import React, { useCallback, useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStoreContext, useCanvasStoreApi } from '../stores/CanvasStoreContext'
import { useUIStore } from '../stores/uiStore'
import { viewToCanvas } from '../lib/canvas/coordinates'
import type { DrawingElement, DrawingTool, DrawingRect, DrawingArrow, DrawingLine, DrawingText } from '../../shared/types'
import { generateId } from '../stores/canvas/helpers'

// ---------------------------------------------------------------------------
// Drawing style
// ---------------------------------------------------------------------------

interface DrawingStyle {
  strokeColor: string
  strokeWidth: number
  fillColor: string
  fontSize: number
}

const PRESET_COLORS = [
  '#ffffff', '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c',
  '#4dabf7', '#9775fa', '#f06595', '#868e96', '#000000',
]

const DEFAULT_STYLE: DrawingStyle = {
  strokeColor: '#ffffff',
  strokeWidth: 2,
  fillColor: 'transparent',
  fontSize: 16,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getElBBox(el: DrawingElement): { x: number; y: number; w: number; h: number } {
  if (el.type === 'rect') return { x: el.x, y: el.y, w: el.width, h: el.height }
  if (el.type === 'text') return { x: el.x, y: el.y - el.fontSize, w: el.text.length * el.fontSize * 0.6, h: el.fontSize * 1.4 }
  if (el.type === 'arrow' || el.type === 'line') {
    const x = Math.min(el.x1, el.x2)
    const y = Math.min(el.y1, el.y2)
    return { x, y, w: Math.abs(el.x2 - el.x1) || 4, h: Math.abs(el.y2 - el.y1) || 4 }
  }
  return { x: 0, y: 0, w: 0, h: 0 }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DrawingLayer: React.FC = () => {
  const drawings = useCanvasStoreContext((s) => s.drawings)
  const selectedDrawingId = useCanvasStoreContext((s) => s.selectedDrawingId)
  const addDrawing = useCanvasStoreContext((s) => s.addDrawing)
  const removeDrawing = useCanvasStoreContext((s) => s.removeDrawing)
  const updateDrawing = useCanvasStoreContext((s) => s.updateDrawing)
  const selectDrawing = useCanvasStoreContext((s) => s.selectDrawing)
  const canvasApi = useCanvasStoreApi()

  const [ghost, setGhost] = useState<DrawingElement | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; tool: DrawingTool; style: DrawingStyle } | null>(null)
  const [textInput, setTextInput] = useState<{ clientX: number; clientY: number; canvasX: number; canvasY: number } | null>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const [style, setStyle] = useState<DrawingStyle>(DEFAULT_STYLE)
  const svgRef = useRef<SVGSVGElement>(null)
  const activeTool = useUIStore((s) => s.activeTool)
  const activeDrawingTool = useUIStore((s) => s.activeDrawingTool)

  const getCanvasPoint = useCallback((e: MouseEvent): { x: number; y: number } | null => {
    const container = document.querySelector('[data-canvas-container]')
    if (!container) return null
    const rect = container.getBoundingClientRect()
    const store = canvasApi.getState()
    return viewToCanvas(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      store.zoomLevel,
      store.viewportOffset,
    )
  }, [canvasApi])

  // ---- Task 1+3+5: Mousedown on canvas container (draw mode: create, select mode: move) ----
  useEffect(() => {
    const container = document.querySelector('[data-canvas-container]')
    if (!container) return

    const handleMouseDown = (e: MouseEvent) => {
      const currentActiveTool = useUIStore.getState().activeTool

      // ---- Draw mode: create shapes ----
      if (currentActiveTool === 'draw') {
        if (e.button !== 0) return
        e.stopPropagation()
        e.preventDefault()

        const drawTool = useUIStore.getState().activeDrawingTool
        const point = getCanvasPoint(e)
        if (!point) return

        // Text tool
        if (drawTool === 'text') {
          setTextInput({ clientX: e.clientX, clientY: e.clientY, canvasX: point.x, canvasY: point.y })
          return
        }

        const currentStyle = { ...style }
        dragRef.current = { startX: point.x, startY: point.y, tool: drawTool, style: currentStyle }

        const handleMouseMove = (ev: MouseEvent) => {
          if (!dragRef.current) return
          const end = getCanvasPoint(ev)
          if (!end) return
          const { startX, startY, tool, style: s } = dragRef.current
          const id = '__ghost__'

          if (tool === 'rect') {
            setGhost({
              type: 'rect', id,
              x: Math.min(startX, end.x), y: Math.min(startY, end.y),
              width: Math.abs(end.x - startX), height: Math.abs(end.y - startY),
              strokeColor: s.strokeColor, strokeWidth: s.strokeWidth, fill: s.fillColor,
            })
          } else if (tool === 'arrow' || tool === 'line') {
            setGhost({
              type: tool, id,
              x1: startX, y1: startY, x2: end.x, y2: end.y,
              strokeColor: s.strokeColor, strokeWidth: s.strokeWidth,
            })
          }
        }

        const handleMouseUp = () => {
          document.removeEventListener('mousemove', handleMouseMove)
          document.removeEventListener('mouseup', handleMouseUp)
          setGhost((current) => {
            if (current) addDrawing({ ...current, id: generateId() })
            return null
          })
          dragRef.current = null
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        return
      }

      // ---- Select mode: click to select/deselect drawings ----
      if (currentActiveTool === 'select' && e.button === 0) {
        // Check if click is on a drawing element (handled by SVG click handlers)
        // If not on a drawing, deselect
        const target = e.target as Element
        if (!target.closest('[data-drawing-id]')) {
          selectDrawing(null)
        }
      }
    }

    container.addEventListener('mousedown', handleMouseDown as EventListener)
    return () => container.removeEventListener('mousedown', handleMouseDown as EventListener)
  }, [getCanvasPoint, canvasApi, addDrawing, selectDrawing, style])

  // ---- Task 2: Context menu for drawings (state-based, same pattern as Canvas.tsx) ----
  const [drawingContextMenuId, setDrawingContextMenuId] = useState<string | null>(null)

  // Capture-phase handler — just sets state
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: Event) => {
      const target = e.target as SVGElement
      const drawingId = target.getAttribute('data-drawing-id')
      if (!drawingId) return
      e.preventDefault()
      e.stopPropagation()
      setDrawingContextMenuId(drawingId)
    }
    svg.addEventListener('contextmenu', handler, true)
    return () => svg.removeEventListener('contextmenu', handler, true)
  }, [])

  // useEffect shows the native menu (runs AFTER event cycle)
  useEffect(() => {
    if (!drawingContextMenuId || !window.electronAPI) return
    let cancelled = false
    const id = drawingContextMenuId

    const show = async () => {
      const result = await window.electronAPI.showContextMenu([
        { id: 'delete', label: '🗑️ Delete' },
      ])
      if (cancelled) return
      if (result === 'delete') removeDrawing(id)
      setDrawingContextMenuId(null)
    }
    show()

    return () => { cancelled = true }
  }, [drawingContextMenuId, removeDrawing])

  // ---- Task 3: Text input focus ----
  useEffect(() => {
    if (textInput) textInputRef.current?.focus()
  }, [textInput])

  // ---- Task 7: Delete key ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const store = canvasApi.getState()
        if (store.selectedDrawingId) {
          store.removeDrawing(store.selectedDrawingId)
        }
      }
      if (e.key === 'Escape') {
        canvasApi.getState().selectDrawing(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [canvasApi])

  // ---- Task 8: Clear selection on tool switch ----
  useEffect(() => {
    if (activeTool !== 'select') selectDrawing(null)
  }, [activeTool, selectDrawing])

  // ---- Task 4+5: Click/drag handlers for drawings ----
  const handleDrawingMouseDown = useCallback((e: React.MouseEvent, el: DrawingElement) => {
    if (activeTool !== 'select') return
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    selectDrawing(el.id)

    const startX = e.clientX
    const startY = e.clientY
    const origX = el.type === 'rect' || el.type === 'text' ? el.x : (el as DrawingArrow | DrawingLine).x1
    const origY = el.type === 'rect' || el.type === 'text' ? el.y : (el as DrawingArrow | DrawingLine).y1
    const origX2 = (el.type === 'arrow' || el.type === 'line') ? (el as DrawingArrow | DrawingLine).x2 : 0
    const origY2 = (el.type === 'arrow' || el.type === 'line') ? (el as DrawingArrow | DrawingLine).y2 : 0
    let moved = false

    const onMove = (ev: MouseEvent) => {
      const store = canvasApi.getState()
      const dx = (ev.clientX - startX) / store.zoomLevel
      const dy = (ev.clientY - startY) / store.zoomLevel
      if (!moved && Math.hypot(dx, dy) < 3) return
      moved = true

      if (el.type === 'rect') {
        store.updateDrawing(el.id, { x: origX + dx, y: origY + dy })
      } else if (el.type === 'text') {
        store.updateDrawing(el.id, { x: origX + dx, y: origY + dy })
      } else if (el.type === 'arrow' || el.type === 'line') {
        store.updateDrawing(el.id, {
          x1: origX + dx, y1: origY + dy,
          x2: origX2 + dx, y2: origY2 + dy,
        })
      }
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [activeTool, canvasApi, selectDrawing])

  // ---- Task 6: Resize handles for rectangles ----
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, el: DrawingRect, corner: string) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const orig = { x: el.x, y: el.y, w: el.width, h: el.height }

    const onMove = (ev: MouseEvent) => {
      const store = canvasApi.getState()
      const dx = (ev.clientX - startX) / store.zoomLevel
      const dy = (ev.clientY - startY) / store.zoomLevel

      let newX = orig.x, newY = orig.y, newW = orig.w, newH = orig.h
      if (corner === 'se') { newW = Math.max(20, orig.w + dx); newH = Math.max(20, orig.h + dy) }
      if (corner === 'sw') { newX = orig.x + dx; newW = Math.max(20, orig.w - dx); newH = Math.max(20, orig.h + dy) }
      if (corner === 'ne') { newY = orig.y + dy; newW = Math.max(20, orig.w + dx); newH = Math.max(20, orig.h - dy) }
      if (corner === 'nw') { newX = orig.x + dx; newY = orig.y + dy; newW = Math.max(20, orig.w - dx); newH = Math.max(20, orig.h - dy) }

      store.updateDrawing(el.id, { x: newX, y: newY, width: newW, height: newH })
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [canvasApi])

  const handleTextSubmit = useCallback(() => {
    const input = textInputRef.current
    if (!input || !textInput) return
    const text = input.value.trim()
    if (text) {
      addDrawing({
        type: 'text', id: generateId(),
        x: textInput.canvasX, y: textInput.canvasY,
        text, fontSize: style.fontSize, color: style.strokeColor,
      })
    }
    setTextInput(null)
  }, [textInput, addDrawing, style])

  const allElements = [...drawings, ...(ghost ? [ghost] : [])]

  // ---- Render ----
  return (
    <>
      <svg
        ref={svgRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%', overflow: 'visible',
          pointerEvents: activeTool === 'draw' ? 'none' : 'auto',
          zIndex: 45000,
          transition: 'none',
        }}
      >
        {/* Task 1: Per-element arrowhead markers */}
        <defs>
          {allElements.filter((el): el is DrawingArrow => el.type === 'arrow').map((el) => (
            <marker
              key={`ah-${el.id}`}
              id={`ah-${el.id}`}
              viewBox="0 0 10 10" refX="10" refY="5"
              markerWidth="8" markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={el.strokeColor} />
            </marker>
          ))}
        </defs>

        {/* Drawings */}
        {allElements.map((el) => {
          const isGhost = el.id === '__ghost__'
          const isSelected = el.id === selectedDrawingId
          const opacity = isGhost ? 0.6 : 1

          const sharedProps = {
            'data-drawing-id': isGhost ? undefined : el.id,
            opacity,
            style: { cursor: activeTool === 'select' ? 'grab' : 'crosshair', pointerEvents: (isGhost ? 'none' : 'auto') as React.CSSProperties['pointerEvents'] },
            onMouseDown: (e: React.MouseEvent) => !isGhost && handleDrawingMouseDown(e, el),
          }

          if (el.type === 'rect') {
            return (
              <React.Fragment key={el.id}>
                <rect
                  x={el.x} y={el.y} width={el.width} height={el.height}
                  fill={el.fill} stroke={el.strokeColor} strokeWidth={el.strokeWidth}
                  rx={4} {...sharedProps}
                />
                {/* Task 4: Selection outline */}
                {isSelected && (
                  <rect
                    x={el.x - 2} y={el.y - 2} width={el.width + 4} height={el.height + 4}
                    fill="none" stroke="var(--focus-blue)" strokeWidth={1.5}
                    strokeDasharray="6 3" rx={4}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                {/* Task 6: Resize handles */}
                {isSelected && activeTool === 'select' && (
                  <>
                    {([['nw', el.x, el.y], ['ne', el.x + el.width, el.y],
                      ['sw', el.x, el.y + el.height], ['se', el.x + el.width, el.y + el.height]] as const
                    ).map(([corner, cx, cy]) => (
                      <rect
                        key={corner}
                        x={cx - 5} y={cy - 5} width={10} height={10}
                        fill="var(--focus-blue)" stroke="var(--surface-0)" strokeWidth={1}
                        rx={2}
                        style={{ cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize', pointerEvents: 'auto' }}
                        onMouseDown={(e) => handleResizeMouseDown(e, el, corner)}
                      />
                    ))}
                  </>
                )}
              </React.Fragment>
            )
          }

          if (el.type === 'arrow') {
            return (
              <React.Fragment key={el.id}>
                <line
                  x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                  stroke={el.strokeColor} strokeWidth={el.strokeWidth}
                  markerEnd={`url(#ah-${el.id})`} {...sharedProps}
                />
                {isSelected && (
                  <line
                    x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    stroke="var(--focus-blue)" strokeWidth={el.strokeWidth + 4}
                    opacity={0.3} style={{ pointerEvents: 'none' }}
                  />
                )}
              </React.Fragment>
            )
          }

          if (el.type === 'line') {
            return (
              <React.Fragment key={el.id}>
                <line
                  x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                  stroke={el.strokeColor} strokeWidth={el.strokeWidth} {...sharedProps}
                />
                {isSelected && (
                  <line
                    x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    stroke="var(--focus-blue)" strokeWidth={el.strokeWidth + 4}
                    opacity={0.3} style={{ pointerEvents: 'none' }}
                  />
                )}
              </React.Fragment>
            )
          }

          if (el.type === 'text') {
            return (
              <React.Fragment key={el.id}>
                <text
                  x={el.x} y={el.y}
                  fill={el.color} fontSize={el.fontSize}
                  fontFamily="system-ui, -apple-system, sans-serif" fontWeight="600"
                  {...sharedProps}
                >
                  {el.text}
                </text>
                {isSelected && (() => {
                  const bbox = getElBBox(el)
                  return (
                    <rect
                      x={bbox.x - 4} y={bbox.y - 2} width={bbox.w + 8} height={bbox.h + 4}
                      fill="none" stroke="var(--focus-blue)" strokeWidth={1.5}
                      strokeDasharray="6 3" rx={3}
                      style={{ pointerEvents: 'none' }}
                    />
                  )
                })()}
              </React.Fragment>
            )
          }

          return null
        })}
      </svg>

      {/* Task 3: Text input — portaled to body */}
      {textInput && createPortal(
        <div style={{ position: 'fixed', left: textInput.clientX, top: textInput.clientY - 16, zIndex: 2147483000 }}>
          <input
            ref={textInputRef}
            type="text"
            placeholder="Type..."
            autoFocus
            style={{
              background: 'var(--surface-2)', color: 'var(--text-primary)',
              border: '2px solid var(--focus-blue)', borderRadius: 6,
              padding: '6px 10px', fontSize: style.fontSize,
              fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 600,
              outline: 'none', minWidth: 150,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTextSubmit()
              if (e.key === 'Escape') setTextInput(null)
            }}
            onBlur={handleTextSubmit}
          />
        </div>,
        document.body,
      )}

      {/* Style picker — visible in draw mode */}
      {activeTool === 'draw' && createPortal(
        <div style={{
          position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)',
          zIndex: 2147483000,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 12,
          background: 'var(--surface-0)', border: '1px solid var(--border-subtle)',
          boxShadow: '0 8px 24px -6px var(--shadow-node)',
        }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setStyle((s) => ({ ...s, strokeColor: c }))}
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: c,
                border: c === style.strokeColor ? '2.5px solid var(--focus-blue)' : '2px solid var(--border-subtle)',
                cursor: 'pointer', padding: 0, flexShrink: 0,
              }}
            />
          ))}
          <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 4px' }} />
          <select
            value={style.strokeWidth}
            onChange={(e) => setStyle((s) => ({ ...s, strokeWidth: Number(e.target.value) }))}
            style={{
              background: 'var(--surface-2)', color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)', borderRadius: 6,
              padding: '2px 6px', fontSize: 12, cursor: 'pointer',
            }}
          >
            <option value={1}>Thin</option>
            <option value={2}>Normal</option>
            <option value={4}>Thick</option>
          </select>
          {activeDrawingTool === 'rect' && (
            <button
              onClick={() => setStyle((s) => ({
                ...s,
                fillColor: s.fillColor === 'transparent' ? s.strokeColor + '33' : 'transparent',
              }))}
              style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11,
                background: style.fillColor !== 'transparent' ? 'var(--hover-strong)' : 'transparent',
                color: 'var(--text-primary)', border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              Fill
            </button>
          )}
          {activeDrawingTool === 'text' && (
            <select
              value={style.fontSize}
              onChange={(e) => setStyle((s) => ({ ...s, fontSize: Number(e.target.value) }))}
              style={{
                background: 'var(--surface-2)', color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)', borderRadius: 6,
                padding: '2px 6px', fontSize: 12, cursor: 'pointer',
              }}
            >
              <option value={12}>12px</option>
              <option value={16}>16px</option>
              <option value={20}>20px</option>
              <option value={28}>28px</option>
              <option value={36}>36px</option>
            </select>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

export default React.memo(DrawingLayer)
