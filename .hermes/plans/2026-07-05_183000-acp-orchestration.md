# ACP Orchestration — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace raw PTY piping with native ACP (Agent Client Protocol) support, enabling intelligent multi-agent orchestration where the Orquestra canvas acts as an ACP Client and worker terminals are ACP Agent sessions.

**Architecture:** Orquestra spawns ACP-compatible agent CLIs (Claude Code, Codex, Gemini, etc.) as child processes. Communication happens via JSON-RPC 2.0 over stdio — no PTY scraping. An orchestration panel in the renderer displays structured agent output (tool calls, diffs, progress). Multiple agents run in parallel, each addressable by the orchestrator.

**Tech Stack:** `@agentclientprotocol/sdk` (TypeScript ACP library), Electron main process (ACP client), React renderer (orchestration UI), Zustand (state), IPC bridge.

---

## Context

### What is ACP?
- **Agent Client Protocol** — open standard by Zed Industries (Apache license)
- JSON-RPC 2.0 over stdio (local agents) or HTTP/WebSocket (remote)
- Client = code editor (Orquestra). Agent = AI coding tool (Claude Code, Codex, Gemini, etc.)
- Eliminates PTY scraping — all communication is structured
- TypeScript SDK: `npm install @agentclientprotocol/sdk`

### ACP Message Flow
```
1. Client → Agent: initialize (negotiate version + capabilities)
2. Client → Agent: authenticate (if required)
3. Client → Agent: session/new (create conversation)
4. Client → Agent: session/prompt (send user message)
5. Agent → Client: session/update notifications (text chunks, tool calls, diffs, plans)
6. Agent → Client: session/request_permission (ask before executing tools)
7. Client → Agent: session/cancel (abort if needed)
8. Agent → Client: session/prompt response (stop reason)
```

### Current Orquestra Architecture (relevant parts)
- **Main process:** `src/main/` — IPC handlers, window management
- **Renderer:** `src/renderer/` — React UI, Zustand stores
- **Preload:** `src/preload/` — secure IPC bridge
- **Shared:** `src/shared/` — types, IPC channel names
- **Panel types:** `terminal | browser | editor | canvas | agent | document`
- **Existing agent panel:** `src/agent/renderer/AgentPanel.tsx` (Claude-Code sidebar)

---

## Phase 1: ACP Client Core (Main Process)

### Task 1: Install ACP SDK and create types

**Objective:** Add the ACP TypeScript SDK and define shared types for ACP sessions.

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/shared/acp-types.ts`

**Step 1:** Install SDK
```bash
npm install @agentclientprotocol/sdk
```

**Step 2:** Create `src/shared/acp-types.ts`
```typescript
// ACP session types shared between main and renderer

export interface AcpAgentConfig {
  /** Agent CLI command (e.g., 'claude', 'codex', 'acpx') */
  command: string
  /** CLI arguments */
  args?: string[]
  /** Working directory */
  cwd?: string
  /** Environment variables */
  env?: Record<string, string>
}

export interface AcpSessionInfo {
  sessionId: string
  agentName: string
  status: 'initializing' | 'idle' | 'running' | 'error' | 'closed'
  /** Agent-reported capabilities */
  capabilities?: Record<string, unknown>
}

export type AcpUpdateKind =
  | 'text_chunk'
  | 'tool_call_start'
  | 'tool_call_update'
  | 'tool_call_end'
  | 'diff'
  | 'plan'
  | 'usage'
  | 'error'

export interface AcpSessionUpdate {
  sessionId: string
  kind: AcpUpdateKind
  data: unknown
}

export interface AcpToolCall {
  id: string
  title: string
  kind: 'read' | 'edit' | 'delete' | 'execute' | 'search' | 'think' | 'other'
  status: 'pending' | 'running' | 'completed' | 'error'
  content?: string
  error?: string
}
```

**Step 3:** Add IPC channels in `src/shared/ipc-channels.ts`
```typescript
// ACP — Agent Client Protocol
export const ACP_START_AGENT = 'acp:startAgent'
export const ACP_STOP_AGENT = 'acp:stopAgent'
export const ACP_CREATE_SESSION = 'acp:createSession'
export const ACP_SEND_PROMPT = 'acp:sendPrompt'
export const ACP_CANCEL_SESSION = 'acp:cancelSession'
export const ACP_CLOSE_SESSION = 'acp:closeSession'
export const ACP_SESSION_UPDATE = 'acp:sessionUpdate' // main → renderer
export const ACP_SESSION_STATUS = 'acp:sessionStatus' // main → renderer
export const ACP_REQUEST_PERMISSION = 'acp:requestPermission' // agent → renderer
export const ACP_PERMISSION_RESPONSE = 'acp:permissionResponse' // renderer → main
```

**Step 4:** Run typecheck
```bash
npm run typecheck
```

---

### Task 2: ACP Connection Manager (main process)

**Objective:** Create a manager that spawns ACP agent processes and handles JSON-RPC communication.

**Files:**
- Create: `src/main/acp/acpConnection.ts`
- Create: `src/main/acp/acpManager.ts`

**Step 1:** Create `src/main/acp/acpConnection.ts`

This wraps a single ACP agent connection:
```typescript
import { spawn, type ChildProcess } from 'child_process'
import { ClientSideConnection } from '@agentclientprotocol/sdk'
import type { AcpAgentConfig } from '../../shared/acp-types'

