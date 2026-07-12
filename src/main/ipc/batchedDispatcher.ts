// =============================================================================
// Batched dispatcher — trailing-edge debounce for coalescing event bursts into
// a single delivery `delayMs` after the last item.
//
// Two accumulation modes share one timer skeleton:
//   - keyed-Map mode (`createKeyedDispatcher`): later items with the same key
//     overwrite earlier ones; the batch is the de-duplicated set of values.
//   - string mode (`createStringDispatcher`): items are concatenated into one
//     accumulated string; the batch is that string.
//
// In both modes the pending state is swapped/reset to empty BEFORE `onBatch`
// runs, the timer is nulled first, and `onBatch` owns the emit and all error
// handling (callers differ in whether they wrap the whole loop or each send,
// and in whether they log or stay silent). `cancel()` clears the timer; pass
// `resetPending: true` to also drop the accumulated-but-unflushed items.
// =============================================================================

interface BatchedDispatcher<TItem> {
  /** Accumulate one item, arming the trailing-edge flush if not already armed. */
  push: (item: TItem) => void
  /** Clear any pending flush timer. With `resetPending` also drop pending items. */
  cancel: (options?: { resetPending?: boolean }) => void
}

/**
 * Keyed-Map dispatcher. Items are `[key, value]` pairs; a later push with the
 * same key replaces the earlier value. `onBatch` receives the de-duplicated
 * values in insertion order (Map iteration order) and owns the emit loop and
 * its error handling.
 */
export function createKeyedDispatcher<TValue>(
  delayMs: number,
  onBatch: (values: IterableIterator<TValue>) => void,
): BatchedDispatcher<[string, TValue]> {
  let pending = new Map<string, TValue>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  const push = ([key, value]: [string, TValue]): void => {
    pending.set(key, value)
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        const values = pending
        pending = new Map()
        flushTimer = null
        onBatch(values.values())
      }, delayMs)
    }
  }

  const cancel = (options?: { resetPending?: boolean }): void => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (options?.resetPending) pending = new Map()
  }

  return { push, cancel }
}

/**
 * String-accumulation dispatcher. Items are concatenated; `onBatch` receives
 * the accumulated string (only invoked when non-empty, matching the original
 * terminal skeleton) and owns the emit and its error handling.
 */
const MAX_STRING_BUFFER = 1024 * 1024 // 1MB cap to prevent heap exhaustion

export function createStringDispatcher(
  delayMs: number | (() => number),
  onBatch: (data: string) => void,
): BatchedDispatcher<string> {
  let buffer = ''
  let bufferBytes = 0
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  const resolveDelay = (): number => {
    const d = typeof delayMs === 'function' ? delayMs() : delayMs
    return Math.max(0, Math.min(100, Number(d) || 0))
  }

  const push = (data: string): void => {
    buffer += data
    bufferBytes += Buffer.byteLength(data, 'utf-8')
    // Hard cap to prevent unbounded heap growth under high-output commands
    if (bufferBytes > MAX_STRING_BUFFER) {
      buffer = ''
      bufferBytes = 0
    }
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        if (buffer) onBatch(buffer)
        buffer = ''
        bufferBytes = 0
      }, resolveDelay())
    }
  }

  const cancel = (options?: { resetPending?: boolean }): void => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (options?.resetPending) { buffer = ''; bufferBytes = 0 }
  }

  return { push, cancel }
}
