import { describe, expect, it } from 'vitest'
import {
  allTasksTerminal,
  applyWorkerResultToPlan,
  canDispatchTask,
  findPlanCycle,
  formatPlanValidationErrors,
  listReadyTasks,
  markTaskStatus,
  recomputeReadyStatuses,
  validatePlan,
} from './plan'

describe('orchestration plan DAG', () => {
  it('rejects empty and cyclic plans', () => {
    expect(validatePlan(null).ok).toBe(false)
    expect(validatePlan({ version: 1, tasks: [] }).ok).toBe(false)

    const cyclic = validatePlan({
      version: 1,
      goal: 'x',
      tasks: [
        { id: 'a', role: 'Do task A fully and carefully', deps: ['b'] },
        { id: 'b', role: 'Do task B fully and carefully', deps: ['a'] },
      ],
    })
    expect(cyclic.ok).toBe(false)
    if (!cyclic.ok) {
      expect(cyclic.errors.some((e) => e.code === 'cycle')).toBe(true)
      expect(formatPlanValidationErrors(cyclic.errors)).toMatch(/cycle/i)
    }
  })

  it('rejects duplicate ids and overlong roles', () => {
    const dup = validatePlan({
      version: 1,
      tasks: [
        { id: 'a', role: 'Do task A fully and carefully', deps: [] },
        { id: 'a', role: 'Do task A again carefully here', deps: [] },
      ],
    })
    expect(dup.ok).toBe(false)

    const longRole = 'x'.repeat(300)
    const long = validatePlan({
      version: 1,
      tasks: [{ id: 'a', role: longRole, deps: [] }],
    })
    expect(long.ok).toBe(false)
  })

  it('marks only dependency-ready tasks as ready', () => {
    const validated = validatePlan({
      version: 1,
      goal: 'Build feature',
      tasks: [
        { id: 'api', role: 'Implement API endpoints only for the feature', deps: [] },
        { id: 'ui', role: 'Implement UI screens only for the feature', deps: ['api'] },
        { id: 'docs', role: 'Write docs only after API and UI land', deps: ['api', 'ui'] },
      ],
    })
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    let plan = recomputeReadyStatuses(validated.plan)
    expect(listReadyTasks(plan).map((t) => t.id)).toEqual(['api'])
    expect(plan.tasks.find((t) => t.id === 'ui')?.status).toBe('pending')

    plan = markTaskStatus(plan, 'api', 'done', { summary: 'API ok' })
    expect(listReadyTasks(plan).map((t) => t.id).sort()).toEqual(['ui'])
    plan = markTaskStatus(plan, 'ui', 'done')
    expect(listReadyTasks(plan).map((t) => t.id)).toEqual(['docs'])
    plan = markTaskStatus(plan, 'docs', 'done')
    expect(allTasksTerminal(plan)).toBe(true)
  })

  it('findPlanCycle returns null for acyclic graphs', () => {
    expect(
      findPlanCycle([
        { id: 'a', name: 'a', role: 'a', deps: [], status: 'pending' },
        { id: 'b', name: 'b', role: 'b', deps: ['a'], status: 'pending' },
      ]),
    ).toBeNull()
  })

  it('canDispatchTask only allows ready (or finished) plan tasks', () => {
    const validated = validatePlan({
      version: 1,
      goal: 'feature',
      tasks: [
        { id: 'api', role: 'Implement API handlers carefully now', deps: [] },
        { id: 'ui', role: 'Implement UI screens carefully now', deps: ['api'] },
      ],
    })
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    const plan = recomputeReadyStatuses(validated.plan)
    expect(canDispatchTask(null, 'ui').allow).toBe(true)
    expect(canDispatchTask(plan, 'api').allow).toBe(true)
    expect(canDispatchTask(plan, 'ui').allow).toBe(false)
    if (canDispatchTask(plan, 'ui').allow === false) {
      expect(canDispatchTask(plan, 'ui').reason).toMatch(/not ready|Unmet deps/i)
    }
    const afterApi = markTaskStatus(plan, 'api', 'done')
    expect(canDispatchTask(afterApi, 'ui').allow).toBe(true)
    // free-form name not in plan
    expect(canDispatchTask(plan, 'docs').allow).toBe(true)
  })

  it('applyWorkerResultToPlan unlocks dependents (same path as worker status IPC)', () => {
    const validated = validatePlan({
      version: 1,
      goal: 'Ship invoice export',
      tasks: [
        { id: 'api', role: 'Implement invoice export API handlers only', deps: [] },
        { id: 'ui', role: 'Implement invoice export UI only', deps: ['api'] },
        { id: 'tests', role: 'Add tests for invoice export only', deps: ['api', 'ui'] },
      ],
    })
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    let plan = recomputeReadyStatuses(validated.plan)
    expect(canDispatchTask(plan, 'ui').allow).toBe(false)

    // Worker "api" finished (accept ok) — same helper the store/IPC must call
    plan = applyWorkerResultToPlan(plan, 'api', 'done', 'API complete | accept=2/2')!
    expect(plan.tasks.find((t) => t.id === 'api')?.status).toBe('done')
    expect(canDispatchTask(plan, 'ui').allow).toBe(true)
    expect(listReadyTasks(plan).map((t) => t.id)).toContain('ui')
    expect(canDispatchTask(plan, 'tests').allow).toBe(false)

    plan = applyWorkerResultToPlan(plan, 'ui', 'done')!
    expect(canDispatchTask(plan, 'tests').allow).toBe(true)
  })
})
