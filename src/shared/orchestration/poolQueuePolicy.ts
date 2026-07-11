// =============================================================================
// poolQueuePolicy — pure decisions for Maestro worker pool + task queue.
//
// Product rule: workers are a small reusable pool (≤ maxWorkers). Tasks queue
// when full. Same name → reassign. Burst recruits cannot all open panels.
// =============================================================================

import { normalizeFunctionId } from './plan'

export type PoolPanel = {
  panelId: string
  functionName: string
  /** recruiting | running | done | failed | dismissed | idle */
  status: string
}

export type RecruitDisposition =
  | { action: 'reassign'; panelId: string; functionName: string }
  | { action: 'reassign_idle'; panelId: string; functionName: string }
  | { action: 'recruit'; functionName: string }
  | { action: 'enqueue'; functionName: string; reason: 'at_capacity' }
  | { action: 'drop_duplicate'; functionName: string }
  | { action: 'reject'; reason: string }

export const DEFAULT_DEDUPE_WINDOW_MS = 2000

/** Stable key for burst/double recruit dedupe (name + role). */
export function makeRecruitDedupeKey(name: string, role: string): string {
  const n = String(name || '').trim().toLowerCase()
  const r = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return `${n}|${r}`
}

export function isDuplicateRecruit(
  recent: ReadonlyMap<string, number> | ReadonlySet<string>,
  key: string,
  now: number = Date.now(),
  windowMs: number = DEFAULT_DEDUPE_WINDOW_MS,
): boolean {
  if (!key || key === '|') return false
  if (recent instanceof Map) {
    const ts = recent.get(key)
    if (ts === undefined) return false
    return now - ts < windowMs
  }
  return recent.has(key)
}

export function rememberRecruit(
  recent: Map<string, number>,
  key: string,
  now: number = Date.now(),
  windowMs: number = DEFAULT_DEDUPE_WINDOW_MS,
): void {
  // prune stale
  for (const [k, ts] of [...recent.entries()]) {
    if (now - ts >= windowMs) recent.delete(k)
  }
  if (key && key !== '|') recent.set(key, now)
}

function nameMatches(panelName: string, requested: string): boolean {
  const f = panelName.trim().toLowerCase()
  const want = requested.trim().toLowerCase()
  if (!f || !want) return false
  if (f === want) return true
  const base = normalizeFunctionId(f)
  const wantBase = normalizeFunctionId(want)
  return base === wantBase || f === wantBase || base === want
}

function isIdleStatus(status: string): boolean {
  const s = (status || '').toLowerCase()
  return s === 'done' || s === 'failed' || s === 'dismissed' || s === 'idle'
}

function isBusyStatus(status: string): boolean {
  const s = (status || '').toLowerCase()
  return s === 'recruiting' || s === 'running'
}

/**
 * Decide what to do with a recruit request under pool/queue rules.
 * Callers must increment pendingReserves synchronously when action is `recruit`.
 */
export function disposeRecruit(input: {
  requestedName: string
  role: string
  openPanels: readonly PoolPanel[]
  maxWorkers: number
  /** In-flight recruits accepted but panel not yet in openPanels */
  pendingReserves: number
  recentKeys?: ReadonlyMap<string, number> | ReadonlySet<string>
  now?: number
  dedupeWindowMs?: number
  /** Prefer reusing idle/done slots over opening new panels (default true) */
  preferReassignIdle?: boolean
  /**
   * pool_queue (default): at capacity → enqueue.
   * legacy: at capacity with no idle → reject (no open).
   */
  dispatchMode?: 'pool_queue' | 'legacy_function_panels'
}): RecruitDisposition {
  const want = (input.requestedName || '').trim()
  if (!want) {
    return { action: 'reject', reason: 'Function name is required' }
  }
  const role = (input.role || '').trim()
  if (!role) {
    return { action: 'reject', reason: 'Role is required' }
  }

  const now = input.now ?? Date.now()
  const windowMs = input.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS
  const dedupeKey = makeRecruitDedupeKey(want, role)
  if (input.recentKeys && isDuplicateRecruit(input.recentKeys, dedupeKey, now, windowMs)) {
    return { action: 'drop_duplicate', functionName: want }
  }

  const open = input.openPanels.filter((p) => p.panelId && p.functionName)
  const max = Math.max(1, Math.floor(input.maxWorkers || 1))
  const pending = Math.max(0, Math.floor(input.pendingReserves || 0))
  const preferIdle = input.preferReassignIdle !== false
  const mode = input.dispatchMode ?? 'pool_queue'

  // 1. Same function name already open → reassign that slot
  for (const p of open) {
    if (nameMatches(p.functionName, want)) {
      return { action: 'reassign', panelId: p.panelId, functionName: p.functionName }
    }
  }

  // 2. Capacity including in-flight reserves
  const used = open.length + pending
  if (used < max) {
    return { action: 'recruit', functionName: want }
  }

  // 3. At capacity: reuse idle/done slot (rename to new task) — prefer over dismiss
  if (preferIdle) {
    const idle = open.find((p) => isIdleStatus(p.status) && !isBusyStatus(p.status))
    if (idle) {
      return {
        action: 'reassign_idle',
        panelId: idle.panelId,
        functionName: want,
      }
    }
  }

  // 4. Full pool of busy workers
  if (mode === 'legacy_function_panels') {
    return {
      action: 'reject',
      reason: `Worker limit reached (${used}/${max}). Reassign or dismiss before recruiting more.`,
    }
  }
  return { action: 'enqueue', functionName: want, reason: 'at_capacity' }
}

