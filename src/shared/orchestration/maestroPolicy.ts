// =============================================================================
// Maestro anti-self-implement policy helpers (pure).
// =============================================================================

/**
 * Paths that look like project deliverables (not orchestration control files).
 * Used to flag Maestro writes during an active run.
 */
export function isDeliverablePath(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!p || p.endsWith('/')) return false
  // Never treat orquestra control plane as deliverable violation
  if (p.startsWith('.orquestra/') || p.includes('/.orquestra/')) return false
  if (p === 'orquestra.js' || p === 'orquestra.cjs' || p === 'orquestra.cmd') return false
  if (p.endsWith('/orquestra.js') || p.endsWith('/orquestra.cjs') || p.endsWith('/orquestra.cmd')) return false
  if (p.startsWith('.claude/')) return false
  if (p === '.orquestra-commands' || p.startsWith('.orquestra-commands/')) return false
  if (p === '.orquestra-results' || p.startsWith('.orquestra-results/')) return false
  if (p.startsWith('node_modules/')) return false
  // Has an extension → likely a source/doc deliverable
  return /\.[a-zA-Z0-9]+$/.test(p)
}

export interface PolicyViolation {
  path: string
  reason: string
}

/**
 * Evaluate whether a set of written relative paths violates Maestro
 * "orchestrator must not implement deliverables" during an active run.
 */
export function evaluateMaestroWritePolicy(
  writtenRelativePaths: string[],
  opts?: { activeRun: boolean },
): { ok: boolean; violations: PolicyViolation[] } {
  if (opts?.activeRun === false) {
    return { ok: true, violations: [] }
  }
  const violations: PolicyViolation[] = []
  for (const raw of writtenRelativePaths) {
    const p = raw.replace(/\\/g, '/')
    if (isDeliverablePath(p)) {
      violations.push({
        path: p,
        reason: 'Maestro must not create/edit project deliverables during an active orchestration run',
      })
    }
  }
  return { ok: violations.length === 0, violations }
}

export function formatPolicyViolations(violations: PolicyViolation[]): string {
  if (violations.length === 0) return 'policy ok'
  return violations.map((v) => `${v.path}: ${v.reason}`).join('; ')
}

/** Optional agent command mapping by role template id. */
export function resolveAgentCommandForTemplate(
  templateId: string | undefined,
  mapping: Record<string, string> | undefined,
  fallback: string,
): string {
  if (templateId && mapping?.[templateId]?.trim()) return mapping[templateId].trim()
  return fallback.trim() || 'verboo'
}
