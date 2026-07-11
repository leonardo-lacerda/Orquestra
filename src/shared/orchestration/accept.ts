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
  /** Optional directory listing for basename search when exact path misses. */
  readdirSync?(path: string): string[]
  /** Optional directory test for basename walk. */
  isDirectory?(path: string): boolean
}

export interface EvaluateAcceptInput {
  workspaceRoot: string
  criteria: AcceptCriterion[]
  /** Worker output lines (already cleaned) for marker checks */
  outputLines?: string[]
  joinPath?: (root: string, rel: string) => string
}

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.orquestra',
  '.orquestra-results',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  'out',
  'vendor',
])

function defaultJoin(root: string, rel: string): string {
  const r = root.replace(/[/\\]+$/, '')
  const p = rel.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  return r + '/' + p
}

function basenameOf(rel: string): string {
  const n = rel.replace(/\\/g, '/').replace(/\/+$/, '')
  const i = n.lastIndexOf('/')
  return i >= 0 ? n.slice(i + 1) : n
}

/**
 * Paths mentioned in worker output that end with the expected basename
 * (e.g. role said notes.test.js, worker wrote notes-api/notes.test.js).
 */
export function pathsHintingBasename(lines: string[], basename: string): string[] {
  const base = basename.toLowerCase()
  if (!base) return []
  const out: string[] = []
  const seen = new Set<string>()
  // Capture path-like tokens containing the basename (notes-api/notes.test.js)
  const esc = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:^|[\\s"'(\`])((?:[\\w.@-]+/)*${esc})`, 'gi')
  for (const line of lines) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      const p = m[1].replace(/\\/g, '/').replace(/^\.\//, '')
      const key = p.toLowerCase()
      if (seen.has(key)) continue
      if (!key.endsWith(base)) continue
      seen.add(key)
      out.push(p)
    }
  }
  return out
}

/**
 * Find a file by basename under workspaceRoot (depth-limited BFS).
 * Skips heavy dirs (node_modules, .git, …). Pure when fs.readdirSync is provided.
 */
export function findFileByBasename(
  workspaceRoot: string,
  basename: string,
  fs: AcceptFs,
  opts?: { maxDepth?: number; maxVisits?: number },
): string | null {
  if (!fs.readdirSync || !basename || basename.includes('..')) return null
  const root = workspaceRoot.replace(/[/\\]+$/, '')
  const want = basename.toLowerCase()
  const maxDepth = opts?.maxDepth ?? 5
  const maxVisits = opts?.maxVisits ?? 400
  const queue: Array<{ abs: string; rel: string; depth: number }> = [
    { abs: root, rel: '', depth: 0 },
  ]
  let visits = 0
  while (queue.length > 0 && visits < maxVisits) {
    const cur = queue.shift()!
    visits++
    let names: string[]
    try {
      names = fs.readdirSync(cur.abs)
    } catch {
      continue
    }
    for (const name of names) {
      if (name === '.' || name === '..') continue
      const childRel = cur.rel ? `${cur.rel}/${name}` : name
      const childAbs = `${cur.abs}/${name}`
      if (name.toLowerCase() === want && fs.existsSync(childAbs)) {
        // Prefer files over same-named dirs
        if (!fs.isDirectory?.(childAbs)) return childRel.replace(/\\/g, '/')
      }
      if (cur.depth >= maxDepth) continue
      if (SKIP_DIR_NAMES.has(name)) continue
      if (fs.isDirectory?.(childAbs)) {
        queue.push({ abs: childAbs, rel: childRel, depth: cur.depth + 1 })
      }
    }
  }
  return null
}

/**
 * Resolve a relative file path for accept: exact hit, output hints, then basename walk.
 */
export function resolveAcceptFilePath(
  workspaceRoot: string,
  relPath: string,
  fs: AcceptFs,
  outputLines: string[] = [],
): { ok: boolean; path: string; detail: string } {
  const join = defaultJoin
  const exact = join(workspaceRoot, relPath)
  if (fs.existsSync(exact) && !fs.isDirectory?.(exact)) {
    return { ok: true, path: relPath, detail: `exists: ${relPath}` }
  }

  const base = basenameOf(relPath)
  // Prefer paths the worker itself mentioned (often notes-api/foo.js while role said foo.js)
  for (const hint of pathsHintingBasename(outputLines, base)) {
    const abs = join(workspaceRoot, hint)
    if (fs.existsSync(abs) && !fs.isDirectory?.(abs)) {
      return {
        ok: true,
        path: hint,
        detail: `exists: ${hint} (from worker output; role said ${relPath})`,
      }
    }
  }

  const found = findFileByBasename(workspaceRoot, base, fs)
  if (found) {
    return {
      ok: true,
      path: found,
      detail: `exists: ${found} (resolved from ${relPath})`,
    }
  }

  return { ok: false, path: relPath, detail: `missing: ${relPath}` }
}

/**
 * Evaluate accept criteria. file_* use the provided fs against workspaceRoot.
 * marker scans outputLines (must not treat inject echo as the only signal when
 * combined with file criteria — caller should still filter echo for idle).
 *
 * file_exists is path-smart: role may say `notes.test.js` while the worker
 * created `notes-api/notes.test.js` — output hints + basename search prevent
 * false FAILED when the deliverable actually exists.
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
      const resolved = resolveAcceptFilePath(input.workspaceRoot, c.path, fs, lines)
      return {
        type: 'file_exists',
        ok: resolved.ok,
        path: resolved.path,
        detail: resolved.detail,
      }
    }
    if (c.type === 'file_contains') {
      const resolved = resolveAcceptFilePath(input.workspaceRoot, c.path, fs, lines)
      if (!resolved.ok) {
        return {
          type: 'file_contains',
          ok: false,
          path: c.path,
          detail: `missing file: ${c.path}`,
        }
      }
      const abs = join(input.workspaceRoot, resolved.path)
      try {
        const body = fs.readFileSync(abs, 'utf-8')
        const re = new RegExp(c.pattern, c.flags ?? '')
        const ok = re.test(body)
        return {
          type: 'file_contains',
          ok,
          path: resolved.path,
          detail: ok
            ? `matched /${c.pattern}/ in ${resolved.path}`
            : `no match /${c.pattern}/ in ${resolved.path}`,
        }
      } catch (e) {
        return {
          type: 'file_contains',
          ok: false,
          path: resolved.path,
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
