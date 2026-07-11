// =============================================================================
// Orchestration run snapshot serialize / parse / hydrate helpers (pure).
// =============================================================================

import type {
  OrchestrationPlan,
  OrchestrationRunSnapshot,
  OrchestrationRunWorkerSnapshot,
} from './types'

export function createEmptyRunSnapshot(runId?: string): OrchestrationRunSnapshot {
  return {
    version: 1,
    runId: runId ?? `run-${Date.now()}`,
    updatedAt: Date.now(),
    namesByPanelId: {},
    workers: [],
    plan: null,
    queue: [],
  }
}

export function parseRunSnapshot(raw: unknown): OrchestrationRunSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<OrchestrationRunSnapshot>
  if (o.version !== 1) return null
  if (typeof o.runId !== 'string' || !o.runId) return null
  const namesByPanelId: Record<string, string> = {}
  if (o.namesByPanelId && typeof o.namesByPanelId === 'object') {
    for (const [k, v] of Object.entries(o.namesByPanelId)) {
      if (typeof v === 'string' && v.trim()) namesByPanelId[k] = v.trim()
    }
  }
  const workers: OrchestrationRunWorkerSnapshot[] = Array.isArray(o.workers)
    ? o.workers
      .filter((w) => w && typeof w === 'object' && typeof (w as OrchestrationRunWorkerSnapshot).panelId === 'string')
      .map((w) => {
        const x = w as OrchestrationRunWorkerSnapshot
        return {
          panelId: String(x.panelId),
          name: String(x.name ?? ''),
          role: String(x.role ?? ''),
          status: x.status ?? 'running',
          maestroPtyId: String(x.maestroPtyId ?? ''),
          workerPtyId: x.workerPtyId,
          updatedAt: typeof x.updatedAt === 'number' ? x.updatedAt : Date.now(),
        }
      })
    : []
  return {
    version: 1,
    runId: o.runId,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
    maestroPtyId: o.maestroPtyId,
    namesByPanelId,
    workers,
    plan: (o.plan as OrchestrationPlan | null | undefined) ?? null,
    queue: Array.isArray(o.queue) ? o.queue.map(String) : [],
  }
}

export function snapshotFromWorkers(args: {
  runId?: string
  maestroPtyId?: string
  namesByPanelId: Record<string, string> | Map<string, string>
  workers: OrchestrationRunWorkerSnapshot[]
  plan?: OrchestrationPlan | null
  queue?: string[]
}): OrchestrationRunSnapshot {
  const names: Record<string, string> = {}
  if (args.namesByPanelId instanceof Map) {
    for (const [k, v] of args.namesByPanelId) names[k] = v
  } else {
    Object.assign(names, args.namesByPanelId)
  }
  return {
    version: 1,
    runId: args.runId ?? `run-${Date.now()}`,
    updatedAt: Date.now(),
    maestroPtyId: args.maestroPtyId,
    namesByPanelId: names,
    workers: args.workers,
    plan: args.plan ?? null,
    queue: args.queue ?? [],
  }
}

/** Build namesMap for reuse resolution from a loaded snapshot. */
export function namesMapFromSnapshot(snapshot: OrchestrationRunSnapshot): Map<string, string> {
  return new Map(Object.entries(snapshot.namesByPanelId))
}

/**
 * Given open panels and a snapshot, return the function name to reuse for a
 * requested id — preferring snapshot names over UI titles.
 */
export function resolveFunctionPanelFromSnapshot(
  snapshot: OrchestrationRunSnapshot,
  openPanelIds: Set<string>,
  requestedName: string,
): { panelId: string; functionName: string } | null {
  const want = requestedName.trim().toLowerCase()
  if (!want) return null
  const base = want.replace(/-\d+$/, '') || want

  for (const [panelId, fname] of Object.entries(snapshot.namesByPanelId)) {
    if (!openPanelIds.has(panelId)) continue
    const f = fname.trim().toLowerCase()
    if (f === want || f === base || f.replace(/-\d+$/, '') === base) {
      return { panelId, functionName: fname }
    }
  }
  for (const w of snapshot.workers) {
    if (!openPanelIds.has(w.panelId)) continue
    const f = w.name.trim().toLowerCase()
    if (f === want || f === base || f.replace(/-\d+$/, '') === base) {
      return { panelId: w.panelId, functionName: w.name }
    }
  }
  return null
}
