import { describe, expect, it } from 'vitest'
import {
  applyAgentPermissionFlags,
  detectWorkerAgentFromCommand,
  permissionModeLabel,
  resolveWorkerAgentBaseCommand,
} from './agentPermission'

describe('detectWorkerAgentFromCommand', () => {
  it('detects known binaries including path basenames', () => {
    expect(detectWorkerAgentFromCommand('verboo')).toBe('verboo')
    expect(detectWorkerAgentFromCommand('claude --model sonnet')).toBe('claude')
    expect(detectWorkerAgentFromCommand('codex')).toBe('codex')
    expect(detectWorkerAgentFromCommand('opencode --auto')).toBe('opencode')
    expect(detectWorkerAgentFromCommand(String.raw`C:\tools\claude.exe`)).toBe('claude')
    expect(detectWorkerAgentFromCommand('my-weird-bot')).toBe('custom')
  })
})

describe('resolveWorkerAgentBaseCommand', () => {
  it('uses presets and custom free-text', () => {
    expect(resolveWorkerAgentBaseCommand({
      orchestrationDefaultWorkerAgent: 'claude',
    })).toBe('claude')
    expect(resolveWorkerAgentBaseCommand({
      orchestrationDefaultWorkerAgent: 'codex',
    })).toBe('codex')
    expect(resolveWorkerAgentBaseCommand({
      orchestrationDefaultWorkerAgent: 'custom',
      orchestrationDefaultAgentCommand: 'my-bot --x',
    })).toBe('my-bot --x')
  })
})

describe('applyAgentPermissionFlags', () => {
  it('applies Claude/Verboo skip-permissions and OpenCode --auto', () => {
    expect(applyAgentPermissionFlags('verboo', 'bypass', 'verboo')).toBe(
      'verboo --dangerously-skip-permissions',
    )
    expect(applyAgentPermissionFlags('claude', 'bypass', 'claude')).toBe(
      'claude --dangerously-skip-permissions',
    )
    expect(applyAgentPermissionFlags('opencode', 'bypass', 'opencode')).toBe(
      'opencode --auto',
    )
  })

  it('migrates legacy free-text command when preset is missing', () => {
    expect(resolveWorkerAgentBaseCommand({
      orchestrationDefaultAgentCommand: 'codex',
    })).toBe('codex')
    expect(resolveWorkerAgentBaseCommand({
      orchestrationDefaultAgentCommand: 'claude --model sonnet',
    })).toBe('claude')
  })

  it('applies Codex full bypass flag (not Claude flag)', () => {
    expect(applyAgentPermissionFlags('codex', 'bypass', 'codex')).toBe(
      'codex --dangerously-bypass-approvals-and-sandbox',
    )
    expect(applyAgentPermissionFlags('codex', 'bypass', 'codex')).not.toContain(
      '--dangerously-skip-permissions',
    )
  })

  it('strips the correct flags in ask mode per agent', () => {
    expect(
      applyAgentPermissionFlags('verboo --dangerously-skip-permissions', 'ask', 'verboo'),
    ).toBe('verboo')
    expect(
      applyAgentPermissionFlags(
        'codex --dangerously-bypass-approvals-and-sandbox --yolo',
        'ask',
        'codex',
      ),
    ).toBe('codex')
    expect(
      applyAgentPermissionFlags('opencode --auto --yolo', 'ask', 'opencode'),
    ).toBe('opencode')
  })

  it('detects agent from command when hint omitted', () => {
    expect(applyAgentPermissionFlags('codex', 'bypass')).toBe(
      'codex --dangerously-bypass-approvals-and-sandbox',
    )
  })

  it('does not invent flags for unknown custom CLIs', () => {
    expect(applyAgentPermissionFlags('my-bot', 'bypass', 'custom')).toBe('my-bot')
  })

  it('returns empty for blank command', () => {
    expect(applyAgentPermissionFlags('   ', 'bypass')).toBe('')
  })
})

describe('permissionModeLabel', () => {
  it('describes both modes', () => {
    expect(permissionModeLabel('ask')).toMatch(/ask/i)
    expect(permissionModeLabel('bypass')).toMatch(/bypass/i)
  })
})
