/**
 * Path helpers for multi-Maestro run layout.
 */
import { describe, expect, it } from 'vitest'
import {
  absFromWorkspace,
  claudeLocalRelative,
  cliCjsRelative,
  cliDirRelative,
  cliInvokeRelative,
  legacyCommandsDirRelative,
  legacyResultsDirRelative,
  registryPathRelative,
  runCommandsDirRelative,
  runCrownPathRelative,
  runDirRelative,
  runQueuePathRelative,
  runResultsDirRelative,
  runWorkerResultPathRelative,
  ultraLegacyCommandsDirRelative,
  ultraLegacyResultsDirRelative,
  workerRolePathRelative,
  safeOrquestraSegment,
} from './runFiles'

describe('runFiles multi-Maestro paths', () => {
  it('runDirRelative / crown / commands / results round-trip under runs/{id}', () => {
    const runId = 'run-abc-123'
    expect(runDirRelative(runId)).toBe('.orquestra/runs/run-abc-123')
    expect(runCrownPathRelative(runId)).toBe('.orquestra/runs/run-abc-123/crown.json')
    expect(runCommandsDirRelative(runId)).toBe('.orquestra/runs/run-abc-123/commands')
    expect(runResultsDirRelative(runId)).toBe('.orquestra/runs/run-abc-123/results')
    expect(registryPathRelative()).toBe('.orquestra/registry.json')
  })

  it('hub layout: CLI, flat commands/results, CLAUDE.local all under .orquestra/', () => {
    expect(cliDirRelative()).toBe('.orquestra/cli')
    expect(cliCjsRelative()).toBe('.orquestra/cli/orquestra.cjs')
    expect(cliInvokeRelative()).toBe('node .orquestra/cli/orquestra.cjs')
    expect(legacyCommandsDirRelative()).toBe('.orquestra/commands')
    expect(legacyResultsDirRelative()).toBe('.orquestra/results')
    expect(claudeLocalRelative()).toBe('.orquestra/CLAUDE.local.md')
    // Ultra-legacy root paths still exported for read fallback
    expect(ultraLegacyCommandsDirRelative()).toBe('.orquestra-commands')
    expect(ultraLegacyResultsDirRelative()).toBe('.orquestra-results')
  })

  it('same worker name under two runs → distinct result + ROLE paths', () => {
    const a = runWorkerResultPathRelative('run-aaa', 'logger')
    const b = runWorkerResultPathRelative('run-bbb', 'logger')
    expect(a).toBe('.orquestra/runs/run-aaa/results/worker-logger.json')
    expect(b).toBe('.orquestra/runs/run-bbb/results/worker-logger.json')
    expect(a).not.toBe(b)
    expect(workerRolePathRelative('run-aaa', 'logger')).not.toBe(
      workerRolePathRelative('run-bbb', 'logger'),
    )
  })

  it('safeOrquestraSegment strips path traversal', () => {
    expect(safeOrquestraSegment('../evil')).not.toContain('..')
    expect(safeOrquestraSegment('a/b\\c')).not.toMatch(/[/\\]/)
  })

  it('absFromWorkspace joins without double slashes', () => {
    expect(absFromWorkspace('/ws/', '.orquestra/runs/r1/crown.json')).toBe(
      '/ws/.orquestra/runs/r1/crown.json',
    )
  })

  it('runQueuePathRelative is run-scoped', () => {
    expect(runQueuePathRelative('run-aaa')).toBe('.orquestra/runs/run-aaa/queue.json')
    expect(runQueuePathRelative('run-aaa')).not.toBe(runQueuePathRelative('run-bbb'))
  })
})
