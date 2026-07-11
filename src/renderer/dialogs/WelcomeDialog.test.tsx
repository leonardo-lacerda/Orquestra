// =============================================================================
// WelcomeDialog — first-run welcome. Shows on first load before the tour;
// Continue marks onboarding as completed so it won't show again.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

vi.mock('../lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { WelcomeDialog } from './WelcomeDialog'
import { useSettingsStore } from '../stores/settingsStore'

let host: HTMLDivElement
let root: Root
const settingsSet = vi.fn(() => Promise.resolve())

function clickButton(match: (b: HTMLButtonElement) => boolean): void {
  const btn = [...host.querySelectorAll('button')].find(match as (b: Element) => boolean) as HTMLButtonElement
  if (!btn) throw new Error('button not found')
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  settingsSet.mockClear()
  ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
    ...(window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI,
    settingsSet,
  }
  useSettingsStore.setState({ _loaded: true, onboardingCompleted: false } as never)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('WelcomeDialog', () => {
  it('is hidden once onboarding is completed', () => {
    useSettingsStore.setState({ onboardingCompleted: true } as never)
    act(() => root.render(<WelcomeDialog />))
    expect(host.textContent).toBe('')
  })

  it('shows on first run (not yet completed)', () => {
    act(() => root.render(<WelcomeDialog />))
    expect(host.textContent).toContain('Welcome to Orquestra')
  })

  it('Continue sets onboardingCompleted and dismisses after the fade', () => {
    vi.useFakeTimers()
    act(() => root.render(<WelcomeDialog />))
    clickButton((b) => b.textContent?.trim() === 'Continue')
    act(() => { vi.advanceTimersByTime(350) })
    expect(useSettingsStore.getState().onboardingCompleted).toBe(true)
    vi.useRealTimers()
  })
})
