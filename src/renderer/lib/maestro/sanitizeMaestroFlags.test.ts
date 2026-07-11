import { beforeEach, describe, expect, it, vi } from 'vitest'

const setPanelMaestro = vi.fn()

vi.mock('../../stores/appStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      setPanelMaestro,
      workspaces: [
        {
          id: 'ws1',
          panels: {
            b: { id: 'b', type: 'terminal', maestro: true },
            a: { id: 'a', type: 'terminal', maestro: true },
            c: { id: 'c', type: 'editor', maestro: false },
          },
        },
      ],
    })),
  },
}))

vi.mock('./ensureMaestroArmed', () => ({
  clearMaestroArmed: vi.fn(),
}))

import { sanitizeMaestroFlags } from './sanitizeMaestroFlags'

describe('sanitizeMaestroFlags', () => {
  beforeEach(() => {
    setPanelMaestro.mockClear()
  })

  it('keeps focused maestro when multiple', () => {
    const keep = sanitizeMaestroFlags('ws1', 'b')
    expect(keep).toBe('b')
    expect(setPanelMaestro).toHaveBeenCalledWith('ws1', 'a', false)
  })

  it('keeps stable id sort when no focus', () => {
    const keep = sanitizeMaestroFlags('ws1', null)
    expect(keep).toBe('a')
    expect(setPanelMaestro).toHaveBeenCalledWith('ws1', 'b', false)
  })
})
