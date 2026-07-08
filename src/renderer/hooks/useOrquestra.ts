// =============================================================================
// useOrquestra — Hook that listens for Maestro commands from terminals and
// executes canvas operations (recruit, dismiss, connect, list, reassign).
// =============================================================================

import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { terminalRegistry } from '../lib/terminal/terminalRegistry'
import { findCanvasNodeForPanel } from '../stores/canvasStore'
import type { PanelType, Point } from '../../shared/types'

const MAX_AGENT_RETRIES = 20 // 10s max waiting for terminal pty
const AGENT_POLL_MS = 500
const MAX_ROLE_WAIT = 15 // 15s max waiting for agent to produce output
const ROLE_POLL_MS = 1000

function resolveAgentPanelType(agent?: string): PanelType {
  if (agent?.toLowerCase().includes('agent') || agent?.toLowerCase().includes('claude')) return 'agent'
  return 'terminal'
}

/** Calculate a position for a new worker, offset from the orquestrador node.
 *  Workers are placed to the right of the orquestrador in a 2-column grid. */
function workerPosition(maestroId: string, recruitCountRef: React.MutableRefObject<Map<string, number>>, maestroPanelId: string): Point {
  const count = recruitCountRef.current.get(maestroId) || 0
  const col = count % 2
  const row = Math.floor(count / 2)

  // Try to find the orquestrador's canvas position for a smarter offset
  const orquestrador = findCanvasNodeForPanel(maestroPanelId)
  if (orquestrador) {
    const node = orquestrador.store.getState().nodes[orquestrador.nodeId]
    if (node) {
      return { x: node.origin.x + 600 + col * 500, y: node.origin.y + row * 350 }
    }
  }

  // Fallback: absolute grid
  return { x: 600 + col * 500, y: 100 + row * 350 }
}

