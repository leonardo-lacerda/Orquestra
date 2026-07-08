// =============================================================================
// AcpConnection — wraps a single ACP agent subprocess connection.
//
// Spawns an agent CLI (claude, codex, gemini, etc.), establishes an ACP
// session over stdio (JSON-RPC 2.0), and streams structured updates back.
//
// SDK API reference (verified against @agentclientprotocol/sdk v1.1.0):
//   - acp.client({ name }) → ClientApp
//   - ClientApp.connect(stream) → ClientConnection
//   - ClientConnection.agent → ClientContext
//   - ClientContext.request(method, params) → response
//   - ClientContext.buildSession(cwd).start() → ActiveSession
//   - ActiveSession.prompt(text) → Promise<PromptResponse>
//   - ActiveSession.nextUpdate() → ActiveSessionMessage
//     where .kind is 'session_update' | 'stop'
//   - ActiveSessionMessage (kind='session_update'): .update has sessionUpdate discriminator
//   - ActiveSessionMessage (kind='stop'): .response has stopReason
// =============================================================================

import { spawn, type ChildProcess } from 'child_process'
import { Writable, Readable } from 'node:stream'
import * as acp from '@agentclientprotocol/sdk'
import type { AcpAgentConfig, AcpSessionUpdate, AcpPermissionRequest } from '../../shared/acp-types'
import log from '../logger'

// ---------------------------------------------------------------------------
// Callback types
// ---------------------------------------------------------------------------

export type SessionUpdateHandler = (update: AcpSessionUpdate) => void
export type PermissionRequestHandler = (request: AcpPermissionRequest) => Promise<{ optionId: string }>

// ---------------------------------------------------------------------------
// AcpConnection
// ---------------------------------------------------------------------------

export class AcpConnection {
  private agentId: string
  private process: ChildProcess
  private connection: acp.ClientConnection | null = null
  /** Active SDK session wrappers keyed by sessionId. */
  private activeSessions = new Map<string, acp.ActiveSession>()
  /** Abort controllers for per-session update loops. */
  private sessionLoops = new Map<string, AbortController>()
  private onUpdate: SessionUpdateHandler
  private onPermission: PermissionRequestHandler

  /** Resolves once the ACP initialize handshake completes. */
  private _ready: Promise<void>
  private _resolveReady!: () => void
  private _rejectReady!: (err: Error) => void

  constructor(
    agentId: string,
    config: AcpAgentConfig,
    onUpdate: SessionUpdateHandler,
    onPermission: PermissionRequestHandler,
  ) {
    this.agentId = agentId
    this.onUpdate = onUpdate
    this.onPermission = onPermission

    this._ready = new Promise((resolve, reject) => {
      this._resolveReady = resolve
      this._rejectReady = reject
    })

    log.info('[acp] spawning agent %s: %s %o', agentId, config.command, config.args ?? [])

    this.process = spawn(config.command, config.args ?? [], {
      cwd: config.cwd,
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    this.process.stderr?.on('data', (chunk: Buffer) => {
      log.debug('[acp] agent %s stderr: %s', agentId, chunk.toString().trim())
    })

    this.process.on('error', (err) => {
      log.error('[acp] agent %s process error: %s', agentId, err.message)
      this._rejectReady(err)
    })

    this.process.on('exit', (code) => {
      log.info('[acp] agent %s exited with code %s', agentId, code)
      this.cleanup()
    })

    // Kick off the connection handshake.
    void this.doConnect()
  }

  /** Resolves when the initialize handshake is complete. */
  get ready(): Promise<void> {
    return this._ready
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /** Create a new session and return its id. */
  async createSession(cwd?: string): Promise<string> {
    if (!this.connection) throw new Error('Not connected')

    const session = await this.connection.agent
      .buildSession(cwd ?? process.cwd())
      .start()

    const sessionId = session.sessionId
    this.activeSessions.set(sessionId, session)

    // Start the update-reading loop.
    const abort = new AbortController()
    this.sessionLoops.set(sessionId, abort)
    void this.runSessionLoop(sessionId, session, abort.signal)

    log.info('[acp] session %s created on agent %s', sessionId, this.agentId)
    return sessionId
  }

  /** Send a prompt to an existing session. */
  async sendPrompt(sessionId: string, message: string): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    // Fire-and-forget — the response arrives via the session loop.
    session.prompt(message).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('[acp] prompt failed for session %s: %s', sessionId, msg)
      this.onUpdate({
        sessionId,
        agentId: this.agentId,
        kind: 'error',
        data: { message: msg },
      })
    })
  }

  /** Cancel an in-progress prompt turn. */
  cancel(sessionId: string): void {
    if (!this.connection) return
    try {
      void this.connection.agent.notify(acp.methods.agent.session.cancel, { sessionId })
    } catch { /* ignore */ }
  }

  /** Close a session on the agent side and stop the update loop. */
  close(sessionId: string): void {
    // Stop the update loop.
    const loop = this.sessionLoops.get(sessionId)
    if (loop) {
      loop.abort()
      this.sessionLoops.delete(sessionId)
    }

    // Dispose the SDK session wrapper.
    const session = this.activeSessions.get(sessionId)
    if (session) {
      session.dispose()
      this.activeSessions.delete(sessionId)
    }

    // Tell the agent to close.
    if (this.connection) {
      try {
        void this.connection.agent
          .request(acp.methods.agent.session.close, { sessionId })
          .catch(() => {})
      } catch { /* ignore */ }
    }
  }

