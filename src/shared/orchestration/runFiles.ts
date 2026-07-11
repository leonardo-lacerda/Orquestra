// =============================================================================
// Path helpers for .orquestra/runs layout (pure path strings).
// =============================================================================

import { ORQUESTRA_LATEST_RUN_FILE, ORQUESTRA_RUNS_DIR } from './types'

export function runsRootRelative(): string {
  return ORQUESTRA_RUNS_DIR
}

export function latestRunSnapshotRelative(): string {
  return `${ORQUESTRA_RUNS_DIR}/${ORQUESTRA_LATEST_RUN_FILE}`
}

export function runDirRelative(runId: string): string {
  const safe = runId.replace(/[/\\]/g, '_').replace(/\.\./g, '_')
  return `${ORQUESTRA_RUNS_DIR}/${safe}`
}

export function planPathRelative(runId: string): string {
  return `${runDirRelative(runId)}/plan.json`
}

export function specPathRelative(runId: string): string {
  return `${runDirRelative(runId)}/shared/SPEC.md`
}

export function contractsPathRelative(runId: string): string {
  return `${runDirRelative(runId)}/shared/CONTRACTS.md`
}

export function workerRolePathRelative(runId: string, workerName: string): string {
  const safe = workerName.replace(/[/\\]/g, '_').replace(/\.\./g, '_')
  return `${runDirRelative(runId)}/workers/${safe}/ROLE.md`
}

export function absFromWorkspace(workspaceRoot: string, rel: string): string {
  const root = workspaceRoot.replace(/[/\\]+$/, '')
  const r = rel.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  return `${root}/${r}`
}
