import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  installPlanOnDisk,
  readLatestRunSnapshot,
  readPlanFromDisk,
  writeLatestRunSnapshot,
} from './runStateFile'
import { createEmptyRunSnapshot } from '../../shared/orchestration'

const dirs: string[] = []

afterEach(() => {
  for (const d of dirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

describe('runStateFile', () => {
  it('writes and reloads latest snapshot', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-run-'))
    dirs.push(root)
    const snap = createEmptyRunSnapshot('run-test')
    snap.namesByPanelId = { p1: 'api' }
    snap.workers = [{
      panelId: 'p1',
      name: 'api',
      role: 'Implement API only carefully',
      status: 'done',
      maestroPtyId: 'm1',
      updatedAt: Date.now(),
    }]
    writeLatestRunSnapshot(root, snap)
    const loaded = readLatestRunSnapshot(root)
    expect(loaded?.namesByPanelId.p1).toBe('api')
    expect(loaded?.workers[0]?.name).toBe('api')
  })

  it('installs plan + blackboard and reloads plan', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-plan-'))
    dirs.push(root)
    const res = installPlanOnDisk(root, {
      version: 1,
      goal: 'Ship billing invoices export',
      tasks: [
        { id: 'export', role: 'Implement invoice export only', deps: [] },
        { id: 'tests', role: 'Add tests for invoice export only', deps: ['export'] },
      ],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const plan = readPlanFromDisk(root, res.plan.id)
    expect(plan?.tasks.map((t) => t.id).sort()).toEqual(['export', 'tests'])
    const spec = path.join(root, '.orquestra', 'runs', res.plan.id, 'shared', 'SPEC.md')
    expect(fs.existsSync(spec)).toBe(true)
    expect(fs.readFileSync(spec, 'utf-8')).toMatch(/billing invoices/i)
  })

  it('rejects cyclic plan install', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-bad-'))
    dirs.push(root)
    const res = installPlanOnDisk(root, {
      version: 1,
      goal: 'bad',
      tasks: [
        { id: 'a', role: 'Task A needs enough characters here', deps: ['b'] },
        { id: 'b', role: 'Task B needs enough characters here', deps: ['a'] },
      ],
    })
    expect(res.ok).toBe(false)
  })
})
