// =============================================================================
// Build plan skeletons from orchestration settings + user text (pure).
// Domain-generic: does not hardcode product domains beyond light heuristics.
// =============================================================================

import { inferAcceptFromRole } from './accept'
import { recomputeReadyStatuses, validatePlan } from './plan'
import type { OrchestrationPlan, OrchestrationTask } from './types'

export type TaskSplitStrategy = 'auto' | 'by-task' | 'by-file' | 'by-stage'
export type ReviewPolicy = 'never' | 'always' | 'on-changes'
export type ContextPolicy = 'summary' | 'relevant-files' | 'full'

export interface PlanBuilderSettings {
  taskSplitStrategy?: TaskSplitStrategy
  reviewPolicy?: ReviewPolicy
  contextPolicy?: ContextPolicy
  maxWorkers?: number
}

export interface PlanBuilderInput {
  goal: string
  settings?: PlanBuilderSettings
  /** Optional known file paths from workspace for relevant-files context */
  relevantFiles?: string[]
}

function task(
  id: string,
  role: string,
  deps: string[] = [],
): OrchestrationTask {
  return {
    id,
    name: id,
    role: role.slice(0, 220),
    deps,
    status: 'pending',
    accept: inferAcceptFromRole(role),
  }
}

/** Split user text into chunk roles by common separators (language-agnostic-ish). */
export function splitGoalIntoParts(goal: string): string[] {
  const g = goal.trim()
  if (!g) return []
  // bullets / numbered
  const bullet = g.split(/\n+/).map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter((l) => l.length > 12)
  if (bullet.length >= 2) return bullet.slice(0, 8)

  // conjunctions (pt/en)
  const conj = g.split(/\s+(?:e|and|then|depois|,|;)\s+/i).map((s) => s.trim()).filter((s) => s.length > 12)
  if (conj.length >= 2) return conj.slice(0, 8)

  return [g]
}

/** Extract path-like tokens for by-file split. */
export function extractFileHints(goal: string): string[] {
  const re = /\b([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)\b/g
  const out: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(goal)) !== null) {
    const p = m[1]
    if (p.includes('://')) continue
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length >= 6) break
  }
  return out
}

function byFileTasks(goal: string): OrchestrationTask[] {
  const files = extractFileHints(goal)
  if (files.length === 0) {
    return [task('impl', `Implement the request: ${goal.slice(0, 160)}`)]
  }
  return files.map((f, i) => {
    const id = f.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || `file-${i + 1}`
    return task(id, `Work only on ${f} for: ${goal.slice(0, 100)}. Do not own other files.`)
  })
}

function byTaskTasks(goal: string): OrchestrationTask[] {
  const parts = splitGoalIntoParts(goal)
  return parts.map((part, i) => {
    const id = `task-${i + 1}`
    return task(id, part.slice(0, 200))
  })
}

function byStageTasks(goal: string): OrchestrationTask[] {
  const g = goal.slice(0, 120)
  return [
    task('scout', `Scout the codebase for: ${g}. Summarize relevant files; do not implement yet.`, []),
    task('implement', `Implement: ${g}. Follow scout findings if present.`, ['scout']),
    task('test', `Add or run verification for: ${g}.`, ['implement']),
    task('review', `Review implement+test for: ${g}. List issues; prefer not to rewrite everything.`, ['implement', 'test']),
  ]
}

function autoTasks(goal: string): OrchestrationTask[] {
  const files = extractFileHints(goal)
  if (files.length >= 2) return byFileTasks(goal)
  const parts = splitGoalIntoParts(goal)
  if (parts.length >= 2) return byTaskTasks(goal)
  // Single blob: one implement task (caller may still add review)
  return [task('impl', goal.slice(0, 200))]
}

export function buildPlanFromSettings(input: PlanBuilderInput): OrchestrationPlan {
  const strategy = input.settings?.taskSplitStrategy ?? 'auto'
  const maxWorkers = Math.max(1, Math.floor(input.settings?.maxWorkers || 8))
  let tasks: OrchestrationTask[]
  switch (strategy) {
    case 'by-file':
      tasks = byFileTasks(input.goal)
      break
    case 'by-task':
      tasks = byTaskTasks(input.goal)
      break
    case 'by-stage':
      tasks = byStageTasks(input.goal)
      break
    case 'auto':
    default:
      tasks = autoTasks(input.goal)
      break
  }

  // Cap task count to maxWorkers (drop extras from the end, keep order)
  if (tasks.length > maxWorkers) {
    tasks = tasks.slice(0, maxWorkers)
    // Fix deps pointing to removed ids
    const keep = new Set(tasks.map((t) => t.id))
    tasks = tasks.map((t) => ({ ...t, deps: t.deps.filter((d) => keep.has(d)) }))
  }

  const review = input.settings?.reviewPolicy ?? 'on-changes'
  if (review === 'always') {
    const implIds = tasks.map((t) => t.id)
    if (!tasks.some((t) => t.id === 'review')) {
      tasks.push(
        task(
          'review',
          `Review all worker outputs for: ${input.goal.slice(0, 100)}. Report issues; do not re-implement everything.`,
          implIds,
        ),
      )
    }
  }

  // Context policy annotation on roles (relevant files list)
  const ctx = input.settings?.contextPolicy ?? 'relevant-files'
  if (ctx === 'relevant-files' && input.relevantFiles && input.relevantFiles.length > 0) {
    const list = input.relevantFiles.slice(0, 8).join(', ')
    tasks = tasks.map((t) => ({
      ...t,
      role: `${t.role} Relevant files: ${list}.`.slice(0, 220),
    }))
  } else if (ctx === 'full') {
    tasks = tasks.map((t) => ({
      ...t,
      role: `${t.role} Use full run context under .orquestra/runs/ when needed.`.slice(0, 220),
    }))
  }

  const plan: OrchestrationPlan = {
    version: 1,
    id: `run-${Date.now()}`,
    goal: input.goal.trim() || 'Untitled run',
    createdAt: Date.now(),
    tasks,
  }
  const validated = validatePlan(plan)
  if (!validated.ok) {
    // Should not happen for builder output; fall back to single task
    return recomputeReadyStatuses({
      version: 1,
      id: plan.id,
      goal: plan.goal,
      createdAt: plan.createdAt,
      tasks: [task('impl', input.goal.slice(0, 200))],
    })
  }
  return recomputeReadyStatuses(validated.plan)
}
