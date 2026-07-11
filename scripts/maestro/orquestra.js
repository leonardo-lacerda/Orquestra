#!/usr/bin/env node
// =============================================================================
// orquestra — CLI for Maestro mode terminals (canonical copy).
//
// Copied into the workspace as orquestra.cjs when Maestro is enabled
// (see installOrquestraCliToWorkspace). Keep in sync with repo-root orquestra.js.
// .cjs avoids breakage when the workspace package.json sets "type":"module".
//
// IPC commands write JSON to .orquestra-commands/ (watched by Orquestra main).
// Local commands (wait / status) poll .orquestra-results/worker-<name>.json.
//
// Result file schema (worker-<name>.json):
//   {
//     "name": "worker-1",
//     "workerName": "worker-1",          // alias (legacy)
//     "role": "...",
//     "workerRole": "...",              // alias (legacy)
//     "status": "running|done|failed|timeout|completed|idle",
//     "exitCode": 0 | null,
//     "summary": "...",
//     "timestamp": 123,
//     "updatedAt": 123
//   }
// Terminal statuses for wait: done | completed | failed | timeout
// =============================================================================

const fs = require('fs')
const path = require('path')

const LEGACY_COMMANDS_DIR = '.orquestra-commands'
const LEGACY_RESULTS_DIR = '.orquestra-results'
const REGISTRY_PATH = path.resolve('.orquestra', 'registry.json')

/** Statuses that mean wait() can stop polling this worker. */
const TERMINAL_STATUSES = new Set(['done', 'completed', 'failed', 'timeout', 'idle'])
/** idle is legacy "agent went quiet"; writers now emit done, but accept idle for old files. */
const SUCCESS_STATUSES = new Set(['done', 'completed', 'idle'])

function safeSeg(id) {
  return String(id || 'unknown').replace(/[/\\]/g, '_').replace(/\.\./g, '_').slice(0, 120) || 'unknown'
}

function readRegistry() {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return { version: 1, runs: [] }
    const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
    return { version: 1, runs: Array.isArray(raw.runs) ? raw.runs : [] }
  } catch {
    return { version: 1, runs: [] }
  }
}

/**
 * Resolve orchestration run id: --run flag > ORQUESTRA_RUN_ID > single registry run > crown.json runId.
 */
function resolveRunId(flags) {
  if (flags && flags.run) return String(flags.run).trim()
  if (process.env.ORQUESTRA_RUN_ID) return String(process.env.ORQUESTRA_RUN_ID).trim()
  const reg = readRegistry()
  if (reg.runs.length === 1) return reg.runs[0].runId
  try {
    const crownPath = path.resolve('.orquestra', 'crown.json')
    if (fs.existsSync(crownPath)) {
      const raw = JSON.parse(fs.readFileSync(crownPath, 'utf-8'))
      if (raw.runId) return String(raw.runId).trim()
    }
  } catch { /* ignore */ }
  return null
}

function readCrownMaestroId(runId) {
  try {
    if (runId) {
      const p = path.resolve('.orquestra', 'runs', safeSeg(runId), 'crown.json')
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
        return raw.terminalPtyId || raw.maestroId || null
      }
    }
    const crownPath = path.resolve('.orquestra', 'crown.json')
    if (!fs.existsSync(crownPath)) return null
    const raw = JSON.parse(fs.readFileSync(crownPath, 'utf-8'))
    return raw.terminalPtyId || raw.maestroId || null
  } catch {
    return null
  }
}

function commandsDirFor(runId) {
  if (runId) return path.resolve('.orquestra', 'runs', safeSeg(runId), 'commands')
  return path.resolve(LEGACY_COMMANDS_DIR)
}

function resultsDirFor(runId) {
  if (runId) return path.resolve('.orquestra', 'runs', safeSeg(runId), 'results')
  return path.resolve(LEGACY_RESULTS_DIR)
}

