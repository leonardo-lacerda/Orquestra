/**
 * E2E gate A1: real command file → watcher → recruit (canvas workers).
 *
 * Mirrors CLI `orquestra.js send()`: write under runs/{runId}/commands with
 * maestroId + runId stamps (and dual-write legacy for single-run). Result-file
 * writers are unit-tested separately (A2).
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { closeApp, launchApp, seedTerminal } from './fixtures/electron-app'

test('command-file recruit creates worker nodes on canvas', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orquestra-cmd-recruit-'))
  const { electronApp, mainWindow } = await launchApp()

  try {
    expect(await mainWindow.evaluate((workspaceRoot) =>
      window.__orquestraE2E!.setWorkspaceRoot(workspaceRoot), root)).toBe(true)

    await mainWindow.waitForFunction(() => window.__orquestraE2E?.ready === true, { timeout: 15_000 })
    await mainWindow.waitForSelector('[data-canvas-panel-id]', { timeout: 15_000 })

    const maestroNodeId = await seedTerminal(mainWindow, { x: 80, y: 120 })
    await expect.poll(() => mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.terminalPtyId(nodeId), maestroNodeId)).not.toBeNull()

    const enabled = await mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.enableMaestro(nodeId), maestroNodeId)
    expect(enabled).toBe(true)

    // CLI bootstrap (orquestra.cjs and/or orquestra.js) must land in workspace
    await expect.poll(async () => {
      try {
        await fs.access(path.join(root, 'orquestra.cjs'))
        return true
      } catch {
        try {
          await fs.access(path.join(root, 'orquestra.js'))
          return true
        } catch {
          return false
        }
      }
    }).toBe(true)

    // Wait for multi-run registry (crown arm writes registry + runs/{id}/commands)
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

    // Same shape as scripts/maestro/orquestra.js send()
    const cmdPayload = {
      cmd: 'recruit',
      args: { role: 'E2E HTML worker', agent: null, name: 'e2e-html' },
      timestamp: Date.now(),
      maestroId: run.maestroPtyId,
      runId: run.runId,
    }
    const filename = `cmd-${Date.now()}-e2e.json`
    fsSync.writeFileSync(path.join(runCmdDir, filename), JSON.stringify(cmdPayload))
    // Dual-write legacy (CLI does this for single-run older watchers)
    const legacyDir = path.join(root, '.orquestra-commands')
    fsSync.mkdirSync(legacyDir, { recursive: true })
    fsSync.writeFileSync(path.join(legacyDir, filename), JSON.stringify(cmdPayload))

    // Watcher polls ~500ms; wait for worker panel title
    await expect.poll(async () => {
      const nodes = await mainWindow.evaluate(() => window.__orquestraE2E!.nodes())
      // At least maestro + worker
      return nodes.length >= 2
    }, { timeout: 20_000 }).toBe(true)

    // Prefer asserting tracked orchestration workers if harness exposes them
    const tracked = await mainWindow.evaluate((maestro) =>
      window.__orquestraE2E!.orchestrationWorkers?.(maestro) ?? [], maestroNodeId)
    if (tracked.length > 0) {
      expect(tracked.some((w) => w.name === 'e2e-html' || w.role.includes('HTML'))).toBe(true)
    }
  } finally {
    await closeApp(electronApp)
    await fs.rm(root, { recursive: true, force: true })
  }
})
