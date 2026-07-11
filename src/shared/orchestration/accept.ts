// =============================================================================
// Task acceptance criteria evaluation (pure; fs injected for portability).
// =============================================================================

import {
  DEFAULT_COMPLETION_TOKEN,
  type AcceptCriterion,
  type AcceptResult,
} from './types'

export interface AcceptFs {
  existsSync(path: string): boolean
  readFileSync(path: string, encoding: 'utf-8'): string
}

export interface EvaluateAcceptInput {
  workspaceRoot: string
  criteria: AcceptCriterion[]
  /** Worker output lines (already cleaned) for marker checks */
  outputLines?: string[]
  joinPath?: (root: string, rel: string) => string
}

function defaultJoin(root: string, rel: string): string {
  const r = root.replace(/[/\\]+$/, '')
  const p = rel.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  return r + '/' + p
}

/**
 * Evaluate accept criteria. file_* use the provided fs against workspaceRoot.
 * marker scans outputLines (must not treat inject echo as the only signal when
 * combined with file criteria — caller should still filter echo for idle).
 */
export function evaluateAcceptCriteria(
  input: EvaluateAcceptInput,
  fs: AcceptFs,
): { ok: boolean; results: AcceptResult[] } {
  const join = input.joinPath ?? defaultJoin
  const lines = input.outputLines ?? []
  const criteria = input.criteria.length > 0
    ? input.criteria
    : ([{ type: 'marker' as const }])

  const results: AcceptResult[] = criteria.map((c) => {
    if (c.type === 'file_exists') {
      const abs = join(input.workspaceRoot, c.path)
      const ok = fs.existsSync(abs)
      return {
        type: 'file_exists',
        ok,
        path: c.path,
        detail: ok ? `exists: ${c.path}` : `missing: ${c.path}`,
      }
    }
    if (c.type === 'file_contains') {
      const abs = join(input.workspaceRoot, c.path)
      if (!fs.existsSync(abs)) {
        return {
          type: 'file_contains',
          ok: false,
          path: c.path,
          detail: `missing file: ${c.path}`,
        }
      }
      try {
        const body = fs.readFileSync(abs, 'utf-8')
        const re = new RegExp(c.pattern, c.flags ?? '')
        const ok = re.test(body)
        return {
          type: 'file_contains',
          ok,
          path: c.path,
          detail: ok ? `matched /${c.pattern}/ in ${c.path}` : `no match /${c.pattern}/ in ${c.path}`,
        }
      } catch (e) {
        return {
          type: 'file_contains',
          ok: false,
          path: c.path,
          detail: `read error: ${e instanceof Error ? e.message : String(e)}`,
        }
      }
    }
    // marker
    const token = (c.token ?? DEFAULT_COMPLETION_TOKEN).trim()
    const re = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const ok = lines.some((l) => re.test(l))
    return {
      type: 'marker',
      ok,
      detail: ok ? `marker found: ${token}` : `marker missing: ${token}`,
    }
  })

  return { ok: results.every((r) => r.ok), results }
}

/**
 * Heuristic: if role mentions creating a single filename, add file_exists.
 * Domain-generic (any extension).
 */
export function inferAcceptFromRole(role: string): AcceptCriterion[] {
  const r = role.trim()
  const criteria: AcceptCriterion[] = []
  // Match common "only foo.ext" / "create bar/baz.ts" patterns
  const fileRe = /\b([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)\b/g
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = fileRe.exec(r)) !== null) {
    const path = m[1].replace(/^\.\//, '')
    if (seen.has(path.toLowerCase())) continue
    // skip URLs / version-like
    if (path.includes('://')) continue
    seen.add(path.toLowerCase())
    criteria.push({ type: 'file_exists', path })
    if (criteria.length >= 3) break
  }
  criteria.push({ type: 'marker' })
  return criteria
}

export function formatAcceptResults(results: AcceptResult[]): string {
  if (results.length === 0) return 'accept=none'
  const ok = results.filter((r) => r.ok).length
  return `accept=${ok}/${results.length}: ` + results.map((r) => r.detail).join('; ')
}
