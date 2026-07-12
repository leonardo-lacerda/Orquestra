import { beforeEach, describe, expect, it, vi } from 'vitest'

const init = vi.fn()
const captureException = vi.fn()

vi.mock('@sentry/electron/renderer', () => ({ init, captureException }))

describe('renderer Sentry initialization', () => {
  beforeEach(() => {
    vi.resetModules()
    init.mockClear()
    captureException.mockClear()
  })

  it('does not initialize or capture when the build has no DSN', async () => {
    vi.stubGlobal('__SENTRY_DSN__', '')
    const sentry = await import('./sentry')

    sentry.initRendererSentry()
    sentry.captureRendererException(new Error('test'))

    expect(init).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('initializes and captures when a DSN is configured', async () => {
    vi.stubGlobal('__SENTRY_DSN__', 'https://public@example.invalid/1')
    const sentry = await import('./sentry')

    sentry.initRendererSentry()
    const error = new Error('test')
    sentry.captureRendererException(error, { panelId: 'panel-1' })

    expect(init).toHaveBeenCalledOnce()
    expect(captureException).toHaveBeenCalledWith(error, {
      extra: { panelId: 'panel-1' },
    })
  })
})
