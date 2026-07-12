// =============================================================================
// Shared drawing stroke/fill style — used by DrawingLayer (commit) and the
// toolbar style strip (UI). Kept outside React portal trees so HMR remounts of
// Canvas don't try to removeChild portal nodes that body already lost.
// =============================================================================

import { useSyncExternalStore } from 'react'

export interface DrawingStyle {
  strokeColor: string
  strokeWidth: number
  fillColor: string
  fontSize: number
}

export const PRESET_COLORS = [
  '#ffffff', '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c',
  '#4dabf7', '#9775fa', '#f06595', '#868e96', '#000000',
] as const

const DEFAULT_STYLE: DrawingStyle = {
  // Blue stays visible on both dark and light canvas backgrounds.
  strokeColor: '#4dabf7',
  strokeWidth: 2,
  fillColor: 'transparent',
  fontSize: 16,
}

let style: DrawingStyle = { ...DEFAULT_STYLE }
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function getDrawingStyle(): DrawingStyle {
  return style
}

export function setDrawingStyle(partial: Partial<DrawingStyle>): void {
  style = { ...style, ...partial }
  emit()
}

export function useDrawingStyle(): DrawingStyle {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange)
      return () => { listeners.delete(onStoreChange) }
    },
    () => style,
    () => DEFAULT_STYLE,
  )
}

/** Stable body host for rare fixed overlays (text input). Idempotent. */
export function getDrawingPortalHost(): HTMLElement {
  const id = 'orquestra-drawing-portal-root'
  let host = document.getElementById(id)
  if (!host) {
    host = document.createElement('div')
    host.id = id
    host.setAttribute('data-orquestra-drawing-portal', '')
    document.body.appendChild(host)
  }
  return host
}