function send(cmd, args = {}, runId) {
  const rid = runId || resolveRunId({}) || null
  const dir = commandsDirFor(rid)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  // Also ensure legacy dir exists for older main builds
  if (!fs.existsSync(LEGACY_COMMANDS_DIR)) {
    try { fs.mkdirSync(path.resolve(LEGACY_COMMANDS_DIR), { recursive: true }) } catch { /* ignore */ }
  }
  const maestroId = readCrownMaestroId(rid)
  const payload = JSON.stringify({
    cmd,
    args,
    timestamp: Date.now(),
    ...(maestroId ? { maestroId } : {}),
    ...(rid ? { runId: rid } : {}),
  })
  const filename = 'cmd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.json'
  fs.writeFileSync(path.join(dir, filename), payload)
  // Dual-write to legacy commands when single-run for older watchers
  if (rid) {
    try {
      fs.writeFileSync(path.join(path.resolve(LEGACY_COMMANDS_DIR), filename), payload)
    } catch { /* ignore */ }
  }
  process.stdout.write('OK:' + cmd + (rid ? ' run=' + rid : '') + '\n')
}

function print(msg) {
  process.stderr.write(msg + '\n')
}

function sleep(ms) {
  // Prefer Atomics.wait (no busy-spin) when available.
  try {
    const sab = new SharedArrayBuffer(4)
    const ia = new Int32Array(sab)
    Atomics.wait(ia, 0, 0, ms)
    return
  } catch {
    const end = Date.now() + ms
    while (Date.now() < end) { /* fallback spin */ }
  }
}

function parseFlags(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
      flags[key] = val
    } else {
      positional.push(argv[i])
    }
  }
  return { flags, positional }
}

function safeWorkerFileName(name) {
  return path.basename(String(name)).replace(/[/\\]/g, '_')
}

function resultPathFor(name, runId) {
  const rid = runId || resolveRunId({})
  if (rid) {
    return path.join(resultsDirFor(rid), `worker-${safeWorkerFileName(name)}.json`)
  }
  return path.resolve(LEGACY_RESULTS_DIR, `worker-${safeWorkerFileName(name)}.json`)
}

function readWorkerResult(name, runId) {
  const rp = resultPathFor(name, runId)
  if (!fs.existsSync(rp)) {
    // Fallback legacy flat path
    const legacy = path.resolve(LEGACY_RESULTS_DIR, `worker-${safeWorkerFileName(name)}.json`)
    if (!fs.existsSync(legacy)) return null
    try {
      const raw = JSON.parse(fs.readFileSync(legacy, 'utf-8'))
      return normalizeResult(raw, name)
    } catch {
      return null
    }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(rp, 'utf-8'))
    return normalizeResult(raw, name)
  } catch {
    return null
  }
}

function normalizeResult(raw, name) {
  const status = String(raw.status || '').toLowerCase()
  const summary = raw.summary != null ? String(raw.summary) : ''
  return {
    name: raw.name || raw.workerName || name,
    role: raw.role || raw.workerRole || '',
    status,
    exitCode: typeof raw.exitCode === 'number' ? raw.exitCode : null,
    summary,
    timestamp: raw.updatedAt || raw.timestamp || 0,
    raw,
  }
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(String(status || '').toLowerCase())
}

function markerForStatus(status) {
  const s = String(status || '').toLowerCase()
  // idle is success (legacy agent-quiet completion) — wait treats it as DONE
  if (s === 'done' || s === 'completed' || s === 'idle') return 'DONE'
  if (s === 'failed') return 'FAILED'
  if (s === 'timeout') return 'TIMEOUT'
  if (s === 'running') return 'RUNNING'
  return String(status || 'UNKNOWN').toUpperCase()
}

const args = process.argv.slice(2)
const cmd = args[0]

