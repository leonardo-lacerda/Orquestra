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
    expect(instructions).toContain('Maximum workers (HARD CEILING, not a target): 3')
    expect(instructions).toContain('Workers may use network tools: NO')
    expect(instructions).toContain('Workers may recruit nested workers: NO')
    expect(instructions).toContain('Never exceed 3 open worker panels')
    expect(instructions).toContain('PLAN FUNCTIONS BEFORE ANY RECRUIT')
    expect(instructions).toContain('HARD CEILING')
    expect(instructions).toContain('Create only index.html')
  })

  it('forces plan-first function table, unique short roles, and no self-implement', () => {
    const instructions = buildMaestroInstructions({
      ...DEFAULT_SETTINGS,
      orchestrationMode: 'assisted',
    })
    expect(instructions).toContain('Mode: assisted')
    expect(instructions).toContain('You are the ORCHESTRATOR')
    expect(instructions).toContain('PLAN FUNCTIONS BEFORE ANY RECRUIT')
    expect(instructions).toMatch(/function/i)
    expect(instructions).toContain('--name is REQUIRED')
    expect(instructions).toContain('--name html')
    expect(instructions).toMatch(/UNIQUE|unique/)
    expect(instructions).toMatch(/Self-implement is FORBIDDEN|do NOT write those files yourself/i)
    expect(instructions).toMatch(/reassign/i)
    expect(instructions).toMatch(/REUSE WORKERS|REUSES the panel/i)
    expect(instructions).toMatch(/COMPLETION/i)
    expect(instructions).toMatch(/DISMISS|dismiss/i)
    expect(instructions).toContain('node orquestra.js dismiss')
    expect(instructions).toMatch(/do not leave dead terminals|CLEANUP|canvas clean/i)
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