/**
 * Simulate N sequential recruit decisions with shared pending/recent state.
 * Used by tests to prove burst cannot exceed maxWorkers opens.
 */
export function disposeRecruitBurst(
  requests: Array<{ name: string; role: string }>,
  opts: {
    maxWorkers: number
    openPanels?: PoolPanel[]
    dispatchMode?: 'pool_queue' | 'legacy_function_panels'
    now?: number
  },
): RecruitDisposition[] {
  const open = [...(opts.openPanels ?? [])]
  let pending = 0
  const recent = new Map<string, number>()
  const now = opts.now ?? Date.now()
  const out: RecruitDisposition[] = []

  for (const req of requests) {
    const d = disposeRecruit({
      requestedName: req.name,
      role: req.role,
      openPanels: open,
      maxWorkers: opts.maxWorkers,
      pendingReserves: pending,
      recentKeys: recent,
      now,
      dispatchMode: opts.dispatchMode,
    })
    out.push(d)
    if (d.action === 'recruit') {
      pending += 1
      rememberRecruit(recent, makeRecruitDedupeKey(req.name, req.role), now)
      // Simulate panel appearing (still recruiting) so later same-name reassigns
      open.push({
        panelId: `pending-${req.name}-${pending}`,
        functionName: req.name,
        status: 'recruiting',
      })
      pending -= 1
    } else if (d.action === 'reassign' || d.action === 'reassign_idle') {
      rememberRecruit(recent, makeRecruitDedupeKey(req.name, req.role), now)
      const panel = open.find((p) => p.panelId === d.panelId)
      if (panel) {
        panel.functionName = d.functionName
        panel.status = 'running'
      }
    } else if (d.action === 'drop_duplicate' || d.action === 'enqueue') {
      // no panel open
    }
  }
  return out
}

export function formatRecruitDisposition(
  d: RecruitDisposition,
  pool?: { open: number; max: number },
): string {
  const poolStr =
    pool !== undefined ? ` (pool ${pool.open}/${pool.max})` : ''
  switch (d.action) {
    case 'reassign':
      return `[orquestra] Reusing worker "${d.functionName}"${poolStr}.`
    case 'reassign_idle':
      return `[orquestra] Reusing idle slot for "${d.functionName}"${poolStr}.`
    case 'recruit':
      return `[orquestra] Recruiting "${d.functionName}"${poolStr}.`
    case 'enqueue':
      return (
        `[orquestra] Queued "${d.functionName}" — pool full${poolStr}. `
        + 'A free worker will get the next task; do not recruit under a new name to bypass the limit.'
      )
    case 'drop_duplicate':
      return `[orquestra] Ignored duplicate recruit for "${d.functionName}".`
    case 'reject':
      return `[orquestra] Recruit rejected: ${d.reason}`
  }
}

// ---------------------------------------------------------------------------
// Run-scoped task queue (pure)
// ---------------------------------------------------------------------------

export type RunQueueItemStatus = 'queued' | 'dispatched' | 'cancelled'

export interface RunQueueItem {
  id: string
  name: string
  role: string
  status: RunQueueItemStatus
  enqueuedAt: number
  source?: 'recruit_overflow' | 'maestro_plan' | 'dedupe_coalesce'
}

export interface RunQueueFile {
  version: 1
  runId: string
  updatedAt: number
  items: RunQueueItem[]
}

export function emptyRunQueue(runId: string, now: number = Date.now()): RunQueueFile {
  return { version: 1, runId, updatedAt: now, items: [] }
}

export function enqueueRunTask(
  queue: RunQueueFile,
  item: { name: string; role: string; source?: RunQueueItem['source']; id?: string },
  now: number = Date.now(),
): RunQueueFile {
  const id =
    item.id
    || `q-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const next: RunQueueItem = {
    id,
    name: item.name.trim(),
    role: item.role.trim(),
    status: 'queued',
    enqueuedAt: now,
    source: item.source ?? 'recruit_overflow',
  }
  return {
    ...queue,
    updatedAt: now,
    items: [...queue.items, next],
  }
}

export function peekQueuedTask(queue: RunQueueFile): RunQueueItem | null {
  return queue.items.find((i) => i.status === 'queued') ?? null
}

/** Mark head queued item as dispatched and return it. */
export function dequeueRunTask(
  queue: RunQueueFile,
  now: number = Date.now(),
): { queue: RunQueueFile; item: RunQueueItem | null } {
  const idx = queue.items.findIndex((i) => i.status === 'queued')
  if (idx < 0) return { queue, item: null }
  const item = { ...queue.items[idx], status: 'dispatched' as const }
  const items = queue.items.map((it, i) => (i === idx ? item : it))
  return {
    queue: { ...queue, updatedAt: now, items },
    item,
  }
}

export function countQueued(queue: RunQueueFile): number {
  return queue.items.filter((i) => i.status === 'queued').length
}

/**
 * When a worker finishes, decide whether to drain queue onto that free panel.
 */
export function decideDrainOnFree(input: {
  freePanelId: string
  queueHead: { name: string; role: string } | null
  autoDrain: boolean
}): { action: 'reassign'; panelId: string; name: string; role: string } | { action: 'none' } {
  if (!input.autoDrain || !input.queueHead) return { action: 'none' }
  const role = input.queueHead.role.trim()
  const name = input.queueHead.name.trim()
  if (!role || !name || !input.freePanelId) return { action: 'none' }
  return {
    action: 'reassign',
    panelId: input.freePanelId,
    name,
    role,
  }
}
