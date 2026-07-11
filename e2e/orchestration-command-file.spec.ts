/**
 * E2E gate A1: real .orquestra-commands → watcher → recruit (canvas workers).
 *
 * Result-file writers are unit-tested separately (A2). This does not claim
 * full idle→wait E2E unless results appear without seeding.
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

    await expect.poll(async () => {
      try {
        await fs.access(path.join(root, 'orquestra.js'))
        return true
      } catch {
        return false
      }
    }).toBe(true)

    // Real command-file path (same as CLI send())
    const cmdDir = path.join(root, '.orquestra-commands')
    fsSync.mkdirSync(cmdDir, { recursive: true })
    const cmdPayload = {
      cmd: 'recruit',
      args: { role: 'E2E HTML worker', agent: null, name: 'e2e-html' },
      timestamp: Date.now(),
    }
    fsSync.writeFileSync(
      path.join(cmdDir, `cmd-${Date.now()}-e2e.json`),
      JSON.stringify(cmdPayload),
    )

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
