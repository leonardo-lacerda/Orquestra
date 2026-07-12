import { describe, it, expect, beforeEach } from 'vitest'
import { createCanvasStore } from '../canvasStore'
import type { DrawingElement } from '../../../shared/types'

describe('drawingsSlice', () => {
  let store: ReturnType<typeof createCanvasStore>

  beforeEach(() => {
    store = createCanvasStore()
  })

  it('adds a rect drawing so annotation tools can persist strokes', () => {
    const rect: DrawingElement = {
      type: 'rect',
      id: 'd1',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      strokeColor: '#4dabf7',
      strokeWidth: 2,
      fill: 'transparent',
    }
    store.getState().addDrawing(rect)
    expect(store.getState().drawings).toHaveLength(1)
    expect(store.getState().drawings[0]).toEqual(rect)
  })

  it('removes and selects drawings', () => {
    store.getState().addDrawing({
      type: 'line', id: 'l1', x1: 0, y1: 0, x2: 10, y2: 10,
      strokeColor: '#fff', strokeWidth: 2,
    })
    store.getState().selectDrawing('l1')
    expect(store.getState().selectedDrawingId).toBe('l1')
    store.getState().removeDrawing('l1')
    expect(store.getState().drawings).toHaveLength(0)
    expect(store.getState().selectedDrawingId).toBeNull()
  })
})
