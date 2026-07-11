import { describe, expect, it } from 'vitest'
import { applyRoleTemplate, buildContractsMarkdown, buildRoleMarkdown, buildSpecMarkdown, ROLE_TEMPLATES } from './blackboard'
import { validatePlan } from './plan'

describe('blackboard + templates', () => {
  it('builds SPEC and CONTRACTS from a generic plan', () => {
    const v = validatePlan({
      version: 1,
      goal: 'Refactor authentication module',
      tasks: [
        { id: 'scout', role: 'Scout auth module files only', deps: [] },
        { id: 'impl', role: 'Implement auth fixes only', deps: ['scout'] },
      ],
    })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const spec = buildSpecMarkdown(v.plan)
    const contracts = buildContractsMarkdown(v.plan)
    expect(spec).toContain('Refactor authentication module')
    expect(spec).toContain('scout')
    expect(contracts).toContain('impl')
    const role = buildRoleMarkdown({ functionName: 'impl', role: 'Implement auth fixes only', plan: v.plan })
    expect(role).toContain('SPEC.md')
    expect(role).toContain('ORQUESTRA_WORKER_DONE')
  })

  it('applies known role templates', () => {
    expect(ROLE_TEMPLATES['review.diff']).toBeTruthy()
    const { role, templateId } = applyRoleTemplate('review.diff', 'Check the API PR for regressions')
    expect(templateId).toBe('review.diff')
    expect(role.toLowerCase()).toMatch(/review/)
  })
})
