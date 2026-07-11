import { describe, expect, it } from 'vitest'
import {
  inferCanvasConnectionType,
  isConnectionSourcePanelType,
  isConnectionTargetPanelType,
} from './canvasConnections'

describe('canvas connection rules', () => {
  it('infers pipe for terminal to terminal links', () => {
    expect(inferCanvasConnectionType('terminal', 'terminal')).toBe('pipe')
  })

  it('infers context for editor, document, and browser sources', () => {
    expect(inferCanvasConnectionType('editor', 'terminal')).toBe('context')
    expect(inferCanvasConnectionType('document', 'terminal')).toBe('context')
    expect(inferCanvasConnectionType('browser', 'agent')).toBe('context')
  })

  it('infers advanced context and output combinations', () => {
    expect(inferCanvasConnectionType('terminal', 'agent')).toBe('context')
    expect(inferCanvasConnectionType('agent', 'terminal')).toBe('context')
    expect(inferCanvasConnectionType('terminal', 'editor')).toBe('output')
    expect(inferCanvasConnectionType('agent', 'editor')).toBe('output')
  })

  it('rejects unsupported target combinations', () => {
    expect(inferCanvasConnectionType('editor', 'browser')).toBeNull()
  })

  it('exposes source and target panel capabilities', () => {
    expect(isConnectionSourcePanelType('editor')).toBe(true)
    expect(isConnectionSourcePanelType('document')).toBe(true)
    expect(isConnectionSourcePanelType('browser')).toBe(true)
    expect(isConnectionSourcePanelType('terminal')).toBe(true)
    expect(isConnectionSourcePanelType('agent')).toBe(true)

    expect(isConnectionTargetPanelType('terminal')).toBe(true)
    expect(isConnectionTargetPanelType('agent')).toBe(true)
    expect(isConnectionTargetPanelType('editor')).toBe(true)
  })
})
