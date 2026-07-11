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
  flattenRoleForTerminalInject,
  formatWorkerListForTerminal,
  clearWorkerInputField,
  injectWorkerTaskToPty,
  isDuplicateRole,
  isWorkerPty,
  maestroLinkedContextRelativePath,
  MAX_WORKER_ROLE_CHARS,
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

  it('injectWorkerTaskToPty submits with Enter then clears the input field', async () => {
    const writes: string[] = []
    const api = {
      terminalWrite: (ptyId: string, data: string) => {
        writes.push(data)
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = { electronAPI: api }

    injectWorkerTaskToPty('pty-1', 'You are the "html" worker. Do this job now: create index.html')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('create index.html')
    expect(writes[0].endsWith(PTY_CR)).toBe(true)

    await new Promise((r) => setTimeout(r, 200))
    // Second write is bare CR (force submit)
    expect(writes.some((w) => w === PTY_CR)).toBe(true)

    await new Promise((r) => setTimeout(r, 600))
    // At least one clear sequence after submit (Esc/Ctrl-A/K/U) so text does not stay in composer
    const cleared = writes.some((w) => w.includes(PTY_CTRL_U))
    expect(cleared).toBe(true)
  })

  it('clearWorkerInputField sends clear-line control bytes', () => {
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

  it('hard-rejects role longer than max (full brief paste)', () => {
    const long =
      'Create index.html only: landing page to sell an online calculator. Sections: hero with headline and CTA, features/benefits, interactive calculator demo area, pricing, testimonials, final CTA, footer. Semantic HTML, link styles.css and app.js. Do not write CSS or JS. Extra fluff to exceed limit.'
    expect(long.length).toBeGreaterThan(MAX_WORKER_ROLE_CHARS)
    const result = evaluateRecruitGuard({
      allowNestedWorkers: false,
      callerIsWorkerPty: false,
      panelMaestroFlag: true,
      activeWorkerCount: 0,
      maxWorkers: 4,
      role: long,
      name: 'html',
      requireName: true,
    })
    expect(result.allow).toBe(false)
    if (result.allow === false) {
      expect(result.message).toMatch(/max 220/i)
      expect(result.message).toMatch(/SHORT function-specific/i)
    }
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
})
