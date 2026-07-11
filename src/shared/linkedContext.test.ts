import { describe, expect, it } from 'vitest'
import {
  CLAUDE_LINKED_CONTEXT_BEGIN,
  CLAUDE_LINKED_CONTEXT_END,
  formatLinkedContextClaudeInstructions,
  formatLinkedContextIndex,
  formatLinkedContextMarkdown,
  linkedContextClaudeRuleMarkdown,
  linkedContextSkillMarkdown,
  LINKED_CONTEXT_SKILL_SLUG,
  upsertManagedMarkdownSection,
} from './linkedContext'

describe('linked context markdown formatter', () => {
  it('formats source text as a readable markdown bundle', () => {
    const markdown = formatLinkedContextMarkdown({
      targetPanelId: 'term-1',
      targetNodeId: 'node-term',
      updatedAt: 0,
      sources: [{
        connectionId: 'conn-1',
        sourcePanelId: 'editor-1',
        sourceNodeId: 'node-editor',
        targetPanelId: 'term-1',
        targetNodeId: 'node-term',
        kind: 'editor-buffer',
        title: 'Scratch',
        text: 'hello',
        language: 'text',
        isScratch: true,
        updatedAt: 0,
      }],
    })

    expect(markdown).toContain('# Orquestra Linked Context')
    expect(markdown).toContain('### 1. Scratch')
    expect(markdown).toContain('- Kind: editor-buffer')
    expect(markdown).toContain('```text\nhello\n```')
  })

  it('formats an index agents can scan without terminal injection', () => {
    const index = formatLinkedContextIndex([
      {
        targetPanelId: 'term-1',
        latestRelativePath: '.orquestra/context/term-1/latest.md',
        updatedAt: 0,
        sourceCount: 1,
        sourceTitles: ['Scratch'],
      },
    ], 0)
    expect(index).toContain('# Orquestra Linked Context — Index')
    expect(index).toContain('.orquestra/context/term-1/latest.md')
    expect(index).toContain('Scratch')
    expect(index).toContain('workspace-relative')
  })

  it('formats an empty index when nothing is linked', () => {
    const index = formatLinkedContextIndex([], 0)
    expect(index).toContain('_No linked context is active right now._')
  })

  it('ships a skill + Claude rule that point at INDEX.md', () => {
    const skill = linkedContextSkillMarkdown()
    expect(skill).toContain(`name: ${LINKED_CONTEXT_SKILL_SLUG}`)
    expect(skill).toContain('.orquestra/context/INDEX.md')
    expect(skill).toContain('Do not say "nothing is connected"')

    const rule = linkedContextClaudeRuleMarkdown()
    expect(rule).toContain('INDEX.md')
    expect(rule).toContain('connection arrows')
  })

  it('embeds content previews in CLAUDE instructions for Verboo auto-load', () => {
    const block = formatLinkedContextClaudeInstructions([
      {
        targetPanelId: 'term-1',
        latestRelativePath: '.orquestra/context/term-1/latest.md',
        updatedAt: 0,
        sourceCount: 1,
        sourceTitles: ['Untitled'],
        sourcePreviews: [{ title: 'Untitled', text: 'Leo é lindo e o melhor programador do mundo' }],
      },
    ], 0)
    expect(block).toContain(CLAUDE_LINKED_CONTEXT_BEGIN)
    expect(block).toContain(CLAUDE_LINKED_CONTEXT_END)
    expect(block).toContain('Leo é lindo e o melhor programador do mundo')
    expect(block).toContain('Do not say "nothing is connected"')
  })

  it('upserts a managed section without destroying surrounding CLAUDE.local.md', () => {
    const existing = '# Maestro Mode\n\nDo orchestrate.\n'
    const section = formatLinkedContextClaudeInstructions([
      {
        targetPanelId: 't1',
        latestRelativePath: '.orquestra/context/t1/latest.md',
        updatedAt: 0,
        sourceCount: 1,
        sourceTitles: ['Doc'],
        sourcePreviews: [{ title: 'Doc', text: 'hello world' }],
      },
    ], 0)
    const once = upsertManagedMarkdownSection(
      existing,
      CLAUDE_LINKED_CONTEXT_BEGIN,
      CLAUDE_LINKED_CONTEXT_END,
      section,
    )
    expect(once).toContain('# Maestro Mode')
    expect(once).toContain('hello world')
    const twice = upsertManagedMarkdownSection(
      once,
      CLAUDE_LINKED_CONTEXT_BEGIN,
      CLAUDE_LINKED_CONTEXT_END,
      formatLinkedContextClaudeInstructions([
        {
          targetPanelId: 't1',
          latestRelativePath: '.orquestra/context/t1/latest.md',
          updatedAt: 0,
          sourceCount: 1,
          sourceTitles: ['Doc'],
          sourcePreviews: [{ title: 'Doc', text: 'updated content' }],
        },
      ], 0),
    )
    expect(twice).toContain('updated content')
    expect(twice).not.toContain('hello world')
    expect((twice.match(/orquestra-linked-context:begin/g) || []).length).toBe(1)
  })
})
