// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createdWebgl, FakeWebgl } = vi.hoisted(() => {
  const instances: Array<{
    dispose: ReturnType<typeof vi.fn>
    clearTextureAtlas: ReturnType<typeof vi.fn>
    onContextLoss: ReturnType<typeof vi.fn>
  }> = []
  class Webgl {
    dispose = vi.fn()
    clearTextureAtlas = vi.fn()
    onContextLoss = vi.fn()

    constructor() {
      instances.push(this)
    }
  }
  return { createdWebgl: instances, FakeWebgl: Webgl }
})

vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: FakeWebgl }))
vi.mock('./terminalLifecycle', () => ({ finalizeReconnect: vi.fn() }))

import { registry } from './registryState'
import {
  cancelScheduledTuiWebglHeal,
  scheduleTuiWebglHeal,
} from './terminalDom'

describe('TUI WebGL healing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    registry.clear()
    createdWebgl.length = 0
  })

  afterEach(() => {
    cancelScheduledTuiWebglHeal()
    registry.clear()
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  it('hard-heals within the maximum wait even when full redraws keep arriving (focus path)', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const originalWebgl = new FakeWebgl()
    const loadAddon = vi.fn()
    const refresh = vi.fn()

    registry.set('panel-tui', {
      terminal: { element, rows: 24, loadAddon, refresh },
      webglAddon: originalWebgl,
    } as never)

    // focus/attach may arm hard rebuild; streaming output must not (see below).
    scheduleTuiWebglHeal({ hard: true, reason: 'focus' })
    vi.advanceTimersByTime(400)
    // Previously this reset the 520 ms timer, so a continuously repainting AI
    // TUI could postpone recovery forever.
    scheduleTuiWebglHeal({ hard: true, reason: 'focus' })
    vi.advanceTimersByTime(120)

    expect(originalWebgl.dispose).toHaveBeenCalledOnce()
    expect(loadAddon).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalled()
  })

  it('output path never hard-rebuilds even if hard:true is passed', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const originalWebgl = new FakeWebgl()
    const loadAddon = vi.fn()
    const refresh = vi.fn()

    registry.set('panel-stream', {
      terminal: { element, rows: 24, loadAddon, refresh },
      webglAddon: originalWebgl,
    } as never)

    scheduleTuiWebglHeal({ hard: true, reason: 'output' })
    vi.advanceTimersByTime(800)

    // Soft heal may refresh; hard dispose+reload must not run for streaming.
    expect(originalWebgl.dispose).not.toHaveBeenCalled()
    expect(loadAddon).not.toHaveBeenCalled()
  })
})
