// =============================================================================
// AcpManager — singleton that manages multiple ACP agent connections.
//
// Owns the lifecycle of every spawned agent: connect, session creation,
// prompt routing, permission forwarding, and teardown.
//
// The IPC layer (src/main/ipc/acp.ts) calls into this singleton.
// =============================================================================

import { randomUUID } from 'node:crypto'
import * as acp from '@agentclientprotocol/sdk'
import {
  AcpConnection,
  type SessionUpdateHandler,
  type PermissionRequestHandler,
} from './acpConnection'
import type {
  AcpAgentConfig,
  AcpAgentInfo,
  AcpSessionInfo,
  AcpSessionUpdate,
  AcpPermissionRequest,
} from '../../shared/acp-types'
import {
  ACP_SESSION_UPDATE,
  ACP_SESSION_STATUS,
  ACP_REQUEST_PERMISSION,
} from '../../shared/ipc-channels'
import { broadcastToAll } from '../windowRegistry'
import log from '../logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManagedAgent {
  id: string
  config: AcpAgentConfig
  connection: AcpConnection
  status: AcpAgentInfo['status']
  sessions: Map<string, AcpSessionInfo>
}

interface PendingPermission {
  requestId: string
  agentId: string
  resolve: (outcome: acp.RequestPermissionOutcome) => void
}

// ---------------------------------------------------------------------------
// AcpManager (singleton)
// ---------------------------------------------------------------------------

class AcpManager {
  private agents = new Map<string, ManagedAgent>()
  private permissionCounter = 0
  private pendingPermissions = new Map<string, PendingPermission>()

  // =========================================================================
  // Agent lifecycle
  // =========================================================================

  /**
   * Spawn an ACP agent and wait for it to connect.
   * Returns agent info once the initialize handshake completes.
   */
  async startAgent(config: AcpAgentConfig): Promise<AcpAgentInfo> {
    const id = `acp-${randomUUID().slice(0, 8)}`

    // Build the callbacks that the connection will invoke.
    const onUpdate: SessionUpdateHandler = (update) => this.handleSessionUpdate(id, update)
    const onPermission: PermissionRequestHandler = (req) => this.handlePermissionRequest(id, req)

    const agent: ManagedAgent = {
      id,
      config,
      connection: null!,
      status: 'starting',
      sessions: new Map(),
    }
    this.agents.set(id, agent)

    // Create the connection (spawns the process).
    const connection = new AcpConnection(id, config, onUpdate, onPermission)
    agent.connection = connection

    // Wait for the initialize handshake to complete.
    try {
      await connection.ready
      agent.status = 'ready'
    } catch (err) {
      agent.status = 'error'
      const msg = err instanceof Error ? err.message : String(err)
      this.broadcastStatus(id, 'error', msg)
      throw err
    }

    const info: AcpAgentInfo = { id, command: config.command, status: 'ready' }
    this.broadcastStatus(id, 'ready')
    return info
  }

  /** Stop an agent and all its sessions. */
  stopAgent(agentId: string): void {
    const agent = this.agents.get(agentId)
    if (!agent) return

    // Close all sessions.
    for (const session of Array.from(agent.sessions.values())) {
      agent.connection.close(session.sessionId)
    }
    agent.sessions.clear()

    // Destroy the connection.
    agent.connection.destroy()
    agent.status = 'stopped'
    this.agents.delete(agentId)

    this.broadcastStatus(agentId, 'stopped')
    log.info('[acp] agent %s stopped', agentId)
  }

  // =========================================================================
  // Session lifecycle
  // =========================================================================

  /** Create a new session on a connected agent. */
  async createSession(agentId: string, cwd?: string): Promise<AcpSessionInfo> {
    const agent = this.agents.get(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)
    if (agent.status !== 'ready') throw new Error(`Agent ${agentId} is not ready`)

    await agent.connection.ready
    const sessionId = await agent.connection.createSession(cwd)

    const info: AcpSessionInfo = {
      sessionId,
      agentId,
      status: 'idle',
    }
    agent.sessions.set(sessionId, info)
    return info
  }

  /** Send a prompt to a session. */
  async sendPrompt(agentId: string, sessionId: string, message: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)

    const session = agent.sessions.get(sessionId)
    if (session) session.status = 'running'

    await agent.connection.sendPrompt(sessionId, message)
  }

  /** Cancel an in-progress prompt turn. */
  cancelSession(agentId: string, sessionId: string): void {
    const agent = this.agents.get(agentId)
    if (!agent) return
    agent.connection.cancel(sessionId)
  }

  /** Close a session. */
  closeSession(agentId: string, sessionId: string): void {
    const agent = this.agents.get(agentId)
    if (!agent) return

    agent.connection.close(sessionId)
    agent.sessions.delete(sessionId)
  }

  // =========================================================================
  // Permission responses (from renderer)
  // =========================================================================

  /** Respond to a pending permission request. */
  respondToPermission(requestId: string, outcome: acp.RequestPermissionOutcome): void {
    const pending = this.pendingPermissions.get(requestId)
    if (!pending) {
      log.warn('[acp] no pending permission request %s', requestId)
      return
    }
    this.pendingPermissions.delete(requestId)
    pending.resolve(outcome)
  }

  // =========================================================================
  // Query
  // =========================================================================

  /** List all connected agents. */
  listAgents(): AcpAgentInfo[] {
    const result: AcpAgentInfo[] = []
    for (const a of Array.from(this.agents.values())) {
      result.push({ id: a.id, command: a.config.command, status: a.status })
    }
    return result
  }

  /** Get info about a specific agent. */
  getAgent(agentId: string): AcpAgentInfo | undefined {
    const agent = this.agents.get(agentId)
    if (!agent) return undefined
    return { id: agent.id, command: agent.config.command, status: agent.status }
  }

  // =========================================================================
  // Shutdown
  // =========================================================================

  /** Stop all agents (called on app quit). */
  shutdown(): void {
    for (const id of Array.from(this.agents.keys())) {
      this.stopAgent(id)
    }
  }

  // =========================================================================
  // Private — callbacks from AcpConnection
  // =========================================================================

  /** Forward session updates to all renderer windows. */
  private handleSessionUpdate(agentId: string, update: AcpSessionUpdate): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      const session = agent.sessions.get(update.sessionId)
      if (session && update.kind === 'error') {
        session.status = 'error'
      }
    }

    broadcastToAll(ACP_SESSION_UPDATE, update)
  }

  /**
   * Handle a permission request from the agent.
   * Broadcasts to renderers and returns a promise that resolves when the
   * renderer responds via respondToPermission().
   */
  private handlePermissionRequest(
    agentId: string,
    request: AcpPermissionRequest,
  ): Promise<{ optionId: string }> {
    return new Promise<{ optionId: string }>((resolve) => {
      const requestId = `perm-${++this.permissionCounter}`

      this.pendingPermissions.set(requestId, {
        requestId,
        agentId,
        resolve: (outcome) => {
          if (outcome.outcome === 'cancelled') {
            resolve({ optionId: 'cancelled' })
          } else {
            resolve({ optionId: outcome.optionId })
          }
        },
      })

      // Broadcast to renderers so they can show a permission dialog.
      broadcastToAll(ACP_REQUEST_PERMISSION, {
        requestId,
        ...request,
      })
    })
  }

  /** Broadcast agent status to all windows. */
  private broadcastStatus(agentId: string, status: AcpAgentInfo['status'], error?: string): void {
    broadcastToAll(ACP_SESSION_STATUS, { agentId, status, error })
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const acpManager = new AcpManager()
