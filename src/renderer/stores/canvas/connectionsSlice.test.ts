import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getEntry: vi.fn((panelId: string) => ({ ptyId: `pty-${panelId}` })),
}))

vi.mock('../../lib/terminal/terminalRegistry', () => ({
  terminalRegistry: {
    getEntry: mocks.getEntry,
  },
}))

import { createCanvasStore } from '../canvasStore'

const terminalPipeCreate = vi.fn(() => Promise.resolve())
const terminalPipeDestroy = vi.fn(() => Promise.resolve())

function installElectronApiMock(): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        terminalPipeCreate,
        terminalPipeDestroy,
      },
    },
  })
}

describe('canvas connections slice', () => {
  beforeEach(() => {
    mocks.getEntry.mockClear()
    terminalPipeCreate.mockClear()
    terminalPipeDestroy.mockClear()
    installElectronApiMock()
  })

  it('keeps default terminal connections as PTY pipes', () => {
    const store = createCanvasStore()
    const source = store.getState().addNode('term-a', 'terminal')
    const target = store.getState().addNode('term-b', 'terminal')

    const id = store.getState().addConnection(source, target)

    expect(id).toBeTruthy()
    expect(store.getState().connections[id!]).toMatchObject({ type: 'pipe' })
    expect(terminalPipeCreate).toHaveBeenCalledWith('pty-term-a', 'pty-term-b')
  })

  it('stores context connections without creating PTY pipes', () => {
    const store = createCanvasStore()
    const source = store.getState().addNode('editor-a', 'editor')
    const target = store.getState().addNode('term-b', 'terminal')

    const id = store.getState().addConnection(source, target, 'context')

    expect(id).toBeTruthy()
    expect(store.getState().connections[id!]).toMatchObject({ type: 'context' })
    expect(terminalPipeCreate).not.toHaveBeenCalled()
  })

  it('does not destroy PTY pipes when removing context connections', () => {
    const store = createCanvasStore()
    const source = store.getState().addNode('editor-a', 'editor')
    const target = store.getState().addNode('term-b', 'terminal')
    const id = store.getState().addConnection(source, target, 'context')

    store.getState().removeConnection(id!)

    expect(terminalPipeDestroy).not.toHaveBeenCalled()
  })

  it('converts a pipe to context and tears down only the old PTY pipe', () => {
    const store = createCanvasStore()
    const source = store.getState().addNode('term-a', 'terminal')
    const target = store.getState().addNode('term-b', 'terminal')
    const id = store.getState().addConnection(source, target, 'pipe')!

    store.getState().setConnectionType(id, 'context')

    expect(store.getState().connections[id].type).toBe('context')
    expect(terminalPipeDestroy).toHaveBeenCalledWith('pty-term-a', 'pty-term-b')
  })
})
