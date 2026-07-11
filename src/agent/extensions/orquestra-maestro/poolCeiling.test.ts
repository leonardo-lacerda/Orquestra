/**
 * Extension must still sendCommand recruit when at maxWorkers so the app can enqueue.
 */
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  isExtensionAtPoolCeiling,
  shouldSendExtensionRecruitCommand,
} from './index'

describe('orquestra_recruit pool ceiling (extension)', () => {
  it('detects ceiling for a new name but still allows send', () => {
    const names = new Set(['w1', 'w2', 'w3', 'w4'])
    expect(isExtensionAtPoolCeiling(names, 'docs', 4)).toBe(true)
    expect(isExtensionAtPoolCeiling(names, 'w1', 4)).toBe(false) // same name → reassign path
    expect(shouldSendExtensionRecruitCommand()).toBe(true)
  })

  it('source always sendCommands recruit even at ceiling (no ERROR hard-return before send)', () => {
    // Drive shipped file: ceiling path must call sendCommand, not return ERROR first.
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const src = fs.readFileSync(path.join(dir, 'index.ts'), 'utf-8')
    // Old bug: return ok(`ERROR: already at maxWorkers=...`) without sendCommand
    expect(src).not.toMatch(
      /already at maxWorkers=\$\{maxWorkers\}\. Reassign an existing worker \(orquestra_reassign\) instead of opening a new panel/,
    )
    expect(src).toContain('isExtensionAtPoolCeiling')
    expect(src).toContain("sendCommand(cwd, 'recruit'")
    // Message tells agent about queue
    expect(src).toMatch(/QUEUE this task|will QUEUE/i)
  })
})
