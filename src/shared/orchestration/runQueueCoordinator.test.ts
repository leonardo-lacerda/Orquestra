/**
 * Serialized queue mutations — concurrent overflow must not drop items.
 */
import { describe, expect, it } from 'vitest'
import {
  concurrentDualClaim,
  concurrentEnqueueAll,
  createRunQueueCoordinator,
  makeRunQueueKey,
  runIdForQueueDisk,
} from './runQueueCoordinator'
import { countQueued } from './poolQueuePolicy'

describe('makeRunQueueKey', () => {
  it('prefers runId and never uses literal unknown', () => {
    expect(makeRunQueueKey({ runId: 'run-abc', maestroId: 'pty-1' })).toBe('run:run-abc')
    expect(makeRunQueueKey({ runId: '', maestroId: 'pty-1' })).toBe('maestro:pty-1')
    expect(makeRunQueueKey({ runId: null, maestroId: 'pty-1' })).toBe('maestro:pty-1')
    expect(makeRunQueueKey({ runId: 'unknown', maestroId: 'pty-1' })).toBe('run:unknown')
    // disk path only for run: keys with real id — maestro keys are memory/drain-compatible
    expect(runIdForQueueDisk('run:run-abc')).toBe('run-abc')
    expect(runIdForQueueDisk('maestro:pty-1')).toBeNull()
  })
})

describe('createRunQueueCoordinator concurrent enqueue', () => {
  it('keeps all items when N enqueues race (no last-write-wins drop)', async () => {
    let disk: string | null = null
    let loadCount = 0
    const coord = createRunQueueCoordinator({
      load: async () => {
        loadCount++
        // Simulate slow disk always returning empty unless we parse disk
        if (!disk) return null
        return JSON.parse(disk)
      },
      save: async (_key, q) => {
        // artificial delay so races would drop without lock
        await new Promise((r) => setTimeout(r, 5))
        disk = JSON.stringify(q)
      },
    })

    const key = makeRunQueueKey({ runId: 'run-race', maestroId: 'm1' })
    const items = [
      { name: 'docs', role: 'write docs' },
      { name: 'tests', role: 'add tests' },
      { name: 'extra', role: 'more work' },
    ]
    const q = await concurrentEnqueueAll(coord, key, items, 'run-race')
    expect(countQueued(q)).toBe(3)
    expect(q.items.map((i) => i.name).sort()).toEqual(['docs', 'extra', 'tests'])
    // load may run once per first ensure; critical is final count
    expect(loadCount).toBeGreaterThanOrEqual(1)
  })

  it('dequeue is serialized with enqueue', async () => {
    const coord = createRunQueueCoordinator()
    const key = makeRunQueueKey({ runId: 'run-d', maestroId: 'm' })
    await coord.enqueue(key, { name: 'a', role: 'ra' }, 'run-d')
    await coord.enqueue(key, { name: 'b', role: 'rb' }, 'run-d')
    const { item } = await coord.dequeueHead(key)
    expect(item?.name).toBe('a')
    const head = await coord.peek(key)
    expect(head?.name).toBe('b')
    expect(countQueued(coord.getCached(key)!)).toBe(1)
  })

  it('maestro-scoped key works without disk runId (drain-compatible)', async () => {
    const coord = createRunQueueCoordinator()
    const key = makeRunQueueKey({ runId: undefined, maestroId: 'rpty-6' })
    expect(runIdForQueueDisk(key)).toBeNull()
    await coord.enqueue(key, { name: 'docs', role: 'md' })
    const head = await coord.peek(key)
    expect(head?.name).toBe('docs')
  })

  it('claimHead is atomic: concurrent dual-drain gets two distinct tasks, zero lost', async () => {
    const coord = createRunQueueCoordinator()
    const key = makeRunQueueKey({ runId: 'run-dual', maestroId: 'm1' })
    await coord.enqueue(key, { name: 'A', role: 'task-A-role' }, 'run-dual')
    await coord.enqueue(key, { name: 'B', role: 'task-B-role' }, 'run-dual')

    // Old bug: two peeks both saw A, then dequeues A and B but both reassigned A.
    // claimHead must hand each drain a unique item under the same lock chain.
    const claimed = await concurrentDualClaim(coord, key)
    const names = claimed.map((c) => c?.name).filter(Boolean).sort()
    expect(names).toEqual(['A', 'B'])
    expect(claimed[0]?.name).not.toBe(claimed[1]?.name)
    expect(claimed[0]?.role).not.toBe(claimed[1]?.role)
    // Both claimed → no queued left
    expect(countQueued(coord.getCached(key)!)).toBe(0)
    // Third claim is empty
    const empty = await coord.claimHead(key)
    expect(empty.item).toBeNull()
  })

  it('claimHead returns null when empty (no stale peek)', async () => {
    const coord = createRunQueueCoordinator()
    const key = makeRunQueueKey({ runId: 'run-e', maestroId: 'm' })
    const r = await coord.claimHead(key)
    expect(r.item).toBeNull()
  })
})
