// =============================================================================
// ACP types — shared between main and renderer
//
// The Agent Client Protocol (ACP) is JSON-RPC 2.0 over stdio that standardises
// communication between code editors (clients) and AI coding agents.
// =============================================================================

/** Configuration for spawning an ACP-compatible agent CLI. */
export interface AcpAgentConfig {
  /** Agent CLI command (e.g., 'claude', 'codex', 'acpx'). */
  command: string
  /** CLI arguments. */
  args?: string[]
  /** Working directory for the agent process. */
  cwd?: string
  /** Extra environment variables. */
  env?: Record<string, string>
}

/** Runtime info for a managed ACP agent. */
export interface AcpAgentInfo {
  id: string
  command: string
  status: 'starting' | 'ready' | 'error' | 'stopped'
  error?: string
}

/** Info about a single ACP session. */
export interface AcpSessionInfo {
  sessionId: string
  agentId: string
  status: 'initializing' | 'idle' | 'running' | 'error' | 'closed'
}

/** Kinds of session/update notifications from the agent. */
export type AcpUpdateKind =
  | 'text_chunk'
  | 'tool_call_start'
  | 'tool_call_update'
  | 'tool_call_end'
  | 'diff'
  | 'plan'
  | 'usage'
  | 'error'

/** A single session/update notification forwarded from main → renderer. */
export interface AcpSessionUpdate {
  sessionId: string
  agentId: string
  kind: AcpUpdateKind
  data: unknown
}

/** Structured tool call reported by the agent. */
export interface AcpToolCall {
  id: string
  title: string
  kind: 'read' | 'edit' | 'delete' | 'execute' | 'search' | 'think' | 'other'
  status: 'pending' | 'running' | 'completed' | 'error'
  content?: string
  error?: string
}

/** Permission request from an agent (e.g., "may I write this file?"). */
export interface AcpPermissionRequest {
  sessionId: string
  agentId: string
  toolCallId: string
  title: string
  description?: string
}

// =============================================================================
// API Orchestrator — direct HTTP calls to AI APIs (no CLI needed)
// =============================================================================

/** Config for calling an AI API directly. */
export interface ApiOrchestratorConfig {
  /** API endpoint URL (e.g., 'https://code.verboo.ai/router/v1/chat/completions') */
  endpoint: string
  /** API key for authentication */
  apiKey: string
  /** Model name (e.g., 'pro/deepseek-v4-flash') */
  model: string
  /** Optional system prompt override */
  systemPrompt?: string
}
