// =============================================================================
// Plan DAG validation, ready-set, and status transitions (pure).
// =============================================================================

import {
  MAX_TASK_ROLE_CHARS,
  type OrchestrationPlan,
  type OrchestrationTask,
  type OrchestrationTaskStatus,
} from './types'

export type PlanValidationError =
  | { code: 'empty'; message: string }
  | { code: 'duplicate_id'; message: string; id: string }
  | { code: 'unknown_dep'; message: string; id: string; dep: string }
  | { code: 'cycle'; message: string; path: string[] }
  | { code: 'role_empty'; message: string; id: string }
  | { code: 'role_too_long'; message: string; id: string; length: number }
  | { code: 'invalid_version'; message: string }

export function normalizeFunctionId(name: string): string {
  const n = name.trim().toLowerCase()
  if (!n) return ''
  return n.replace(/-\d+$/, '') || n
}

/** Detect directed cycles; returns one cycle path if found. */
export function findPlanCycle(tasks: OrchestrationTask[]): string[] | null {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const visiting = new Set<string>()
  const done = new Set<string>()
  const stack: string[] = []

  function dfs(id: string): string[] | null {
    if (done.has(id)) return null
    if (visiting.has(id)) {
      const i = stack.indexOf(id)
      return i >= 0 ? [...stack.slice(i), id] : [id]
    }
    visiting.add(id)
    stack.push(id)
    const task = byId.get(id)
    for (const dep of task?.deps ?? []) {
      if (!byId.has(dep)) continue
      const c = dfs(dep)
      if (c) return c
    }
    stack.pop()
    visiting.delete(id)
    done.add(id)
    return null
  }

  for (const t of tasks) {
    const c = dfs(t.id)
    if (c) return c
  }
  return null
}

export function validatePlan(plan: unknown): { ok: true; plan: OrchestrationPlan } | { ok: false; errors: PlanValidationError[] } {
  const errors: PlanValidationError[] = []
  if (!plan || typeof plan !== 'object') {
    return { ok: false, errors: [{ code: 'empty', message: 'Plan is missing or not an object' }] }
  }
  const p = plan as Partial<OrchestrationPlan>
  if (p.version !== 1) {
    errors.push({ code: 'invalid_version', message: 'Plan version must be 1' })
  }
  if (!Array.isArray(p.tasks) || p.tasks.length === 0) {
    errors.push({ code: 'empty', message: 'Plan must include at least one task' })
    return { ok: false, errors }
  }

  const ids = new Set<string>()
  for (const raw of p.tasks) {
    const id = String(raw?.id ?? '').trim()
    if (!id) {
      errors.push({ code: 'empty', message: 'Task id is required' })
      continue
    }
    if (ids.has(id.toLowerCase())) {
      errors.push({ code: 'duplicate_id', message: `Duplicate task id "${id}"`, id })
    }
    ids.add(id.toLowerCase())
    const role = String(raw?.role ?? '').trim()
    if (!role) {
      errors.push({ code: 'role_empty', message: `Task "${id}" has empty role`, id })
    } else if (role.length > MAX_TASK_ROLE_CHARS) {
      errors.push({
        code: 'role_too_long',
        message: `Task "${id}" role is ${role.length} chars (max ${MAX_TASK_ROLE_CHARS})`,
        id,
        length: role.length,
      })
    }
  }

  const idSet = new Set(p.tasks.map((t) => String(t.id).trim()))
  for (const raw of p.tasks) {
    const id = String(raw.id).trim()
    for (const dep of raw.deps ?? []) {
      const d = String(dep).trim()
      if (!idSet.has(d)) {
        errors.push({
          code: 'unknown_dep',
          message: `Task "${id}" depends on unknown "${d}"`,
          id,
          dep: d,
        })
      }
    }
  }

  const normalized: OrchestrationTask[] = p.tasks.map((t) => ({
    id: String(t.id).trim(),
    name: String(t.name ?? t.id).trim() || String(t.id).trim(),
    role: String(t.role ?? '').trim(),
    deps: (t.deps ?? []).map((d) => String(d).trim()).filter(Boolean),
    status: (t.status as OrchestrationTaskStatus) || 'pending',
    roleTemplate: t.roleTemplate,
    accept: t.accept,
    retries: t.retries ?? 0,
    summary: t.summary,
    acceptResults: t.acceptResults,
  }))

  const cycle = findPlanCycle(normalized)
  if (cycle) {
    errors.push({
      code: 'cycle',
      message: `Dependency cycle: ${cycle.join(' → ')}`,
      path: cycle,
    })
  }

  if (errors.length > 0) return { ok: false, errors }

  const planOut: OrchestrationPlan = {
    version: 1,
    id: String(p.id ?? `run-${Date.now()}`),
    goal: String(p.goal ?? '').trim() || 'Untitled orchestration run',
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
    tasks: normalized,
  }
  return { ok: true, plan: planOut }
}

