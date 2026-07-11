import type { CanvasConnectionType, PanelType } from './types'

const CONTEXT_SOURCE_TYPES = new Set<PanelType>(['editor', 'document', 'browser', 'terminal', 'agent', 'orchestration'])
const CONTEXT_TARGET_TYPES = new Set<PanelType>(['terminal', 'agent'])

export function isConnectionSourcePanelType(type: PanelType | undefined): boolean {
  return CONTEXT_SOURCE_TYPES.has(type as PanelType)
}

export function isConnectionTargetPanelType(type: PanelType | undefined): boolean {
  return CONTEXT_TARGET_TYPES.has(type as PanelType) || type === 'editor'
}

export function inferCanvasConnectionType(
  sourceType: PanelType | undefined,
  targetType: PanelType | undefined,
): CanvasConnectionType | null {
  if (!sourceType || !targetType) return null

  if (sourceType === 'terminal' && targetType === 'terminal') {
    return 'pipe'
  }

  if ((sourceType === 'terminal' || sourceType === 'agent') && targetType === 'editor') {
    return 'output'
  }

  if (CONTEXT_SOURCE_TYPES.has(sourceType) && CONTEXT_TARGET_TYPES.has(targetType)) {
    return 'context'
  }

  return null
}
