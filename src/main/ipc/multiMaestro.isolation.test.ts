/**
 * Multi-Maestro control-plane isolation — exercises shipped terminal.ts helpers.
 * Proves two runs with the same worker name do not share result paths, and
 * cascade of run A does not touch workers of run B.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('node-pty', () => ({ spawn: vi.fn() }))
vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
  clipboard: { writeText: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}))
vi.mock('./pathValidation', () => ({
  validateCwd: (p: string) => p,
  validatePathStrict: async () => {},
}))
vi.mock('./terminalLogger', () => ({
  getOrCreateLogger: () => ({ append: () => {}, flush: () => {}, readAll: () => '' }),
  removeLogger: () => {},
  flushAll: () => {},
  disposeAll: () => {},
  TerminalLogger: { getLogDir: () => os.tmpdir() },
}))
vi.mock('../windowRegistry', () => ({
  sendToWindow: vi.fn(),
  windowFromEvent: () => null,
  onWindowClosed: vi.fn(),
}))
vi.mock('../settingsFile', () => ({
  getAllSettings: () => ({
    orchestrationMultiMaestro: true,
    orchestrationMaxWorkers: 4,
  }),
}))
vi.mock('../maestro/maestroAssets', () => ({
  resolveMaestroCliDir: () => null,
  checkMaestroAssets: () => ({ ok: true, cliDir: '', extensionDir: '', missing: [] }),
}))
vi.mock('../maestro/claudeLocalManaged', () => ({
  mergeMaestroIntoClaudeLocal: (a: string, b: string) => a + b,
  removeMaestroFromClaudeLocal: () => null,
}))
vi.mock('../maestro/maestroInstructions', () => ({
  buildMaestroInstructions: () => '# maestro',
  buildMaestroSettingsSnapshot: () => ({}),
}))
vi.mock('../runtime/runtimeManager', () => ({
  runtimes: { resolve: () => null },
}))
vi.mock('../runtime/locator', () => ({
  parseLocator: () => null,
}))
vi.mock('../perf/perfMonitor', () => ({
  countTerminalData: () => {},
}))
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  cascadeOrchestratorWorkers,
  trackWorker,
  writeWorkerResultFile,
  generateOrchestrationRunId,
  upsertMaestroRegistryEntry,
  readMaestroRegistry,
} from './terminal'
import { runWorkerResultPathRelative, absFromWorkspace } from '../../shared/orchestration/runFiles'
import { shouldCascadeWorker, workerResultKey } from '../../shared/orchestration/multiMaestroPolicy'

describe('multi-Maestro isolation (shipped main helpers)', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-multi-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch { /* ignore */ }
  })

  it('writeWorkerResultFile: same worker name under two runs → different files on disk', () => {
    const runA = 'run-aaa111'
    const runB = 'run-bbb222'
    writeWorkerResultFile(tmp, {
      workerName: 'logger',
      workerRole: 'role-a',
      status: 'done',
      summary: 'from A',
      timestamp: Date.now(),
      exitCode: 0,
      runId: runA,
    })
    writeWorkerResultFile(tmp, {
      workerName: 'logger',
      workerRole: 'role-b',
      status: 'running',
      summary: 'from B',
      timestamp: Date.now(),
      exitCode: null,
      runId: runB,
    })

    const pathA = absFromWorkspace(tmp, runWorkerResultPathRelative(runA, 'logger')).replace(/\//g, path.sep)
    const pathB = absFromWorkspace(tmp, runWorkerResultPathRelative(runB, 'logger')).replace(/\//g, path.sep)
    expect(pathA).not.toBe(pathB)
    expect(fs.existsSync(pathA)).toBe(true)
    expect(fs.existsSync(pathB)).toBe(true)
    const a = JSON.parse(fs.readFileSync(pathA, 'utf-8'))
    const b = JSON.parse(fs.readFileSync(pathB, 'utf-8'))
    expect(a.summary).toBe('from A')
    expect(b.summary).toBe('from B')
    expect(a.runId).toBe(runA)
    expect(b.runId).toBe(runB)
    // Multi mode must NOT overwrite a shared flat file
    expect(workerResultKey(runA, 'logger')).not.toBe(workerResultKey(runB, 'logger'))
  })

  it('cascadeOrchestratorWorkers for maestro A does not remove workers of run B', () => {
    const runA = generateOrchestrationRunId()
    const runB = generateOrchestrationRunId()
    trackWorker('worker-pty-a', 'maestro-pty-a', 'logger', 'role A', tmp, runA)
    trackWorker('worker-pty-b', 'maestro-pty-b', 'logger', 'role B', tmp, runB)

    cascadeOrchestratorWorkers('maestro-pty-a', 'disabled', runA)

    // B still tracked (cascade only A)
    // trackWorker stores in module map — re-import list via track then cascade
    // After cascade A, writing result for B should still work (B tracking may remain)
    // We verify via result files: A's logger failed, B's logger still running
    const pathA = absFromWorkspace(tmp, runWorkerResultPathRelative(runA, 'logger')).replace(/\//g, path.sep)
    const pathB = absFromWorkspace(tmp, runWorkerResultPathRelative(runB, 'logger')).replace(/\//g, path.sep)
    expect(fs.existsSync(pathA)).toBe(true)
    expect(fs.existsSync(pathB)).toBe(true)
    const a = JSON.parse(fs.readFileSync(pathA, 'utf-8'))
    const b = JSON.parse(fs.readFileSync(pathB, 'utf-8'))
    expect(a.status).toBe('failed')
    expect(b.status).toBe('running')
    expect(b.summary).toMatch(/recruited|running|waiting/i)
  })

  it('shouldCascadeWorker is used for run isolation (policy)', () => {
    expect(
      shouldCascadeWorker({
        workerRunId: 'r1',
        workerOrchestratorId: 'p1',
        targetRunId: 'r2',
        targetOrchestratorId: 'p2',
      }),
    ).toBe(false)
  })

  it('upsertMaestroRegistryEntry keeps one run per maestro PTY (re-arm replaces stale)', () => {
    upsertMaestroRegistryEntry(tmp, {
      runId: 'run-old',
      maestroPtyId: 'rpty-1',
      panelId: 'panel-a',
      workspacePath: tmp,
      createdAt: 1,
      updatedAt: 1,
    })
    upsertMaestroRegistryEntry(tmp, {
      runId: 'run-new',
      maestroPtyId: 'rpty-1',
      panelId: 'panel-a',
      workspacePath: tmp,
      createdAt: 2,
      updatedAt: 2,
    })
    upsertMaestroRegistryEntry(tmp, {
      runId: 'run-b',
      maestroPtyId: 'rpty-2',
      panelId: 'panel-b',
      workspacePath: tmp,
      createdAt: 3,
      updatedAt: 3,
    })
    const reg = readMaestroRegistry(tmp)
    expect(reg.runs).toHaveLength(2)
    expect(reg.runs.find((r) => r.maestroPtyId === 'rpty-1')?.runId).toBe('run-new')
    expect(reg.runs.find((r) => r.runId === 'run-old')).toBeUndefined()
    expect(reg.runs.find((r) => r.maestroPtyId === 'rpty-2')?.runId).toBe('run-b')
  })
})
