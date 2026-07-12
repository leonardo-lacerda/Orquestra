import { describe, expect, it, vi, afterEach } from 'vitest'
import { joinReleaseUrl, resolveLatestInstallerDownloadUrl } from './auto-updater'

describe('joinReleaseUrl', () => {
  it('encodes spaces in the installer name', () => {
    expect(joinReleaseUrl('https://pub.example.r2.dev', 'v1.5.2/Orquestra Setup 1.5.2.exe'))
      .toBe('https://pub.example.r2.dev/v1.5.2/Orquestra%20Setup%201.5.2.exe')
  })
})

describe('resolveLatestInstallerDownloadUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('heals double version prefixes and returns a HEAD-ok URL', async () => {
    const yml = [
      'version: 1.5.2',
      'path: v1.5.2/v1.5.2/Orquestra Setup 1.5.2.exe',
      'files:',
      '  - url: v1.5.2/v1.5.2/Orquestra Setup 1.5.2.exe',
    ].join('\n')

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
      const u = String(url)
      if (u.endsWith('/latest.yml')) {
        return { ok: true, text: async () => yml }
      }
      if (init?.method === 'HEAD') {
        // Broken double path 404s; healed single path is ok.
        if (u.includes('v1.5.2/v1.5.2/')) {
          return { ok: false }
        }
        if (u.includes('v1.5.2/Orquestra%20Setup%201.5.2.exe')) {
          return { ok: true }
        }
        return { ok: false }
      }
      return { ok: false, text: async () => '' }
    }))

    const url = await resolveLatestInstallerDownloadUrl('https://pub.example.r2.dev', 'win32')
    expect(url).toBe('https://pub.example.r2.dev/v1.5.2/Orquestra%20Setup%201.5.2.exe')
  })
})
