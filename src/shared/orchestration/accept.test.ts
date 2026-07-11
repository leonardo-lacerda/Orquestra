import { describe, expect, it } from 'vitest'
import { evaluateAcceptCriteria, formatAcceptResults, inferAcceptFromRole } from './accept'
import type { AcceptFs } from './accept'

function memFs(files: Record<string, string>): AcceptFs {
  const norm = (p: string) => p.replace(/\\/g, '/')
  return {
    existsSync(p) {
      const key = norm(p)
      return Object.keys(files).some((f) => key === norm(f) || key.endsWith('/' + f) || key.endsWith(f))
    },
    readFileSync(p) {
      const key = norm(p)
      for (const [f, body] of Object.entries(files)) {
        if (key === norm(f) || key.endsWith('/' + f) || key.endsWith(f)) return body
      }
      throw new Error('ENOENT ' + p)
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
})
