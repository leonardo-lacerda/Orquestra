// =============================================================================
// orchestrationRunStore — lightweight tracker for Maestro workers.
//
// Fed by useOrquestra (recruit / dismiss / exit). Hydrated from
// .orquestra/runs/latest.json after reload so function-id reuse survives.
// =============================================================================

import { create } from 'zustand'
import {
  applyWorkerResultToPlan,
  type OrchestrationPlan,
  type OrchestrationRunSnapshot,
} from '../../shared/orchestration'

export type OrchestrationWorkerUiStatus =
  | 'recruiting'
  | 'running'
  | 'done'
  | 'failed'
  | 'dismissed'

export interface OrchestrationWorkerEntry {
  panelId: string
  name: string
  role: string
  status: OrchestrationWorkerUiStatus
  maestroPtyId: string
  workerPtyId?: string
  updatedAt: number
}

interface OrchestrationRunState {
  /** maestroPtyId → workers keyed by panelId */
  byMaestro: Record<string, Record<string, OrchestrationWorkerEntry>>
  /** Last loaded/saved run id */
  runId: string | null
  /** Installed orchestration plan (preserved across snapshot writes). */
  plan: OrchestrationPlan | null
  noteRecruit: (args: {
    maestroPtyId: string
    panelId: string
    name: string
    role: string
  }) => void
  noteWorkerReady: (panelId: string, workerPtyId: string) => void
  noteWorkerDone: (
    panelId: string,
    status?: 'done' | 'failed',
    opts?: { functionName?: string; summary?: string },
  ) => void
  noteDismiss: (panelId: string) => void
  clearMaestro: (maestroPtyId: string) => void
  listForMaestro: (maestroPtyId: string) => OrchestrationWorkerEntry[]
  activeCountForMaestro: (maestroPtyId: string) => number
  setPlan: (plan: OrchestrationPlan | null) => void
  /** Sync plan DAG when a named worker finishes (unlocks dependents). */
  applyWorkerResultToActivePlan: (
    functionName: string,
    status: 'done' | 'failed',
    summary?: string,
  ) => void
  /** Replace maestro workers from an on-disk snapshot (reload). */
  hydrateFromSnapshot: (snapshot: OrchestrationRunSnapshot) => void
  /** Build a serializable snapshot for the given maestro. */
  toSnapshot: (
    maestroPtyId: string,
    namesByPanelId: Record<string, string>,
  ) => OrchestrationRunSnapshot
}

function patchWorker(
  state: OrchestrationRunState,
  panelId: string,
  patch: Partial<OrchestrationWorkerEntry>,
): OrchestrationRunState {
  for (const [maestroPtyId, workers] of Object.entries(state.byMaestro)) {
    if (!workers[panelId]) continue
    return {
      ...state,
      byMaestro: {
        ...state.byMaestro,
        [maestroPtyId]: {
          ...workers,
          [panelId]: {
            ...workers[panelId],
            ...patch,
            updatedAt: Date.now(),
          },
        },
      },
    }
  }
  return state
}

