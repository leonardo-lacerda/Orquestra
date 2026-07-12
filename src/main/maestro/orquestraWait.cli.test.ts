/**
 * CLI wait/results tests against the shipped Maestro CLI
 * (scripts/maestro/orquestra.js — same file terminalSetMaestro copies).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const CLI_PATH = path.join(REPO_ROOT, 'scripts', 'maestro', 'orquestra.js')
const ROOT_CLI_PATH = path.join(REPO_ROOT, 'orquestra.js')

const tempDirs: string[] = []

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orquestra-wait-'))
  tempDirs.push(dir)
  // Hub flat results (post-centralization)
  fs.mkdirSync(path.join(dir, '.orquestra', 'results'), { recursive: true })
  return dir
}

function writeResult(
  cwd: string,
  name: string,
  status: string,
  extra: Record<string, unknown> = {},
): void {
  const payload = {
    name,
    workerName: name,
    role: extra.role ?? 'test',
    workerRole: extra.role ?? 'test',
    status,
    exitCode: extra.exitCode ?? (status === 'done' || status === 'completed' ? 0 : 1),
    summary: extra.summary ?? `${name} ${status}`,
    timestamp: Date.now(),
    updatedAt: Date.now(),
    ...extra,
  }
  fs.mkdirSync(path.join(cwd, '.orquestra', 'results'), { recursive: true })
  fs.writeFileSync(
    path.join(cwd, '.orquestra', 'results', `worker-${name}.json`),
    JSON.stringify(payload, null, 2),
  )
}

function runWait(cwd: string, workers: string, timeoutSec = 2, pollMs = 200) {
  const r = spawnSync(
    process.execPath,
    [
      CLI_PATH,
      'wait',
      '--workers',
      workers,
      '--timeout',
      String(timeoutSec),
      '--poll',
      String(pollMs),
    ],
    { cwd, encoding: 'utf-8', timeout: (timeoutSec + 5) * 1000 },
  )
  return {
    exitCode: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})

describe('shipped Maestro CLI wait/results', () => {
  it('keeps root orquestra.js identical to scripts/maestro (single source)', () => {
    expect(fs.existsSync(CLI_PATH)).toBe(true)
    expect(fs.existsSync(ROOT_CLI_PATH)).toBe(true)
    expect(fs.readFileSync(CLI_PATH, 'utf-8')).toBe(fs.readFileSync(ROOT_CLI_PATH, 'utf-8'))
  })

  it('exits 0 when all waited workers are done', () => {
    const cwd = makeWorkspace()
    writeResult(cwd, 'worker-1', 'done', { summary: 'HTML ready' })
    writeResult(cwd, 'worker-2', 'completed', { summary: 'CSS ready' })

    const r = runWait(cwd, 'worker-1,worker-2', 2)
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('WORKER_RESULT:worker-1:DONE:')
    expect(r.stdout).toContain('WORKER_RESULT:worker-2:DONE:')
  })

  it('exits 0 for run-scoped results with --run (multi-Maestro path)', () => {
    const cwd = makeWorkspace()
    const runId = 'run-wait-scoped-1'
    const resultsDir = path.join(cwd, '.orquestra', 'runs', runId, 'results')
    fs.mkdirSync(resultsDir, { recursive: true })
    fs.mkdirSync(path.join(cwd, '.orquestra'), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, '.orquestra', 'registry.json'),
      JSON.stringify({
        version: 1,
        runs: [{ runId, maestroPtyId: 'pty-a', createdAt: Date.now(), updatedAt: Date.now() }],
      }),
    )
    for (const name of ['api', 'ui']) {
      fs.writeFileSync(
        path.join(resultsDir, `worker-${name}.json`),
        JSON.stringify({
          name,
          workerName: name,
          status: 'done',
          exitCode: 0,
          summary: `${name} ok`,
          timestamp: Date.now(),
          runId,
        }),
      )
    }

    const r = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'wait',
        '--run',
        runId,
        '--workers',
        'api,ui',
        '--timeout',
        '2',
        '--poll',
        '200',
      ],
      { cwd, encoding: 'utf-8', timeout: 8_000 },
    )
    expect(r.status ?? 1).toBe(0)
    expect(r.stdout ?? '').toContain('WORKER_RESULT:api:DONE:')
    expect(r.stdout ?? '').toContain('WORKER_RESULT:ui:DONE:')
  })

  it('does not see same worker name under another runId (multi isolation)', () => {
    const cwd = makeWorkspace()
    const runA = 'run-a'
    const runB = 'run-b'
    for (const runId of [runA, runB]) {
      const resultsDir = path.join(cwd, '.orquestra', 'runs', runId, 'results')
      fs.mkdirSync(resultsDir, { recursive: true })
    }
    fs.mkdirSync(path.join(cwd, '.orquestra'), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, '.orquestra', 'registry.json'),
      JSON.stringify({
        version: 1,
        runs: [
          { runId: runA, maestroPtyId: 'pty-a', createdAt: 1, updatedAt: 1 },
          { runId: runB, maestroPtyId: 'pty-b', createdAt: 2, updatedAt: 2 },
        ],
      }),
    )
    // Only run B has logger done
    fs.writeFileSync(
      path.join(cwd, '.orquestra', 'runs', runB, 'results', 'worker-logger.json'),
      JSON.stringify({
        name: 'logger',
        status: 'done',
        exitCode: 0,
        summary: 'B only',
        timestamp: Date.now(),
        runId: runB,
      }),
    )

    const waitA = spawnSync(
      process.execPath,
      [CLI_PATH, 'wait', '--run', runA, '--workers', 'logger', '--timeout', '1', '--poll', '200'],
      { cwd, encoding: 'utf-8', timeout: 8_000 },
    )
    // A has no result → timeout/non-zero
    expect(waitA.status ?? 1).not.toBe(0)

    const waitB = spawnSync(
      process.execPath,
      [CLI_PATH, 'wait', '--run', runB, '--workers', 'logger', '--timeout', '2', '--poll', '200'],
      { cwd, encoding: 'utf-8', timeout: 8_000 },
    )
    expect(waitB.status ?? 1).toBe(0)
    expect(waitB.stdout ?? '').toContain('WORKER_RESULT:logger:DONE:')
  })

  it('exits non-zero and reports partial failure without hanging', () => {
    const cwd = makeWorkspace()
    writeResult(cwd, 'ok-worker', 'done', { summary: 'ok' })
    writeResult(cwd, 'bad-worker', 'failed', { summary: 'boom', exitCode: 2 })

    const r = runWait(cwd, 'ok-worker,bad-worker', 2)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain('WORKER_RESULT:ok-worker:DONE:')
    expect(r.stdout).toContain('WORKER_RESULT:bad-worker:FAILED:')
    expect(r.stdout).toMatch(/boom/)
  })

  it('times out with non-zero exit and writes timeout markers (no infinite hang)', () => {
    const cwd = makeWorkspace()
    writeResult(cwd, 'fast', 'done', { summary: 'done already' })
    // slow never gets a terminal status file

    const started = Date.now()
    const r = runWait(cwd, 'fast,slow', 1, 200)
    const elapsed = Date.now() - started

    expect(r.exitCode).toBe(1)
    expect(elapsed).toBeLessThan(8000)
    expect(r.stdout).toContain('WORKER_RESULT:fast:DONE:')
    expect(r.stdout).toContain('WORKER_RESULT:slow:TIMEOUT:')
    expect(r.stderr).toMatch(/Timeout/i)

    const timeoutFile = path.join(cwd, '.orquestra', 'results', 'worker-slow.json')
    expect(fs.existsSync(timeoutFile)).toBe(true)
    const parsed = JSON.parse(fs.readFileSync(timeoutFile, 'utf-8')) as { status: string }
    expect(parsed.status).toBe('timeout')
  })

  it('treats legacy idle result payload as success (no hang, exit 0)', () => {
    // Real historical payload shape before writers normalized idle→done.
    const cwd = makeWorkspace()
    writeResult(cwd, 'quiet-worker', 'idle', {
      summary: 'Agent went quiet after finishing',
      exitCode: 0,
    })

    const started = Date.now()
    const r = runWait(cwd, 'quiet-worker', 2, 200)
    const elapsed = Date.now() - started

    expect(elapsed).toBeLessThan(3000)
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('WORKER_RESULT:quiet-worker:DONE:')
  })
})