  /** Tear down the connection and kill the agent process. */
  destroy(): void {
    this.cleanup()
    if (this.process && !this.process.killed) {
      this.process.kill()
    }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  /** Wire up stdin/stdout, build the ClientApp, and run the initialize handshake. */
  private async doConnect(): Promise<void> {
    try {
      const stdin = this.process.stdin!
      const stdout = this.process.stdout!

      const input = Writable.toWeb(stdin) as WritableStream<Uint8Array>
      const output = Readable.toWeb(stdout) as ReadableStream<Uint8Array>
      const stream = acp.ndJsonStream(input, output)

      // Build the client app with handlers for agent→client requests.
      const app = acp.client({ name: 'Orquestra' })
        .onRequest(acp.methods.client.session.requestPermission, async (ctx) => {
          const params = ctx.params
          const request: AcpPermissionRequest = {
            sessionId: params.sessionId,
            agentId: this.agentId,
            toolCallId: params.toolCall.toolCallId,
            title: params.toolCall.title ?? 'Permission requested',
            description: params.toolCall.title ?? undefined,
          }
          const result = await this.onPermission(request)
          return { outcome: { outcome: 'selected' as const, optionId: result.optionId } }
        })
        .onRequest(acp.methods.client.fs.readTextFile, async (ctx) => {
          log.warn('[acp:%s] readTextFile %s — not yet delegated to renderer', this.agentId, ctx.params.path)
          return { content: '' }
        })
        .onRequest(acp.methods.client.fs.writeTextFile, async (ctx) => {
          log.warn('[acp:%s] writeTextFile %s — not yet delegated to renderer', this.agentId, ctx.params.path)
        })

      // Connect to the agent process.
      this.connection = app.connect(stream) as acp.ClientConnection

      // Run the initialize handshake.
      await this.connection.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
      })

      log.info('[acp] agent %s connected and initialized', this.agentId)
      this._resolveReady()

      // When the connection closes, clean up.
      void this.connection.closed.then(() => {
        log.info('[acp] agent %s connection closed', this.agentId)
        this.cleanup()
      })
    } catch (err) {
      log.error('[acp] agent %s connect failed: %s', this.agentId, err)
      this._rejectReady(err as Error)
    }
  }

  /**
   * Drain session updates until the signal aborts or the turn ends.
   *
   * SDK ActiveSessionMessage.kind is 'session_update' | 'stop':
   *   - 'session_update': .update contains the SessionUpdate (discriminated by .sessionUpdate)
   *   - 'stop': .response contains the PromptResponse with .stopReason
   */
  private async runSessionLoop(
    sessionId: string,
    session: acp.ActiveSession,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      while (!signal.aborted) {
        const msg = await session.nextUpdate()

        if (msg.kind === 'stop') {
          // Notify the renderer that the turn completed.
          this.onUpdate({
            sessionId,
            agentId: this.agentId,
            kind: 'text_chunk',
            data: { stopReason: msg.stopReason, response: msg.response },
          })
          break
        }

        // msg.kind === 'session_update' — msg.update contains the SessionUpdate
        const update = msg.update
        const mapped = this.mapSessionUpdate(sessionId, update)
        if (mapped) this.onUpdate(mapped)
      }
    } catch (err) {
      if (signal.aborted) return
      const msg = err instanceof Error ? err.message : String(err)
      log.error('[acp] session loop error for %s: %s', sessionId, msg)
      this.onUpdate({
        sessionId,
        agentId: this.agentId,
        kind: 'error',
        data: { message: msg },
      })
    }
  }

  /** Map an ACP SessionUpdate to our shared AcpSessionUpdate type. */
  private mapSessionUpdate(
    sessionId: string,
    update: acp.SessionUpdate,
  ): AcpSessionUpdate | null {
    // The SessionUpdate union is discriminated by the 'sessionUpdate' field.
    const kind = (update as { sessionUpdate: string }).sessionUpdate
    const base = { sessionId, agentId: this.agentId, data: update }

    switch (kind) {
      case 'user_message_chunk':
      case 'agent_message_chunk':
      case 'agent_thought_chunk':
        return { ...base, kind: 'text_chunk' }
      case 'tool_call':
        return { ...base, kind: 'tool_call_start' }
      case 'tool_call_update':
        return { ...base, kind: 'tool_call_update' }
      case 'plan':
      case 'plan_update':
      case 'plan_removed':
        return { ...base, kind: 'plan' }
      case 'usage_update':
        return { ...base, kind: 'usage' }
      default:
        return { ...base, kind: 'tool_call_update' }
    }
  }

  /** Clean up all session state without killing the process. */
  private cleanup(): void {
    for (const loop of Array.from(this.sessionLoops.values())) loop.abort()
    this.sessionLoops.clear()

    for (const session of Array.from(this.activeSessions.values())) session.dispose()
    this.activeSessions.clear()

    this.connection = null
  }
}
