/**
 * Unit tests for R2 keep-2-versions prune / filter helpers (no network).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  cmpSemver,
  isCurrentVersionArtifact,
  planPruneKeys,
  patchLatestYmlArtifactPaths,
} from './publish-release.mjs'

describe('cmpSemver', () => {
  it('orders versions', () => {
    assert.equal(cmpSemver('1.5.5', '1.5.4'), 1)
    assert.equal(cmpSemver('1.5.3', '1.5.4'), -1)
    assert.equal(cmpSemver('1.5.5', '1.5.5'), 0)
    assert.equal(cmpSemver('v1.5.5', '1.5.4'), 1)
  })
})

describe('isCurrentVersionArtifact', () => {
  it('accepts latest.yml and matching flat/versioned files', () => {
    assert.equal(isCurrentVersionArtifact('latest.yml', '1.5.5'), true)
    assert.equal(isCurrentVersionArtifact('Orquestra Setup 1.5.5.exe', '1.5.5'), true)
    assert.equal(isCurrentVersionArtifact('Orquestra-1.5.5-win.zip', '1.5.5'), true)
    assert.equal(isCurrentVersionArtifact('v1.5.5/Orquestra Setup 1.5.5.exe', '1.5.5'), true)
  })
  it('rejects older leftovers', () => {
    assert.equal(isCurrentVersionArtifact('Orquestra Setup 1.5.3.exe', '1.5.5'), false)
    assert.equal(isCurrentVersionArtifact('v1.5.3/Orquestra Setup 1.5.3.exe', '1.5.5'), false)
    assert.equal(isCurrentVersionArtifact('v1.5.5/Orquestra Setup 1.5.3.exe', '1.5.5'), false)
  })
})

describe('planPruneKeys', () => {
  it('keeps latest.yml + 2 newest version folders, drops junk and flat root', () => {
    const keys = [
      'latest.yml',
      'Orquestra Setup 1.5.5.exe',
      'v1.5.5/Orquestra Setup 1.5.5.exe',
      'v1.5.5/Orquestra Setup 1.5.3.exe', // junk from bad publish
      'v1.5.4/Orquestra Setup 1.5.4.exe',
      'v1.5.3/Orquestra Setup 1.5.3.exe',
      'v1.5.2/Orquestra-1.5.2-win.zip',
      'v1.5.1/Orquestra Setup 1.5.1.exe',
    ]
    const { keepVersions, toDelete } = planPruneKeys(keys, '1.5.5', 2)
    assert.deepEqual(keepVersions, ['1.5.5', '1.5.4'])
    assert.ok(toDelete.includes('Orquestra Setup 1.5.5.exe'))
    assert.ok(toDelete.includes('v1.5.5/Orquestra Setup 1.5.3.exe'))
    assert.ok(toDelete.includes('v1.5.3/Orquestra Setup 1.5.3.exe'))
    assert.ok(toDelete.includes('v1.5.2/Orquestra-1.5.2-win.zip'))
    assert.ok(toDelete.includes('v1.5.1/Orquestra Setup 1.5.1.exe'))
    assert.ok(!toDelete.includes('latest.yml'))
    assert.ok(!toDelete.includes('v1.5.5/Orquestra Setup 1.5.5.exe'))
    assert.ok(!toDelete.includes('v1.5.4/Orquestra Setup 1.5.4.exe'))
  })
})

describe('patchLatestYmlArtifactPaths', () => {
  it('prefixes version once', () => {
    const yml = 'version: 1.5.5\npath: Orquestra Setup 1.5.5.exe\nfiles:\n  - url: Orquestra Setup 1.5.5.exe\n'
    const out = patchLatestYmlArtifactPaths(yml, '1.5.5')
    assert.match(out, /path: v1\.5\.5\/Orquestra Setup 1\.5\.5\.exe/)
    assert.doesNotMatch(out, /v1\.5\.5\/v1\.5\.5\//)
  })
})
