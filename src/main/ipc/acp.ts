// =============================================================================
// ACP IPC handlers — bridges renderer requests to the AcpManager singleton.
//
// Renderer → Main (invoke):  startAgent, stopAgent, createSession, sendPrompt,
//                             cancelSession, closeSession, permissionResponse
// Main → Renderer (push):    sessionUpdate, sessionStatus, requestPermission
// =============================================================================

import { ipcMain } from 'electron'
import {
  ACP_START_AGENT,
  ACP_STOP_AGENT,
  ACP_CREATE_SESSION,
  ACP_SEND_PROMPT,
  ACP_CANCEL_SESSION,
  ACP_CLOSE_SESSION,
  ACP_PERMISSION_RESPONSE,
} from '../../shared/ipc-channels'
import type { AcpAgentConfig } from '../../shared/acp-types'
import { acpManager } from '../acp/acpManager'
import type * as acp from '@agentclientprotocol/sdk'
import log from '../logger'

export function registerHandlers(): void {
  // -------------------------------------------------------------------------
  // Agent lifecycle
  // -------------------------------------------------------------------------

  ipcMain.handle(
    ACP_START_AGENT,
    async (_event, config: AcpAgentConfig) => {
      try {
        return await acpManager.startAgent(config)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.error('[acp:ipc] startAgent failed: %s', msg)
        throw err
      }
    },
  )

  ipcMain.handle(
    ACP_STOP_AGENT,
    async (_event, agentId: string) => {
      acpManager.stopAgent(agentId)
    },
  )

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  ipcMain.handle(
    ACP_CREATE_SESSION,
    async (_event, agentId: string, cwd?: string) => {
      try {
        return await acpManager.createSession(agentId, cwd)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.error('[acp:ipc] createSession failed: %s', msg)
        throw err
      }
    },
  )

  ipcMain.handle(
    ACP_SEND_PROMPT,
    async (_event, agentId: string, sessionId: string, message: string) => {
      try {
        await acpManager.sendPrompt(agentId, sessionId, message)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.error('[acp:ipc] sendPrompt failed: %s', msg)
        throw err
      }
    },
  )

  ipcMain.handle(
    ACP_CANCEL_SESSION,
    async (_event, agentId: string, sessionId: string) => {
      acpManager.cancelSession(agentId, sessionId)
    },
  )

  ipcMain.handle(
    ACP_CLOSE_SESSION,
    async (_event, agentId: string, sessionId: string) => {
      acpManager.closeSession(agentId, sessionId)
    },
  )

  // -------------------------------------------------------------------------
  // Permission responses
  // -------------------------------------------------------------------------

  ipcMain.on(
    ACP_PERMISSION_RESPONSE,
    (
      _event,
      requestId: string,
      outcome: acp.RequestPermissionOutcome,
    ) => {
      acpManager.respondToPermission(requestId, outcome)
    },
  )
}
