/**
 * Orchestration smoke: maestro terminal → recruit ×2 → seed result files → wait OK.
 *
 * Uses the e2e harness for deterministic recruit/status (same run tracker + canvas
 * nodes the product uses). The wait CLI is the shipped scripts/maestro/orquestra.js.
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

function writeWorkerResult(
  root: string,
  name: string,
  status: 'done' | 'failed' = 'done',
  summary = 'ok',
): void {
  const dir = path.join(root, '.orquestra-results')
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
  }
  fsSync.writeFileSync(path.join(dir, `worker-${name}.json`), JSON.stringify(payload, null, 2))
}

test('orchestration smoke: recruit workers, seed results, wait succeeds', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orquestra-orch-smoke-'))
  const { electronApp, mainWindow } = await launchApp()

  try {
    expect(await mainWindow.evaluate((workspaceRoot) =>
      window.__orquestraE2E!.setWorkspaceRoot(workspaceRoot), root)).toBe(true)

    // setWorkspaceRoot can remount canvas; wait for harness + canvas again.
    await mainWindow.waitForFunction(() => window.__orquestraE2E?.ready === true, { timeout: 15_000 })
    await mainWindow.waitForSelector('[data-canvas-panel-id]', { timeout: 15_000 })

    const maestroNodeId = await seedTerminal(mainWindow, { x: 80, y: 120 })

    await expect.poll(() => mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.terminalPtyId(nodeId), maestroNodeId)).not.toBeNull()

    expect(await mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.enableMaestro(nodeId), maestroNodeId)).toBe(true)

    // CLI should be copied into the workspace by terminalSetMaestro
    await expect.poll(async () => {
      try {
        await fs.access(path.join(root, 'orquestra.js'))
        return true
      } catch {
        return false
      }
    }).toBe(true)

    const worker1 = await mainWindow.evaluate(({ maestro, point }) =>
      window.__orquestraE2E!.recruitWorker({
        maestroNodeId: maestro,
        name: 'worker-html',
        role: 'Build HTML',
        point,
      }), { maestro: maestroNodeId, point: { x: 700, y: 120 } })
    const worker2 = await mainWindow.evaluate(({ maestro, point }) =>
      window.__orquestraE2E!.recruitWorker({
        maestroNodeId: maestro,
        name: 'worker-css',
        role: 'Build CSS',
        point,
      }), { maestro: maestroNodeId, point: { x: 700, y: 480 } })

    expect(worker1).toBeTruthy()
    expect(worker2).toBeTruthy()

    const nodes = await mainWindow.evaluate(() => window.__orquestraE2E!.nodes())
    // Maestro + 2 workers (plus any prior seed) — at least 3 nodes
    expect(nodes.length).toBeGreaterThanOrEqual(3)

    const tracked = await mainWindow.evaluate((maestro) =>
      window.__orquestraE2E!.orchestrationWorkers(maestro), maestroNodeId)
    expect(tracked).toHaveLength(2)
    expect(tracked.map((w) => w.name).sort()).toEqual(['worker-css', 'worker-html'])
    expect(tracked.every((w) => w.status === 'recruiting')).toBe(true)

    for (const w of tracked) {
      await mainWindow.evaluate((panelId) =>
        window.__orquestraE2E!.markWorkerDone(panelId, 'done'), w.panelId)
    }

    const afterDone = await mainWindow.evaluate((maestro) =>
      window.__orquestraE2E!.orchestrationWorkers(maestro), maestroNodeId)
    expect(afterDone.every((w) => w.status === 'done')).toBe(true)

    writeWorkerResult(root, 'worker-html', 'done', 'HTML ready')
    writeWorkerResult(root, 'worker-css', 'done', 'CSS ready')

    const wait = spawnSync(
      process.execPath,
      [CLI_PATH, 'wait', '--workers', 'worker-html,worker-css', '--timeout', '5', '--poll', '200'],
      { cwd: root, encoding: 'utf-8', timeout: 15_000 },
    )
    expect(wait.status).toBe(0)
    expect(wait.stdout ?? '').toContain('WORKER_RESULT:worker-html:DONE:')
    expect(wait.stdout ?? '').toContain('WORKER_RESULT:worker-css:DONE:')
  } finally {
    await closeApp(electronApp)
    await fs.rm(root, { recursive: true, force: true })
  }
})
