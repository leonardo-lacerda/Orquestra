// =============================================================================
// runQueueCoordinator — serialized per-key mutate of run task queues.
// Prevents lost enqueues when concurrent overflow recruits race RMW on disk.
// =============================================================================

import {
  dequeueRunTask,
  emptyRunQueue,
  enqueueRunTask,
  peekQueuedTask,
  type RunQueueFile,
  type RunQueueItem,
} from './poolQueuePolicy'

export type RunQueueKey = string

/** Stable key shared by enqueue + drain for one Maestro run. */
export function makeRunQueueKey(opts: {
  runId?: string | null
  maestroId: string
}): RunQueueKey {
  const rid = (opts.runId || '').trim()
  if (rid) return `run:${rid}`
  // Never use literal "unknown" — maestro-scoped key still drains on free slot.
  return `maestro:${opts.maestroId}`
}

/** Prefer real runId for on-disk path; null means memory-only (no disk path). */
export function runIdForQueueDisk(key: RunQueueKey): string | null {
  if (key.startsWith('run:')) return key.slice(4)
  return null
}

export interface RunQueueCoordinator {
  enqueue(
    key: RunQueueKey,
    item: { name: string; role: string; source?: RunQueueItem['source'] },
    runIdHint?: string,
  ): Promise<RunQueueFile>
  dequeueHead(key: RunQueueKey): Promise<{ queue: RunQueueFile; item: RunQueueItem | null }>
  /**
   * Atomic claim of the queue head for auto-drain: peek + dequeue under ONE lock.
   * Two concurrent claimHead calls never both receive the same item.
   */
  claimHead(key: RunQueueKey): Promise<{ queue: RunQueueFile; item: RunQueueItem | null }>
  peek(key: RunQueueKey): Promise<RunQueueItem | null>
  /** Test/helper: current memory snapshot (after last op). */
  getCached(key: RunQueueKey): RunQueueFile | undefined
  /** Test/helper: wait until all locks idle. */
  flush(): Promise<void>
}

/**
 * Create a coordinator. Optional load/save for disk; memory is always updated
 * under the per-key chain so concurrent enqueues cannot last-write-wins.
 */
export function createRunQueueCoordinator(opts?: {
  load?: (key: RunQueueKey, runId: string) => Promise<RunQueueFile | null>
  save?: (key: RunQueueKey, queue: RunQueueFile) => Promise<void>
}): RunQueueCoordinator {
  const chains = new Map<RunQueueKey, Promise<unknown>>()
  const memory = new Map<RunQueueKey, RunQueueFile>()

  function withLock<T>(key: RunQueueKey, fn: () => Promise<T>): Promise<T> {
    const prev = chains.get(key) ?? Promise.resolve()
    const run = prev.catch(() => {}).then(fn)
    // Keep chain alive until this op finishes (success or fail)
    chains.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    )
    return run
  }

  async function ensureLoaded(key: RunQueueKey, runIdHint: string): Promise<RunQueueFile> {
    const cached = memory.get(key)
    if (cached) return cached
    const diskId = runIdForQueueDisk(key) || runIdHint || 'local'
    if (opts?.load && runIdForQueueDisk(key)) {
      try {
        const loaded = await opts.load(key, diskId)
        if (loaded && Array.isArray(loaded.items)) {
          memory.set(key, loaded)
          return loaded
        }
      } catch {
        /* fall through */
      }
    }
    const empty = emptyRunQueue(diskId)
    memory.set(key, empty)
    return empty
  }

  return {
    async enqueue(key, item, runIdHint = '') {
      return withLock(key, async () => {
        let q = await ensureLoaded(key, runIdHint || runIdForQueueDisk(key) || 'local')
        q = enqueueRunTask(q, item)
        memory.set(key, q)
        if (opts?.save && runIdForQueueDisk(key)) {
          await opts.save(key, q)
        }
        return q
      })
    },

    async dequeueHead(key) {
      return withLock(key, async () => {
        const q = await ensureLoaded(key, runIdForQueueDisk(key) || 'local')
        const result = dequeueRunTask(q)
        memory.set(key, result.queue)
        if (opts?.save && runIdForQueueDisk(key)) {
          await opts.save(key, result.queue)
        }
        return result
      })
    },

    async claimHead(key) {
      // Single lock: observe head and mark dispatched atomically (no peek/dequeue race).
      return withLock(key, async () => {
        const q = await ensureLoaded(key, runIdForQueueDisk(key) || 'local')
        const head = peekQueuedTask(q)
        if (!head) {
          return { queue: q, item: null }
        }
        const result = dequeueRunTask(q)
        memory.set(key, result.queue)
        if (opts?.save && runIdForQueueDisk(key)) {
          await opts.save(key, result.queue)
        }
        // Prefer dequeued item (authoritative); fall back to head only if dequeue empty
        return {
          queue: result.queue,
          item: result.item ?? head,
        }
      })
    },

    async peek(key) {
      return withLock(key, async () => {
        const q = await ensureLoaded(key, runIdForQueueDisk(key) || 'local')
        return peekQueuedTask(q)
      })
    },

    getCached(key) {
      return memory.get(key)
    },

    async flush() {
      const all = [...chains.values()]
      await Promise.all(all)
    },
  }
}

/** Concurrent enqueue simulation for tests — drives the real coordinator. */
export async function concurrentEnqueueAll(
  coord: RunQueueCoordinator,
  key: RunQueueKey,
  items: Array<{ name: string; role: string }>,
  runIdHint?: string,
): Promise<RunQueueFile> {
  await Promise.all(items.map((it) => coord.enqueue(key, { ...it, source: 'recruit_overflow' }, runIdHint)))
  await coord.flush()
  const cached = coord.getCached(key)
  if (!cached) throw new Error('queue missing after concurrent enqueue')
  return cached
}

/**
 * Simulate two free-slot auto-drains racing on the same queue.
 * Returns claimed items (null if empty). Must be two distinct tasks when queue has ≥2.
 */
export async function concurrentDualClaim(
  coord: RunQueueCoordinator,
  key: RunQueueKey,
): Promise<Array<RunQueueItem | null>> {
  const [a, b] = await Promise.all([coord.claimHead(key), coord.claimHead(key)])
  await coord.flush()
  return [a.item, b.item]
}
