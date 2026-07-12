import { describe, expect, it } from 'vitest'
import {
  applyFolderTrustToDisposition,
  dispositionOrquestraCommand,
  isMaestroBusy,
  shouldCascadeWorker,
  shouldInjectToMaestro,
  workerResultKey,
} from './multiMaestroPolicy'
import {
  absFromWorkspace,
  runWorkerResultPathRelative,
  safeOrquestraSegment,
} from './runFiles'

describe('dispositionOrquestraCommand', () => {
  it('accepts matching maestro+run stamps', () => {
    expect(
      dispositionOrquestraCommand({
        payloadMaestroId: 'pty-a',
        payloadRunId: 'run-1',
        activeMaestroId: 'pty-a',
        activeRunId: 'run-1',
      }),
    ).toBe('accept')
  })

  it('drops stale maestro stamp', () => {
    expect(
      dispositionOrquestraCommand({
        payloadMaestroId: 'pty-old',
        payloadRunId: 'run-1',
        activeMaestroId: 'pty-new',
        activeRunId: 'run-1',
      }),
    ).toBe('drop_stale')
  })

  it('drops missing/stale run when active run required', () => {
    expect(
      dispositionOrquestraCommand({
        payloadMaestroId: 'pty-a',
        payloadRunId: undefined,
        activeMaestroId: 'pty-a',
        activeRunId: 'run-1',
      }),
    ).toBe('drop_missing')
    expect(
      dispositionOrquestraCommand({
        payloadMaestroId: 'pty-a',
        payloadRunId: 'run-other',
        activeMaestroId: 'pty-a',
        activeRunId: 'run-1',
      }),
    ).toBe('drop_stale')
  })
})

describe('applyFolderTrustToDisposition', () => {
  it('accepts unstamped cmd when folder trust is on (run-scoped or sole legacy)', () => {
    const r = applyFolderTrustToDisposition({
      disposition: 'drop_missing',
      trustFolderIdentity: true,
      activeMaestroId: 'pty-a',
      activeRunId: 'run-1',
      payloadMaestroId: undefined,
      payloadRunId: undefined,
    })
    expect(r.disposition).toBe('accept')
    expect(r.maestroId).toBe('pty-a')
    expect(r.runId).toBe('run-1')
  })

  it('does not trust missing stamps when folder trust is off', () => {
    const r = applyFolderTrustToDisposition({
      disposition: 'drop_missing',
      trustFolderIdentity: false,
      activeMaestroId: 'pty-a',
      activeRunId: 'run-1',
    })
    expect(r.disposition).toBe('drop_missing')
  })

  it('still drops explicit mismatched stamps under folder trust', () => {
    const r = applyFolderTrustToDisposition({
      disposition: 'drop_missing',
      trustFolderIdentity: true,
      activeMaestroId: 'pty-a',
      activeRunId: 'run-1',
      payloadMaestroId: 'pty-other',
      payloadRunId: 'run-1',
    })
    // dispositionOrquestraCommand would return drop_stale; if already drop_missing with wrong stamp:
    expect(r.disposition).toBe('drop_missing')
  })
})

describe('shouldInjectToMaestro', () => {
  it('only injects when orchestrator is still a live maestro', () => {
    const live = new Set(['pty-a'])
    expect(shouldInjectToMaestro('pty-a', live)).toBe(true)
    expect(shouldInjectToMaestro('pty-b', live)).toBe(false)
  })
})

describe('shouldCascadeWorker', () => {
  it('cascades only same runId', () => {
    expect(
      shouldCascadeWorker({
        workerRunId: 'run-a',
        workerOrchestratorId: 'pty-a',
        targetRunId: 'run-a',
        targetOrchestratorId: 'pty-a',
      }),
    ).toBe(true)
    expect(
      shouldCascadeWorker({
        workerRunId: 'run-b',
        workerOrchestratorId: 'pty-b',
        targetRunId: 'run-a',
        targetOrchestratorId: 'pty-a',
      }),
    ).toBe(false)
  })

  it('falls back to orchestrator id when run ids missing', () => {
    expect(
      shouldCascadeWorker({
        workerRunId: '',
        workerOrchestratorId: 'pty-a',
        targetRunId: '',
        targetOrchestratorId: 'pty-a',
      }),
    ).toBe(true)
    expect(
      shouldCascadeWorker({
        workerRunId: null,
        workerOrchestratorId: 'pty-b',
        targetRunId: null,
        targetOrchestratorId: 'pty-a',
      }),
    ).toBe(false)
  })
})

describe('isMaestroBusy multi vs single', () => {
  it('multi: another live maestro is NOT busy', () => {
    expect(
      isMaestroBusy({
        multiMaestro: true,
        previousPtyId: 'pty-a',
        requestingPtyId: 'pty-b',
        previousStillLive: true,
        forceTakeover: false,
      }),
    ).toBe(false)
  })

  it('single: blocks live previous without force', () => {
    expect(
      isMaestroBusy({
        multiMaestro: false,
        previousPtyId: 'pty-a',
        requestingPtyId: 'pty-b',
        previousStillLive: true,
        forceTakeover: false,
      }),
    ).toBe(true)
  })

  it('single: allows force takeover', () => {
    expect(
      isMaestroBusy({
        multiMaestro: false,
        previousPtyId: 'pty-a',
        requestingPtyId: 'pty-b',
        previousStillLive: true,
        forceTakeover: true,
      }),
    ).toBe(false)
  })
})

describe('worker result path isolation (shipped helpers)', () => {
  it('same worker name under different runs yields different paths and keys', () => {
    const a = runWorkerResultPathRelative('run-aaa', 'logger')
    const b = runWorkerResultPathRelative('run-bbb', 'logger')
    expect(a).not.toBe(b)
    expect(a).toContain('run-aaa')
    expect(b).toContain('run-bbb')
    expect(workerResultKey('run-aaa', 'logger')).not.toBe(workerResultKey('run-bbb', 'logger'))
    const absA = absFromWorkspace('C:/proj', a)
    const absB = absFromWorkspace('C:/proj', b)
    expect(absA).not.toBe(absB)
  })

  it('safeOrquestraSegment strips path traversal', () => {
    expect(safeOrquestraSegment('../evil')).not.toContain('..')
    expect(safeOrquestraSegment('a/b')).not.toContain('/')
  })
})
