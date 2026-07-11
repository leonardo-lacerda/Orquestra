/**
 * Static product-positioning checks for orchestration beta:
 * Experimental OrchestrationPanel label, Maestro first-run copy, honest permissions.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { PANEL_DEFINITIONS } from '../../shared/panels'
import { translations } from '../i18n/translations'
import { ONBOARDING_STEPS } from '../onboarding/steps'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

describe('orchestration product positioning', () => {
  it('labels OrchestrationPanel as experimental', () => {
    expect(PANEL_DEFINITIONS.orchestration.label.toLowerCase()).toMatch(/experimental/)
  })

  it('settings intro states permissions are guidance not a sandbox', () => {
    const intro = translations.en['orchestration.intro']
    expect(intro.toLowerCase()).toMatch(/not a full sandbox|not a sandbox/)
    expect(intro.toLowerCase()).toMatch(/maestro|crown/)
    expect(intro.toLowerCase()).toMatch(/experimental/)
    expect(translations.en['orchestration.allowFileEdits.desc'].toLowerCase()).toMatch(
      /not a hard sandbox|not a sandbox|not os-level|not a network firewall|guidance/,
    )
  })

  it('onboarding includes Maestro first-run steps', () => {
    const maestroStep = ONBOARDING_STEPS.find((s) => s.id === 'maestro')
    expect(maestroStep).toBeTruthy()
    expect(maestroStep!.body.toLowerCase()).toMatch(/maestro|crown/)
    expect(maestroStep!.body.toLowerCase()).toMatch(/worker/)
    expect(translations.en['onboarding.step5Body']).toMatch(/Maestro/)
    expect(translations['pt-BR']['onboarding.step5Body']).toMatch(/Maestro/)
  })

  it('crown popover renders full orchestrator controls', () => {
    const canvasNode = fs.readFileSync(
      path.join(REPO, 'src/renderer/canvas/CanvasNode.tsx'),
      'utf-8',
    )
    const popover = fs.readFileSync(
      path.join(REPO, 'src/renderer/canvas/MaestroSettingsPopover.tsx'),
      'utf-8',
    )
    expect(canvasNode).toContain('MaestroSettingsPopover')
    expect(canvasNode).toContain('listForMaestro')
    expect(popover).toContain('data-maestro-settings-popover')
    expect(popover).toContain('data-maestro-worker-agent')
    expect(popover).toContain('data-maestro-permission-mode')
    expect(popover).toContain('data-maestro-launch-cmd')
    expect(popover).toContain('data-maestro-mode')
    expect(popover).toContain('data-maestro-max-workers')
    expect(popover).toContain('data-maestro-task-split')
    expect(popover).toContain('orchestrationAllowFileEdits')
    expect(popover).toContain('orchestrationOnWorkerDone')
  })
})
