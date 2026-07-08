// =============================================================================
// ACP Store — renderer state for ACP agent sessions
// =============================================================================

import { create } from 'zustand'
import type {
  AcpAgentInfo,
  AcpSessionInfo,
  AcpSessionUpdate,
  AcpToolCall,
} from '../../shared/acp-types'

interface AcpStoreState {
  /** agentId → agent info */
  agents: Record<string, AcpAgentInfo>
  /** sessionId → session info */
  sessions: Record<string, AcpSessionInfo>
  /** sessionId → accumulated text from agent */
  sessionText: Record<string, string>
  /** sessionId → tool calls */
  sessionToolCalls: Record<string, AcpToolCall[]>
  /** sessionId → usage */
  sessionUsage: Record<string, { used: number; total: number; cost?: number }>

  // Actions
  addAgent: (id: string, command: string) => void
  setAgentStatus: (id: string, status: AcpAgentInfo['status'], error?: string) => void
  removeAgent: (id: string) => void
  addSession: (info: AcpSessionInfo) => void
  setSessionStatus: (sessionId: string, status: AcpSessionInfo['status']) => void
  applyUpdate: (update: AcpSessionUpdate) => void
  clearSession: (sessionId: string) => void
}

export const useAcpStore = create<AcpStoreState>((set) => ({
  agents: {},
  sessions: {},
  sessionText: {},
  sessionToolCalls: {},
  sessionUsage: {},

  addAgent: (id, command) =>
    set((s) => ({
      agents: { ...s.agents, [id]: { id, command, status: 'starting' } },
    })),

  setAgentStatus: (id, status, error) =>
    set((s) => ({
      agents: {
        ...s.agents,
        [id]: { ...s.agents[id], status, error },
      },
    })),

  removeAgent: (id) =>
    set((s) => {
      const { [id]: _, ...agents } = s.agents
      return { agents }
    }),

  addSession: (info) =>
    set((s) => ({
      sessions: { ...s.sessions, [info.sessionId]: info },
      sessionText: { ...s.sessionText, [info.sessionId]: '' },
      sessionToolCalls: { ...s.sessionToolCalls, [info.sessionId]: [] },
    })),

  setSessionStatus: (sessionId, status) =>
    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: { ...s.sessions[sessionId], status },
      },
    })),

  applyUpdate: (update) =>
    set((s) => {
      const { sessionId, kind, data } = update

      if (kind === 'text_chunk') {
        const chunk = data as { text?: string }
        return {
          sessionText: {
            ...s.sessionText,
            [sessionId]: (s.sessionText[sessionId] || '') + (chunk.text || ''),
          },
        }
      }

      if (kind === 'tool_call_start' || kind === 'tool_call_update' || kind === 'tool_call_end') {
        const tc = data as AcpToolCall
        const calls = [...(s.sessionToolCalls[sessionId] || [])]
        const idx = calls.findIndex((c) => c.id === tc.id)
        if (idx >= 0) calls[idx] = { ...calls[idx], ...tc }
        else calls.push(tc)
        return { sessionToolCalls: { ...s.sessionToolCalls, [sessionId]: calls } }
      }

      if (kind === 'usage') {
        return {
          sessionUsage: {
            ...s.sessionUsage,
            [sessionId]: data as { used: number; total: number; cost?: number },
          },
        }
      }

      return {}
    }),

  clearSession: (sessionId) =>
    set((s) => {
      const { [sessionId]: _s, ...sessions } = s.sessions
      const { [sessionId]: _t, ...sessionText } = s.sessionText
      const { [sessionId]: _c, ...sessionToolCalls } = s.sessionToolCalls
      const { [sessionId]: _u, ...sessionUsage } = s.sessionUsage
      return { sessions, sessionText, sessionToolCalls, sessionUsage }
    }),
}))