export function useOrquestra(): void {
  const recruitCountRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!window.electronAPI?.onMaestroRecruit) return

    const unsubs = [
      // --- Recruit ---
      window.electronAPI.onMaestroRecruit(async (maestroId, args) => {
        const store = useAppStore.getState()
        const ws = store.workspaces[0]
        if (!ws) return

        const panelType = resolveAgentPanelType(args.agent)
        const name = args.name || args.role || 'Worker'
        const agentCmd = args.agent && args.agent !== 'auto' ? args.agent : 'verboo'

        const orchestratorPanelId = terminalRegistry.panelIdForPty(maestroId)
        const count = recruitCountRef.current.get(maestroId) || 0
        recruitCountRef.current.set(maestroId, count + 1)
        const position = workerPosition(maestroId, recruitCountRef, orchestratorPanelId || '')

        let panelId: string | null = null
        if (panelType === 'agent') {
          panelId = store.createAgent(ws.id, position)
        } else {
          panelId = store.createTerminal(ws.id, undefined, position)
        }

        if (panelId) {
          store.updatePanelTitle(ws.id, panelId, name)
          console.log('[orquestra] Recruited ' + name + ' (' + panelType + '): ' + panelId)

          // Add visual orchestration arrow: maestroId (orquestrador PTY) → worker
          if (orchestratorPanelId) {
            const orquestrador = findCanvasNodeForPanel(orchestratorPanelId)
            const worker = findCanvasNodeForPanel(panelId)
            if (orquestrador && worker) {
              requestAnimationFrame(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (orquestrador.store.getState() as any).addConnection?.(
                  orquestrador.nodeId,
                  worker.nodeId,
                  'orchestration',
                )
              })
            }
          }

          // Wait for terminal to initialize (with max retries)
          const startAgent = (retries = 0) => {
            if (retries > MAX_AGENT_RETRIES) {
              console.error('[orquestra] Failed to start agent: max retries exceeded')
              return
            }
            const ptyId = terminalRegistry.ptyIdForPanel(panelId!)
            if (!ptyId) {
              setTimeout(() => startAgent(retries + 1), AGENT_POLL_MS)
              return
            }
            console.log('[orquestra] Terminal ready: ' + name + ' (ptyId: ' + ptyId + ')')

            // Start the agent
            if (agentCmd) {
              const cr = String.fromCharCode(13)
              window.electronAPI?.terminalWrite?.(ptyId, agentCmd + cr)
              console.log('[orquestra] Started ' + agentCmd + ' in ' + name)
            }

            // Register worker for response tracking
            window.electronAPI?.orquestraTrackWorker?.(ptyId, maestroId, name, args.role || '', ws.rootPath || '')
            console.log('[orquestra] Tracking ' + name + ' → ' + maestroId)

            // Wait for agent to produce output, then send role
            // Replaces the old hardcoded 8s with an adaptive check.
            const sendRole = (attempts = 0) => {
              if (attempts > MAX_ROLE_WAIT) {
                console.log('[orquestra] Timeout waiting for ' + name + ' output, sending role anyway')
                // fallback: send role even if no output detected
              }
              if (args.role) {
                window.electronAPI?.workerHasOutput?.(ptyId).then((hasOutput) => {
                  if (hasOutput || attempts >= MAX_ROLE_WAIT) {
                    const cr = String.fromCharCode(13)
                    const markedRole = '[ORQUESTRADOR\u2192WORKER] ' + args.role
                    window.electronAPI?.terminalWrite?.(ptyId, markedRole + cr)
                    console.log('[orquestra] Sent role to ' + name + ' after ~' + (attempts * ROLE_POLL_MS / 1000) + 's')
                  } else {
                    setTimeout(() => sendRole(attempts + 1), ROLE_POLL_MS)
                  }
                })
              }
            }
            // Start checking after 2s (minimum agent boot time)
            setTimeout(() => sendRole(0), 2000)
          }
          // Start polling after 1s
          setTimeout(() => startAgent(0), 1000)
        }
      }),

      // --- Dismiss ---
      window.electronAPI.onMaestroDismiss((_maestroId, args) => {
        const store = useAppStore.getState()
        const ws = store.workspaces[0]
        if (!ws) return
        const target = args.target
        const panel = Object.values(ws.panels).find(
          (p) => p.title === target || p.id === target,
        )
        if (panel) {
          // Remove orchestration arrow from canvas
          const worker = findCanvasNodeForPanel(panel.id)
          if (worker) {
            const conns = worker.store.getState().getConnections(worker.nodeId)
            for (const conn of conns) {
              if (conn.type === 'orchestration') {
                worker.store.getState().removeConnection(conn.id)
              }
            }
          }
          store.closePanel(ws.id, panel.id)
          console.log('[orquestra] Dismissed: ' + target)
        }
      }),

      // --- Connect ---
      window.electronAPI.onMaestroConnect((_maestroId, args) => {
        const store = useAppStore.getState()
        const ws = store.workspaces[0]
        if (!ws) return
        const editorId = store.createEditor(ws.id, args.path)
        if (editorId) console.log('[orquestra] Connected ' + args.target + ' to ' + args.path)
      }),

      // --- List ---
      window.electronAPI.onMaestroList((_maestroId, _args) => {
        const store = useAppStore.getState()
        const ws = store.workspaces[0]
        if (!ws) return
        // TODO: ideally filter to only tracked workers via IPC, but for now
        // show all terminals + agents (excluding the maestro terminal itself)
        const all = Object.values(ws.panels)
          .filter((p) => (p.type === 'terminal' || p.type === 'agent') && p.id !== terminalRegistry.panelIdForPty(_maestroId))
          .map((p) => p.title + ' (' + p.type + ') [' + p.id + ']')
          .join('\n')
        console.log('[orquestra] Workers:\n' + (all || '(none)'))
      }),

      // --- Reassign ---
      window.electronAPI.onMaestroReassign((_maestroId, args) => {
        const store = useAppStore.getState()
        const ws = store.workspaces[0]
        if (!ws) return
        const panel = Object.values(ws.panels).find(
          (p) => p.title === args.target || p.id === args.target,
        )
        if (panel) {
          store.updatePanelTitle(ws.id, panel.id, args.role)
          console.log('[orquestra] Reassigned ' + args.target + ' to: ' + args.role)
        }
      }),
    ]

    return () => unsubs.forEach((u) => u?.())
  }, [])
}
