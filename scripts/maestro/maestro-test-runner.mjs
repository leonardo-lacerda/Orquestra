#!/usr/bin/env node

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
let outputPipeClosed = false

for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error) => {
    if (error?.code === 'EPIPE') {
      outputPipeClosed = true
      return
    }
    throw error
  })
}

export function usage() {
  return `
Maestro headless test runner

Usage:
  npm run test:maestro -- --workspace <dir> --prompt <text> [options]
  npm run test:maestro -- --workspace <dir> --prompt-file <file> [options]

Options:
  --maestro-command <cmd>  Interactive agent command (default: $ORQUESTRA_MAESTRO_COMMAND or "verboo --dangerously-skip-permissions")
  --timeout <seconds>      Overall timeout (default: 600)
  --recruit-timeout <sec>  Fail if no worker appears in this time (default: 120)
  --startup-delay <sec>    Delay before injecting the prompt (default: 5)
  --ready-pattern <regex>  Wait for this terminal pattern before injection (Verboo: inferred from /help)
  --ready-timeout <sec>    Maximum wait for the ready pattern (default: 90)
  --type-delay <ms>        Delay per typed character (default: 2)
  --settle <seconds>       Quiet period after all work completes (default: 8)
  --poll <milliseconds>    Monitor interval (default: 1000)
  --expect-workers <n>     Minimum workers that must be observed (default: 1)
  --max-workers <n>        Fail if the pool exceeds this size (default: 4)
  --report <file>          Also write JSONL events to this file
  --no-build               Use the current dist/ without rebuilding
  --allow-worker-failures  Exit successfully even if a worker fails
  --help                    Show this help
`
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function numberOption(raw, flag, { integer = false, min = 0 } = {}) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    throw new Error(`${flag} must be ${integer ? 'an integer' : 'a number'} >= ${min}`)
  }
  return value
}

export function parseArgs(argv, cwd = process.cwd()) {
  const options = {
    workspace: cwd,
    prompt: null,
    promptFile: null,
    maestroCommand: process.env.ORQUESTRA_MAESTRO_COMMAND || 'verboo --dangerously-skip-permissions',
    timeoutMs: 600_000,
    recruitTimeoutMs: 120_000,
    startupDelayMs: 5_000,
    readyPattern: null,
    readyTimeoutMs: 90_000,
    typeDelayMs: 2,
    settleMs: 8_000,
    pollMs: 1_000,
    expectWorkers: 1,
    maxWorkers: 4,
    report: null,
    build: true,
    allowWorkerFailures: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    switch (flag) {
      case '--workspace': options.workspace = path.resolve(cwd, valueAfter(argv, i++, flag)); break
      case '--prompt': options.prompt = valueAfter(argv, i++, flag); break
      case '--prompt-file': options.promptFile = path.resolve(cwd, valueAfter(argv, i++, flag)); break
      case '--maestro-command': options.maestroCommand = valueAfter(argv, i++, flag); break
      case '--timeout': options.timeoutMs = numberOption(valueAfter(argv, i++, flag), flag, { min: 1 }) * 1000; break
      case '--recruit-timeout': options.recruitTimeoutMs = numberOption(valueAfter(argv, i++, flag), flag, { min: 1 }) * 1000; break
      case '--startup-delay': options.startupDelayMs = numberOption(valueAfter(argv, i++, flag), flag) * 1000; break
      case '--ready-pattern': options.readyPattern = valueAfter(argv, i++, flag); break
      case '--ready-timeout': options.readyTimeoutMs = numberOption(valueAfter(argv, i++, flag), flag, { min: 1 }) * 1000; break
      case '--type-delay': options.typeDelayMs = numberOption(valueAfter(argv, i++, flag), flag, { integer: true }); break
      case '--settle': options.settleMs = numberOption(valueAfter(argv, i++, flag), flag) * 1000; break
      case '--poll': options.pollMs = numberOption(valueAfter(argv, i++, flag), flag, { integer: true, min: 100 }); break
      case '--expect-workers': options.expectWorkers = numberOption(valueAfter(argv, i++, flag), flag, { integer: true }); break
      case '--max-workers': options.maxWorkers = numberOption(valueAfter(argv, i++, flag), flag, { integer: true, min: 1 }); break
      case '--report': options.report = path.resolve(cwd, valueAfter(argv, i++, flag)); break
      case '--no-build': options.build = false; break
      case '--allow-worker-failures': options.allowWorkerFailures = true; break
      case '--help': case '-h': options.help = true; break
      default: throw new Error(`Unknown option: ${flag}`)
    }
  }
  if (!options.help && !options.prompt && !options.promptFile) {
    throw new Error('Provide --prompt or --prompt-file')
  }
  if (options.prompt && options.promptFile) throw new Error('Use only one of --prompt or --prompt-file')
  return options
}