export function recomputeReadyStatuses(plan: OrchestrationPlan): OrchestrationPlan {
  const byId = new Map(plan.tasks.map((t) => [t.id, t]))
  const tasks = plan.tasks.map((t) => {
    if (t.status === 'done' || t.status === 'failed' || t.status === 'skipped' || t.status === 'running') {
      return t
    }
    const depsOk = t.deps.every((d) => byId.get(d)?.status === 'done')
    return { ...t, status: depsOk ? 'ready' as const : 'pending' as const }
  })
  return { ...plan, tasks }
}

export function listReadyTasks(plan: OrchestrationPlan): OrchestrationTask[] {
  return recomputeReadyStatuses(plan).tasks.filter((t) => t.status === 'ready')
}

export function markTaskStatus(
  plan: OrchestrationPlan,
  taskId: string,
  status: OrchestrationTaskStatus,
  extra?: Partial<Pick<OrchestrationTask, 'summary' | 'acceptResults' | 'retries'>>,
): OrchestrationPlan {
  const tasks = plan.tasks.map((t) =>
    t.id === taskId ? { ...t, status, ...extra } : t,
  )
  return recomputeReadyStatuses({ ...plan, tasks })
}

export function allTasksTerminal(plan: OrchestrationPlan): boolean {
  return plan.tasks.every(
    (t) => t.status === 'done' || t.status === 'failed' || t.status === 'skipped',
  )
}

export function formatPlanValidationErrors(errors: PlanValidationError[]): string {
  return errors.map((e) => e.message).join('; ')
}

/**
 * When a plan is installed, only dependency-ready tasks may be dispatched
 * (recruit / reassign). Free-form names not in the plan are allowed.
 * No plan → allow (legacy free-form orchestration).
 */
/**
 * Apply a worker completion (done/failed) onto the installed plan by function
 * name. Unlocks dependents via recomputeReadyStatuses. Pure — used by the store
 * and unit tests so multi-wave DAGs stay in sync with worker results.
 */
export function applyWorkerResultToPlan(
  plan: OrchestrationPlan | null | undefined,
  functionName: string,
  status: 'done' | 'failed',
  summary?: string,
): OrchestrationPlan | null {
  if (!plan?.tasks?.length) return plan ?? null
  const want = functionName.trim().toLowerCase()
  if (!want) return plan
  const base = normalizeFunctionId(want)
  const task = plan.tasks.find((t) => {
    const id = t.id.toLowerCase()
    const name = t.name.toLowerCase()
    return id === want || name === want
      || normalizeFunctionId(id) === base
      || normalizeFunctionId(name) === base
  })
  if (!task) return plan
  return markTaskStatus(plan, task.id, status, summary ? { summary } : undefined)
}

export function canDispatchTask(
  plan: OrchestrationPlan | null | undefined,
  functionName: string,
): { allow: true } | { allow: false; reason: string } {
  if (!plan || !plan.tasks?.length) return { allow: true }
  const want = functionName.trim().toLowerCase()
  if (!want) return { allow: false, reason: 'Function name is required when a plan is installed' }
  const base = normalizeFunctionId(want)
  const task = plan.tasks.find((t) => {
    const id = t.id.toLowerCase()
    const name = t.name.toLowerCase()
    return id === want || name === want || normalizeFunctionId(id) === base || normalizeFunctionId(name) === base
  })
  if (!task) {
    // Name not in plan — free-form side task still allowed
    return { allow: true }
  }
  const live = recomputeReadyStatuses(plan)
  const liveTask = live.tasks.find((t) => t.id === task.id)
  if (!liveTask) return { allow: true }
  if (liveTask.status === 'ready' || liveTask.status === 'running') {
    return { allow: true }
  }
  if (liveTask.status === 'done' || liveTask.status === 'failed') {
    // Follow-up reassign on finished plan task is allowed
    return { allow: true }
  }
  const unmet = liveTask.deps.filter((d) => {
    const dep = live.tasks.find((t) => t.id === d)
    return !dep || dep.status !== 'done'
  })
  return {
    allow: false,
    reason:
      `Task "${liveTask.id}" is not ready (status=${liveTask.status}). `
      + (unmet.length ? `Unmet deps: ${unmet.join(', ')}. ` : '')
      + `Dispatch only ready tasks (see orquestra plan-status).`,
  }
}
