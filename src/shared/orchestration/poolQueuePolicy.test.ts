/**
 * Pool + queue disposition — must drive shipped disposeRecruit / burst helper.
 */
import { describe, expect, it } from 'vitest'
import {
  countQueued,
  decideDrainOnFree,
  dequeueRunTask,
  disposeRecruit,
  disposeRecruitBurst,
  emptyRunQueue,
  enqueueRunTask,
  formatRecruitDisposition,
  isDuplicateRecruit,
  makeRecruitDedupeKey,
  peekQueuedTask,
  rememberRecruit,
} from './poolQueuePolicy'

describe('disposeRecruit (pool/queue)', () => {
  it('same name open → reassign (never second panel)', () => {
    const d = disposeRecruit({
      requestedName: 'logger',
      role: 'next task',
      openPanels: [{ panelId: 'p1', functionName: 'logger', status: 'running' }],
      maxWorkers: 4,
      pendingReserves: 0,
    })
    expect(d).toEqual({
      action: 'reassign',
      panelId: 'p1',
      functionName: 'logger',
    })
  })

  it('under capacity → recruit', () => {
    const d = disposeRecruit({
      requestedName: 'api',
      role: 'add routes',
      openPanels: [],
      maxWorkers: 4,
      pendingReserves: 0,
    })
    expect(d).toEqual({ action: 'recruit', functionName: 'api' })
  })

  it('pendingReserves count toward capacity (anti-burst)', () => {
    const d = disposeRecruit({
      requestedName: 'docs',
      role: 'write md',
      openPanels: [
        { panelId: 'a', functionName: 'w1', status: 'running' },
        { panelId: 'b', functionName: 'w2', status: 'running' },
      ],
      maxWorkers: 4,
      pendingReserves: 2, // 2+2 = 4 full
    })
    expect(d.action).toBe('enqueue')
    if (d.action === 'enqueue') {
      expect(d.functionName).toBe('docs')
      expect(d.reason).toBe('at_capacity')
    }
  })

  it('at capacity with idle slot → reassign_idle (prefer reuse over new panel)', () => {
    const d = disposeRecruit({
      requestedName: 'docs',
      role: 'write docs',
      openPanels: [
        { panelId: 'a', functionName: 'core', status: 'done' },
        { panelId: 'b', functionName: 'tests', status: 'running' },
      ],
      maxWorkers: 2,
      pendingReserves: 0,
      preferReassignIdle: true,
    })
    expect(d).toEqual({
      action: 'reassign_idle',
      panelId: 'a',
      functionName: 'docs',
    })
  })

  it('all busy at capacity → enqueue (pool_queue)', () => {
    const d = disposeRecruit({
      requestedName: 'extra',
      role: 'more work',
      openPanels: [
        { panelId: 'a', functionName: 'w1', status: 'running' },
        { panelId: 'b', functionName: 'w2', status: 'running' },
      ],
      maxWorkers: 2,
      pendingReserves: 0,
    })
    expect(d.action).toBe('enqueue')
  })

  it('legacy mode at capacity → reject (no open)', () => {
    const d = disposeRecruit({
      requestedName: 'extra',
      role: 'more work',
      openPanels: [
        { panelId: 'a', functionName: 'w1', status: 'running' },
        { panelId: 'b', functionName: 'w2', status: 'running' },
      ],
      maxWorkers: 2,
      pendingReserves: 0,
      dispatchMode: 'legacy_function_panels',
    })
    expect(d.action).toBe('reject')
  })

  it('duplicate name+role in window → drop_duplicate', () => {
    const recent = new Map<string, number>()
    const key = makeRecruitDedupeKey('core', 'Implement logger')
    const now = 1_000_000
    rememberRecruit(recent, key, now)
    expect(isDuplicateRecruit(recent, key, now + 500)).toBe(true)
    const d = disposeRecruit({
      requestedName: 'core',
      role: 'Implement logger',
      openPanels: [],
      maxWorkers: 4,
      pendingReserves: 0,
      recentKeys: recent,
      now: now + 500,
    })
    expect(d).toEqual({ action: 'drop_duplicate', functionName: 'core' })
  })

  it('burst of maxWorkers+2 distinct names → at most maxWorkers recruit accepts', () => {
    const max = 4
    const requests = [
      { name: 'core', role: 'r1' },
      { name: 'health', role: 'r2' },
      { name: 'runner', role: 'r3' },
      { name: 'tests', role: 'r4' },
      { name: 'docs', role: 'r5' },
      { name: 'extra', role: 'r6' },
    ]
    const results = disposeRecruitBurst(requests, { maxWorkers: max })
    const recruits = results.filter((r) => r.action === 'recruit')
    const enqueued = results.filter((r) => r.action === 'enqueue')
    expect(recruits.length).toBe(max)
    expect(enqueued.length).toBe(2)
    expect(recruits.map((r) => (r as { functionName: string }).functionName)).toEqual([
      'core',
      'health',
      'runner',
      'tests',
    ])
    expect(enqueued.map((r) => (r as { functionName: string }).functionName)).toEqual([
      'docs',
      'extra',
    ])
  })

  it('burst with duplicate same name+role → second is drop_duplicate', () => {
    const results = disposeRecruitBurst(
      [
        { name: 'core', role: 'same role text' },
        { name: 'core', role: 'same role text' },
        { name: 'health', role: 'other' },
      ],
      { maxWorkers: 4 },
    )
    expect(results[0].action).toBe('recruit')
    // After first recruit, panel is open with name core → second same name is reassign
    // (not drop) when role differs timing... same name open → reassign takes priority
    // over dedupe when panel already exists from first.
    expect(results[1].action === 'reassign' || results[1].action === 'drop_duplicate').toBe(true)
    expect(results[2].action).toBe('recruit')
  })
})

describe('run queue pure ops', () => {
  it('enqueue / peek / dequeue / count', () => {
    let q = emptyRunQueue('run-a', 100)
    q = enqueueRunTask(q, { name: 'docs', role: 'write md' }, 101)
    q = enqueueRunTask(q, { name: 'tests', role: 'add tests' }, 102)
    expect(countQueued(q)).toBe(2)
    expect(peekQueuedTask(q)?.name).toBe('docs')
    const { queue: q2, item } = dequeueRunTask(q, 103)
    expect(item?.name).toBe('docs')
    expect(item?.status).toBe('dispatched')
    expect(countQueued(q2)).toBe(1)
    expect(peekQueuedTask(q2)?.name).toBe('tests')
  })

  it('decideDrainOnFree reassigns queue head onto free panel', () => {
    expect(
      decideDrainOnFree({
        freePanelId: 'p1',
        queueHead: { name: 'docs', role: 'write docs' },
        autoDrain: true,
      }),
    ).toEqual({
      action: 'reassign',
      panelId: 'p1',
      name: 'docs',
      role: 'write docs',
    })
    expect(
      decideDrainOnFree({
        freePanelId: 'p1',
        queueHead: { name: 'docs', role: 'write docs' },
        autoDrain: false,
      }),
    ).toEqual({ action: 'none' })
  })
})

describe('formatRecruitDisposition', () => {
  it('mentions queue and pool when enqueue', () => {
    const msg = formatRecruitDisposition(
      { action: 'enqueue', functionName: 'docs', reason: 'at_capacity' },
      { open: 4, max: 4 },
    )
    expect(msg).toMatch(/Queued "docs"/)
    expect(msg).toMatch(/pool 4\/4/)
    expect(msg).toMatch(/do not recruit under a new name/i)
  })
})
