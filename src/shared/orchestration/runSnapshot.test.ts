import { describe, expect, it } from 'vitest'
import {
  createEmptyRunSnapshot,
  namesMapFromSnapshot,
  parseRunSnapshot,
  resolveFunctionPanelFromSnapshot,
  snapshotFromWorkers,
} from './runSnapshot'

describe('run snapshot', () => {
  it('round-trips and resolves function panels after reload', () => {
    const snap = snapshotFromWorkers({
      runId: 'run-1',
      maestroPtyId: 'pty-m',
      namesByPanelId: { panelHtml: 'api', panelUi: 'ui' },
      workers: [
        {
          panelId: 'panelHtml',
          name: 'api',
          role: 'Implement API only',
          status: 'done',
          maestroPtyId: 'pty-m',
          updatedAt: 1,
        },
      ],
    })
    const json = JSON.parse(JSON.stringify(snap))
    const loaded = parseRunSnapshot(json)
    expect(loaded).not.toBeNull()
    if (!loaded) return
    expect(namesMapFromSnapshot(loaded).get('panelHtml')).toBe('api')

    const open = new Set(['panelHtml', 'panelUi'])
    // OSC title is gone; resolve by snapshot names
    expect(resolveFunctionPanelFromSnapshot(loaded, open, 'api')).toEqual({
      panelId: 'panelHtml',
      functionName: 'api',
    })
    expect(resolveFunctionPanelFromSnapshot(loaded, open, 'api-2')?.panelId).toBe('panelHtml')
    expect(resolveFunctionPanelFromSnapshot(loaded, open, 'missing')).toBeNull()
  })

  it('createEmptyRunSnapshot has version 1', () => {
    const e = createEmptyRunSnapshot('x')
    expect(e.version).toBe(1)
    expect(e.runId).toBe('x')
  })
})
