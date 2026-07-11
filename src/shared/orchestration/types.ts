// =============================================================================
// Shared orchestration runtime types (Intelligent Maestro Runtime).
// Domain-generic: task ids are free-form function names, not tied to any stack.
// =============================================================================

export type OrchestrationTaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped'

export type AcceptCriterion =
  | { type: 'file_exists'; path: string }
  | { type: 'file_contains'; path: string; pattern: string; flags?: string }
  | { type: 'marker'; token?: string }

export interface OrchestrationTask {
  id: string
  name: string
  role: string
  deps: string[]
  status: OrchestrationTaskStatus
  roleTemplate?: string
  accept?: AcceptCriterion[]
  retries?: number
  summary?: string
  acceptResults?: AcceptResult[]
}

export interface AcceptResult {
  type: AcceptCriterion['type']
  ok: boolean
  detail: string
  path?: string
}

export interface OrchestrationPlan {
  version: 1
  id: string
  goal: string
  createdAt: number
  tasks: OrchestrationTask[]
}

export type OrchestrationWorkerUiStatus =
  | 'recruiting'
  | 'running'
  | 'done'
  | 'failed'
  | 'dismissed'

export interface OrchestrationRunWorkerSnapshot {
  panelId: string
  name: string
  role: string
  status: OrchestrationWorkerUiStatus
  maestroPtyId: string
  workerPtyId?: string
  updatedAt: number
}

/** On-disk snapshot under .orquestra/runs/latest.json */
export interface OrchestrationRunSnapshot {
  version: 1
  runId: string
  updatedAt: number
  maestroPtyId?: string
  /** panelId → function name (stable across OSC title changes) */
  namesByPanelId: Record<string, string>
  workers: OrchestrationRunWorkerSnapshot[]
  plan?: OrchestrationPlan | null
  /** Task ids waiting for a free slot */
  queue?: string[]
}

export type SlotDecision =
  | { action: 'reassign'; panelId: string; functionName: string }
  | { action: 'recruit'; functionName: string }
  | { action: 'queue'; functionName: string }
  | { action: 'reject'; reason: string }
  | { action: 'dismiss_then_recruit'; dismissPanelId: string; functionName: string }

export const DEFAULT_COMPLETION_TOKEN = 'ORQUESTRA_WORKER_DONE'
export const MAX_TASK_ROLE_CHARS = 220
export const ORQUESTRA_RUNS_DIR = '.orquestra/runs'
export const ORQUESTRA_LATEST_RUN_FILE = 'latest.json'