export function inferredReadyPattern(command, explicitPattern = null) {
  if (explicitPattern) return explicitPattern
  return /(^|[\\/])?verboo(?:\.cmd)?(?:\s|$)/i.test(String(command || '')) ? '/help' : null
}

export function stripAnsi(value) {
  return String(value || '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '')
    .replace(/\r/g, '')
}

export function queuedCount(queue) {
  return Array.isArray(queue?.items)
    ? queue.items.filter((item) => item?.status === 'queued').length
    : 0
}

export function completionState({ workers, results, queued, expectWorkers, maxWorkers }) {
  const liveWorkers = workers.filter((worker) => worker.status !== 'dismissed')
  if (liveWorkers.length > maxWorkers) {
    return { complete: false, fatal: `worker pool exceeded limit (${liveWorkers.length}/${maxWorkers})` }
  }
  const observedNames = new Set([
    ...liveWorkers.map((worker) => worker.name),
    ...results.map((result) => result.workerName || result.name).filter(Boolean),
  ])
  const enoughWorkers = observedNames.size >= expectWorkers
  const workersSettled = liveWorkers.every((worker) => worker.status === 'done' || worker.status === 'failed')
  const failed = liveWorkers.some((worker) => worker.status === 'failed')
    || results.some((result) => result.status === 'failed')
  return {
    complete: enoughWorkers && workersSettled && queued === 0,
    fatal: null,
    failed,
    observedWorkers: observedNames.size,
  }
}

async function exists(file) {
  try { await fs.access(file); return true } catch { return false }
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return fallback }
}

