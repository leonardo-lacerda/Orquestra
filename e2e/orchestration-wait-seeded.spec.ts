/**
 * E2E gate A2b: command-file recruit → seed result files on disk → CLI wait exit 0.
 *
 * No live LLM. Proves the shipped wait CLI + multi-run result path after a real
 * command-file recruit (A1 path + A2 writers via seed).
 */
import { expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { closeApp, launchApp, seedTerminal } from './fixtures/electron-app'

const REPO_ROOT = path.resolve(__dirname, '..')
const CLI_PATH = path.join(REPO_ROOT, 'scripts', 'maestro', 'orquestra.js')

function writeRunWorkerResult(
  root: string,
  runId: string,
  name: string,
  status: 'done' | 'failed' = 'done',
  summary = 'ok',
): void {
  const dir = path.join(root, '.orquestra', 'runs', runId, 'results')
  fsSync.mkdirSync(dir, { recursive: true })
  const payload = {
    name,
    workerName: name,
    role: summary,
    workerRole: summary,
    status,
    exitCode: status === 'done' ? 0 : 1,
    summary,
    timestamp: Date.now(),
    updatedAt: Date.now(),
    runId,
  }
  fsSync.writeFileSync(path.join(dir, `worker-${name}.json`), JSON.stringify(payload, null, 2))
  // Dual-write flat hub results for waiters without runId
  const hubFlat = path.join(root, '.orquestra', 'results')
  fsSync.mkdirSync(hubFlat, { recursive: true })
  fsSync.writeFileSync(path.join(hubFlat, `worker-${name}.json`), JSON.stringify(payload, null, 2))
}

test('wait-seeded: command-file recruit + seeded results → CLI wait 0', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orquestra-wait-seeded-'))
  const { electronApp, mainWindow } = await launchApp()

  try {
    expect(await mainWindow.evaluate((workspaceRoot) =>
      window.__orquestraE2E!.setWorkspaceRoot(workspaceRoot), root)).toBe(true)

    await mainWindow.waitForFunction(() => window.__orquestraE2E?.ready === true, { timeout: 15_000 })
    await mainWindow.waitForSelector('[data-canvas-panel-id]', { timeout: 15_000 })

    const maestroNodeId = await seedTerminal(mainWindow, { x: 80, y: 120 })
    await expect.poll(() => mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.terminalPtyId(nodeId), maestroNodeId)).not.toBeNull()

    expect(await mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.enableMaestro(nodeId), maestroNodeId)).toBe(true)

    await expect.poll(async () => {
      try {
        await fs.access(path.join(root, '.orquestra', 'cli', 'orquestra.cjs'))
        return true
      } catch {
        try {
          await fs.access(path.join(root, '.orquestra', 'cli', 'orquestra.js'))
          return true
        } catch {
          return false
        }
      }
    }).toBe(true)

    const registryPath = path.join(root, '.orquestra', 'registry.json')
    await expect.poll(async () => {
      try {
        const reg = JSON.parse(await fs.readFile(registryPath, 'utf-8')) as {
          runs?: Array<{ runId?: string; maestroPtyId?: string }>
        }
        return Boolean(reg.runs?.[0]?.runId && reg.runs?.[0]?.maestroPtyId)
      } catch {
        return false
      }
    }, { timeout: 15_000 }).toBe(true)

    const reg = JSON.parse(await fs.readFile(registryPath, 'utf-8')) as {
      runs: Array<{ runId: string; maestroPtyId: string }>
    }
    const run = reg.runs[0]
    const runCmdDir = path.join(root, '.orquestra', 'runs', run.runId, 'commands')
    fsSync.mkdirSync(runCmdDir, { recursive: true })

    const workers = [
      { name: 'seed-html', role: 'E2E HTML seed worker' },
      { name: 'seed-css', role: 'E2E CSS seed worker' },
    ] as const

    for (const w of workers) {
      const cmdPayload = {
        cmd: 'recruit',
        args: { role: w.role, agent: null, name: w.name },
        timestamp: Date.now(),
        maestroId: run.maestroPtyId,
        runId: run.runId,
      }
      const filename = `cmd-${Date.now()}-${w.name}.json`
      fsSync.writeFileSync(path.join(runCmdDir, filename), JSON.stringify(cmdPayload))
    }

    await expect.poll(async () => {
      const nodes = await mainWindow.evaluate(() => window.__orquestraE2E!.nodes())
      return nodes.length >= 3 // maestro + 2 workers
    }, { timeout: 25_000 }).toBe(true)

    // Seed disk results as product writers would (no real agent idle)
    for (const w of workers) {
      writeRunWorkerResult(root, run.runId, w.name, 'done', `${w.name} ready`)
    }

    const wait = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'wait',
        '--run', run.runId,
        '--workers', 'seed-html,seed-css',
        '--timeout', '5',
        '--poll', '200',
      ],
      { cwd: root, encoding: 'utf-8', timeout: 15_000 },
    )
    expect(wait.status, `wait stderr: ${wait.stderr}\nstdout: ${wait.stdout}`).toBe(0)
    expect(wait.stdout ?? '').toContain('WORKER_RESULT:seed-html:DONE:')
    expect(wait.stdout ?? '').toContain('WORKER_RESULT:seed-css:DONE:')
  } finally {
    await closeApp(electronApp)
    await fs.rm(root, { recursive: true, force: true })
  }
})