if (!cmd || cmd === '--help' || cmd === '-h') {
  print('orquestra — Maestro CLI for Orquestra')
  print('')
  print('Commands:')
  print('  recruit    Create a new worker terminal on the canvas')
  print('  dismiss    Close a worker')
  print('  connect    Open a file in an editor panel')
  print('  list       List workers (canvas + local results)')
  print('  wait       Block until workers complete (polls run results dir)')
  print('  status     Show worker result files as JSON')
  print('  reassign   Change a worker\'s role/prompt')
  print('  plan       Validate/install a plan JSON (DAG) under .orquestra/runs/')
  print('  plan-status  Show latest installed plan task statuses')
  print('')
  print('Multi-Maestro: pass --run <runId> or set ORQUESTRA_RUN_ID (set when crown arms).')
  print('')
  print('Examples:')
  print('  orquestra recruit --run <runId> --name api --role "Implement the API handlers only"')
  print('  orquestra wait --run <runId> --workers api,ui --timeout 300')
  print('  orquestra plan --file plan.json')
  print('  orquestra status --run <runId>')
  print('  orquestra dismiss --run <runId> api')
  process.exit(0)
}

switch (cmd) {
  case 'recruit': {
    const { flags } = parseFlags(args.slice(1))
    const runId = resolveRunId(flags)
    if (!flags.name) {
      print('Error: --name is required (function id, e.g. html, css, js)')
      print('Usage: orquestra recruit --name <function-id> --role "short unique task" [--run <runId>]')
      process.exit(1)
    }
    if (!flags.role) {
      print('Error: --role is required (short unique task for this function only)')
      print('Usage: orquestra recruit --name <function-id> --role "short unique task" [--run <runId>]')
      process.exit(1)
    }
    if (!runId && readRegistry().runs.length > 1) {
      print('Error: multiple Maestro runs active — pass --run <runId> or set ORQUESTRA_RUN_ID')
      process.exit(1)
    }
    send('recruit', {
      role: flags.role,
      agent: flags.agent || null,
      name: flags.name,
      ...(runId ? { runId } : {}),
    }, runId)
    print(`Recruiting function ${flags.name}: ${flags.role}${flags.agent ? ` (${flags.agent})` : ''}${runId ? ` run=${runId}` : ''}`)
    break
  }

  case 'dismiss': {
    const { positional, flags } = parseFlags(args.slice(1))
    const runId = resolveRunId(flags)
    if (!positional[0]) {
      print('Error: terminal name or id is required')
      print('Usage: orquestra dismiss <terminal-name> [--run <runId>]')
      process.exit(1)
    }
    send('dismiss', { target: positional[0], ...(runId ? { runId } : {}) }, runId)
    print(`Dismissing: ${positional[0]}${runId ? ` run=${runId}` : ''}`)
    break
  }

  case 'connect': {
    const { positional, flags } = parseFlags(args.slice(1))
    const runId = resolveRunId(flags)
    if (!positional[0] || !positional[1]) {
      print('Error: terminal name and file path are required')
      print('Usage: orquestra connect <terminal-name> <file-path>')
      process.exit(1)
    }
    send('connect', { target: positional[0], path: positional[1] }, runId)
    print(`Connecting ${positional[0]} to ${positional[1]}`)
    break
  }

  case 'list': {
    const { flags } = parseFlags(args.slice(1))
    const runId = resolveRunId(flags)
    send('list', runId ? { runId } : {}, runId)
    const resultDir = resultsDirFor(runId)
    if (fs.existsSync(resultDir)) {
      const files = fs.readdirSync(resultDir).filter((f) => /^worker-.+\.json$/.test(f))
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(resultDir, file), 'utf-8'))
          const name = data.name || data.workerName || file
          const status = data.status || 'unknown'
          const role = String(data.role || data.workerRole || '').slice(0, 60)
          process.stdout.write(`WORKER:${name}:${status}:${role}\n`)
        } catch { /* skip corrupt */ }
      }
    }
    break
  }

  case 'wait': {
    const { flags } = parseFlags(args.slice(1))
    const runId = resolveRunId(flags)
    const workerNames = String(flags.workers || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const timeoutSec = Math.max(1, parseInt(flags.timeout, 10) || 300)
    const pollIntervalMs = Math.max(200, parseInt(flags.poll, 10) || 2000)

    if (workerNames.length === 0) {
      print('Error: --workers is required (comma-separated names)')
      print('Usage: orquestra wait --workers name1,name2 --timeout 300 [--run <runId>]')
      process.exit(1)
    }
    if (!runId && readRegistry().runs.length > 1) {
      print('Error: multiple Maestro runs active — pass --run <runId> or set ORQUESTRA_RUN_ID')
      process.exit(1)
    }

    const startTime = Date.now()
    const deadline = startTime + timeoutSec * 1000

    while (Date.now() < deadline) {
      const snapshots = workerNames.map((name) => ({ name, result: readWorkerResult(name, runId) }))
      const allTerminal = snapshots.every(({ result }) => result && isTerminalStatus(result.status))

      if (allTerminal) {
        let anyFailed = false
        process.stdout.write('WAIT_COMPLETE\n')
        for (const { name, result } of snapshots) {
          const status = result.status
          const marker = markerForStatus(status)
          if (!SUCCESS_STATUSES.has(status)) anyFailed = true
          const summary = (result.summary || '').replace(/\s+/g, ' ').slice(0, 500)
          const role = (result.role || '').replace(/\s+/g, ' ').slice(0, 120)
          const acceptList = result.raw && Array.isArray(result.raw.accept) ? result.raw.accept : []
          const accept = acceptList.length
            ? acceptList.map((a) => (a.ok ? 'ok' : 'fail') + ':' + (a.detail || a.type)).join(',')
            : ''
          process.stdout.write(`WORKER_RESULT:${name}:${marker}:${summary}\n`)
          process.stdout.write(
            `COMPLETION:${name}: status=${status}`
            + (role ? ` role="${role}"` : '')
            + (accept ? ` accept=${accept}` : '')
            + ` summary="${summary}"\n`,
          )
          process.stdout.write(
            `TASK:${name}:${status}`
            + (accept ? `:accept=${accept}` : '')
            + `\n`,
          )
        }
        process.stdout.write(
          'HINT: Reuse finished workers with: node orquestra.js reassign <name> --role "next task"\n'
          + 'Only recruit a new panel when that function name is not already open and under maxWorkers.\n'
          + 'When this run is fully done (or a worker is no longer needed), clean up with: node orquestra.js dismiss <name>\n'
          + 'Dismiss all finished workers after consolidating so terminals do not accumulate.\n',
        )
        process.exit(anyFailed ? 1 : 0)
      }

      sleep(pollIntervalMs)
    }

    // Timeout: report every worker (done or still pending)
    print(`Timeout (${timeoutSec}s) — worker status:`)
    let anyMissing = false
    for (const name of workerNames) {
      const result = readWorkerResult(name, runId)
      if (!result || !isTerminalStatus(result.status)) {
        anyMissing = true
        // Write a timeout marker so subsequent waits don't hang forever
        try {
          const dir = resultsDirFor(runId)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          const existing = result?.raw || {}
          fs.writeFileSync(resultPathFor(name, runId), JSON.stringify({
            ...existing,
            name,
            workerName: name,
            role: existing.role || existing.workerRole || '',
            workerRole: existing.workerRole || existing.role || '',
            status: 'timeout',
            exitCode: existing.exitCode ?? 1,
            summary: existing.summary || `Timed out after ${timeoutSec}s`,
            timestamp: Date.now(),
            updatedAt: Date.now(),
            ...(runId ? { runId } : {}),
          }, null, 2))
        } catch { /* best-effort */ }
        process.stdout.write(`WORKER_RESULT:${name}:TIMEOUT:no terminal result within ${timeoutSec}s\n`)
      } else {
        const marker = markerForStatus(result.status)
        const summary = (result.summary || '').replace(/\s+/g, ' ').slice(0, 200)
        process.stdout.write(`WORKER_RESULT:${name}:${marker}:${summary}\n`)
      }
    }
    process.exit(1)
    break
  }

  case 'status': {
    const { flags } = parseFlags(args.slice(1))
    const runId = resolveRunId(flags)
    const resultDir = resultsDirFor(runId)
    const statuses = []
    if (fs.existsSync(resultDir)) {
      for (const file of fs.readdirSync(resultDir)) {
        if (!/^worker-.+\.json$/.test(file)) continue
        try {
          statuses.push(JSON.parse(fs.readFileSync(path.join(resultDir, file), 'utf-8')))
        } catch { /* skip */ }
      }
    }
    const norm = (s) => String(s?.status || '').toLowerCase()
    process.stdout.write(JSON.stringify({
      runId: runId || null,
      workers: statuses,
      total: statuses.length,
      done: statuses.filter((s) => SUCCESS_STATUSES.has(norm(s))).length,
      failed: statuses.filter((s) => norm(s) === 'failed' || norm(s) === 'timeout').length,
      running: statuses.filter((s) => norm(s) === 'running' || norm(s) === 'idle').length,
      // Legacy aliases
      completed: statuses.filter((s) => SUCCESS_STATUSES.has(norm(s))).length,
      idle: statuses.filter((s) => norm(s) === 'idle').length,
    }, null, 2) + '\n')
    break
  }

  case 'reassign': {
    const { flags, positional } = parseFlags(args.slice(1))
    const runId = resolveRunId(flags)
    if (!positional[0] || !flags.role) {
      print('Error: terminal name and --role are required')
      print('Usage: orquestra reassign <terminal-name> --role "Nova responsabilidade" [--run <runId>]')
      process.exit(1)
    }
    send('reassign', {
      target: positional[0],
      role: flags.role,
      ...(runId ? { runId } : {}),
    }, runId)
    print(`Reassigning ${positional[0]} to: ${flags.role}${runId ? ` run=${runId}` : ''}`)
    break
  }

  case 'plan': {
    // Validate + install plan JSON (DAG) under .orquestra/runs/<id>/
    const { flags } = parseFlags(args.slice(1))
    const file = flags.file || flags.f || positionalFrom(args.slice(1))[0]
    if (!file) {
      print('Error: --file plan.json is required')
      print('Usage: orquestra plan --file plan.json')
      process.exit(1)
    }
    const abs = path.resolve(String(file))
    if (!fs.existsSync(abs)) {
      print('Error: plan file not found: ' + abs)
      process.exit(1)
    }
    let raw
    try {
      raw = JSON.parse(fs.readFileSync(abs, 'utf-8'))
    } catch (e) {
      print('Error: invalid JSON: ' + e.message)
      process.exit(1)
    }
    const err = validatePlanCli(raw)
    if (err) {
      print('Error: invalid plan: ' + err)
      process.exit(1)
    }
    const plan = normalizePlanCli(raw)
    const runDir = path.resolve('.orquestra', 'runs', plan.id)
    fs.mkdirSync(path.join(runDir, 'shared'), { recursive: true })
    fs.mkdirSync(path.join(runDir, 'workers'), { recursive: true })
    fs.writeFileSync(path.join(runDir, 'plan.json'), JSON.stringify(plan, null, 2))
    fs.writeFileSync(path.join(runDir, 'shared', 'SPEC.md'), buildSpecCli(plan))
    fs.writeFileSync(path.join(runDir, 'shared', 'CONTRACTS.md'), buildContractsCli(plan))
    const latest = {
      version: 1,
      runId: plan.id,
      updatedAt: Date.now(),
      namesByPanelId: {},
      workers: [],
      plan,
      queue: [],
    }
    fs.mkdirSync(path.resolve('.orquestra', 'runs'), { recursive: true })
    fs.writeFileSync(path.resolve('.orquestra', 'runs', 'latest.json'), JSON.stringify(latest, null, 2))
    const ready = plan.tasks.filter((t) => (t.deps || []).length === 0).map((t) => t.id)
    process.stdout.write('OK:plan\n')
    print(`Plan installed: ${plan.id}`)
    print(`Goal: ${plan.goal}`)
    print(`Tasks: ${plan.tasks.map((t) => t.id).join(', ')}`)
    print(`Ready to dispatch: ${ready.join(', ') || '(none)'}`)
    print('Recruit only ready function ids, then wait. Use reassign for follow-ups; dismiss when done.')
    break
  }

  case 'plan-status': {
    const latestPath = path.resolve('.orquestra', 'runs', 'latest.json')
    if (!fs.existsSync(latestPath)) {
      print('No plan installed (.orquestra/runs/latest.json missing)')
      process.exit(1)
    }
    const latest = JSON.parse(fs.readFileSync(latestPath, 'utf-8'))
    const plan = latest.plan
    if (!plan || !Array.isArray(plan.tasks)) {
      print('Latest run has no plan.tasks')
      process.exit(1)
    }
    const runId = latest.runId || resolveRunId({})
    const resultsDir = resultsDirFor(runId)
    for (const t of plan.tasks) {
      const deps = (t.deps || []).join(',') || '-'
      let resultStatus = 'not-started'
      const rf = path.join(resultsDir, `worker-${path.basename(t.name || t.id)}.json`)
      if (fs.existsSync(rf)) {
        try {
          resultStatus = String(JSON.parse(fs.readFileSync(rf, 'utf-8')).status || 'unknown')
        } catch { /* ignore */ }
      }
      process.stdout.write(`TASK:${t.id}:deps=${deps}:role=${String(t.role || '').slice(0, 80)}:result=${resultStatus}\n`)
    }
    break
  }

  default:
    print(`Unknown command: ${cmd}`)
    print('Run "orquestra --help" for usage')
    process.exit(1)
}

