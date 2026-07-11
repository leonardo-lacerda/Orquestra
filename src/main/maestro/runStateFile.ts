// =============================================================================
// Persist orchestration run snapshots under <workspace>/.orquestra/runs/
// =============================================================================

import fs from 'node:fs'
import path from 'node:path'
import {
  absFromWorkspace,
  createEmptyRunSnapshot,
  latestRunSnapshotRelative,
  parseRunSnapshot,
  planPathRelative,
  type OrchestrationPlan,
  type OrchestrationRunSnapshot,
  validatePlan,
  buildSpecMarkdown,
  buildContractsMarkdown,
  contractsPathRelative,
  specPathRelative,
  runDirRelative,
} from '../../shared/orchestration'
import log from '../logger'

export function readLatestRunSnapshot(workspaceRoot: string): OrchestrationRunSnapshot | null {
  try {
    const p = absFromWorkspace(workspaceRoot, latestRunSnapshotRelative())
    if (!fs.existsSync(p)) return null
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return parseRunSnapshot(raw)
  } catch (err) {
    log.warn('[maestro] failed to read run snapshot: %s', err)
    return null
  }
}

export function writeLatestRunSnapshot(
  workspaceRoot: string,
  snapshot: OrchestrationRunSnapshot,
): void {
  try {
    const rel = latestRunSnapshotRelative()
    const p = absFromWorkspace(workspaceRoot, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    const next = { ...snapshot, updatedAt: Date.now() }
    fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf-8')
  } catch (err) {
    log.warn('[maestro] failed to write run snapshot: %s', err)
  }
}

export function installPlanOnDisk(
  workspaceRoot: string,
  planInput: unknown,
): { ok: true; plan: OrchestrationPlan } | { ok: false; error: string } {
  const validated = validatePlan(planInput)
  if (!validated.ok) {
    return { ok: false, error: validated.errors.map((e) => e.message).join('; ') }
  }
  const plan = validated.plan
  try {
    const dir = absFromWorkspace(workspaceRoot, runDirRelative(plan.id))
    fs.mkdirSync(path.join(dir, 'shared'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'workers'), { recursive: true })
    const planAbs = absFromWorkspace(workspaceRoot, planPathRelative(plan.id))
    fs.writeFileSync(planAbs, JSON.stringify(plan, null, 2), 'utf-8')
    fs.writeFileSync(
      absFromWorkspace(workspaceRoot, specPathRelative(plan.id)),
      buildSpecMarkdown(plan),
      'utf-8',
    )
    fs.writeFileSync(
      absFromWorkspace(workspaceRoot, contractsPathRelative(plan.id)),
      buildContractsMarkdown(plan),
      'utf-8',
    )
    // Also mirror as latest
    const prev = readLatestRunSnapshot(workspaceRoot) ?? createEmptyRunSnapshot(plan.id)
    writeLatestRunSnapshot(workspaceRoot, {
      ...prev,
      runId: plan.id,
      plan,
    })
    return { ok: true, plan }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function readPlanFromDisk(
  workspaceRoot: string,
  runId?: string,
): OrchestrationPlan | null {
  try {
    if (runId) {
      const p = absFromWorkspace(workspaceRoot, planPathRelative(runId))
      if (!fs.existsSync(p)) return null
      const validated = validatePlan(JSON.parse(fs.readFileSync(p, 'utf-8')))
      return validated.ok ? validated.plan : null
    }
    const snap = readLatestRunSnapshot(workspaceRoot)
    return snap?.plan ?? null
  } catch {
    return null
  }
}
