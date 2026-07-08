import { describe, expect, it } from 'vitest'
import { disambiguateTitle } from './panelTitle'

type P = Record<string, { title: string }>

describe('disambiguateTitle', () => {
  it('leaves a unique title untouched', () => {
    const panels: P = { a: { title: 'Codex · orquestra' }, b: { title: 'Claude Code' } }
    expect(disambiguateTitle('Codex · orquestra', 'a', panels)).toBe('Codex · orquestra')
  })

  it('appends " 2" when a sibling already shows the same title', () => {
    const panels: P = { a: { title: 'Codex · orquestra' }, b: { title: 'Codex · orquestra' } }
    expect(disambiguateTitle('Codex · orquestra', 'b', panels)).toBe('Codex · orquestra 2')
  })

  it('skips suffixes already in use by siblings', () => {
    const panels: P = {
      a: { title: 'Codex · orquestra' },
      b: { title: 'Codex · orquestra 2' },
      c: { title: 'Codex · orquestra' },
    }
    expect(disambiguateTitle('Codex · orquestra', 'c', panels)).toBe('Codex · orquestra 3')
  })

  it('ignores the panel being titled when checking for collisions', () => {
    // The panel's own current title must not count as a conflict with itself.
    const panels: P = { a: { title: 'Codex · orquestra 2' }, b: { title: 'Codex · orquestra' } }
    expect(disambiguateTitle('Codex · orquestra', 'a', panels)).toBe('Codex · orquestra 2')
  })

  it('stays stable as each panel re-asserts its base every update', () => {
    // Two panels with the same base, applied repeatedly in alternating order:
    // the result must settle (one bare, one " 2") and never oscillate.
    const panels: P = { a: { title: '' }, b: { title: '' } }
    const tick = (id: 'a' | 'b') => {
      panels[id].title = disambiguateTitle('Codex · orquestra', id, panels)
    }
    for (let i = 0; i < 6; i++) { tick('a'); tick('b') }
    const titles = [panels.a.title, panels.b.title].sort()
    expect(titles).toEqual(['Codex · orquestra', 'Codex · orquestra 2'])
  })

  it('collapses the suffix once the bases diverge', () => {
    // a keeps the shared base; b picks up a distinct live task.
    const panels: P = { a: { title: 'Claude Code' }, b: { title: 'Claude Code 2' } }
    panels.b.title = disambiguateTitle('Claude Code · Running tests', 'b', panels)
    panels.a.title = disambiguateTitle('Claude Code', 'a', panels)
    expect(panels.b.title).toBe('Claude Code · Running tests')
    expect(panels.a.title).toBe('Claude Code') // suffix dropped — no more collision
  })
})
