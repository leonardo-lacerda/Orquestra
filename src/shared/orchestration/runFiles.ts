// =============================================================================
// Path helpers for .orquestra layout (pure path strings — same on main + CLI).
// Multi-Maestro: each run lives under `.orquestra/runs/{runId}/`.
// =============================================================================

import {
  ORQUESTRA_CLAUDE_DIR,
  ORQUESTRA_CLAUDE_LOCAL,
  ORQUESTRA_CLI_DIR,
  ORQUESTRA_LATEST_RUN_FILE,
  ORQUESTRA_LEGACY_COMMANDS_DIR,
  ORQUESTRA_LEGACY_RESULTS_DIR,
  ORQUESTRA_REGISTRY_FILE,
  ORQUESTRA_RUNS_DIR,
  ORQUESTRA_ULTRA_LEGACY_COMMANDS_DIR,
  ORQUESTRA_ULTRA_LEGACY_RESULTS_DIR,
} from './types'

/** Sanitize run/worker id segments for path safety. */
export function safeOrquestraSegment(id: string): string {
  return String(id || 'unknown')
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[^\w.@+-]+/g, '_')
    .slice(0, 120) || 'unknown'
}

export function runsRootRelative(): string {
  return ORQUESTRA_RUNS_DIR
}

export function latestRunSnapshotRelative(): string {
  return `${ORQUESTRA_RUNS_DIR}/${ORQUESTRA_LATEST_RUN_FILE}`
}

/** `.orquestra/registry.json` — list of active Maestro runs. */
export function registryPathRelative(): string {
  return `.orquestra/${ORQUESTRA_REGISTRY_FILE}`
}

export function runDirRelative(runId: string): string {
  return `${ORQUESTRA_RUNS_DIR}/${safeOrquestraSegment(runId)}`
}

export function runCrownPathRelative(runId: string): string {
  return `${runDirRelative(runId)}/crown.json`
}

export function runCommandsDirRelative(runId: string): string {
  return `${runDirRelative(runId)}/commands`
}

export function runResultsDirRelative(runId: string): string {
  return `${runDirRelative(runId)}/results`
}

export function runWorkerResultPathRelative(runId: string, workerName: string): string {
  const safe = safeOrquestraSegment(pathBasename(workerName))
  return `${runResultsDirRelative(runId)}/worker-${safe}.json`
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
  const safe = safeOrquestraSegment(workerName)
  return `${runDirRelative(runId)}/workers/${safe}/ROLE.md`
}

/** Per-run task backlog for pool/queue dispatch. */
export function runQueuePathRelative(runId: string): string {
  return `${runDirRelative(runId)}/queue.json`
}

export function legacyResultsDirRelative(): string {
  return ORQUESTRA_LEGACY_RESULTS_DIR
}

export function legacyCommandsDirRelative(): string {
  return ORQUESTRA_LEGACY_COMMANDS_DIR
}

/** Pre-hub root commands dir — watcher still scans for old workspaces. */
export function ultraLegacyCommandsDirRelative(): string {
  return ORQUESTRA_ULTRA_LEGACY_COMMANDS_DIR
}

/** Pre-hub root results dir — CLI wait still polls as fallback. */
export function ultraLegacyResultsDirRelative(): string {
  return ORQUESTRA_ULTRA_LEGACY_RESULTS_DIR
}

export function legacyWorkerResultPathRelative(workerName: string): string {
  const safe = safeOrquestraSegment(pathBasename(workerName))
  return `${ORQUESTRA_LEGACY_RESULTS_DIR}/worker-${safe}.json`
}

/** `.orquestra/cli` — installed Maestro CLI. */
export function cliDirRelative(): string {
  return ORQUESTRA_CLI_DIR
}

export function cliCjsRelative(): string {
  return `${ORQUESTRA_CLI_DIR}/orquestra.cjs`
}

/** Shell invocation used in Maestro instructions / inject notes. */
export function cliInvokeRelative(): string {
  return `node ${cliCjsRelative()}`
}

/** Managed Maestro CLAUDE.local under the hub. */
export function claudeLocalRelative(): string {
  return ORQUESTRA_CLAUDE_LOCAL
}

/** Agent skill/commands tree under `.orquestra/claude`. */
export function claudeHubDirRelative(): string {
  return ORQUESTRA_CLAUDE_DIR
}

export function absFromWorkspace(workspaceRoot: string, rel: string): string {
  const root = workspaceRoot.replace(/[/\\]+$/, '')
  const r = rel.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  return `${root}/${r}`
}

function pathBasename(name: string): string {
  const n = String(name || '').replace(/\\/g, '/')
  const i = n.lastIndexOf('/')
  return i >= 0 ? n.slice(i + 1) : n
}
