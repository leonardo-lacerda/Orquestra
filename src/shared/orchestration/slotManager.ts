// =============================================================================
// Slot manager: reassign / recruit / queue / dismiss-then-recruit (pure).
// =============================================================================

import { normalizeFunctionId } from './plan'
import type { SlotDecision } from './types'

export interface SlotPanel {
  panelId: string
  functionName: string
  /** recruiting | running | done | failed */
  status: string
}

export interface SlotResolveInput {
  requestedName: string
  openPanels: SlotPanel[]
  maxWorkers: number
  /** When at capacity, may dismiss oldest idle/done unused function */
  allowDismissUnused?: boolean
}

export function resolveSlot(input: SlotResolveInput): SlotDecision {
  const want = input.requestedName.trim()
  if (!want) {
    return { action: 'reject', reason: 'Function name is required' }
  }
  const wantBase = normalizeFunctionId(want)
  const max = Math.max(1, Math.floor(input.maxWorkers || 1))
  const open = input.openPanels.filter((p) => p.panelId && p.functionName)

  // 1. Same function id open → reassign
  for (const p of open) {
    const f = p.functionName.trim().toLowerCase()
    const base = normalizeFunctionId(f)
    if (f === want.toLowerCase() || base === wantBase || f === wantBase) {
      return { action: 'reassign', panelId: p.panelId, functionName: p.functionName }
    }
  }

  // 2. Free capacity → recruit
  if (open.length < max) {
    return { action: 'recruit', functionName: want }
  }

  // 3. At capacity: free an unused idle/done panel if allowed
  if (input.allowDismissUnused !== false) {
    const unused = open.filter(
      (p) => p.status === 'done' || p.status === 'failed' || p.status === 'dismissed',
    )
    if (unused.length > 0) {
      // oldest-ish: first in list
      return {
        action: 'dismiss_then_recruit',
        dismissPanelId: unused[0].panelId,
        functionName: want,
      }
    }
  }

  // 4. Queue
  const names = open.map((p) => p.functionName).join(', ')
  return {
    action: 'queue',
    functionName: want,
  }
}

export function formatSlotDecision(d: SlotDecision): string {
  switch (d.action) {
    case 'reassign':
      return `reassign panel ${d.panelId} as ${d.functionName}`
    case 'recruit':
      return `recruit new ${d.functionName}`
    case 'queue':
      return `queue ${d.functionName} (at capacity)`
    case 'reject':
      return `reject: ${d.reason}`
    case 'dismiss_then_recruit':
      return `dismiss ${d.dismissPanelId} then recruit ${d.functionName}`
  }
}
