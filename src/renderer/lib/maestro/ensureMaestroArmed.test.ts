/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../stores/appStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      setPanelMaestro: vi.fn(),
      workspaces: [{ id: 'ws1', panels: {}, rootPath: '/repo' }],
    })),
  },
}))

vi.mock('../../stores/orchestrationRunStore', () => ({
  useOrchestrationRunStore: {
    getState: vi.fn(() => ({ clearMaestro: vi.fn() })),
  },
}))

const getEntry = vi.fn()
vi.mock('../terminal/terminalRegistry', () => ({
  terminalRegistry: {
    getEntry: (...args: unknown[]) => getEntry(...args),
    ptyIdForPanel: vi.fn(),
  },
}))

import {
  clearMaestroArmed,
  ensureMaestroArmed,
  isLivePty,
  onMaestroRegistryExit,
} from './ensureMaestroArmed'

describe('ensureMaestroArmed', () => {
  beforeEach(() => {
    clearMaestroArmed('panel-1')
    getEntry.mockReset()
    ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      terminalSetMaestro: vi.fn(async () => ({ ok: true })),
      terminalWrite: vi.fn(),
    }
  })

  it('isLivePty requires registry alive match', () => {
    getEntry.mockReturnValue({ ptyId: 'pty-1', alive: true })
    expect(isLivePty('panel-1', 'pty-1')).toBe(true)
    getEntry.mockReturnValue({ ptyId: 'pty-1', alive: false })
    expect(isLivePty('panel-1', 'pty-1')).toBe(false)
  })

  it('returns PTY_GONE without IPC when not alive', async () => {
    getEntry.mockReturnValue({ ptyId: 'pty-dead', alive: false })
    const r = await ensureMaestroArmed({
      workspaceId: 'ws1',
      panelId: 'panel-1',
      ptyId: 'pty-dead',
      rootPath: '/repo',
    })
    expect(r).toEqual({ ok: false, error: 'Terminal not running', code: 'PTY_GONE' })
    expect(window.electronAPI.terminalSetMaestro).not.toHaveBeenCalled()
  })

  it('arms live pty and short-circuits when still alive', async () => {
    getEntry.mockReturnValue({ ptyId: 'pty-1', alive: true })
    const r1 = await ensureMaestroArmed({
      workspaceId: 'ws1',
      panelId: 'panel-1',
      ptyId: 'pty-1',
      rootPath: '/repo',
    })
    expect(r1.ok).toBe(true)
    expect(window.electronAPI.terminalSetMaestro).toHaveBeenCalledTimes(1)

    const r2 = await ensureMaestroArmed({
      workspaceId: 'ws1',
      panelId: 'panel-1',
      ptyId: 'pty-1',
      rootPath: '/repo',
    })
    expect(r2.ok).toBe(true)
    expect(window.electronAPI.terminalSetMaestro).toHaveBeenCalledTimes(1)
  })

  it('onMaestroRegistryExit clears armed map so dead id is not short-circuited', async () => {
    getEntry.mockReturnValue({ ptyId: 'pty-1', alive: true })
    await ensureMaestroArmed({
      workspaceId: 'ws1',
      panelId: 'panel-1',
      ptyId: 'pty-1',
      rootPath: '/repo',
    })
    onMaestroRegistryExit('panel-1')
    getEntry.mockReturnValue({ ptyId: 'pty-1', alive: false })
    const r = await ensureMaestroArmed({
      workspaceId: 'ws1',
      panelId: 'panel-1',
      ptyId: 'pty-1',
      rootPath: '/repo',
    })
    expect(r.code).toBe('PTY_GONE')
  })
})
