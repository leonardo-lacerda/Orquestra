import { describe, expect, it } from 'vitest'
import { maestroCrownUiState, shouldAttemptMaestroRearm } from './rearmDecision'

describe('shouldAttemptMaestroRearm', () => {
  const base = {
    panelMaestroFlag: true,
    ptyId: 'pty-1',
    ptyAlive: true,
    rootPath: 'C:/proj',
    lastArmKey: null as string | null,
    panelId: 'panel-1',
  }

  it('attempts when flag + live pty + root and not yet armed', () => {
    expect(shouldAttemptMaestroRearm(base)).toBe(true)
  })

  it('skips when already armed for same key', () => {
    expect(shouldAttemptMaestroRearm({
      ...base,
      lastArmKey: 'panel-1:pty-1',
    })).toBe(false)
  })

  it('skips when PTY dead or flag off', () => {
    expect(shouldAttemptMaestroRearm({ ...base, ptyAlive: false })).toBe(false)
    expect(shouldAttemptMaestroRearm({ ...base, panelMaestroFlag: false })).toBe(false)
    expect(shouldAttemptMaestroRearm({ ...base, rootPath: '' })).toBe(false)
  })
})

describe('maestroCrownUiState', () => {
  it('error wins over flag', () => {
    expect(maestroCrownUiState({
      panelMaestroFlag: true,
      ptyAlive: true,
      error: 'assets missing',
      armedForLivePty: false,
    })).toBe('error')
  })

  it('paused when flag but not armed or dead', () => {
    expect(maestroCrownUiState({
      panelMaestroFlag: true,
      ptyAlive: true,
      error: null,
      armedForLivePty: false,
    })).toBe('paused')
    expect(maestroCrownUiState({
      panelMaestroFlag: true,
      ptyAlive: false,
      error: null,
      armedForLivePty: false,
    })).toBe('paused')
  })

  it('active only when flag + live + armed', () => {
    expect(maestroCrownUiState({
      panelMaestroFlag: true,
      ptyAlive: true,
      error: null,
      armedForLivePty: true,
    })).toBe('active')
  })

  it('off when no maestro flag', () => {
    expect(maestroCrownUiState({
      panelMaestroFlag: false,
      ptyAlive: true,
      error: null,
      armedForLivePty: false,
    })).toBe('off')
  })
})
