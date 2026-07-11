// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerEditorBuffer,
  unregisterEditorBuffer,
  flushScratchEditorBuffersToStore,
} from './editorSaveRegistry'

describe('flushScratchEditorBuffersToStore', () => {
  beforeEach(() => {
    // Clean any leftover registrations from other tests.
    for (const id of ['scratch-1', 'file-1', 'scratch-2']) {
      unregisterEditorBuffer(id)
    }
  })

  it('writes live scratch buffers into the store before session save', () => {
    const panels: Record<string, { type: string; filePath?: string; unsavedContent?: string }> = {
      'scratch-1': { type: 'editor', unsavedContent: 'old' },
      'file-1': { type: 'editor', filePath: '/repo/a.ts', unsavedContent: undefined },
    }
    registerEditorBuffer('scratch-1', () => 'Leo é lindo')
    registerEditorBuffer('file-1', () => 'should not flush file-backed')

    const written: Array<{ id: string; content: string | undefined }> = []
    const n = flushScratchEditorBuffersToStore(
      (id) => panels[id],
      (id, content) => {
        written.push({ id, content })
        if (panels[id]) panels[id].unsavedContent = content
      },
    )

    expect(n).toBe(1)
    expect(written).toEqual([{ id: 'scratch-1', content: 'Leo é lindo' }])
    expect(panels['scratch-1'].unsavedContent).toBe('Leo é lindo')
  })

  it('skips when live buffer already matches unsavedContent', () => {
    const panels = {
      'scratch-2': { type: 'editor' as const, unsavedContent: 'same' },
    }
    registerEditorBuffer('scratch-2', () => 'same')
    let calls = 0
    const n = flushScratchEditorBuffersToStore(
      (id) => panels[id as 'scratch-2'],
      () => { calls++ },
    )
    expect(n).toBe(0)
    expect(calls).toBe(0)
  })
})