async function listJson(dir) {
  try {
    return (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort()
  } catch {
    return []
  }
}

async function runCommand(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, timeoutMs, label, pollMs = 250) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await wait(pollMs)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function loadRun(workspace, maestroPtyId, startedAt) {
  const registryFile = path.join(workspace, '.orquestra', 'registry.json')
  return waitFor(async () => {
    const registry = await readJson(registryFile, { runs: [] })
    return registry.runs?.find((run) =>
      run.maestroPtyId === maestroPtyId && Number(run.updatedAt || 0) >= startedAt - 2_000)
  }, 15_000, 'Maestro run registry')
}

async function diskSnapshot(workspace, runId) {
  const runDir = path.join(workspace, '.orquestra', 'runs', runId)
  const resultDir = path.join(runDir, 'results')
  const commandDir = path.join(runDir, 'commands')
  const resultFiles = await listJson(resultDir)
  const results = (await Promise.all(resultFiles.map((name) => readJson(path.join(resultDir, name))))).filter(Boolean)
  const queue = await readJson(path.join(runDir, 'queue.json'), { items: [] })
  const plan = await readJson(path.join(runDir, 'plan.json'))
  return { commandFiles: await listJson(commandDir), results, queue, plan }
}

async function waitForAgentReady(page, nodeId, options, onProgress = null) {
  await wait(options.startupDelayMs)
  const source = inferredReadyPattern(options.maestroCommand, options.readyPattern)
  if (!source) return { pattern: null, output: '' }
  let pattern
  try { pattern = new RegExp(source, 'i') } catch (error) {
    throw new Error(`Invalid --ready-pattern regex: ${error.message}`)
  }
  const deadline = Date.now() + options.readyTimeoutMs
  let output = ''
  let lastProgressAt = 0
  let lastProgressTail = ''
  while (Date.now() < deadline) {
    output = await page.evaluate((id) => window.__orquestraE2E.terminalOutput(id), nodeId)
    if (pattern.test(stripAnsi(output))) return { pattern: source, output }
    const progressTail = tailLines(output, 8)
    if (
      onProgress
      && progressTail
      && progressTail !== lastProgressTail
      && Date.now() - lastProgressAt >= 5_000
    ) {
      lastProgressAt = Date.now()
      lastProgressTail = progressTail
      await onProgress(progressTail)
    }
    await wait(500)
  }
  throw new Error(
    `Agent did not become ready within ${options.readyTimeoutMs / 1000}s `
    + `(pattern: ${source}). Terminal tail:\n${tailLines(output)}`,
  )
}

function tailLines(text, count = 14) {
  return stripAnsi(text).split('\n').map((line) => line.trimEnd()).filter(Boolean).slice(-count).join('\n')
}

async function main() {
  let options
  try { options = parseArgs(process.argv.slice(2)) } catch (error) {
    console.error(`[maestro-test] ${error.message}\n${usage()}`)
    process.exitCode = 2
    return
  }
  if (options.help) { console.log(usage()); return }

  const workspaceStat = await fs.stat(options.workspace).catch(() => null)
  if (!workspaceStat?.isDirectory()) throw new Error(`Workspace does not exist: ${options.workspace}`)
  const prompt = options.prompt ?? await fs.readFile(options.promptFile, 'utf8')
  if (!prompt.trim()) throw new Error('Prompt is empty')

  if (options.build) {
    console.log('[maestro-test] Building the Electron app...')
    await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], REPO_ROOT)
  } else if (!(await exists(path.join(REPO_ROOT, 'dist', 'main', 'index.js')))) {
    throw new Error('dist/main/index.js is missing; remove --no-build')
  }

  const { _electron: electron } = await import('playwright')
  let app
  let reportReady = false
  const emit = async (event, data = {}) => {
    const record = { timestamp: new Date().toISOString(), event, ...data }
    if (!outputPipeClosed) {
      console.log(`[maestro-test] ${event}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ''}`)
    }
    if (options.report) {
      if (!reportReady) {
        await fs.mkdir(path.dirname(options.report), { recursive: true })
        await fs.writeFile(options.report, '')
        reportReady = true
      }
      await fs.appendFile(options.report, `${JSON.stringify(record)}\n`)
    }
  }

  try {
    const startedAt = Date.now()
    app = await electron.launch({
      args: ['.'], cwd: REPO_ROOT,
      env: { ...process.env, ORQUESTRA_E2E: '1', NODE_ENV: 'production' },
    })
    const page = await app.firstWindow()
    page.on('console', (message) => {
      const text = message.text()
      const knownE2ESentryNoise = text.includes('sentry-ipc://') || text.includes('Sentry SDK failed')
      if (message.type() === 'error' && !knownE2ESentryNoise) {
        void emit('renderer-error', { message: text })
      }
    })
    await page.waitForFunction(() => window.__orquestraE2E?.ready === true, { timeout: 15_000 })
    await page.waitForSelector('[data-canvas-panel-id]', { timeout: 15_000 })
    await page.evaluate((root) => window.__orquestraE2E.setWorkspaceRoot(root), options.workspace)
    await page.waitForSelector('[data-canvas-panel-id]', { timeout: 15_000 })

    const maestroNodeId = await page.evaluate(() => window.__orquestraE2E.createTerminal({ x: 80, y: 120 }))
    const maestroPtyId = await waitFor(
      () => page.evaluate((id) => window.__orquestraE2E.terminalPtyId(id), maestroNodeId),
      10_000, 'Maestro PTY',
    )
    const enabled = await page.evaluate((id) => window.__orquestraE2E.enableMaestro(id), maestroNodeId)
    if (!enabled) throw new Error('Could not enable the Maestro crown')
    const run = await loadRun(options.workspace, maestroPtyId, startedAt)
    await emit('maestro-ready', { runId: run.runId, maestroPtyId, workspace: options.workspace })

    await page.evaluate(({ id, text }) => window.__orquestraE2E.writeTerminal(id, `${text}\r`), {
      id: maestroNodeId, text: options.maestroCommand,
    })
    await emit('agent-started', { command: options.maestroCommand })
    const ready = await waitForAgentReady(
      page,
      maestroNodeId,
      options,
      (tail) => emit('agent-waiting', { tail }),
    )
    await emit('agent-ready', { pattern: ready.pattern })
    const oneLinePrompt = prompt.replace(/\r?\n/g, ' ').trim()
    const typed = await page.evaluate(({ id, text, delayMs }) =>
      window.__orquestraE2E.typeTerminal(id, text, delayMs), {
      id: maestroNodeId, text: oneLinePrompt, delayMs: options.typeDelayMs,
    })
    if (!typed) throw new Error('Could not type the prompt into the Maestro terminal')
    const submitted = await page.evaluate((id) => window.__orquestraE2E.submitTerminal(id), maestroNodeId)
    if (!submitted) throw new Error('Could not submit the prompt in the Maestro terminal')
    await emit('prompt-injected', { prompt: oneLinePrompt })
    const promptInjectedAt = Date.now()

    let lastSignature = ''
    let lastOutput = ''
    let completeSince = null
    const deadline = Date.now() + options.timeoutMs
    while (Date.now() < deadline) {
      if (outputPipeClosed) throw new Error('Output pipe closed by the calling process')
      const workers = await page.evaluate((id) => window.__orquestraE2E.orchestrationWorkers(id), maestroNodeId)
      const disk = await diskSnapshot(options.workspace, run.runId)
      const queued = queuedCount(disk.queue)
      const state = completionState({ ...options, workers, results: disk.results, queued })
      if (state.fatal) throw new Error(state.fatal)

      const signature = JSON.stringify({ workers, commands: disk.commandFiles, results: disk.results, queued, plan: disk.plan })
      if (signature !== lastSignature) {
        lastSignature = signature
        completeSince = null
        await emit('state', {
          workers: workers.map(({ name, status, role }) => ({ name, status, role })),
          queued,
          commands: disk.commandFiles.length,
          results: disk.results.map((result) => ({ name: result.workerName || result.name, status: result.status, summary: result.summary })),
        })
      }

      const output = await page.evaluate((id) => window.__orquestraE2E.terminalOutput(id), maestroNodeId)
      const outputTail = tailLines(output)
      if (outputTail && outputTail !== lastOutput) {
        lastOutput = outputTail
        await emit('maestro-output', { tail: outputTail })
      }
      if (
        options.expectWorkers > 0
        && state.observedWorkers === 0
        && Date.now() - promptInjectedAt >= options.recruitTimeoutMs
      ) {
        throw new Error(
          `No worker was recruited within ${options.recruitTimeoutMs / 1000}s. `
          + `Maestro terminal tail:\n${outputTail}`,
        )
      }

      if (state.complete) {
        completeSince ??= Date.now()
        if (Date.now() - completeSince >= options.settleMs) {
          const workerOutputs = await page.evaluate((items) => Object.fromEntries(items.map((worker) => [
            worker.name, window.__orquestraE2E.terminalOutput(worker.panelId),
          ])), workers)
          await emit('complete', {
            runId: run.runId,
            failed: state.failed,
            observedWorkers: state.observedWorkers,
            workerOutputTails: Object.fromEntries(Object.entries(workerOutputs).map(([name, outputText]) => [name, tailLines(outputText)])),
          })
          if (state.failed && !options.allowWorkerFailures) process.exitCode = 1
          return
        }
      } else {
        completeSince = null
      }
      await wait(options.pollMs)
    }
    throw new Error(`Timed out after ${options.timeoutMs / 1000}s`)
  } finally {
    if (app) await app.close().catch(() => {})
  }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (!outputPipeClosed) console.error(`[maestro-test] FAILED: ${error.stack || error.message}`)
    process.exitCode = 1
  })
}
