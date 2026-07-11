import { beforeEach, describe, expect, it } from 'vitest'
import { useOrchestrationRunStore } from './orchestrationRunStore'
import {
  canDispatchTask,
  recomputeReadyStatuses,
  validatePlan,
  type OrchestrationRunSnapshot,
} from '../../shared/orchestration'

describe('orchestrationRunStore', () => {
  beforeEach(() => {
    useOrchestrationRunStore.setState({ byMaestro: {}, runId: null, plan: null })
  })

  it('tracks recruit → ready → done lifecycle', () => {
    const store = useOrchestrationRunStore.getState()
    store.noteRecruit({
      maestroPtyId: 'pty-m',
      panelId: 'p1',
      name: 'worker-1',
      role: 'Build HTML',
    })
    expect(store.listForMaestro('pty-m')).toHaveLength(1)
    expect(store.listForMaestro('pty-m')[0].status).toBe('recruiting')
    expect(store.activeCountForMaestro('pty-m')).toBe(1)

    store.noteWorkerReady('p1', 'pty-w1')
    expect(useOrchestrationRunStore.getState().listForMaestro('pty-m')[0].status).toBe('running')

    store.noteWorkerDone('p1', 'done')
    expect(useOrchestrationRunStore.getState().listForMaestro('pty-m')[0].status).toBe('done')
    expect(useOrchestrationRunStore.getState().activeCountForMaestro('pty-m')).toBe(0)
  })

  it('removes dismissed workers', () => {
    const store = useOrchestrationRunStore.getState()
    store.noteRecruit({ maestroPtyId: 'pty-m', panelId: 'p1', name: 'w1', role: 'x' })
    store.noteDismiss('p1')
    expect(useOrchestrationRunStore.getState().listForMaestro('pty-m')).toHaveLength(0)
  })

  it('tracks recruit → running → failed transitions', () => {
    const store = useOrchestrationRunStore.getState()
    store.noteRecruit({
      maestroPtyId: 'pty-m',
      panelId: 'p2',
      name: 'worker-fail',
      role: 'Break things',
    })
    store.noteWorkerReady('p2', 'pty-w2')
    store.noteWorkerDone('p2', 'failed')
    const entry = useOrchestrationRunStore.getState().listForMaestro('pty-m')[0]
    expect(entry.name).toBe('worker-fail')
    expect(entry.role).toBe('Break things')
    expect(entry.status).toBe('failed')
    expect(useOrchestrationRunStore.getState().activeCountForMaestro('pty-m')).toBe(0)
  })

  it('isolates workers per maestro for active/max style counts', () => {
    const store = useOrchestrationRunStore.getState()
    store.noteRecruit({ maestroPtyId: 'm1', panelId: 'a', name: 'w-a', role: 'A' })
    store.noteRecruit({ maestroPtyId: 'm1', panelId: 'b', name: 'w-b', role: 'B' })
    store.noteRecruit({ maestroPtyId: 'm2', panelId: 'c', name: 'w-c', role: 'C' })
    expect(store.activeCountForMaestro('m1')).toBe(2)
    expect(store.activeCountForMaestro('m2')).toBe(1)
    store.noteWorkerDone('a', 'done')
    expect(useOrchestrationRunStore.getState().activeCountForMaestro('m1')).toBe(1)
  })

  it('hydrateFromSnapshot demotes recruiting/running so reload is not falsely live', () => {
    const snap: OrchestrationRunSnapshot = {
      version: 1,
      runId: 'run-1',
      updatedAt: Date.now(),
      maestroPtyId: 'pty-m',
      namesByPanelId: { p1: 'html' },
      workers: [
        {
          panelId: 'p1',
          name: 'html',
          role: 'Build',
          status: 'running',
          maestroPtyId: 'pty-m',
          updatedAt: Date.now(),
        },
      ],
    }
    useOrchestrationRunStore.getState().hydrateFromSnapshot(snap)
    const list = useOrchestrationRunStore.getState().listForMaestro('pty-m')
    expect(list).toHaveLength(1)
    expect(list[0].status).toBe('done')
    expect(useOrchestrationRunStore.getState().activeCountForMaestro('pty-m')).toBe(0)
  })

  it('supports idle-completion path: recruit → running → done without process exit', () => {
    // Mirrors ORQUESTRA_WORKER_STATUS from onWorkerIdle (no TERMINAL_EXIT).
    const store = useOrchestrationRunStore.getState()
    store.noteRecruit({
      maestroPtyId: 'pty-m',
      panelId: 'p-idle',
      name: 'worker-idle',
      role: 'Finish quietly',
    })
    store.noteWorkerReady('p-idle', 'pty-w-idle')
    expect(useOrchestrationRunStore.getState().listForMaestro('pty-m')[0].status).toBe('running')
    expect(useOrchestrationRunStore.getState().activeCountForMaestro('pty-m')).toBe(1)

    // Same call the idle IPC handler makes:
    store.noteWorkerDone('p-idle', 'done')
    const entry = useOrchestrationRunStore.getState().listForMaestro('pty-m')[0]
    expect(entry.status).toBe('done')
    expect(entry.name).toBe('worker-idle')
    expect(useOrchestrationRunStore.getState().activeCountForMaestro('pty-m')).toBe(0)
  })

  it('hydrates function names from disk snapshot for reuse after reload', () => {
    const snapshot: OrchestrationRunSnapshot = {
      version: 1,
      runId: 'run-reload',
      updatedAt: Date.now(),
      maestroPtyId: 'pty-m',
      namesByPanelId: { panelApi: 'api', panelUi: 'ui' },
      workers: [
        {
          panelId: 'panelApi',
          name: 'api',
          role: 'Implement API only carefully',
          status: 'done',
          maestroPtyId: 'pty-m',
          updatedAt: 1,
        },
      ],
      plan: {
        version: 1,
        id: 'run-reload',
        goal: 'Ship API',
        createdAt: 1,
        tasks: [{ id: 'api', name: 'api', role: 'Implement API only carefully', deps: [], status: 'done' }],
      },
      queue: [],
    }
    useOrchestrationRunStore.getState().hydrateFromSnapshot(snapshot)
    const state = useOrchestrationRunStore.getState()
    expect(state.runId).toBe('run-reload')
    expect(state.plan?.tasks[0]?.id).toBe('api')
    expect(state.listForMaestro('pty-m').some((w) => w.name === 'api')).toBe(true)
    // Recruit persist must not wipe plan
    const out = state.toSnapshot('pty-m', snapshot.namesByPanelId)
    expect(out.namesByPanelId.panelApi).toBe('api')
    expect(out.workers.some((w) => w.name === 'api')).toBe(true)
    expect(out.plan?.id).toBe('run-reload')
    expect(out.plan?.tasks[0]?.id).toBe('api')
  })

  it('noteWorkerDone syncs plan so multi-wave dependents become dispatchable', () => {
    const validated = validatePlan({
      version: 1,
      goal: 'Ship invoice export',
      tasks: [
        { id: 'api', role: 'Implement invoice export API handlers only', deps: [] },
        { id: 'ui', role: 'Implement invoice export UI only', deps: ['api'] },
      ],
    })
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    const plan = recomputeReadyStatuses(validated.plan)
    const store = useOrchestrationRunStore.getState()
    store.setPlan(plan)
    store.noteRecruit({
      maestroPtyId: 'pty-m',
      panelId: 'p-api',
      name: 'api',
      role: 'Implement invoice export API handlers only',
    })
    store.noteWorkerReady('p-api', 'pty-api')
    expect(canDispatchTask(useOrchestrationRunStore.getState().plan, 'ui').allow).toBe(false)

    // Same path onOrquestraWorkerStatus uses after accept-gated completion
    store.noteWorkerDone('p-api', 'done', {
      functionName: 'api',
      summary: 'API ok | accept=2/2',
    })
    const after = useOrchestrationRunStore.getState()
    expect(after.plan?.tasks.find((t) => t.id === 'api')?.status).toBe('done')
    expect(canDispatchTask(after.plan, 'ui').allow).toBe(true)
    expect(after.listForMaestro('pty-m')[0].status).toBe('done')
  })
})