function positionalFrom(a) {
  const { positional } = parseFlags(a)
  return positional
}

function validatePlanCli(raw) {
  if (!raw || typeof raw !== 'object') return 'not an object'
  if (raw.version !== 1) return 'version must be 1'
  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) return 'tasks required'
  const ids = new Set()
  for (const t of raw.tasks) {
    const id = String(t.id || '').trim()
    if (!id) return 'empty task id'
    if (ids.has(id.toLowerCase())) return 'duplicate id ' + id
    ids.add(id.toLowerCase())
    const role = String(t.role || '').trim()
    if (!role) return 'empty role for ' + id
    if (role.length > 220) return 'role too long for ' + id
  }
  for (const t of raw.tasks) {
    for (const d of t.deps || []) {
      if (!ids.has(String(d).toLowerCase()) && !raw.tasks.some((x) => x.id === d)) {
        // also allow exact id match from set of originals
        if (![...ids].includes(String(d).toLowerCase())) {
          const all = new Set(raw.tasks.map((x) => String(x.id)))
          if (!all.has(String(d))) return `unknown dep ${d} on ${t.id}`
        }
      }
    }
  }
  // cycle check
  const byId = new Map(raw.tasks.map((t) => [String(t.id), t]))
  const visiting = new Set()
  const done = new Set()
  function dfs(id) {
    if (done.has(id)) return null
    if (visiting.has(id)) return id
    visiting.add(id)
    for (const d of byId.get(id)?.deps || []) {
      const c = dfs(String(d))
      if (c) return c
    }
    visiting.delete(id)
    done.add(id)
    return null
  }
  for (const t of raw.tasks) {
    if (dfs(String(t.id))) return 'dependency cycle involving ' + t.id
  }
  return null
}

function normalizePlanCli(raw) {
  return {
    version: 1,
    id: String(raw.id || ('run-' + Date.now())),
    goal: String(raw.goal || 'Untitled run'),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    tasks: raw.tasks.map((t) => ({
      id: String(t.id).trim(),
      name: String(t.name || t.id).trim(),
      role: String(t.role).trim(),
      deps: (t.deps || []).map(String),
      status: t.status || 'pending',
      accept: t.accept,
    })),
  }
}

function buildSpecCli(plan) {
  let s = '# Run specification\n\n**Goal:** ' + plan.goal + '\n\n## Tasks\n\n'
  for (const t of plan.tasks) {
    s += '### `' + t.name + '`\n- role: ' + t.role + '\n\n'
  }
  return s
}

function buildContractsCli(plan) {
  let s = '# Shared contracts\n\n'
  for (const t of plan.tasks) {
    s += '- **' + t.name + '**: ' + t.role.slice(0, 100) + '\n'
  }
  return s
}
