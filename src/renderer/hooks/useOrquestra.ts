// =============================================================================
// useOrquestra — Hook that listens for Maestro commands from terminals and
// executes canvas operations (recruit, dismiss, connect, list, reassign).
// =============================================================================

import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { terminalRegistry } from '../lib/terminal/terminalRegistry'
import { findCanvasNodeForPanel } from '../stores/canvasStore'
import type { PanelType, Point } from '../../shared/types'

function resolveAgentPanelType(agent?: string): PanelType {
  if (agent?.toLowerCase().includes('agent') || agent?.toLowerCase().includes('claude')) return 'agent'
  return 'terminal'
}

export function useOrquestra(): void {
  const recruitCountRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!window.electronAPI?.onMaestroRecruit) return

    const unsubs = [
      // --- Recruit ---
      window.electronAPI.onMaestroRecruit((maestroId, args) => {
        const store = useAppStore.getState()
        const ws = store.workspaces[0]
        if (!ws) return

        const panelType = resolveAgentPanelType(args.agent)
        const name = args.name || args.role || 'Worker'
        const agentCmd = args.agent && args.agent !== 'auto' ? args.agent : 'verboo'

        const count = recruitCountRef.current.get(maestroId) || 0
        recruitCountRef.current.set(maestroId, count + 1)
        const position: Point = { x: 0, y: 420 * (count + 1) }

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
          const orchestratorPanelId = terminalRegistry.panelIdForPty(maestroId)
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

          // Wait for terminal to initialize, then start agent and send role
          const startAgent = () => {
            const ptyId = terminalRegistry.ptyIdForPanel(panelId!)
            if (!ptyId) {
              // Terminal not ready yet, retry in 500ms
              setTimeout(startAgent, 500)
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

            // Send role as prompt after agent initializes (with origin marker)
            if (args.role) {
              console.log('[orquestra] Will send role to ' + name + ' in 8s')
              setTimeout(() => {
                const cr = String.fromCharCode(13)
                const markedRole = '[ORQUESTRADOR\u2192WORKER] ' + args.role
                window.electronAPI?.terminalWrite?.(ptyId, markedRole + cr)
                console.log('[orquestra] Sent role to ' + name + ': ' + markedRole.slice(0, 60))
              }, 8000)
            }
          }
          // Start polling after 1s
          setTimeout(startAgent, 1000)
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
        const terminals = Object.values(ws.panels)
          .filter((p) => p.type === 'terminal' || p.type === 'agent')
          .map((p) => p.title + ' (' + p.type + ') [' + p.id + ']')
          .join('\n')
        console.log('[orquestra] Terminals:\n' + terminals)
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
