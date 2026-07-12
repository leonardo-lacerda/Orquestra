import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Keep in sync with patchLatestYmlArtifactPaths in publish-release.mjs
function patchLatestYmlArtifactPaths(content, version) {
  const v = String(version || '').replace(/^v/i, '')
  if (!v) return content
  const prefix = `v${v}/`
  const fixRest = (rest) => {
    let r = String(rest || '').trim()
    const re = new RegExp(`^(?:v${v.replace(/\./g, '\\.')}/)+`)
    r = r.replace(re, '')
    if (/^v\d+\.\d+\.\d+\//.test(r)) return r
    return prefix + r
  }
  return content
    .replace(/^(path:\s*)(.+)$/m, (_, p, rest) => `${p}${fixRest(rest)}`)
    .replace(/^(\s+- url:\s*)(.+)$/m, (_, p, rest) => `${p}${fixRest(rest)}`)
}

describe('patchLatestYmlArtifactPaths', () => {
  it('prefixes bare artifact names', () => {
    const out = patchLatestYmlArtifactPaths(
      'version: 1.5.2\npath: Orquestra Setup 1.5.2.exe\nfiles:\n  - url: Orquestra Setup 1.5.2.exe\n',
      '1.5.2',
    )
    assert.match(out, /^path: v1\.5\.2\/Orquestra Setup 1\.5\.2\.exe$/m)
    assert.match(out, /^\s+- url: v1\.5\.2\/Orquestra Setup 1\.5\.2\.exe$/m)
  })

  it('does not double-prefix already versioned paths', () => {
    const out = patchLatestYmlArtifactPaths(
      'version: 1.5.2\npath: v1.5.2/Orquestra Setup 1.5.2.exe\n',
      '1.5.2',
    )
    assert.match(out, /^path: v1\.5\.2\/Orquestra Setup 1\.5\.2\.exe$/m)
    assert.doesNotMatch(out, /v1\.5\.2\/v1\.5\.2\//)
  })

  it('collapses doubled version prefixes', () => {
    const out = patchLatestYmlArtifactPaths(
      'version: 1.5.2\npath: v1.5.2/v1.5.2/Orquestra Setup 1.5.2.exe\n',
      '1.5.2',
    )
    assert.equal(
      out.match(/^path:\s*(.+)$/m)?.[1],
      'v1.5.2/Orquestra Setup 1.5.2.exe',
    )
  })
})
