import { describe, expect, it } from 'vitest'
import {
  MAESTRO_BLOCK_END,
  MAESTRO_BLOCK_START,
  mergeMaestroIntoClaudeLocal,
  removeMaestroFromClaudeLocal,
  wrapMaestroInstructions,
} from './claudeLocalManaged'

describe('claudeLocalManaged', () => {
  it('wraps body with markers', () => {
    const w = wrapMaestroInstructions('# Maestro Mode\nhello')
    expect(w).toContain(MAESTRO_BLOCK_START)
    expect(w).toContain(MAESTRO_BLOCK_END)
    expect(w).toContain('# Maestro Mode')
  })

  it('preserves user text outside markers on re-enable', () => {
    const prev =
      'User notes stay\n'
      + `${MAESTRO_BLOCK_START}\nold maestro\n${MAESTRO_BLOCK_END}\n`
      + 'Footer stays\n'
    const next = mergeMaestroIntoClaudeLocal(prev, '# Maestro Mode\nNEW')
    expect(next).toContain('User notes stay')
    expect(next).toContain('Footer stays')
    expect(next).toContain('NEW')
    expect(next).not.toContain('old maestro')
  })

  it('appends managed block when markers missing (keeps prior content)', () => {
    const next = mergeMaestroIntoClaudeLocal('my hand edits\n', '# Maestro Mode\nX')
    expect(next).toContain('my hand edits')
    expect(next).toContain(MAESTRO_BLOCK_START)
    expect(next).toContain('# Maestro Mode')
  })

  it('removeMaestro keeps user text and drops managed block', () => {
    const prev =
      'Keep me\n'
      + `${MAESTRO_BLOCK_START}\n# Maestro Mode\n${MAESTRO_BLOCK_END}\n`
    const next = removeMaestroFromClaudeLocal(prev)
    expect(next).toContain('Keep me')
    expect(next).not.toContain('Maestro Mode')
    expect(next).not.toContain(MAESTRO_BLOCK_START)
  })

  it('removeMaestro returns null for legacy full Maestro-only file', () => {
    const prev = '# Maestro Mode -- ACTIVE\nYou are the ORCHESTRATOR (Maestro)\n'
    expect(removeMaestroFromClaudeLocal(prev)).toBeNull()
  })
})
