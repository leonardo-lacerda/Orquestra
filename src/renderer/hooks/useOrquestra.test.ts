import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type OrquestraWorkerSummary } from '../../shared/types'
import {
  activeWorkerSlotCount,
  allocateUniqueWorkerName,
  buildRecruitRoleText,
  buildWorkerRoleFileContent,
  evaluateRecruitGuard,
  findTooSimilarRole,
  findWorkerPanelByName,
  normalizeWorkerFunctionId,
  resolveReusableWorkerPanel,
  resolveOwnedWorkerPanel,
  resolveQueueKeyForMaestro,
  flattenRoleForTerminalInject,
  formatWorkerListForTerminal,
  clearWorkerInputField,
  injectWorkerTaskToPty,
  isDuplicateRole,
  isWorkerPty,
  maestroLinkedContextRelativePath,
  MAX_WORKER_ROLE_CHARS,
  clampWorkerRole,
  resolveWorkerRoleLimits,
  normalizeRoleKey,
  ORQUESTRA_RECRUIT_MSG,
  PTY_CTRL_U,
  PTY_CR,
  releaseWorkerTracking,
  resolveAgentPanelType,
  resolveWorkerAgentCommand,
  roleSimilarity,
  softReleaseWorkerPty,
  WORKER_COMPLETION_TOKEN,
  workerRoleFileRelativePath,
  workerRoleWithPolicy,
  type WorkerTrackingMaps,
} from './useOrquestra'

