import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchApp, closeApp, dragMouse } from './fixtures/electron-app'

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  ;({ electronApp: app, mainWindow: page } = await launchApp())
  await page.evaluate(() => window.__orquestraE2E!.createTerminal({ x: 40, y: 40 }))
  await page.waitForSelector('[data-node-id]')
})

test.afterEach(async () => closeApp(app))

async function canvasPoint(dx: number, dy: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('[data-canvas-container]').first().boundingBox()
  if (!box) throw new Error('Canvas is not visible')
  return { x: box.x + dx, y: box.y + dy }
}

async function openDrawingTool(): Promise<void> {
  await page.locator('[data-onboarding="toolbar"] button').nth(2).click()
}

test('rectangle, arrow and line gestures create visible canvas drawings', async () => {
  await openDrawingTool()

  // A zero-sized root SVG still reports child geometry in Chromium, but its
  // children can be discarded at paint time. Keep the annotation viewport
  // non-zero so this test catches the original invisible-drawings regression.
  const layerBox = await page.locator('[data-drawing-layer]').boundingBox()
  expect(layerBox?.width).toBeGreaterThan(0)
  expect(layerBox?.height).toBeGreaterThan(0)

  for (let index = 0; index < 3; index += 1) {
    await page.locator('[data-onboarding="toolbar"] button').nth(3 + index).click()
    await dragMouse(
      page,
      await canvasPoint(180 + index * 40, 180 + index * 40),
      await canvasPoint(300 + index * 40, 250 + index * 40),
    )
    await expect(page.locator('[data-drawing-id]')).toHaveCount(index + 1)
    const drawing = page.locator('[data-drawing-id]').nth(index)
    await expect(drawing).toBeVisible()
    const box = await drawing.boundingBox()
    expect(box?.width).toBeGreaterThan(20)
    expect(box?.height).toBeGreaterThan(index === 0 ? 20 : 0)
  }
})

test('text tool creates a visible annotation', async () => {
  await openDrawingTool()
  await page.locator('[data-onboarding="toolbar"] button').nth(6).click()
  const point = await canvasPoint(240, 220)
  await page.mouse.click(point.x, point.y)

  const input = page.locator('input[placeholder="Type..."]')
  await expect(input).toBeVisible()
  await input.fill('anotação')
  await input.press('Enter')

  await expect(page.locator('[data-drawing-id]')).toHaveCount(1)
  await expect(page.locator('text[data-drawing-id]')).toHaveText('anotação')
  await expect(page.locator('text[data-drawing-id]')).toBeVisible()
})
