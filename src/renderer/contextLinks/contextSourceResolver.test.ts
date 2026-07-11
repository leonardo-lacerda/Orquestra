import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getEditorBuffer: vi.fn(() => null as string | null),
  getTerminalEntry: vi.fn(() => undefined as { ptyId: string } | undefined),
  serializeTerminalState: vi.fn(() => undefined as string | undefined),
}))

vi.mock('../lib/editor/editorSaveRegistry', () => ({
  getEditorBuffer: mocks.getEditorBuffer,
}))

vi.mock('../lib/terminal/terminalRegistry', () => ({
  terminalRegistry: {
    getEntry: mocks.getTerminalEntry,
    serializeTerminalState: mocks.serializeTerminalState,
  },
}))

vi.mock('../../agent/renderer/agentSessionRegistry', () => ({
  getAgentPanelSession: vi.fn(() => undefined),
}))

vi.mock('../../agent/renderer/agentStore', () => ({
  useAgentStore: { getState: () => ({ panels: {} }) },
}))

import type { PanelState } from '../../shared/types'
import { resolveContextSource } from './contextSourceResolver'

const fsReadFile = vi.fn()
const fsStat = vi.fn(() => Promise.resolve({ isDirectory: false, isFile: true }))
const fsReadDir = vi.fn()
const gitDiff = vi.fn()
const gitDiffStaged = vi.fn()

function installElectronApiMock(): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        fsReadFile,
        fsStat,
        fsReadDir,
        gitDiff,
        gitDiffStaged,
      },
    },
  })
}

function panel(overrides: Partial<PanelState> & Pick<PanelState, 'id' | 'type'>): PanelState {
  return {
    title: overrides.id,
    isDirty: false,
    ...overrides,
  }
}

describe('resolveContextSource', () => {
  beforeEach(() => {
    installElectronApiMock()
    fsReadFile.mockReset()
    fsStat.mockClear()
    fsReadDir.mockReset()
    gitDiff.mockReset()
    gitDiffStaged.mockReset()
    mocks.getEditorBuffer.mockReset()
    mocks.getEditorBuffer.mockReturnValue(null)
  })

  it('resolves working-tree diff editors through Git', async () => {
    gitDiff.mockResolvedValue('diff --git a/app.ts b/app.ts')

    const result = await resolveContextSource({
      workspaceId: 'ws-1',
      workspaceRoot: 'C:/repo',
      sourcePanel: panel({ id: 'diff-1', type: 'editor', filePath: 'C:/repo/app.ts', diffMode: 'working' }),
      sourceNodeId: 'node-diff',
      targetPanelId: 'term-1',
      targetNodeId: 'node-term',
      connectionId: 'conn-diff',
    })

    expect(result.kind).toBe('git-diff')
    expect(result.language).toBe('diff')
    expect(gitDiff).toHaveBeenCalledWith('C:/repo', 'C:/repo/app.ts')
  })

  it('resolves terminal scrollback as plain context', async () => {
    mocks.getTerminalEntry.mockReturnValue({ ptyId: 'pty-1' })
    mocks.serializeTerminalState.mockReturnValue('\u001b[31mfailed\u001b[0m\r\nnext')

    const result = await resolveContextSource({
      workspaceId: 'ws-1',
      workspaceRoot: 'C:/repo',
      sourcePanel: panel({ id: 'term-1', type: 'terminal' }),
      sourceNodeId: 'node-term-1',
      targetPanelId: 'term-2',
      targetNodeId: 'node-term-2',
      connectionId: 'conn-terminal',
    })

    expect(result.kind).toBe('terminal')
    expect(result.text).toContain('failed\nnext')
    expect(result.text).not.toContain('\u001b[')
  })

  it('resolves scratch editor buffers without a file path', async () => {
    mocks.getEditorBuffer.mockReturnValue('scratch text')

    const result = await resolveContextSource({
      workspaceId: 'ws-1',
      workspaceRoot: 'C:/repo',
      sourcePanel: panel({ id: 'ed-1', type: 'editor', unsavedContent: 'persisted text' }),
      sourceNodeId: 'node-ed',
      targetPanelId: 'term-1',
      targetNodeId: 'node-term',
      connectionId: 'conn-1',
    })

    expect(result.kind).toBe('editor-buffer')
    expect(result.text).toBe('scratch text')
    expect(result.isScratch).toBe(true)
    expect(fsReadFile).not.toHaveBeenCalled()
  })

  it('reads clean saved editor files from disk', async () => {
    fsReadFile.mockResolvedValue('disk text')

    const result = await resolveContextSource({
      workspaceId: 'ws-1',
      workspaceRoot: 'C:/repo',
      sourcePanel: panel({ id: 'ed-1', type: 'editor', filePath: 'C:/repo/app.ts' }),
      sourceNodeId: 'node-ed',
      targetPanelId: 'term-1',
      targetNodeId: 'node-term',
      connectionId: 'conn-1',
    })

    expect(result.kind).toBe('file')
    expect(result.text).toBe('disk text')
    expect(result.language).toBe('typescript')
    expect(fsReadFile).toHaveBeenCalledWith('C:/repo/app.ts', 'ws-1')
  })

  it('prefers live buffer for dirty saved editor files', async () => {
    mocks.getEditorBuffer.mockReturnValue('dirty buffer')

    const result = await resolveContextSource({
      workspaceId: 'ws-1',
      workspaceRoot: 'C:/repo',
      sourcePanel: panel({ id: 'ed-1', type: 'editor', filePath: 'C:/repo/app.ts', isDirty: true }),
      sourceNodeId: 'node-ed',
      targetPanelId: 'term-1',
      targetNodeId: 'node-term',
      connectionId: 'conn-1',
    })

    expect(result.kind).toBe('file')
    expect(result.text).toBe('dirty buffer')
    expect(result.isDirty).toBe(true)
    expect(fsReadFile).not.toHaveBeenCalled()
  })
})
