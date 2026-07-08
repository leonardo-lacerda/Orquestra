// =============================================================================
// Drawings slice — whiteboard-style shapes on the canvas.
// =============================================================================

import type { DrawingElement } from '../../../shared/types'
import type { CanvasGet, CanvasSet, CanvasStoreActions } from './storeTypes'

type DrawingsActions = Pick<
  CanvasStoreActions,
  'addDrawing' | 'removeDrawing' | 'updateDrawing' | 'clearDrawings' | 'loadDrawings' | 'selectDrawing'
>

export function createDrawingsSlice(set: CanvasSet, get: CanvasGet): DrawingsActions {
  return {
    addDrawing(element: DrawingElement) {
      const state = get()
      set({ drawings: [...state.drawings, element] })
    },

    removeDrawing(id: string) {
      const state = get()
      const updates: Record<string, unknown> = {
        drawings: state.drawings.filter((d) => d.id !== id),
      }
      if (state.selectedDrawingId === id) updates.selectedDrawingId = null
      set(updates)
    },

    updateDrawing(id: string, updates: Partial<DrawingElement>) {
      const state = get()
      set({
        drawings: state.drawings.map((d) =>
          d.id === id ? { ...d, ...updates } as DrawingElement : d,
        ),
      })
    },

    clearDrawings() {
      set({ drawings: [], selectedDrawingId: null })
    },

    loadDrawings(drawings: DrawingElement[]) {
      set({ drawings, selectedDrawingId: null })
    },

    selectDrawing(id: string | null) {
      set({ selectedDrawingId: id })
    },
  }
}
