import { describe, expect, it } from 'vitest'
import { evaluateAcceptCriteria, formatAcceptResults, inferAcceptFromRole } from './accept'
import type { AcceptFs } from './accept'

function memFs(files: Record<string, string>): AcceptFs {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const fileMap = new Map<string, string>()
  for (const [f, body] of Object.entries(files)) {
    fileMap.set(norm(f), body)
  }
  // Synthetic dirs implied by file paths (notes-api/notes.test.js → notes-api)
  const dirs = new Set<string>()
  for (const f of fileMap.keys()) {
    const parts = f.split('/')
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'))
    }
  }
  const resolveKey = (p: string) => {
    const key = norm(p)
    // Match absolute-ish keys that end with a known relative path
    for (const f of fileMap.keys()) {
      if (key === f || key.endsWith('/' + f)) return f
    }
    for (const d of dirs) {
      if (key === d || key.endsWith('/' + d)) return d
    }
    return key
  }
  return {
    existsSync(p) {
      const k = resolveKey(p)
      return fileMap.has(k) || dirs.has(k)
    },
    readFileSync(p) {
      const k = resolveKey(p)
      const body = fileMap.get(k)
      if (body === undefined) throw new Error('ENOENT ' + p)
      return body
    },
    readdirSync(p) {
      const k = resolveKey(p)
      // Root listing: top-level names
      const names = new Set<string>()
      const prefix = k === '' || k === 'C:/proj' || k.endsWith('/proj') ? '' : k + '/'
      for (const f of fileMap.keys()) {
        if (prefix && !f.startsWith(prefix)) continue
        const rest = prefix ? f.slice(prefix.length) : f
        const name = rest.split('/')[0]
        if (name) names.add(name)
      }
      for (const d of dirs) {
        if (prefix && !d.startsWith(prefix) && d !== k) continue
        if (!prefix && d.includes('/')) {
          names.add(d.split('/')[0])
        } else if (prefix && d.startsWith(prefix)) {
          const rest = d.slice(prefix.length)
          const name = rest.split('/')[0]
          if (name) names.add(name)
        } else if (d === k.replace(/^.*\//, '') || (!prefix && !d.includes('/'))) {
          /* parent */
        }
      }
      // Simpler: for workspace root C:/proj, list first path segments
      if (k === 'C:/proj' || k.endsWith('/proj') || k === '') {
        for (const f of fileMap.keys()) names.add(f.split('/')[0])
        for (const d of dirs) names.add(d.split('/')[0])
      } else {
        for (const f of fileMap.keys()) {
          if (!f.startsWith(k + '/')) continue
          names.add(f.slice(k.length + 1).split('/')[0])
        }
      }
      return [...names]
    },
    isDirectory(p) {
      const k = resolveKey(p)
      return dirs.has(k) || k === 'C:/proj' || k.endsWith('/proj')
    },
  }
}

describe('accept criteria', () => {
  it('does not pass file_exists when only output echo/marker present', () => {
    const fs = memFs({})
    const r = evaluateAcceptCriteria(
      {
        workspaceRoot: 'C:/proj',
        criteria: [
          { type: 'file_exists', path: 'src/app.ts' },
          { type: 'marker' },
        ],
        outputLines: [
          'You are the worker. Do this job now.',
          'ORQUESTRA_WORKER_DONE',
        ],
      },
      fs,
    )
    expect(r.ok).toBe(false)
    expect(r.results.find((x) => x.type === 'file_exists')?.ok).toBe(false)
    expect(r.results.find((x) => x.type === 'marker')?.ok).toBe(true)
    expect(formatAcceptResults(r.results)).toMatch(/missing/)
  })

  it('passes when required file exists and marker present', () => {
    const fs = memFs({ 'src/app.ts': 'export const x = 1\n' })
    const r = evaluateAcceptCriteria(
      {
        workspaceRoot: 'C:/proj',
        criteria: [
          { type: 'file_exists', path: 'src/app.ts' },
          { type: 'marker' },
        ],
        outputLines: ['Created src/app.ts', 'ORQUESTRA_WORKER_DONE'],
      },
      fs,
    )
    expect(r.ok).toBe(true)
  })

  it('file_contains checks pattern', () => {
    const fs = memFs({ 'readme.md': '# Hello world\n' })
    const ok = evaluateAcceptCriteria(
      {
        workspaceRoot: 'C:/proj',
        criteria: [{ type: 'file_contains', path: 'readme.md', pattern: 'Hello' }],
      },
      fs,
    )
    expect(ok.ok).toBe(true)
    const bad = evaluateAcceptCriteria(
      {
        workspaceRoot: 'C:/proj',
        criteria: [{ type: 'file_contains', path: 'readme.md', pattern: 'MissingToken' }],
      },
      fs,
    )
    expect(bad.ok).toBe(false)
  })

  it('infers file_exists from role text', () => {
    const c = inferAcceptFromRole('Create only src/auth/login.ts for the login form')
    expect(c.some((x) => x.type === 'file_exists' && x.path.includes('login.ts'))).toBe(true)
    expect(c.some((x) => x.type === 'marker')).toBe(true)
  })

  it('resolves file_exists via basename when worker put files under a subfolder', () => {
    // Role/heuristic said notes.test.js at root; worker wrote notes-api/notes.test.js
    const fs = memFs({
      'notes-api/notes.test.js': 'test("ok", () => {})\n',
      'notes-api/server.js': 'module.exports = {}\n',
    })
    const r = evaluateAcceptCriteria(
      {
        workspaceRoot: 'C:/proj',
        criteria: [
          { type: 'file_exists', path: 'notes.test.js' },
          { type: 'file_exists', path: 'server.js' },
          { type: 'marker' },
        ],
        outputLines: [
          'Wrote notes-api/notes.test.js',
          'All 4 tests passed',
          'ORQUESTRA_WORKER_DONE',
        ],
      },
      fs,
    )
    expect(r.ok).toBe(true)
    expect(r.results.filter((x) => x.type === 'file_exists').every((x) => x.ok)).toBe(true)
    expect(r.results.find((x) => x.type === 'file_exists')?.detail).toMatch(/notes-api|resolved|output/i)
  })

  it('still fails file_exists when basename is truly absent', () => {
    const fs = memFs({ 'readme.md': 'hi\n' })
    const r = evaluateAcceptCriteria(
      {
        workspaceRoot: 'C:/proj',
        criteria: [{ type: 'file_exists', path: 'missing.ts' }, { type: 'marker' }],
        outputLines: ['ORQUESTRA_WORKER_DONE'],
      },
      fs,
    )
    expect(r.ok).toBe(false)
    expect(r.results.find((x) => x.type === 'file_exists')?.ok).toBe(false)
  })
})