describe('useOrquestra helpers', () => {
  it('uses the configured default worker kind for missing or auto agents', () => {
    const settings = { ...DEFAULT_SETTINGS, orchestrationDefaultWorkerKind: 'agent' as const }

    expect(resolveAgentPanelType(undefined, settings)).toBe('agent')
    expect(resolveAgentPanelType('auto', settings)).toBe('agent')
    expect(resolveAgentPanelType('terminal', settings)).toBe('terminal')
  })

  it('resolveWorkerAgentCommand uses preset AI + per-CLI bypass flags', () => {
    const ask = {
      ...DEFAULT_SETTINGS,
      orchestrationDefaultWorkerAgent: 'verboo' as const,
      orchestrationPermissionMode: 'ask' as const,
    }
    expect(resolveWorkerAgentCommand(undefined, ask)).toBe('verboo')
    expect(resolveWorkerAgentCommand('auto', ask)).toBe('verboo')

    const claudeBypass = {
      ...DEFAULT_SETTINGS,
      orchestrationDefaultWorkerAgent: 'claude' as const,
      orchestrationPermissionMode: 'bypass' as const,
    }
    expect(resolveWorkerAgentCommand(undefined, claudeBypass)).toBe(
      'claude --dangerously-skip-permissions',
    )

    const codexBypass = {
      ...DEFAULT_SETTINGS,
      orchestrationDefaultWorkerAgent: 'codex' as const,
      orchestrationPermissionMode: 'bypass' as const,
    }
    expect(resolveWorkerAgentCommand('auto', codexBypass)).toBe(
      'codex --dangerously-bypass-approvals-and-sandbox',
    )

    // Explicit CLI from recruit still gets the correct flags
    expect(resolveWorkerAgentCommand('opencode', {
      ...DEFAULT_SETTINGS,
      orchestrationPermissionMode: 'bypass' as const,
    })).toBe('opencode --auto')

    // Skills often pass --agent verboo: must STILL apply bypass flags
    expect(resolveWorkerAgentCommand('verboo', {
      ...DEFAULT_SETTINGS,
      orchestrationDefaultWorkerAgent: 'verboo' as const,
      orchestrationPermissionMode: 'bypass' as const,
    })).toBe('verboo --dangerously-skip-permissions')

    // Free-text CLI containing "agent" must NOT be treated as panel kind
    expect(resolveWorkerAgentCommand('my-agent --fast', {
      ...DEFAULT_SETTINGS,
      orchestrationPermissionMode: 'ask' as const,
    })).toBe('my-agent --fast')

    // Custom free-text when agent is custom
    const custom = {
      ...DEFAULT_SETTINGS,
      orchestrationDefaultWorkerAgent: 'custom' as const,
      orchestrationDefaultAgentCommand: 'my-bot --x',
      orchestrationPermissionMode: 'ask' as const,
    }
    expect(resolveWorkerAgentCommand(undefined, custom)).toBe('my-bot --x')

    // Partial settings object (missing fields) still applies bypass safely
    expect(resolveWorkerAgentCommand(null as unknown as string, {
      orchestrationPermissionMode: 'bypass',
      orchestrationDefaultWorkerAgent: 'verboo',
    })).toBe('verboo --dangerously-skip-permissions')
  })

  it('builds a short function-tagged task agents can execute without completion marker', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      orchestrationAllowFileEdits: true,
      orchestrationAllowCommands: true,
      orchestrationAllowNetwork: false,
      orchestrationAllowNestedWorkers: false,
    }

    const role = workerRoleWithPolicy(
      'Create only index.html structure',
      settings,
      'html',
      '.orquestra/workers/html/ROLE.md',
    )

    expect(role).toContain('You are the "html" worker')
    expect(role).toContain('Do this job now: Create only index.html structure')
    expect(role).toContain('Start immediately')
    expect(role).toContain('Use your tools')
    expect(role).toContain('Do not recruit other workers')
    expect(role).toContain('.orquestra/workers/html/ROLE.md')
    // CRITICAL: inject must NOT contain the completion token (false idle / 19s wait).
    expect(role).not.toContain(WORKER_COMPLETION_TOKEN)
    expect(role).not.toContain('ORQUESTRA_WORKER_DONE')
    // Must stay single-line and free of the old policy wall.
    expect(role).not.toContain('\n')
    expect(role).not.toContain('[ORQUESTRADOR->WORKER]')
    expect(role).not.toContain('no network')
    expect(role).not.toContain('.orquestra-results')
  })

  it('ROLE.md contains completion token and pure job (not in inject)', () => {
    const rel = workerRoleFileRelativePath('html')
    expect(rel).toBe('.orquestra/workers/html/ROLE.md')
    const body = buildWorkerRoleFileContent('html', 'Create only index.html structure')
    expect(body).toContain('Create only index.html structure')
    expect(body).toContain(WORKER_COMPLETION_TOKEN)
    // Inject path must still strip token:
    const inject = workerRoleWithPolicy('Create only index.html structure', DEFAULT_SETTINGS, 'html', rel)
    expect(inject).not.toContain(WORKER_COMPLETION_TOKEN)
  })

  it('injectWorkerTaskToPty submits with Enter then clears the input field (no second CR)', async () => {
    const writes: string[] = []
    const api = {
      terminalWrite: (ptyId: string, data: string) => {
        writes.push(data)
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = { electronAPI: api }

    const task = 'You are the "html" worker. Do this job now: create index.html'
    injectWorkerTaskToPty('pty-1', task)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('create index.html')
    expect(writes[0].endsWith(PTY_CR)).toBe(true)

    // Wait past several clear delays — must clear, must NOT re-submit with bare CR
    await new Promise((r) => setTimeout(r, 1000))
    const cleared = writes.filter((w) => w.includes(PTY_CTRL_U))
    expect(cleared.length).toBeGreaterThanOrEqual(2)
    // A lone CR would re-send leftover draft as a second user turn
    expect(writes.some((w) => w === PTY_CR)).toBe(false)
    // Backspace fallback for TUIs that ignore Ctrl+U
    expect(writes.some((w) => w.includes('\b'))).toBe(true)
  })

  it('clearWorkerInputField sends clear-line control bytes and optional backspaces', () => {
    const writes: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {
      electronAPI: {
        terminalWrite: (_id: string, data: string) => {
          writes.push(data)
        },
      },
    }
    clearWorkerInputField('pty-x')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain(PTY_CTRL_U)
    expect(writes[0]).not.toContain('\b')

    clearWorkerInputField('pty-x', 40)
    expect(writes).toHaveLength(2)
    expect(writes[1]).toContain(PTY_CTRL_U)
    expect(writes[1].includes('\b')).toBe(true)
  })

  it('flattens multi-line role text into one PTY-safe inject line', () => {
    expect(flattenRoleForTerminalInject('line one\nline two\r\nline three')).toBe(
      'line one line two line three',
    )
  })

  it('detects duplicate roles case/whitespace-insensitively', () => {
    expect(normalizeRoleKey('  Create HTML  ')).toBe('create html')
    expect(isDuplicateRole('Create HTML', ['create  html', 'other'])).toBe(true)
    expect(isDuplicateRole('Create CSS', ['create html'])).toBe(false)
    expect(isDuplicateRole('', ['x'])).toBe(false)
  })

  it('detects near-duplicate long product briefs', () => {
    const a =
      'Create index.html only: landing page to sell an online calculator with hero features pricing testimonials footer'
    const b =
      'Create styles.css only: landing page to sell an online calculator with hero features pricing testimonials footer'
    expect(roleSimilarity(a, b)).toBeGreaterThan(0.5)
    expect(findTooSimilarRole(a, [b])).toBeTruthy()
    expect(
      findTooSimilarRole('Create only styles.css for calculator UI', [
        'Create only index.html structure',
      ]),
    ).toBeNull()
  })

  it('formats tracked workers for terminal list output', () => {
    const workers: OrquestraWorkerSummary[] = [
      {
        workerId: 'pty-worker-1',
        orchestratorId: 'pty-maestro',
        name: 'worker-1',
        role: 'Run tests',
        workspacePath: 'C:\\repo',
        status: 'running',
        outputLineCount: 5,
        lastActivity: 100,
      },
    ]

    expect(formatWorkerListForTerminal([])).toBe('[orquestra] Workers: none')
    expect(formatWorkerListForTerminal(workers)).toBe(
      '[orquestra] Workers:\n- worker-1 [running] (pty-worker-1) - Run tests',
    )
  })

  it('allocates unique worker names without clobbering existing tabs', () => {
    expect(allocateUniqueWorkerName(undefined, 'worker', [], 1)).toBe('worker-1')
    expect(allocateUniqueWorkerName('worker-1', 'worker', ['worker-1'], 2)).toBe('worker-1-2')
    expect(allocateUniqueWorkerName('HTML', 'worker', ['html', 'HTML-2'], 3)).toBe('HTML-3')
  })

  it('detects nested worker PTYs for hard recruit rejection', () => {
    const map = new Map<string, { maestroId: string; panelId: string }>([
      ['pty-worker', { maestroId: 'pty-maestro', panelId: 'panel-w' }],
    ])
    expect(isWorkerPty('pty-worker', map)).toBe(true)
    expect(isWorkerPty('pty-maestro', map)).toBe(false)
  })

  it('hard-rejects nested recruit when policy forbids it (real guard + message)', () => {
    const nested = evaluateRecruitGuard({
      allowNestedWorkers: false,
      callerIsWorkerPty: true,
      panelMaestroFlag: null,
      activeWorkerCount: 0,
      maxWorkers: 4,
    })
    expect(nested).toEqual({ allow: false, message: ORQUESTRA_RECRUIT_MSG.nestedDisabled })
    expect(nested.allow === false && nested.message).toMatch(/Nested workers are disabled/)
  })

  it('hard-rejects recruit from non-maestro panel when nested is off', () => {
    const result = evaluateRecruitGuard({
      allowNestedWorkers: false,
      callerIsWorkerPty: false,
      panelMaestroFlag: false,
      activeWorkerCount: 0,
      maxWorkers: 4,
    })
    expect(result).toEqual({ allow: false, message: ORQUESTRA_RECRUIT_MSG.nestedNonMaestro })
    expect(result.allow === false && result.message).toMatch(/Enable Maestro/)
  })

  it('hard-rejects when active workers reach maxWorkers', () => {
    const result = evaluateRecruitGuard({
      allowNestedWorkers: true,
      callerIsWorkerPty: false,
      panelMaestroFlag: true,
      activeWorkerCount: 2,
      maxWorkers: 2,
    })
    expect(result).toEqual({
      allow: false,
      message: ORQUESTRA_RECRUIT_MSG.workerLimit(2, 2),
    })
    expect(result.allow === false && result.message).toMatch(/Worker limit reached \(2\/2\)/)
  })

  it('allows recruit for root maestro under limits with name+role', () => {
    const result = evaluateRecruitGuard({
      allowNestedWorkers: false,
      callerIsWorkerPty: false,
      panelMaestroFlag: true,
      activeWorkerCount: 1,
      maxWorkers: 4,
      role: 'Build the form',
      name: 'form',
      requireName: true,
    })
    expect(result).toEqual({ allow: true })
  })

  it('hard-rejects empty role', () => {
    const result = evaluateRecruitGuard({
      allowNestedWorkers: false,
      callerIsWorkerPty: false,
      panelMaestroFlag: true,
      activeWorkerCount: 0,
      maxWorkers: 4,
      role: '   ',
      name: 'html',
      requireName: true,
    })
    expect(result).toEqual({ allow: false, message: ORQUESTRA_RECRUIT_MSG.emptyRole })
  })

  it('hard-rejects missing function name', () => {
    const result = evaluateRecruitGuard({
      allowNestedWorkers: false,
      callerIsWorkerPty: false,
      panelMaestroFlag: true,
      activeWorkerCount: 0,
      maxWorkers: 4,
      role: 'Create only index.html',
      name: '',
      requireName: true,
    })
    expect(result).toEqual({ allow: false, message: ORQUESTRA_RECRUIT_MSG.missingName })
  })

  it('allows role that would have failed old max 220 (incident: 243 chars blocked workers)', () => {
    // Reconstruct ~243 char role like the job-runner recruit that was hard-rejected.
    const medium =
      'Implement job-runner core under job-runner/: TypeScript types, enqueue API with name/payload/priority/delay/maxAttempts, JSONL disk persist, concurrency N, exponential backoff+jitter, job states queued|running|completed|failed|dead. No Redis/Bull.'
    expect(medium.length).toBeGreaterThan(220)
    expect(medium.length).toBeLessThanOrEqual(MAX_WORKER_ROLE_CHARS)
    const result = evaluateRecruitGuard({
      allowNestedWorkers: false,
      callerIsWorkerPty: false,
      panelMaestroFlag: true,
      activeWorkerCount: 0,
      maxWorkers: 4,
      role: medium,
      name: 'w1',
      requireName: true,
    })
    expect(result.allow).toBe(true)
  })

  it('hard-rejects only absurd full-brief pastes (HARD max from setting)', () => {
    const { hard } = resolveWorkerRoleLimits(1000)
    const absurd = 'x'.repeat(hard + 10)
    const result = evaluateRecruitGuard({
      allowNestedWorkers: false,
      callerIsWorkerPty: false,
      panelMaestroFlag: true,
      activeWorkerCount: 0,
      maxWorkers: 4,
      role: absurd,
      name: 'html',
      requireName: true,
      maxRoleChars: 1000,
    })
    expect(result.allow).toBe(false)
    if (result.allow === false) {
      expect(result.message).toMatch(new RegExp(`max ${hard}`, 'i'))
    }
  })

  it('clampWorkerRole uses user soft limit and truncates mild overage', () => {
    const soft = 200
    const over = 'a'.repeat(soft + 40)
    const r = clampWorkerRole(over, soft)
    expect(r.ok).toBe(true)
    expect(r.truncated).toBe(true)
    expect(r.role.length).toBe(soft)
    const { hard } = resolveWorkerRoleLimits(soft)
    expect(clampWorkerRole('b'.repeat(hard + 1), soft).ok).toBe(false)
  })

  it('resolveWorkerRoleLimits clamps setting into a sane range', () => {
    expect(resolveWorkerRoleLimits(1000).soft).toBe(1000)
    expect(resolveWorkerRoleLimits(1000).hard).toBeGreaterThan(1000)
    expect(resolveWorkerRoleLimits(10).soft).toBe(80) // floor
    expect(resolveWorkerRoleLimits(99999).soft).toBe(4000) // ceiling
  })

  it('hard-rejects duplicate active roles', () => {
    const result = evaluateRecruitGuard({
      allowNestedWorkers: false,
      callerIsWorkerPty: false,
      panelMaestroFlag: true,
      activeWorkerCount: 1,
      maxWorkers: 10,
      role: 'Create only styles.css for calculator',
      name: 'css2',
      requireName: true,
      existingRoles: ['Create only styles.css for calculator', 'Create only index.html'],
      existingNames: ['css', 'html'],
    })
    expect(result.allow).toBe(false)
    if (result.allow === false) {
      expect(result.message).toMatch(/role is not unique/i)
    }
  })

  it('hard-rejects duplicate function names', () => {
    const result = evaluateRecruitGuard({
      allowNestedWorkers: false,
      callerIsWorkerPty: false,
      panelMaestroFlag: true,
      activeWorkerCount: 1,
      maxWorkers: 10,
      role: 'Create only styles.css',
      name: 'html',
      requireName: true,
      existingRoles: ['Create only index.html'],
      existingNames: ['html'],
    })
    expect(result.allow).toBe(false)
    if (result.allow === false) {
      expect(result.message).toMatch(/already an active worker/i)
    }
  })

  it('builds recruit role with function name and no context body dump or DONE marker', () => {
    const settings = { ...DEFAULT_SETTINGS, orchestrationAllowNestedWorkers: false }
    const text = buildRecruitRoleText(
      'Create only index.html structure',
      settings,
      {
        relativePath: '.orquestra/context/panel-m/latest.md',
        content: 'linked scratch content\nmore lines that must NOT be dumped into PTY',
      },
      'html',
      '.orquestra/workers/html/ROLE.md',
    )
    expect(text).toContain('You are the "html" worker')
    expect(text).toContain('Do this job now: Create only index.html structure')
    expect(text).toContain('.orquestra/context/panel-m/latest.md')
    expect(text).not.toContain('linked scratch content')
    expect(text).not.toContain('\n')
    expect(text).not.toContain(WORKER_COMPLETION_TOKEN)
    expect(text).not.toContain('ORQUESTRA_WORKER_DONE')
    expect(maestroLinkedContextRelativePath('panel-m')).toBe('.orquestra/context/panel-m/latest.md')
  })

  it('soft-release on idle keeps panel slot for reuse; full release frees capacity', () => {
    // After idle: keep open panel in capacity (reassign same name, no second window).
    const maps: WorkerTrackingMaps = {
      workerPanelIds: new Map([['pty-m', new Set(['panel-w1'])]]),
      workerNamesByMaestro: new Map([['pty-m', new Map([['panel-w1', 'html']])]]),
      workerPtyToPanel: new Map([
        ['pty-w1', { maestroId: 'pty-m', panelId: 'panel-w1' }],
      ]),
    }

    expect(activeWorkerSlotCount(maps.workerPanelIds, 'pty-m')).toBe(1)
    softReleaseWorkerPty(maps, { workerPtyId: 'pty-w1', panelId: 'panel-w1' })
    // Panel still counts toward maxWorkers — only PTY map cleared.
    expect(activeWorkerSlotCount(maps.workerPanelIds, 'pty-m')).toBe(1)
    expect(maps.workerPtyToPanel.has('pty-w1')).toBe(false)
    expect(maps.workerNamesByMaestro.get('pty-m')?.get('panel-w1')).toBe('html')
    const stillCap = evaluateRecruitGuard({
      allowNestedWorkers: true,
      callerIsWorkerPty: false,
      panelMaestroFlag: true,
      activeWorkerCount: activeWorkerSlotCount(maps.workerPanelIds, 'pty-m'),
      maxWorkers: 1,
      role: 'New function task for docs',
      name: 'docs',
      requireName: true,
    })
    expect(stillCap.allow).toBe(false)

    // Dismiss/exit still fully releases capacity.
    releaseWorkerTracking(maps, {
      maestroId: 'pty-m',
      panelId: 'panel-w1',
      workerPtyId: 'pty-w1',
    })
    expect(activeWorkerSlotCount(maps.workerPanelIds, 'pty-m')).toBe(0)
    expect(maps.workerNamesByMaestro.get('pty-m')?.has('panel-w1')).toBe(false)
    const afterDismiss = evaluateRecruitGuard({
      allowNestedWorkers: true,
      callerIsWorkerPty: false,
      panelMaestroFlag: true,
      activeWorkerCount: activeWorkerSlotCount(maps.workerPanelIds, 'pty-m'),
      maxWorkers: 1,
      role: 'Create only docs',
      name: 'docs',
      requireName: true,
    })
    expect(afterDismiss).toEqual({ allow: true })
  })

  it('finds existing worker panel by name for reassign reuse', () => {
    const panels = {
      a: { id: 'a', title: 'html' },
      b: { id: 'b', title: 'css •' },
    }
    expect(findWorkerPanelByName(panels, 'html')?.id).toBe('a')
    expect(findWorkerPanelByName(panels, 'CSS')?.id).toBe('b')
    expect(findWorkerPanelByName(panels, 'js')).toBeUndefined()
  })

  it('resolveReusableWorkerPanel uses stable namesMap even when OSC renamed the tab', () => {
    expect(normalizeWorkerFunctionId('html-2')).toBe('html')
    expect(normalizeWorkerFunctionId('HTML')).toBe('html')

    const panels = {
      // Agent overwrote the tab title — title-only lookup would miss this.
      pHtml: { id: 'pHtml', title: 'Fix calculator HTML mar…' },
      pCss: { id: 'pCss', title: 'Create calculator landing…' },
    }
    const namesMap = new Map<string, string>([
      ['pHtml', 'html'],
      ['pCss', 'css'],
    ])

    expect(
      resolveReusableWorkerPanel({
        requestedName: 'html',
        panels,
        namesMap,
      }),
    ).toEqual({ panelId: 'pHtml', functionName: 'html' })

    // Maestro invents html-2 — still reuse the original html panel.
    expect(
      resolveReusableWorkerPanel({
        requestedName: 'html-2',
        panels,
        namesMap,
      }),
    ).toEqual({ panelId: 'pHtml', functionName: 'html' })

    expect(
      resolveReusableWorkerPanel({
        requestedName: 'js',
        panels,
        namesMap,
      }),
    ).toBeNull()
  })

  it('resolveReusableWorkerPanel does NOT reuse another Maestro run panel by title (same function name)', () => {
    // Maestro A owns panel-a titled "logger". Maestro B's namesMap is empty
    // (first recruit of "logger" for B). Must NOT steal panel-a by title.
    const panels = {
      'panel-a': { id: 'panel-a', title: 'logger' },
      'panel-maestro-b': { id: 'panel-maestro-b', title: 'Codex' },
    }
    const namesMapB = new Map<string, string>() // B has no workers yet

    expect(
      resolveReusableWorkerPanel({
        requestedName: 'logger',
        panels,
        namesMap: namesMapB,
        runEntries: [], // B's run store empty
      }),
    ).toBeNull()

    // Even if runEntries wrongly list A's panel, empty ownership + no namesMap hit → null
    // (when namesMap is empty, runEntries alone could match — require namesMap ownership:
    // with empty namesMap, step 2 allows runEntries; so pass only empty runEntries)

    // After B owns its own logger panel, reuse works for B only
    const namesMapB2 = new Map([['panel-b-logger', 'logger']])
    const panels2 = {
      ...panels,
      'panel-b-logger': { id: 'panel-b-logger', title: 'logger' },
    }
    expect(
      resolveReusableWorkerPanel({
        requestedName: 'logger',
        panels: panels2,
        namesMap: namesMapB2,
      }),
    ).toEqual({ panelId: 'panel-b-logger', functionName: 'logger' })

    // A's namesMap still resolves to panel-a, not B's
    const namesMapA = new Map([['panel-a', 'logger']])
    expect(
      resolveReusableWorkerPanel({
        requestedName: 'logger',
        panels: panels2,
        namesMap: namesMapA,
      }),
    ).toEqual({ panelId: 'panel-a', functionName: 'logger' })
  })

  it('workerRoleFileRelativePath is run-scoped when runId provided', () => {
    expect(workerRoleFileRelativePath('logger')).toBe('.orquestra/workers/logger/ROLE.md')
    expect(workerRoleFileRelativePath('logger', 'run-abc')).toBe(
      '.orquestra/runs/run-abc/workers/logger/ROLE.md',
    )
    expect(workerRoleFileRelativePath('logger', 'run-aaa')).not.toBe(
      workerRoleFileRelativePath('logger', 'run-bbb'),
    )
  })

  /**
   * Dismiss/reassign path: handlers call resolveOwnedWorkerPanel.
   * Empty namesMap + foreign panel titled "logger" must NOT resolve
   * (would close/inject Maestro A's worker when B dismisses/reassigns "logger").
   */
  it('resolveOwnedWorkerPanel: dismiss/reassign does NOT hit foreign run panel by title', () => {
    const panels = {
      'panel-a-logger': { id: 'panel-a-logger', title: 'logger' },
      'panel-maestro-b': { id: 'panel-maestro-b', title: 'Codex' },
    }
    const namesMapB = new Map<string, string>() // B owns nothing yet

    // B dismiss/reassign "logger" → must not resolve A's panel (global title was the bug)
    expect(
      resolveOwnedWorkerPanel({
        target: 'logger',
        panels,
        namesMap: namesMapB,
        runEntries: [],
      }),
    ).toBeNull()

    // Foreign panel id is not owned by B
    expect(
      resolveOwnedWorkerPanel({
        target: 'panel-a-logger',
        panels,
        namesMap: namesMapB,
        runEntries: [],
      }),
    ).toBeNull()

    // Stale runEntry for A's panel alone must not grant ownership when B's namesMap is empty
    expect(
      resolveOwnedWorkerPanel({
        target: 'logger',
        panels,
        namesMap: namesMapB,
        runEntries: [{ panelId: 'panel-a-logger', name: 'logger' }],
      }),
    ).toBeNull()

    // After B owns its own logger, resolve B's panel only
    const namesMapB2 = new Map([['panel-b-logger', 'logger']])
    const panels2 = {
      ...panels,
      'panel-b-logger': { id: 'panel-b-logger', title: 'logger' },
    }
    expect(
      resolveOwnedWorkerPanel({
        target: 'logger',
        panels: panels2,
        namesMap: namesMapB2,
      }),
    ).toEqual({ panelId: 'panel-b-logger', functionName: 'logger' })

    // A still resolves only panel-a
    const namesMapA = new Map([['panel-a-logger', 'logger']])
    expect(
      resolveOwnedWorkerPanel({
        target: 'logger',
        panels: panels2,
        namesMap: namesMapA,
      }),
    ).toEqual({ panelId: 'panel-a-logger', functionName: 'logger' })

    // Owned panel id works for A
    expect(
      resolveOwnedWorkerPanel({
        target: 'panel-a-logger',
        panels: panels2,
        namesMap: namesMapA,
      }),
    ).toEqual({ panelId: 'panel-a-logger', functionName: 'logger' })
  })

  it('resolveQueueKeyForMaestro never sinks to unknown; enqueue and drain share key', () => {
    // No panel runId → maestro-scoped key (still drainable)
    const a = resolveQueueKeyForMaestro('rpty-6', undefined, () => undefined)
    expect(a.key).toBe('maestro:rpty-6')
    expect(a.runId).toBeUndefined()
    expect(a.key).not.toContain('unknown')

    const b = resolveQueueKeyForMaestro('rpty-6', 'run-abc', () => 'run-other')
    expect(b.key).toBe('run:run-abc')
    expect(b.runId).toBe('run-abc')

    // Same maestro + same resolve → same key for drain
    const drainKey = resolveQueueKeyForMaestro('rpty-6', undefined, () => undefined)
    expect(drainKey.key).toBe(a.key)
  })

  it('resolveOwnedWorkerPanel: owned title match still works after OSC rename', () => {
    const panels = {
      p1: { id: 'p1', title: 'Fix landing logger mar…' },
    }
    const namesMap = new Map([['p1', 'logger']])
    expect(
      resolveOwnedWorkerPanel({ target: 'logger', panels, namesMap }),
    ).toEqual({ panelId: 'p1', functionName: 'logger' })
    expect(
      resolveOwnedWorkerPanel({
        target: 'Fix landing logger mar…',
        panels,
        namesMap,
      }),
    ).toEqual({ panelId: 'p1', functionName: 'logger' })
  })
})
