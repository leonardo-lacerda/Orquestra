// =============================================================================
// Worker agent presets + permission mode (ask vs bypass) per CLI.
// =============================================================================

import type {
  OrchestrationPermissionMode,
  OrchestrationWorkerAgent,
} from '../types'

/** Preset metadata for known worker agent CLIs. */
export interface WorkerAgentPreset {
  /** Stable id stored in settings. */
  id: Exclude<OrchestrationWorkerAgent, 'custom'>
  /** UI label (English; i18n can override). */
  label: string
  /** Base shell command typed into the worker terminal. */
  baseCommand: string
  /**
   * Flags appended in bypass mode so the agent auto-approves tools.
   * Sources (2026):
   * - Claude Code / Verboo: --dangerously-skip-permissions
   * - Codex: --dangerously-bypass-approvals-and-sandbox (--yolo alias)
   * - OpenCode: --dangerously-skip-permissions (--yolo alias; --auto is softer)
   */
  bypassFlags: string[]
  /** Regexes that strip known permission/bypass flags (ask mode + clean before re-apply). */
  stripPatterns: RegExp[]
}

export const WORKER_AGENT_PRESETS: readonly WorkerAgentPreset[] = [
  {
    id: 'verboo',
    label: 'Verboo',
    baseCommand: 'verboo',
    bypassFlags: ['--dangerously-skip-permissions'],
    stripPatterns: [/\s+--dangerously-skip-permissions\b/gi],
  },
  {
    id: 'claude',
    label: 'Claude Code',
    baseCommand: 'claude',
    bypassFlags: ['--dangerously-skip-permissions'],
    stripPatterns: [
      /\s+--dangerously-skip-permissions\b/gi,
      /\s+--permission-mode(?:=|\s+)\S+/gi,
    ],
  },
  {
    id: 'codex',
    label: 'Codex',
    baseCommand: 'codex',
    // Full unattended: no approvals + no sandbox (closest to Claude skip-permissions).
    bypassFlags: ['--dangerously-bypass-approvals-and-sandbox'],
    stripPatterns: [
      /\s+--dangerously-bypass-approvals-and-sandbox\b/gi,
      /\s+--yolo\b/gi,
      /\s+--ask-for-approval(?:=|\s+)\S+/gi,
      /\s+-a\s+never\b/gi,
      /\s+--full-auto\b/gi,
      /\s+--sandbox(?:=|\s+)\S+/gi,
    ],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    baseCommand: 'opencode',
    // Prefer documented --auto (stable); also strip YOLO aliases if present.
    // https://opencode.ai/docs/permissions/ — --auto auto-approves non-denied tools.
    // Newer builds also accept --dangerously-skip-permissions / --yolo.
    bypassFlags: ['--auto'],
    stripPatterns: [
      /\s+--dangerously-skip-permissions\b/gi,
      /\s+--yolo\b/gi,
      /\s+--auto\b/gi,
    ],
  },
] as const

const PRESET_BY_ID = new Map(WORKER_AGENT_PRESETS.map((p) => [p.id, p]))

/** @deprecated Prefer preset-specific flags via applyAgentPermissionFlags. */
export const AGENT_BYPASS_PERMISSIONS_FLAG = '--dangerously-skip-permissions'

export function getWorkerAgentPreset(
  id: OrchestrationWorkerAgent | string | undefined | null,
): WorkerAgentPreset | null {
  if (!id || id === 'custom') return null
  return PRESET_BY_ID.get(id as Exclude<OrchestrationWorkerAgent, 'custom'>) ?? null
}

/**
 * Detect which known agent a shell command targets (first token / basename).
 * Returns `custom` when unknown.
 */
export function detectWorkerAgentFromCommand(command: string): OrchestrationWorkerAgent {
  const first = String(command ?? '').trim().split(/\s+/)[0] ?? ''
  if (!first) return 'custom'
  const base = first
    .replace(/^.*[/\\]/, '')
    .replace(/\.exe$/i, '')
    .toLowerCase()
  if (base === 'verboo') return 'verboo'
  if (base === 'claude' || base === 'claude-code') return 'claude'
  if (base === 'codex') return 'codex'
  if (base === 'opencode') return 'opencode'
  return 'custom'
}

/**
 * Base command for workers from settings (preset binary or custom free-text).
 *
 * Migration: older settings only had `orchestrationDefaultAgentCommand` (e.g. `claude`).
 * If the agent preset field is missing, infer from that command string.
 */
export function resolveWorkerAgentBaseCommand(settings: {
  orchestrationDefaultWorkerAgent?: OrchestrationWorkerAgent
  orchestrationDefaultAgentCommand?: string
}): string {
  const rawCmd = (settings.orchestrationDefaultAgentCommand ?? '').trim()
  let agent = settings.orchestrationDefaultWorkerAgent

  // Migrate: no preset yet → detect from legacy free-text command.
  if (agent == null && rawCmd) {
    agent = detectWorkerAgentFromCommand(rawCmd)
  }
  agent = agent ?? 'verboo'

  if (agent === 'custom') {
    return rawCmd || 'verboo'
  }
  // Preset binary wins over a stale free-text field from a previous AI choice.
  return getWorkerAgentPreset(agent)?.baseCommand ?? 'verboo'
}

function stripPermissionFlags(command: string, agent: OrchestrationWorkerAgent): string {
  let out = String(command ?? '')
  const preset = getWorkerAgentPreset(agent)
  const patterns = preset
    ? preset.stripPatterns
    : // Unknown custom: strip every known flag family so ask mode is clean.
      WORKER_AGENT_PRESETS.flatMap((p) => p.stripPatterns)

  for (const re of patterns) {
    // Reset lastIndex for global regexes reused across calls
    re.lastIndex = 0
    out = out.replace(re, ' ')
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Normalize a worker agent command so it matches the user-selected permission mode.
 *
 * - `bypass`: append the correct CLI flags for that agent (Claude/Verboo/OpenCode/Codex).
 * - `ask`: strip known bypass/auto-approve flags so the agent prompts.
 *
 * When `agentHint` is omitted, the agent is detected from the command's first token.
 * For unknown custom CLIs, bypass adds no flags (we do not invent flags).
 */
export function applyAgentPermissionFlags(
  command: string,
  mode: OrchestrationPermissionMode,
  agentHint?: OrchestrationWorkerAgent | null,
): string {
  const raw = String(command ?? '').trim()
  if (!raw) return ''

  const agent = agentHint && agentHint !== 'custom'
    ? agentHint
    : detectWorkerAgentFromCommand(raw)

  const base = stripPermissionFlags(raw, agent)
  if (!base) return ''

  if (mode !== 'bypass') return base

  const preset = getWorkerAgentPreset(agent)
  if (!preset || preset.bypassFlags.length === 0) {
    // Unknown CLI: leave as cleaned base — caller should configure Custom carefully.
    return base
  }
  return `${base} ${preset.bypassFlags.join(' ')}`
}

/** Human-readable label for Maestro instructions / logs. */
export function permissionModeLabel(mode: OrchestrationPermissionMode): string {
  return mode === 'bypass'
    ? 'bypass (auto-approve tools — no permission prompts)'
    : 'ask (agent will wait for tool permission)'
}

/** Short note of which bypass flags apply to an agent. */
export function bypassFlagsDescription(agent: OrchestrationWorkerAgent): string {
  const preset = getWorkerAgentPreset(agent)
  if (!preset) {
    return 'custom command — bypass only if you include the CLI’s own skip-permission flags'
  }
  return `${preset.label}: ${preset.bypassFlags.join(' ')}`
}
