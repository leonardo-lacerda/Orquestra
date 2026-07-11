import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { closeApp, launchApp, seedTerminal } from './fixtures/electron-app'

test('links editor context to a terminal and sends terminal output back to an editor', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orquestra-linked-context-'))
  const { electronApp, mainWindow } = await launchApp()

  try {
    expect(await mainWindow.evaluate((workspaceRoot) =>
      window.__orquestraE2E!.setWorkspaceRoot(workspaceRoot), root)).toBe(true)

    const editorNodeId = await mainWindow.evaluate(() =>
      window.__orquestraE2E!.createEditor({ x: 80, y: 120 }))
    const terminalNodeId = await seedTerminal(mainWindow, { x: 760, y: 120 })

    await expect.poll(() => mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.setEditorContent(nodeId, 'linked scratch content'), editorNodeId)).toBe(true)

    const targetPanelId = await mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.nodes().find((node) => node.id === nodeId)?.panelId ?? null, terminalNodeId)
    expect(targetPanelId).toBeTruthy()

    const contextConnectionId = await mainWindow.evaluate(
      ({ source, target }) => window.__orquestraE2E!.addConnection(source, target, 'context'),
      { source: editorNodeId, target: terminalNodeId },
    )
    expect(contextConnectionId).toBeTruthy()

    const bundlePath = path.join(root, '.orquestra', 'context', targetPanelId!, 'latest.md')
    await expect.poll(async () => fs.readFile(bundlePath, 'utf8').catch(() => '')).toContain('linked scratch content')

    await expect.poll(() => mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.terminalPtyId(nodeId), terminalNodeId)).not.toBeNull()
    expect(await mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.writeTerminal(nodeId, 'echo ORQUESTRA_OUTPUT_E2E\r'), terminalNodeId)).toBe(true)
    await mainWindow.waitForTimeout(500)

    const outputEditorNodeId = await mainWindow.evaluate(() =>
      window.__orquestraE2E!.createEditor({ x: 760, y: 620 }))
    await expect.poll(() => mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.setEditorContent(nodeId, ''), outputEditorNodeId)).toBe(true)

    const outputConnectionId = await mainWindow.evaluate(
      ({ source, target }) => window.__orquestraE2E!.addConnection(source, target, 'output'),
      { source: terminalNodeId, target: outputEditorNodeId },
    )
    expect(outputConnectionId).toBeTruthy()

    await expect.poll(() => mainWindow.evaluate((nodeId) =>
      window.__orquestraE2E!.editorContent(nodeId), outputEditorNodeId)).toContain('ORQUESTRA_OUTPUT_E2E')
  } finally {
    await closeApp(electronApp)
    await fs.rm(root, { recursive: true, force: true })
  }
})
