import { describe, expect, it } from 'vitest'
import { buildPlanFromSettings, extractFileHints, splitGoalIntoParts } from './planBuilder'
import { listReadyTasks } from './plan'

describe('planBuilder from settings', () => {
  it('by-file creates a task per path hint', () => {
    const plan = buildPlanFromSettings({
      goal: 'Update src/a.ts and src/b.ts for the feature',
      settings: { taskSplitStrategy: 'by-file', maxWorkers: 4, reviewPolicy: 'never' },
    })
    expect(plan.tasks.length).toBeGreaterThanOrEqual(2)
    expect(extractFileHints(plan.goal).length).toBeGreaterThanOrEqual(2)
  })

  it('by-stage creates scout→implement pipeline with ready only on scout', () => {
    const plan = buildPlanFromSettings({
      goal: 'Add rate limiting to the public API',
      settings: { taskSplitStrategy: 'by-stage', reviewPolicy: 'never', maxWorkers: 8 },
    })
    const ids = plan.tasks.map((t) => t.id)
    expect(ids).toContain('scout')
    expect(ids).toContain('implement')
    const ready = listReadyTasks(plan).map((t) => t.id)
    expect(ready).toEqual(['scout'])
  })

  it('reviewPolicy always appends review task', () => {
    const plan = buildPlanFromSettings({
      goal: 'Ship the onboarding wizard end to end',
      settings: { taskSplitStrategy: 'auto', reviewPolicy: 'always', maxWorkers: 6 },
    })
    expect(plan.tasks.some((t) => t.id === 'review')).toBe(true)
    const review = plan.tasks.find((t) => t.id === 'review')!
    expect(review.deps.length).toBeGreaterThan(0)
  })

  it('splits multi-part goals', () => {
    const parts = splitGoalIntoParts('Implement login and add password reset and write docs')
    expect(parts.length).toBeGreaterThanOrEqual(2)
  })

  it('attaches relevant files when context policy says so', () => {
    const plan = buildPlanFromSettings({
      goal: 'Refactor the parser module',
      settings: { contextPolicy: 'relevant-files', reviewPolicy: 'never' },
      relevantFiles: ['src/parser/index.ts', 'src/parser/lex.ts'],
    })
    expect(plan.tasks[0].role).toMatch(/parser/)
  })
})
