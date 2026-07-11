/**
 * After Maestro B arms, legacy .orquestra/crown.json is B's.
 * Maestro A's agent still has ORQUESTRA_RUN_ID=run-a — must stamp A's PTY, not B's.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveMaestroIdentity } from './index'

describe('resolveMaestroIdentity (multi-Maestro crown stamp)', () => {
  let tmp: string
  const prevEnv = process.env.ORQUESTRA_RUN_ID

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-ext-'))
    fs.mkdirSync(path.join(tmp, '.orquestra', 'runs', 'run-a'), { recursive: true })
    fs.mkdirSync(path.join(tmp, '.orquestra', 'runs', 'run-b'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, '.orquestra', 'runs', 'run-a', 'crown.json'),
      JSON.stringify({ runId: 'run-a', terminalPtyId: 'pty-maestro-a' }),
    )
    fs.writeFileSync(
      path.join(tmp, '.orquestra', 'runs', 'run-b', 'crown.json'),
      JSON.stringify({ runId: 'run-b', terminalPtyId: 'pty-maestro-b' }),
    )
    // Last-armed legacy crown is B (the bug surface)
    fs.writeFileSync(
      path.join(tmp, '.orquestra', 'crown.json'),
      JSON.stringify({ runId: 'run-b', terminalPtyId: 'pty-maestro-b' }),
    )
    fs.writeFileSync(
      path.join(tmp, '.orquestra', 'registry.json'),
      JSON.stringify({
        version: 1,
        runs: [
          { runId: 'run-a', maestroPtyId: 'pty-maestro-a' },
          { runId: 'run-b', maestroPtyId: 'pty-maestro-b' },
        ],
      }),
    )
  })

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.ORQUESTRA_RUN_ID
    else process.env.ORQUESTRA_RUN_ID = prevEnv
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch { /* ignore */ }
  })

  it('with ORQUESTRA_RUN_ID=run-a uses per-run crown (not last-armed B)', () => {
    process.env.ORQUESTRA_RUN_ID = 'run-a'
    const id = resolveMaestroIdentity(tmp)
    expect(id.runId).toBe('run-a')
    expect(id.maestroId).toBe('pty-maestro-a')
    expect(id.maestroId).not.toBe('pty-maestro-b')
  })

  it('with ORQUESTRA_RUN_ID=run-b uses B crown', () => {
    process.env.ORQUESTRA_RUN_ID = 'run-b'
    const id = resolveMaestroIdentity(tmp)
    expect(id.runId).toBe('run-b')
    expect(id.maestroId).toBe('pty-maestro-b')
  })

  it('without ORQUESTRA_RUN_ID and multi registry does NOT use last-armed legacy crown', () => {
    delete process.env.ORQUESTRA_RUN_ID
    const id = resolveMaestroIdentity(tmp)
    // Must not silently become B (last-armed) — that steals A/B recruits
    expect(id.maestroId).not.toBe('pty-maestro-b')
    expect(id.runId).not.toBe('run-b')
    // Prefer unset over wrong stamp
    expect(id.runId === undefined || id.runId === 'run-a').toBe(true)
  })
})