export class AcpConnection {
  private process: ChildProcess
  private client: ClientSideConnection
  private initialized = false

  constructor(config: AcpAgentConfig) {
    this.process = spawn(config.command, config.args ?? [], {
      cwd: config.cwd,
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Create ACP client connection over stdio
    this.client = new ClientSideConnection(
      this.process.stdin!,
      this.process.stdout!,
    )
  }

  async initialize(): Promise<void> {
    const response = await this.client.request('initialize', {
      protocolVersion: '1',
      clientInfo: { name: 'Orquestra', version: '1.0.0' },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
    })
    this.initialized = true
    return response
  }

  async createSession(): Promise<string> {
    const response = await this.client.request('session/new', {})
    return response.sessionId
  }

  async sendPrompt(sessionId: string, message: string): Promise<void> {
    await this.client.request('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: message }],
    })
  }

  onUpdate(callback: (notification: any) => void): void {
    this.client.onNotification('session/update', callback)
  }

  onRequestPermission(callback: (request: any) => any): void {
    this.client.setRequestHandler('session/request_permission', callback)
  }

  cancel(sessionId: string): void {
    this.client.notify('session/cancel', { sessionId })
  }

  close(sessionId: string): void {
    this.client.request('session/close', { sessionId }).catch(() => {})
  }

  destroy(): void {
    this.process.kill()
  }
}
```

**Step 2:** Create `src/main/acp/acpManager.ts`

Singleton that manages multiple ACP connections:
```typescript
import type { AcpAgentConfig, AcpSessionInfo } from '../../shared/acp-types'
import { AcpConnection } from './acpConnection'
import { sendToAllWindows } from '../windowRegistry'
import {
  ACP_SESSION_UPDATE,
  ACP_SESSION_STATUS,
  ACP_REQUEST_PERMISSION,
} from '../../shared/ipc-channels'

interface ManagedAgent {
  connection: AcpConnection
  config: AcpAgentConfig
  sessions: Map<string, AcpSessionInfo>
}

const agents = new Map<string, ManagedAgent>()

export async function startAgent(id: string, config: AcpAgentConfig): Promise<void> {
  const connection = new AcpConnection(config)
  
  // Wire up notifications → renderer
  connection.onUpdate((notification) => {
    sendToAllWindows(ACP_SESSION_UPDATE, notification)
  })

  connection.onRequestPermission(async (request) => {
    // Forward to renderer, wait for user response
    return new Promise((resolve) => {
      sendToAllWindows(ACP_REQUEST_PERMISSION, request, resolve)
    })
  })

  await connection.initialize()
  agents.set(id, { connection, config, sessions: new Map() })
  sendToAllWindows(ACP_SESSION_STATUS, { agentId: id, status: 'ready' })
}

export async function createSession(agentId: string): Promise<string> {
  const agent = agents.get(agentId)
  if (!agent) throw new Error(`Agent ${agentId} not found`)
  
  const sessionId = await agent.connection.createSession()
  agent.sessions.set(sessionId, {
    sessionId,
    agentName: agentId,
    status: 'idle',
  })
  return sessionId
}

export async function sendPrompt(agentId: string, sessionId: string, message: string): Promise<void> {
  const agent = agents.get(agentId)
  if (!agent) throw new Error(`Agent ${agentId} not found`)
  
  const session = agent.sessions.get(sessionId)
  if (session) session.status = 'running'
  
  await agent.connection.sendPrompt(sessionId, message)
}

export function cancelSession(agentId: string, sessionId: string): void {
  agents.get(agentId)?.connection.cancel(sessionId)
}

export function stopAgent(id: string): void {
  const agent = agents.get(id)
  if (!agent) return
  agent.connection.destroy()
  agents.delete(id)
}
```

**Step 3:** Register IPC handlers in `src/main/ipc/acp.ts`
```typescript
import { ipcMain } from 'electron'
import {
  ACP_START_AGENT, ACP_STOP_AGENT, ACP_CREATE_SESSION,
  ACP_SEND_PROMPT, ACP_CANCEL_SESSION, ACP_CLOSE_SESSION,
  ACP_PERMISSION_RESPONSE,
} from '../../shared/ipc-channels'
import * as acpManager from '../acp/acpManager'

export function registerAcpHandlers(): void {
  ipcMain.handle(ACP_START_AGENT, async (_e, id: string, config: any) => {
    return acpManager.startAgent(id, config)
  })
  ipcMain.handle(ACP_STOP_AGENT, async (_e, id: string) => {
    acpManager.stopAgent(id)
  })
  ipcMain.handle(ACP_CREATE_SESSION, async (_e, agentId: string) => {
    return acpManager.createSession(agentId)
  })
  ipcMain.handle(ACP_SEND_PROMPT, async (_e, agentId: string, sessionId: string, msg: string) => {
    return acpManager.sendPrompt(agentId, sessionId, msg)
  })
  ipcMain.handle(ACP_CANCEL_SESSION, async (_e, agentId: string, sessionId: string) => {
    acpManager.cancelSession(agentId, sessionId)
  })
}
```

**Step 4:** Register in main entry (`src/main/index.ts` or equivalent)
```typescript
import { registerAcpHandlers } from './ipc/acp'
// ... in app initialization:
registerAcpHandlers()
```

**Step 5:** Run typecheck + tests
```bash
npm run typecheck
npm test
```

---

## Phase 2: Renderer Integration

### Task 3: Preload bridge + Electron API types

**Objective:** Expose ACP IPC methods to the renderer securely.

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/shared/electron-api.d.ts`

**Step 1:** Add to preload
```typescript
// In preload/index.ts, add:
acpStartAgent: makeInvoker<'acp:startAgent'>(ACP_START_AGENT),
acpStopAgent: makeInvoker<'acp:stopAgent'>(ACP_STOP_AGENT),
acpCreateSession: makeInvoker<'acp:createSession'>(ACP_CREATE_SESSION),
acpSendPrompt: makeInvoker<'acp:sendPrompt'>(ACP_SEND_PROMPT),
acpCancelSession: makeInvoker<'acp:cancelSession'>(ACP_CANCEL_SESSION),
acpOnSessionUpdate: (cb: (data: any) => void) => { /* IPC listener */ },
acpOnSessionStatus: (cb: (data: any) => void) => { /* IPC listener */ },
acpOnRequestPermission: (cb: (data: any) => void) => { /* IPC listener */ },
```

**Step 2:** Add to `electron-api.d.ts`
```typescript
acpStartAgent(id: string, config: AcpAgentConfig): Promise<void>
acpStopAgent(id: string): Promise<void>
acpCreateSession(agentId: string): Promise<string>
acpSendPrompt(agentId: string, sessionId: string, message: string): Promise<void>
acpCancelSession(agentId: string, sessionId: string): Promise<void>
acpOnSessionUpdate(cb: (data: AcpSessionUpdate) => void): () => void
acpOnSessionStatus(cb: (data: { agentId: string; status: string }) => void): () => void
acpOnRequestPermission(cb: (data: any) => void): () => void
```

**Step 3:** Run typecheck

---

### Task 4: ACP Zustand Store

**Objective:** Create a store for ACP session state in the renderer.

**Files:**
- Create: `src/renderer/stores/acpStore.ts`

```typescript
import { create } from 'zustand'
import type { AcpSessionInfo, AcpSessionUpdate, AcpToolCall } from '../../shared/acp-types'

interface AcpStoreState {
  /** agentId → config */
  agents: Record<string, { command: string; status: string }>
  /** sessionId → session info */
  sessions: Record<string, AcpSessionInfo>
  /** sessionId → accumulated text */
  sessionText: Record<string, string>
  /** sessionId → tool calls */
  sessionToolCalls: Record<string, AcpToolCall[]>
  /** sessionId → usage info */
  sessionUsage: Record<string, { used: number; total: number; cost?: number }>

  // Actions
  addAgent: (id: string, command: string) => void
  setAgentStatus: (id: string, status: string) => void
  addSession: (session: AcpSessionInfo) => void
  updateSession: (update: AcpSessionUpdate) => void
  setSessionStatus: (sessionId: string, status: AcpSessionInfo['status']) => void
  clearSession: (sessionId: string) => void
}

export const useAcpStore = create<AcpStoreState>((set, get) => ({
  agents: {},
  sessions: {},
  sessionText: {},
  sessionToolCalls: {},
  sessionUsage: {},

  addAgent: (id, command) => set((s) => ({
    agents: { ...s.agents, [id]: { command, status: 'starting' } }
  })),

  setAgentStatus: (id, status) => set((s) => ({
    agents: { ...s.agents, [id]: { ...s.agents[id], status } }
  })),

  addSession: (session) => set((s) => ({
    sessions: { ...s.sessions, [session.sessionId]: session },
    sessionText: { ...s.sessionText, [session.sessionId]: '' },
    sessionToolCalls: { ...s.sessionToolCalls, [session.sessionId]: [] },
  })),

  updateSession: (update) => set((s) => {
    const { sessionId, kind, data } = update
    if (kind === 'text_chunk') {
      return {
        sessionText: {
          ...s.sessionText,
          [sessionId]: (s.sessionText[sessionId] || '') + (data as any).text,
        },
      }
    }
    if (kind === 'tool_call_start' || kind === 'tool_call_update' || kind === 'tool_call_end') {
      const calls = [...(s.sessionToolCalls[sessionId] || [])]
      const tc = data as AcpToolCall
      const idx = calls.findIndex((c) => c.id === tc.id)
      if (idx >= 0) calls[idx] = { ...calls[idx], ...tc }
      else calls.push(tc)
      return { sessionToolCalls: { ...s.sessionToolCalls, [sessionId]: calls } }
    }
    if (kind === 'usage') {
      return {
        sessionUsage: {
          ...s.sessionUsage,
          [sessionId]: data as any,
        },
      }
    }
    return {}
  }),

  setSessionStatus: (sessionId, status) => set((s) => ({
    sessions: {
      ...s.sessions,
      [sessionId]: { ...s.sessions[sessionId], status },
    },
  })),

  clearSession: (sessionId) => set((s) => {
    const { [sessionId]: _s, ...sessions } = s.sessions
    const { [sessionId]: _t, ...sessionText } = s.sessionText
    const { [sessionId]: _c, ...sessionToolCalls } = s.sessionToolCalls
    const { [sessionId]: _u, ...sessionUsage } = s.sessionUsage
    return { sessions, sessionText, sessionToolCalls, sessionUsage }
  }),
}))
```

---

### Task 5: Orchestration Panel UI

**Objective:** Create a rich panel for multi-agent orchestration — the opposite of raw terminal output.

**Files:**
- Create: `src/renderer/panels/OrchestrationPanel.tsx`

The panel shows:
- Agent list with status indicators (idle, running, error)
- Per-agent session view with structured output:
  - Text response (markdown rendered)
  - Tool calls (collapsible cards with kind icons)
  - Diffs (unified diff view)
  - Progress bars (token usage)
- Input box to send prompts
- Worker assignment (drag agents to tasks)

**Step 1:** Create the panel component
```tsx
import React, { useState, useEffect, useCallback } from 'react'
import { useAcpStore } from '../stores/acpStore'

const OrchestrationPanel: React.FC<{ panelId: string }> = () => {
  const [input, setInput] = useState('')
  const { agents, sessions, sessionText, sessionToolCalls } = useAcpStore()

  // Wire up IPC listeners
  useEffect(() => {
    const unsubs = [
      window.electronAPI.acpOnSessionUpdate((update) => {
        useAcpStore.getState().updateSession(update)
      }),
      window.electronAPI.acpOnSessionStatus((data) => {
        useAcpStore.getState().setAgentStatus(data.agentId, data.status)
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  const handleSend = useCallback(async () => {
    if (!input.trim()) return
    // Send to all active sessions or selected session
    const activeSessions = Object.values(sessions).filter((s) => s.status === 'idle')
    for (const session of activeSessions) {
      await window.electronAPI.acpSendPrompt(
        session.agentName,
        session.sessionId,
        input,
      )
    }
    setInput('')
  }, [input, sessions])

  return (
    <div className="flex flex-col h-full bg-[var(--surface-0)]">
      {/* Agent status bar */}
      <div className="flex gap-2 p-2 border-b border-[var(--border)]">
        {Object.entries(agents).map(([id, agent]) => (
          <AgentBadge key={id} id={id} status={agent.status} />
        ))}
      </div>

      {/* Session output */}
      <div className="flex-1 overflow-y-auto p-4">
        {Object.entries(sessionText).map(([id, text]) => (
          <SessionView
            key={id}
            sessionId={id}
            text={text}
            toolCalls={sessionToolCalls[id] || []}
            status={sessions[id]?.status || 'idle'}
          />
        ))}
      </div>

      {/* Input */}
      <div className="p-2 border-t border-[var(--border)]">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Descreva o que os workers devem fazer..."
          className="w-full bg-[var(--surface-1)] text-[var(--text)] px-3 py-2 rounded"
        />
      </div>
    </div>
  )
}
```

**Step 2:** Register as panel type in `src/shared/panels.ts` and `PanelType`

---

## Phase 3: Multi-Worker Orchestration

### Task 6: Orchestrator → Worker routing

**Objective:** The orchestration panel can spawn multiple worker agents and route tasks to them.

**Concept:** User types a high-level task. The system sends it to an orchestrator agent (or directly to workers). Workers execute in parallel. Results stream back to the orchestration panel.

**Files:**
- Create: `src/main/acp/orchestrator.ts`

The orchestrator:
1. Spawns N worker agents via ACP
2. Sends the user's task to an orchestrator agent with instructions to generate per-worker commands
3. Parses the orchestrator's structured response
4. Routes each sub-task to the appropriate worker via `session/prompt`
5. Streams all updates back to the renderer

---

### Task 7: Settings for agent configurations

**Objective:** Let users configure which agent CLIs to use (Claude Code, Codex, Gemini, Verboo, etc.)

**Files:**
- Modify: `src/renderer/stores/settingsStore.ts` (add ACP agent configs)
- Create: `src/renderer/settings/AcpSettings.tsx`

Users configure:
- Agent name
- CLI command path
- Default args
- Auth method (if needed)

---

## Phase 4: Polish & Integration

### Task 8: Remove legacy PTY pipe code

**Objective:** Clean up the raw PTY piping code that ACP replaces.

**Files:**
- Modify: `src/main/ipc/terminal.ts` (remove pipe functions)
- Modify: `src/renderer/stores/canvas/connectionsSlice.ts` (remove pipe sync)
- Modify: `src/shared/types.ts` (remove TerminalConnection)
- Modify: `src/renderer/canvas/ConnectionLayer.tsx` (remove or repurpose)
- Modify: `src/renderer/canvas/ConnectionHandles.tsx` (remove or repurpose)

**Note:** Keep the visual connection layer for showing agent→worker relationships, but repurpose it to use ACP sessions instead of PTY pipes.

---

## Verification

After each phase:
```bash
npm run typecheck   # Must pass (0 new errors)
npm test            # Must pass
npm run build       # Must succeed
```

End-to-end test:
1. `npm run dev`
2. Open Orchestration Panel
3. Configure an agent (e.g., `claude` or `acpx claude`)
4. Start agent → create session → send prompt
5. Verify structured output appears (not raw PTY)
6. Start 2 agents → send different tasks → verify parallel execution
7. Verify tool calls, diffs, and progress render correctly

---

## Risks & Open Questions

1. **Verboo Code ACP support?** — Verboo Code may not support ACP yet. Bridge option: call their API directly (`code.verboo.ai`) and parse structured responses. Check `verboo --help` for ACP flags.

2. **Agent CLI availability** — Users need agent CLIs installed (`claude`, `codex`, `gemini`). The settings UI should validate CLI availability.

3. **Permission model** — ACP agents can request permission for tool calls (file writes, terminal execution). The UI needs a permission dialog. For automation, support auto-approve mode.

4. **Session persistence** — ACP sessions survive process restarts (via `session/load`). Need to persist session IDs in Orquestra's session state.

5. **Remote agents** — ACP supports HTTP/WebSocket transport for remote agents. Future extension: connect to cloud-hosted agents.

---

## Dependencies

```json
{
  "@agentclientprotocol/sdk": "latest"
}
```

## File Summary

| File | Action | Phase |
|------|--------|-------|
| `package.json` | Modify (add dep) | 1 |
| `src/shared/acp-types.ts` | Create | 1 |
| `src/shared/ipc-channels.ts` | Modify (add channels) | 1 |
| `src/main/acp/acpConnection.ts` | Create | 1 |
| `src/main/acp/acpManager.ts` | Create | 1 |
| `src/main/ipc/acp.ts` | Create | 1 |
| `src/preload/index.ts` | Modify (add bridge) | 2 |
| `src/shared/electron-api.d.ts` | Modify (add types) | 2 |
| `src/renderer/stores/acpStore.ts` | Create | 2 |
| `src/renderer/panels/OrchestrationPanel.tsx` | Create | 2 |
| `src/shared/panels.ts` | Modify (add panel) | 2 |
| `src/main/acp/orchestrator.ts` | Create | 3 |
| `src/renderer/settings/AcpSettings.tsx` | Create | 3 |
| `src/main/ipc/terminal.ts` | Modify (remove pipes) | 4 |
| `src/renderer/stores/canvas/connectionsSlice.ts` | Modify (remove pipes) | 4 |
