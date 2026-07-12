import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { buildMaestroInstructions, buildMaestroSettingsSnapshot } from './maestroInstructions'

describe('maestroInstructions', () => {
  it('includes orchestration limits and permissions', () => {
    const instructions = buildMaestroInstructions({
      ...DEFAULT_SETTINGS,
      orchestrationMode: 'auto',
      orchestrationMaxWorkers: 3,
      orchestrationAllowNetwork: false,
      orchestrationAllowNestedWorkers: false,
    })

    expect(instructions).toContain('Mode: auto')
    expect(instructions).toMatch(/Maximum worker POOL size.*HARD CEILING/)
    expect(instructions).toContain('3')
    expect(instructions).toContain('Workers may use network tools: NO')
    expect(instructions).toContain('Workers may recruit nested workers: NO')
    expect(instructions).toContain('Never exceed 3 open worker panels')
    expect(instructions).toContain('PLAN TASKS')
    expect(instructions).toContain('HARD CEILING')
    expect(instructions).toMatch(/Plan ONLY from the user|derived from THIS user/i)
    // Must not bake a calculator/landing default plan into the system prompt.
    expect(instructions).not.toMatch(/calculator landing|calc demo|pricing, footer/i)
    expect(instructions).not.toContain('Create only index.html: hero, features')
  })

  it('describes pool + reassign + queue, not one terminal per function forever', () => {
    const instructions = buildMaestroInstructions({
      ...DEFAULT_SETTINGS,
      orchestrationMode: 'assisted',
      orchestrationDispatchMode: 'pool_queue',
      orchestrationAutoDrainQueue: true,
    })
    expect(instructions).toContain('Mode: assisted')
    expect(instructions).toMatch(/You are (the ORCHESTRATOR|A Maestro)/)
    expect(instructions).toContain('PLAN TASKS')
    expect(instructions).toMatch(/REUSABLE POOL|worker POOL|pool \+ queue/i)
    expect(instructions).toMatch(/QUEUE of tasks|task queue|Queued/i)
    expect(instructions).toMatch(/reassign/i)
    expect(instructions).toMatch(/Reassign is the DEFAULT|reassign-first/i)
    // Old hard model must not remain the primary rule
    expect(instructions).not.toContain('One worker = one FUNCTION (file/ownership boundary)')
    expect(instructions).not.toContain('PLAN FUNCTIONS BEFORE ANY RECRUIT')
    expect(instructions).toContain('--name and --role REQUIRED')
    expect(instructions).toMatch(/Self-implement is FORBIDDEN|do NOT write those files yourself/i)
    expect(instructions).toMatch(/POOL \+ QUEUE \+ REUSE|REUSES the panel/i)
    expect(instructions).toMatch(/COMPLETION/i)
    expect(instructions).toMatch(/DISMISS|dismiss/i)
    expect(instructions).toContain('node .orquestra/cli/orquestra.cjs dismiss')
    expect(instructions).toMatch(/Preferred pool loop|recruit --name w1/i)
    expect(instructions).toMatch(/do not invent new names to bypass|do not bypass with a new --name/i)
    expect(instructions).toMatch(/NEVER default to html\/css\/js|canned demo plan/i)
    expect(instructions).toContain('Dispatch mode: pool_queue')
    expect(instructions).toContain('Auto-drain queue when a worker finishes: yes')
    expect(instructions).toMatch(/Max worker --role length.*1000/)
    expect(instructions).toMatch(/short task for THAT worker only|--role is the short task/i)
    // Multi must NOT embed a concrete runId= (would steal the other Maestro)
    expect(instructions).not.toMatch(/^runId=run-/m)
    expect(instructions).toMatch(/ORQUESTRA_RUN_ID/)
    expect(instructions).toMatch(/SHARED by all Maestros|does NOT contain your run id/i)
  })

  it('single-maestro may embed concrete runId in instructions', () => {
    const instructions = buildMaestroInstructions(
      { ...DEFAULT_SETTINGS, orchestrationMultiMaestro: false },
      { runId: 'run-only-one', multiMaestro: false },
    )
    expect(instructions).toContain('runId=run-only-one')
    expect(instructions).toContain('--run run-only-one')
  })

  it('builds a crown marker settings snapshot', () => {
    const snapshot = buildMaestroSettingsSnapshot({
      ...DEFAULT_SETTINGS,
      orchestrationMode: 'manual',
      orchestrationMaxWorkers: 2,
      orchestrationDefaultWorkerKind: 'agent',
      orchestrationAllowFileEdits: false,
    })

    expect(snapshot.mode).toBe('manual')
    expect(snapshot.maxWorkers).toBe(2)
    expect(snapshot.defaultWorkerKind).toBe('agent')
    expect(snapshot.permissions.fileEdits).toBe(false)
    expect(snapshot.permissionMode).toBe('ask')
    expect(snapshot.effectiveAgentCommand).toBe('verboo')
  })

  it('documents bypass permission mode and effective launch command per AI', () => {
    const verboo = {
      ...DEFAULT_SETTINGS,
      orchestrationDefaultWorkerAgent: 'verboo' as const,
      orchestrationPermissionMode: 'bypass' as const,
    }
    const instructions = buildMaestroInstructions(verboo)
    expect(instructions).toContain('Worker tool permission mode: bypass')
    expect(instructions).toContain('Default worker AI: verboo')
    expect(instructions).toContain('Effective worker launch command: verboo --dangerously-skip-permissions')

    const snap = buildMaestroSettingsSnapshot(verboo)
    expect(snap.permissionMode).toBe('bypass')
    expect(snap.defaultWorkerAgent).toBe('verboo')
    expect(snap.effectiveAgentCommand).toBe('verboo --dangerously-skip-permissions')

    const codexSnap = buildMaestroSettingsSnapshot({
      ...DEFAULT_SETTINGS,
      orchestrationDefaultWorkerAgent: 'codex',
      orchestrationPermissionMode: 'bypass',
    })
    expect(codexSnap.effectiveAgentCommand).toBe(
      'codex --dangerously-bypass-approvals-and-sandbox',
    )
  })
})
