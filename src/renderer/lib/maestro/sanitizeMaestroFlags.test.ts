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
    // Multi-Maestro default: keep both flags (no forced collapse).
    // When multi is on, setPanelMaestro should NOT clear the other crown.
    // Single-mode tests mock settings; without mock multi defaults true.
    expect(setPanelMaestro).not.toHaveBeenCalled()
  })

  it('keeps multiple maestros when multi enabled (default)', () => {
    const keep = sanitizeMaestroFlags('ws1', null)
    // Returns first in Object.values order (b then a in mock) — either ok; must not clear flags
    expect(keep === 'a' || keep === 'b').toBe(true)
    expect(setPanelMaestro).not.toHaveBeenCalled()
  })
})
