// =============================================================================
// Managed Maestro block inside workspace CLAUDE.local.md
// Enable/re-arm rewrites only the managed section; user text outside is kept.
// =============================================================================

export const MAESTRO_BLOCK_START = '<!-- ORQUESTRA-MAESTRO-START -->'
export const MAESTRO_BLOCK_END = '<!-- ORQUESTRA-MAESTRO-END -->'

/** Wrap generated Maestro instructions in managed markers. */
export function wrapMaestroInstructions(body: string): string {
  const inner = body.trimEnd()
  return `${MAESTRO_BLOCK_START}\n${inner}\n${MAESTRO_BLOCK_END}\n`
}

/**
 * Merge Maestro instructions into existing CLAUDE.local.md content.
 * - Replaces content between markers if present
 * - Otherwise appends a managed block (preserves prior user file)
 * - Empty previous → just the managed block
 */
export function mergeMaestroIntoClaudeLocal(
  previous: string | null | undefined,
  maestroBody: string,
): string {
  const block = wrapMaestroInstructions(maestroBody)
  const prev = previous ?? ''
  if (!prev.trim()) return block

  const start = prev.indexOf(MAESTRO_BLOCK_START)
  const end = prev.indexOf(MAESTRO_BLOCK_END)
  if (start >= 0 && end > start) {
    const before = prev.slice(0, start)
    const after = prev.slice(end + MAESTRO_BLOCK_END.length)
    // Drop a single leading newline after the block to avoid triple blank lines
    const afterClean = after.replace(/^\r?\n/, '')
    return `${before}${block}${afterClean}`
  }

  const sep = prev.endsWith('\n') ? '\n' : '\n\n'
  return `${prev.trimEnd()}${sep}${block}`
}

/**
 * Remove the managed Maestro block; leave user text.
 * Returns null if the file becomes empty / whitespace-only (caller may delete).
 */
export function removeMaestroFromClaudeLocal(
  previous: string | null | undefined,
): string | null {
  const prev = previous ?? ''
  if (!prev) return null
  const start = prev.indexOf(MAESTRO_BLOCK_START)
  const end = prev.indexOf(MAESTRO_BLOCK_END)
  if (start < 0 || end < start) {
    // Legacy full-file Maestro write: treat entire file as managed if it looks like ours
    if (/# Maestro Mode/i.test(prev) || /ORCHESTRATOR \(Maestro\)/i.test(prev)) {
      return null
    }
    return prev
  }
  const before = prev.slice(0, start)
  const after = prev.slice(end + MAESTRO_BLOCK_END.length).replace(/^\r?\n/, '')
  const next = `${before}${after}`.trim()
  return next.length > 0 ? `${next}\n` : null
}