export const useOrchestrationRunStore = create<OrchestrationRunState>((set, get) => ({
  byMaestro: {},
  runId: null,
  plan: null,

  noteRecruit({ maestroPtyId, panelId, name, role }) {
    set((state) => {
      const prev = state.byMaestro[maestroPtyId] ?? {}
      return {
        byMaestro: {
          ...state.byMaestro,
          [maestroPtyId]: {
            ...prev,
            [panelId]: {
              panelId,
              name,
              role,
              status: 'recruiting',
              maestroPtyId,
              updatedAt: Date.now(),
            },
          },
        },
      }
    })
  },

  noteWorkerReady(panelId, workerPtyId) {
    set((state) => patchWorker(state, panelId, { workerPtyId, status: 'running' }))
  },

  noteWorkerDone(panelId, status = 'done', opts) {
    set((state) => {
      let next = patchWorker(state, panelId, { status })
      // Resolve function name: explicit, or from worker entry
      let functionName = opts?.functionName?.trim()
      if (!functionName) {
        for (const workers of Object.values(next.byMaestro)) {
          if (workers[panelId]?.name) {
            functionName = workers[panelId].name
            break
          }
        }
      }
      if (functionName && next.plan) {
        const plan = applyWorkerResultToPlan(
          next.plan,
          functionName,
          status,
          opts?.summary,
        )
        if (plan) next = { ...next, plan }
      }
      return next
    })
  },

  noteDismiss(panelId) {
    set((state) => {
      let changed = false
      const next: OrchestrationRunState['byMaestro'] = {}
      for (const [maestroPtyId, workers] of Object.entries(state.byMaestro)) {
        if (!workers[panelId]) {
          next[maestroPtyId] = workers
          continue
        }
        changed = true
        const { [panelId]: _removed, ...rest } = workers
        next[maestroPtyId] = rest
      }
      return changed ? { byMaestro: next } : state
    })
  },

  clearMaestro(maestroPtyId) {
    set((state) => {
      if (!state.byMaestro[maestroPtyId]) return state
      const { [maestroPtyId]: _removed, ...rest } = state.byMaestro
      return { byMaestro: rest }
    })
  },

  listForMaestro(maestroPtyId) {
    const workers = get().byMaestro[maestroPtyId]
    if (!workers) return []
    return Object.values(workers).sort((a, b) => a.updatedAt - b.updatedAt)
  },

  activeCountForMaestro(maestroPtyId) {
    return get()
      .listForMaestro(maestroPtyId)
      .filter((w) => w.status === 'recruiting' || w.status === 'running')
      .length
  },

  setPlan(plan) {
    set({ plan, runId: plan?.id ?? get().runId })
  },

  applyWorkerResultToActivePlan(functionName, status, summary) {
    set((state) => {
      if (!state.plan) return state
      const plan = applyWorkerResultToPlan(state.plan, functionName, status, summary)
      if (!plan || plan === state.plan) return state
      return { ...state, plan }
    })
  },

  hydrateFromSnapshot(snapshot) {
    const maestroPtyId = snapshot.maestroPtyId || 'unknown'
    const workers: Record<string, OrchestrationWorkerEntry> = {}
    for (const w of snapshot.workers) {
      workers[w.panelId] = {
        panelId: w.panelId,
        name: w.name,
        role: w.role,
        status: w.status,
        maestroPtyId: w.maestroPtyId || maestroPtyId,
        workerPtyId: w.workerPtyId,
        updatedAt: w.updatedAt,
      }
    }
    // Also seed from names map if workers[] empty
    for (const [panelId, name] of Object.entries(snapshot.namesByPanelId)) {
      if (workers[panelId]) continue
      workers[panelId] = {
        panelId,
        name,
        role: '',
        status: 'done',
        maestroPtyId,
        updatedAt: snapshot.updatedAt,
      }
    }
    set({
      runId: snapshot.runId,
      plan: snapshot.plan ?? get().plan,
      byMaestro: { [maestroPtyId]: workers },
    })
  },

  toSnapshot(maestroPtyId, namesByPanelId) {
    const workers = get().listForMaestro(maestroPtyId)
    return {
      version: 1,
      runId: get().runId ?? `run-${Date.now()}`,
      updatedAt: Date.now(),
      maestroPtyId,
      namesByPanelId: { ...namesByPanelId },
      workers: workers.map((w) => ({
        panelId: w.panelId,
        name: w.name,
        role: w.role,
        status: w.status,
        maestroPtyId: w.maestroPtyId,
        workerPtyId: w.workerPtyId,
        updatedAt: w.updatedAt,
      })),
      // Preserve installed plan — never wipe plan.json-backed state on recruit persist
      plan: get().plan,
      queue: [],
    }
  },
}))
