import { describe, expect, it } from 'vitest'
import { formatSlotDecision, resolveSlot } from './slotManager'

describe('slotManager', () => {
  it('reuses open panel with same function id instead of recruiting', () => {
    const d = resolveSlot({
      requestedName: 'api',
      maxWorkers: 4,
      openPanels: [
        { panelId: 'p1', functionName: 'api', status: 'done' },
        { panelId: 'p2', functionName: 'ui', status: 'running' },
      ],
    })
    expect(d).toEqual({ action: 'reassign', panelId: 'p1', functionName: 'api' })
  })

  it('maps api-2 request onto api panel', () => {
    const d = resolveSlot({
      requestedName: 'api-2',
      maxWorkers: 4,
      openPanels: [{ panelId: 'p1', functionName: 'api', status: 'done' }],
    })
    expect(d.action).toBe('reassign')
    if (d.action === 'reassign') expect(d.panelId).toBe('p1')
  })

  it('recruits when capacity free and name is new', () => {
    const d = resolveSlot({
      requestedName: 'tests',
      maxWorkers: 4,
      openPanels: [{ panelId: 'p1', functionName: 'api', status: 'done' }],
    })
    expect(d).toEqual({ action: 'recruit', functionName: 'tests' })
  })

  it('queues or dismisses when at max capacity with no matching name', () => {
    const d = resolveSlot({
      requestedName: 'docs',
      maxWorkers: 2,
      openPanels: [
        { panelId: 'p1', functionName: 'api', status: 'done' },
        { panelId: 'p2', functionName: 'ui', status: 'running' },
      ],
      allowDismissUnused: true,
    })
    expect(d.action).toBe('dismiss_then_recruit')
    if (d.action === 'dismiss_then_recruit') {
      expect(d.dismissPanelId).toBe('p1')
      expect(d.functionName).toBe('docs')
    }

    const queued = resolveSlot({
      requestedName: 'docs',
      maxWorkers: 2,
      openPanels: [
        { panelId: 'p1', functionName: 'api', status: 'running' },
        { panelId: 'p2', functionName: 'ui', status: 'running' },
      ],
    })
    expect(queued.action).toBe('queue')
    expect(formatSlotDecision(queued)).toMatch(/queue/)
  })
})
