import { describe, expect, it } from 'vitest'
import {
  evaluateMaestroWritePolicy,
  formatPolicyViolations,
  isDeliverablePath,
  resolveAgentCommandForTemplate,
} from './maestroPolicy'

describe('maestro write policy', () => {
  it('allows orquestra control paths and flags deliverables', () => {
    expect(isDeliverablePath('.orquestra/runs/latest.json')).toBe(false)
    expect(isDeliverablePath('src/app.ts')).toBe(true)

    const ok = evaluateMaestroWritePolicy(['.orquestra/runs/x/plan.json'], { activeRun: true })
    expect(ok.ok).toBe(true)

    const bad = evaluateMaestroWritePolicy(['styles.css', 'src/main.ts'], { activeRun: true })
    expect(bad.ok).toBe(false)
    expect(formatPolicyViolations(bad.violations)).toMatch(/styles\.css/)
  })

  it('skips checks when no active run', () => {
    const r = evaluateMaestroWritePolicy(['src/app.ts'], { activeRun: false })
    expect(r.ok).toBe(true)
  })

  it('resolves agent command by template mapping', () => {
    expect(
      resolveAgentCommandForTemplate('review.diff', { 'review.diff': 'claude' }, 'verboo'),
    ).toBe('claude')
    expect(resolveAgentCommandForTemplate('unknown', {}, 'verboo')).toBe('verboo')
  })
})
