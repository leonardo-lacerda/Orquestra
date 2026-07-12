// =============================================================================
// multiMaestroPolicy — pure rules for multi-Maestro control-plane isolation.
//
// Product rule: N Maestros may share the same working tree. They must not
// steal each other's workers, injects, or wait results. Isolation is by runId
// (+ maestro PTY id), not by git worktree.
// =============================================================================

export type OrquestraCommandDisposition = 'accept' | 'drop_stale' | 'drop_missing'

/**
 * Command JSON under a run's commands/ (or legacy dir) must stamp maestro + run.
 * Mismatch = stale CLI from another crown/run. Missing = untrusted / old CLI.
 */
export function dispositionOrquestraCommand(opts: {
  payloadMaestroId: string | undefined | null
  payloadRunId?: string | undefined | null
  activeMaestroId: string
  activeRunId?: string | undefined | null
}): OrquestraCommandDisposition {
  const stampedMaestro = (opts.payloadMaestroId ?? '').trim()
  if (!stampedMaestro) return 'drop_missing'
  if (stampedMaestro !== opts.activeMaestroId) return 'drop_stale'
  const activeRun = (opts.activeRunId ?? '').trim()
  if (activeRun) {
    const stampedRun = (opts.payloadRunId ?? '').trim()
    // Missing run stamp: caller may still accept when command file lives under
    // runs/{activeRun}/commands (folder trust in terminal demux).
    if (!stampedRun) return 'drop_missing'
    if (stampedRun !== activeRun) return 'drop_stale'
  }
  return 'accept'
}

/**
 * When a command file lives under runs/{runId}/commands (or the sole live
 * Maestro's legacy dir), missing stamps are filled from folder identity —
 * agents that never received ORQUESTRA_RUN_ID still route correctly.
 * Explicit mismatched stamps still drop.
 */
export function applyFolderTrustToDisposition(opts: {
  disposition: OrquestraCommandDisposition
  trustFolderIdentity: boolean
  activeMaestroId: string
  activeRunId?: string | null
  payloadMaestroId?: string | null
  payloadRunId?: string | null
}): {
  disposition: OrquestraCommandDisposition
  maestroId: string
  runId?: string
} {
  const activeMaestroId = (opts.activeMaestroId ?? '').trim()
  const activeRunId = (opts.activeRunId ?? '').trim() || undefined
  if (
    opts.disposition !== 'drop_missing'
    || !opts.trustFolderIdentity
    || !activeMaestroId
  ) {
    return {
      disposition: opts.disposition,
      maestroId: activeMaestroId,
      runId: activeRunId,
    }
  }
  const stampedM = String(opts.payloadMaestroId ?? '').trim()
  const stampedR = String(opts.payloadRunId ?? '').trim()
  const contradicts =
    (stampedM !== '' && stampedM !== activeMaestroId)
    || (!!activeRunId && stampedR !== '' && stampedR !== activeRunId)
  if (contradicts) {
    return {
      disposition: opts.disposition,
      maestroId: activeMaestroId,
      runId: activeRunId,
    }
  }
  return {
    disposition: 'accept',
    maestroId: activeMaestroId,
    runId: activeRunId,
  }
}

/**
 * Only inject worker status into a PTY that is still a live Maestro.
 */
export function shouldInjectToMaestro(
  orchestratorId: string,
  liveMaestroPtyIds: ReadonlySet<string>,
): boolean {
  return !!orchestratorId && liveMaestroPtyIds.has(orchestratorId)
}

/**
 * Cascade/disable of run A must not touch workers of run B.
 */
export function shouldCascadeWorker(opts: {
  workerRunId: string | undefined | null
  workerOrchestratorId: string
  targetRunId?: string | undefined | null
  targetOrchestratorId: string
}): boolean {
  const wRun = (opts.workerRunId ?? '').trim()
  const tRun = (opts.targetRunId ?? '').trim()
  if (wRun && tRun) return wRun === tRun
  // Fallback when runId missing (legacy tracking): match orchestrator PTY only.
  return opts.workerOrchestratorId === opts.targetOrchestratorId
}

/**
 * Single-maestro mode: refuse arming a second live crown unless forceTakeover.
 * Multi-maestro mode: never busy due to another run (returns false).
 */
export function isMaestroBusy(opts: {
  multiMaestro: boolean
  previousPtyId: string | null | undefined
  requestingPtyId: string
  previousStillLive: boolean
  forceTakeover: boolean
  /** When re-arming the same run on a new PTY, previous is same run. */
  sameRun?: boolean
}): boolean {
  if (opts.multiMaestro && !opts.sameRun) return false
  if (!opts.previousPtyId || opts.previousPtyId === opts.requestingPtyId) return false
  if (!opts.previousStillLive) return false
  return !opts.forceTakeover
}

/**
 * Result/wait path identity: same worker name under different runs must not collide.
 */
export function workerResultKey(runId: string, workerName: string): string {
  return `${String(runId).trim()}::${String(workerName).trim().toLowerCase()}`
}
