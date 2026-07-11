// =============================================================================
// collectPanelIds — the single DockLayout tree walk that gathers every panelId
// inside a layout. Every dock-aware site (canvas close, detach cleanup, the
// workspace panel tree, session capture, and the main-process window registry)
// consumes this instead of hand-rolling the same recursion.
//
// Lives in shared/ because both the renderer and the main process (deriving a
// detached canvas's children from a synced layout) need it. Returns the
// collected ids as an array. Pass an optional `into` Set to also accumulate into
// a caller-owned sink (the returned array still holds only the ids found in THIS
// layout). Null/undefined layouts collect nothing.
// =============================================================================

import type { DockLayoutNode } from './types'

export function collectPanelIds(
  layout: DockLayoutNode | null | undefined,
  into?: Set<string>,
): string[] {
  const out: string[] = []
  walk(layout, out, into)
  return out
}

/**
 * Remove one panelId from a dock layout tree. Returns the updated tree, or
 * null when the tree becomes empty (last tab / last child collapsed away).
 * Shared by the workspace dock store and canvas-bridge headless close so a
 * seed tab is never left pointing at a deleted panel record ("Panel" husk).
 */
export function removePanelFromDockLayout(
  node: DockLayoutNode | null | undefined,
  panelId: string,
): DockLayoutNode | null {
  if (!node) return null
  if (node.type === 'tabs') {
    const idx = node.panelIds.indexOf(panelId)
    if (idx === -1) return node
    const newPanelIds = node.panelIds.filter((id) => id !== panelId)
    if (newPanelIds.length === 0) return null
    return {
      ...node,
      panelIds: newPanelIds,
      activeIndex: Math.min(node.activeIndex, newPanelIds.length - 1),
    }
  }
  const newChildren: DockLayoutNode[] = []
  const newRatios: number[] = []
  for (let i = 0; i < node.children.length; i++) {
    const updated = removePanelFromDockLayout(node.children[i], panelId)
    if (updated) {
      newChildren.push(updated)
      newRatios.push(node.ratios[i])
    }
  }
  if (newChildren.length === 0) return null
  if (newChildren.length === 1) return newChildren[0]
  const total = newRatios.reduce((a, b) => a + b, 0)
  return {
    ...node,
    children: newChildren,
    ratios: newRatios.map((r) => r / total),
  }
}

function walk(
  layout: DockLayoutNode | null | undefined,
  out: string[],
  into: Set<string> | undefined,
): void {
  if (!layout) return
  if (layout.type === 'tabs') {
    for (const id of layout.panelIds) {
      out.push(id)
      into?.add(id)
    }
    return
  }
  for (const child of layout.children) walk(child, out, into)
}
