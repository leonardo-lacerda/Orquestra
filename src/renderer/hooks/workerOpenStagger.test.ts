/**
 * Worker open stagger — 5s between NEW panel creates per Maestro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WORKER_OPEN_STAGGER_MS,
  acquireWorkerOpenSlot,
  releaseWorkerOpenSlot,
  resetRecruitPoolStateForTests,
} from './useOrquestra'

describe('worker open stagger', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetRecruitPoolStateForTests()
  })
  afterEach(() => {
    resetRecruitPoolStateForTests()
    vi.useRealTimers()
  })

  it('first open is immediate; second waits WORKER_OPEN_STAGGER_MS after release', async () => {
    expect(WORKER_OPEN_STAGGER_MS).toBe(5_000)

    const order: string[] = []
    const a = acquireWorkerOpenSlot('m1').then(() => {
      order.push('a-open')
    })
    await a
    expect(order).toEqual(['a-open'])

    let bOpened = false
    const b = acquireWorkerOpenSlot('m1').then(() => {
      bOpened = true
      order.push('b-open')
    })

    // b is waiting — not yet open
    await Promise.resolve()
    expect(bOpened).toBe(false)

    releaseWorkerOpenSlot('m1')
    // still waiting through stagger
    await vi.advanceTimersByTimeAsync(4_999)
    expect(bOpened).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await b
    expect(order).toEqual(['a-open', 'b-open'])
  })

  it('release with 0ms admits next immediately', async () => {
    await acquireWorkerOpenSlot('m2')
    let next = false
    const p = acquireWorkerOpenSlot('m2').then(() => {
      next = true
    })
    releaseWorkerOpenSlot('m2', 0)
    await p
    expect(next).toBe(true)
  })

  it('stagger is isolated per maestro id', async () => {
    await acquireWorkerOpenSlot('ma')
    await acquireWorkerOpenSlot('mb') // different maestro — immediate
    // both held; no throw
    releaseWorkerOpenSlot('ma', 0)
    releaseWorkerOpenSlot('mb', 0)
  })
})
