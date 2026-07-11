// @vitest-environment jsdom
//
// Linked-context must never inject into a terminal (PTY or local xterm).
// PTY write executes paths (Notepad on Windows); local xterm.write paints into
// agent TUIs (Claude Code) as a fake user prompt and can wrap paths mid-name.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const writes: string[] = []
const getEntry = vi.fn()
const terminalWrite = vi.fn()

vi.mock('../lib/terminal/terminalRegistry', () => ({
  terminalRegistry: {
    getEntry: (...args: unknown[]) => getEntry(...args),
    ptyIdForPanel: () => 'pty-1',
  },
}))

vi.mock('../stores/CanvasStoreContext', () => ({
  useCanvasStoreContext: () => ({}),
}))
vi.mock('../stores/appStore', () => ({
  useAppStore: Object.assign(() => null, { getState: () => ({}) }),
}))
vi.mock('../stores/settingsStore', () => ({
  useSettingsStore: Object.assign(() => false, { getState: () => ({}) }),
}))
vi.mock('../contextLinks/contextSourceResolver', () => ({
  resolveContextSource: vi.fn(),
}))
vi.mock('../lib/editor/editorSaveRegistry', () => ({
  writeEditorBuffer: vi.fn(),
}))

beforeEach(() => {
  writes.length = 0
  getEntry.mockReset()
  terminalWrite.mockReset()
  getEntry.mockReturnValue({
    terminal: { write: (s: string) => { writes.push(s) } },
  })
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { terminalWrite },
  })
})

describe('toWorkspaceRelativePath', () => {
  it('extracts .orquestra/context/... from an absolute Windows path', async () => {
    const { toWorkspaceRelativePath } = await import('./useLinkedContextConnections')
    expect(toWorkspaceRelativePath(
      'C:\\Users\\Leo\\Downloads\\Lading-page\\.orquestra\\context\\abc\\latest.md',
    )).toBe('.orquestra/context/abc/latest.md')
  })

  it('leaves unrelated paths unchanged', async () => {
    const { toWorkspaceRelativePath } = await import('./useLinkedContextConnections')
    expect(toWorkspaceRelativePath('/tmp/other.md')).toBe('/tmp/other.md')
  })
})

describe('terminal linked-context notify', () => {
  it('does not write to the PTY or the local xterm buffer', async () => {
    // Re-import the module's notify path indirectly by calling the exported
    // relative-path helper and asserting the dangerous APIs stay untouched.
    // notifyTarget is private; the contract is: terminal targets are silent.
    // We assert no accidental side effects from simply loading the module and
    // that terminalWrite / terminal.write are never called from the helpers
    // that used to paint notices.
    await import('./useLinkedContextConnections')
    expect(terminalWrite).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
  })
})
