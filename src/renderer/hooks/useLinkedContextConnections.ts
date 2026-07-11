import { useEffect, useRef } from 'react'
import type { CanvasNodeState, PanelState, TerminalConnection } from '../../shared/types'
import type { LinkedContextBundleWriteResult } from '../../shared/linkedContext'
import { useCanvasStoreContext } from '../stores/CanvasStoreContext'
import { useAppStore } from '../stores/appStore'
import { resolveContextSource } from '../contextLinks/contextSourceResolver'
import { useSettingsStore } from '../stores/settingsStore'
import { flushScratchEditorBuffersToStore, writeEditorBuffer } from '../lib/editor/editorSaveRegistry'

type ConnectionMap = Record<string, TerminalConnection>

export function useLinkedContextConnections(): void {
  const connections = useCanvasStoreContext((s) => s.connections)
  const nodes = useCanvasStoreContext((s) => s.nodes)
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId)
  const workspace = useAppStore((s) => s.workspaces.find((w) => w.id === s.selectedWorkspaceId))
  const initializedRef = useRef(false)
  const previousConnectionsRef = useRef<ConnectionMap>({})
  const inFlightTargetsRef = useRef(new Set<string>())
  const refreshTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    if (!workspace?.rootPath || !selectedWorkspaceId) return

    const previous = previousConnectionsRef.current
    const current = connections
    previousConnectionsRef.current = current

    if (!initializedRef.current) {
      initializedRef.current = true
      return
    }

    const changedTargetNodeIds = new Set<string>()
    const changedOutputConnectionIds = new Set<string>()

    for (const conn of Object.values(current)) {
      if ((conn.type ?? 'pipe') !== 'context') continue
      if (!previous[conn.id] || (previous[conn.id].type ?? 'pipe') !== 'context') changedTargetNodeIds.add(conn.targetNodeId)
    }

    for (const conn of Object.values(current)) {
      if (conn.type !== 'output') continue
      if (!previous[conn.id] || previous[conn.id].type !== 'output') changedOutputConnectionIds.add(conn.id)
    }

    for (const conn of Object.values(previous)) {
      if ((conn.type ?? 'pipe') !== 'context') continue
      if (!current[conn.id]) changedTargetNodeIds.add(conn.targetNodeId)
    }

    for (const targetNodeId of changedTargetNodeIds) {
      void syncTargetContext({
        workspaceId: selectedWorkspaceId,
        workspaceRoot: workspace.rootPath,
        targetNodeId,
        connections: current,
        nodes,
        panels: workspace.panels,
        inFlightTargets: inFlightTargetsRef.current,
      })
    }

    for (const connectionId of changedOutputConnectionIds) {
      void syncOutputConnection({
        workspaceId: selectedWorkspaceId,
        workspaceRoot: workspace.rootPath,
        connectionId,
        connections: current,
        nodes,
        panels: workspace.panels,
      })
    }
  }, [connections, nodes, selectedWorkspaceId, workspace])

  useEffect(() => {
    if (!workspace?.rootPath || !selectedWorkspaceId) return
    const handler = (event: Event) => {
      const connectionId = (event as CustomEvent<{ connectionId?: string }>).detail?.connectionId
      if (!connectionId) return
      void syncOutputConnection({
        workspaceId: selectedWorkspaceId,
        workspaceRoot: workspace.rootPath,
        connectionId,
        connections,
        nodes,
        panels: workspace.panels,
      })
    }
    window.addEventListener('linked-output:refresh', handler)
    return () => window.removeEventListener('linked-output:refresh', handler)
  }, [connections, nodes, selectedWorkspaceId, workspace])

  // Always re-bundle when a linked source edits (was gated by a setting that
  // defaulted off and left agents stuck on stale CLAUDE.local.md / latest.md).
  // Manual "Refresh context" on the connection still works; this keeps the
  // disk snapshot in lock-step with typing.
  useEffect(() => {
    if (!workspace?.rootPath || !selectedWorkspaceId) return
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ sourcePanelId?: string }>
      const sourcePanelId = custom.detail?.sourcePanelId
      if (!sourcePanelId) return

      const targetNodeIds = new Set<string>()
      for (const conn of Object.values(connections)) {
        if ((conn.type ?? 'pipe') !== 'context') continue
        const sourceNode = nodes[conn.sourceNodeId]
        if (sourceNode?.panelId === sourcePanelId) targetNodeIds.add(conn.targetNodeId)
      }

      for (const targetNodeId of targetNodeIds) {
        const existing = refreshTimersRef.current.get(targetNodeId)
        if (existing) clearTimeout(existing)
        const timer = setTimeout(() => {
          refreshTimersRef.current.delete(targetNodeId)
          // Prefer live store panels over a stale React closure captured when
          // the first keystroke scheduled the timer. Live Monaco text is still
          // read via getEditorBuffer inside resolveContextSource.
          const livePanels =
            useAppStore.getState().workspaces.find((w) => w.id === selectedWorkspaceId)?.panels
            ?? workspace.panels
          void syncTargetContext({
            workspaceId: selectedWorkspaceId,
            workspaceRoot: workspace.rootPath,
            targetNodeId,
            connections,
            nodes,
            panels: livePanels,
            inFlightTargets: inFlightTargetsRef.current,
            silent: true,
          })
        }, 400)
        refreshTimersRef.current.set(targetNodeId, timer)
      }
    }
    window.addEventListener('linked-context:source-changed', handler)
    return () => {
      window.removeEventListener('linked-context:source-changed', handler)
      for (const timer of refreshTimersRef.current.values()) clearTimeout(timer)
      refreshTimersRef.current.clear()
    }
  }, [connections, nodes, selectedWorkspaceId, workspace])

  useEffect(() => {
    if (!workspace?.rootPath || !selectedWorkspaceId) return
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ targetNodeId?: string; action?: string }>
      const targetNodeId = custom.detail?.targetNodeId
      if (!targetNodeId) return
      void syncTargetContext({
        workspaceId: selectedWorkspaceId,
        workspaceRoot: workspace.rootPath,
        targetNodeId,
        connections,
        nodes,
        panels: workspace.panels,
        inFlightTargets: inFlightTargetsRef.current,
      }).then((result) => {
        if (custom.detail?.action === 'open-bundle' && result?.latestPath) {
          useAppStore.getState().createEditor(selectedWorkspaceId, result.latestPath)
        }
      })
    }
    window.addEventListener('linked-context:refresh', handler)
    return () => window.removeEventListener('linked-context:refresh', handler)
  }, [connections, nodes, selectedWorkspaceId, workspace])
}

async function syncTargetContext(params: {
  workspaceId: string
  workspaceRoot: string
  targetNodeId: string
  connections: ConnectionMap
  nodes: Record<string, CanvasNodeState>
  panels: Record<string, PanelState>
  inFlightTargets: Set<string>
  silent?: boolean
}): Promise<LinkedContextBundleWriteResult | null> {
  if (params.inFlightTargets.has(params.targetNodeId)) return null
  params.inFlightTargets.add(params.targetNodeId)
  try {
    // Pull live Monaco scratch text into panel.unsavedContent before resolve so
    // a mid-debounce edit still lands in latest.md / CLAUDE.local.md.
    flushScratchEditorBuffersToStore(
      (panelId) => {
        for (const ws of useAppStore.getState().workspaces) {
          const p = ws.panels[panelId]
          if (p) return p
        }
        return params.panels[panelId]
      },
      (panelId, content) => {
        for (const ws of useAppStore.getState().workspaces) {
          if (ws.panels[panelId]) {
            useAppStore.getState().setPanelUnsavedContent(ws.id, panelId, content)
            return
          }
        }
      },
    )
    const panels =
      useAppStore.getState().workspaces.find((w) => w.id === params.workspaceId)?.panels
      ?? params.panels

    const targetNode = params.nodes[params.targetNodeId]
    if (!targetNode) return null
    const targetPanel = panels[targetNode.panelId]
    if (!targetPanel) return null

    const targetConnections = Object.values(params.connections)
      .filter((conn) => (conn.type ?? 'pipe') === 'context' && conn.targetNodeId === params.targetNodeId)

    const sources = []
    for (const conn of targetConnections) {
      const sourceNode = params.nodes[conn.sourceNodeId]
      if (!sourceNode) continue
      const sourcePanel = panels[sourceNode.panelId]
      if (!sourcePanel) continue
      sources.push(await resolveContextSource({
        workspaceId: params.workspaceId,
        workspaceRoot: params.workspaceRoot,
        sourcePanel,
        sourceNodeId: sourceNode.id,
        targetPanelId: targetPanel.id,
        targetNodeId: targetNode.id,
        connectionId: conn.id,
      }))
    }

    const result = await window.electronAPI.linkedContextWrite({
      workspaceId: params.workspaceId,
      workspaceRoot: params.workspaceRoot,
      targetPanelId: targetPanel.id,
      targetNodeId: targetNode.id,
      maxBundleBytes: useSettingsStore.getState().linkedContextMaxBundleBytes,
      sources,
    })

    window.dispatchEvent(new CustomEvent('linked-context:status', {
      detail: { connectionIds: targetConnections.map((connection) => connection.id), status: sources.some((source) => source.error) ? 'warning' : 'ok' },
    }))
    if (!params.silent) await notifyTarget(params.workspaceId, targetPanel.id, targetPanel.type, result.latestPath, sources)
    return result
  } catch (err) {
    console.warn('[linked-context] failed to sync target context', err)
    window.dispatchEvent(new CustomEvent('linked-context:status', {
      detail: { targetNodeId: params.targetNodeId, status: 'error', error: err instanceof Error ? err.message : String(err) },
    }))
    return null
  } finally {
    params.inFlightTargets.delete(params.targetNodeId)
  }
}

async function notifyTarget(
  workspaceId: string,
  targetPanelId: string,
  targetPanelType: string,
  latestPath: string,
  sources: Awaited<ReturnType<typeof resolveContextSource>>[],
): Promise<void> {
  // Terminal targets: do NOT inject anything into the PTY or the xterm buffer.
  //   - PTY write: multi-line text is executed as shell input; on Windows a
  //     bare .md path opens Notepad.
  //   - Local xterm.write: still paints into full-screen agent TUIs (Claude
  //     Code, etc.), which treats the painted text as a user prompt and may
  //     wrap long paths mid-filename so the agent looks for a broken path.
  // Context is already on disk under .orquestra/context/<panel>/latest.md and
  // the canvas node shows a "N context" badge. Open the bundle from the
  // connection context menu if needed.
  if (targetPanelType === 'terminal') return

  if (targetPanelType === 'agent') {
    const sourceCount = sources.length
    // Prefer a workspace-relative path so the agent resolves it from cwd.
    const relativeHint = toWorkspaceRelativePath(latestPath)
    const titles = sources.map((s) => s.title).filter(Boolean).slice(0, 5)
    const plainMessage = [
      `[Orquestra] Linked context updated (${sourceCount} source${sourceCount === 1 ? '' : 's'}${titles.length ? `: ${titles.join(', ')}` : ''}).`,
      'Also listed in `.orquestra/context/INDEX.md`.',
      'Read this file before answering the next task (single path, do not split):',
      relativeHint,
    ].join('\n')
    const images = await Promise.all(sources
      .map((source) => source.screenshotPath || (source.kind === 'image' ? source.path : undefined))
      .filter((path): path is string => !!path)
      .map(async (path) => {
        const data = await window.electronAPI.fsReadBinary(path, workspaceId)
        return {
          data: arrayBufferToBase64(data),
          mimeType: imageMimeType(path),
          fileName: path.split(/[\\/]/).pop(),
        }
      }))
    await window.electronAPI.agentSteer(targetPanelId, plainMessage, images)
  }
}

/** Prefer `.orquestra/context/...` when the absolute path is inside a workspace. */
export function toWorkspaceRelativePath(absoluteOrLocator: string): string {
  const normalized = absoluteOrLocator.replace(/\\/g, '/')
  const marker = '/.orquestra/context/'
  const idx = normalized.toLowerCase().lastIndexOf(marker)
  if (idx >= 0) return normalized.slice(idx + 1) // drop leading slash → .orquestra/...
  return absoluteOrLocator
}

async function syncOutputConnection(params: {
  workspaceId: string
  workspaceRoot: string
  connectionId: string
  connections: ConnectionMap
  nodes: Record<string, CanvasNodeState>
  panels: Record<string, PanelState>
}): Promise<void> {
  const connection = params.connections[params.connectionId]
  if (!connection || connection.type !== 'output') return
  const sourceNode = params.nodes[connection.sourceNodeId]
  const targetNode = params.nodes[connection.targetNodeId]
  const sourcePanel = sourceNode ? params.panels[sourceNode.panelId] : undefined
  const targetPanel = targetNode ? params.panels[targetNode.panelId] : undefined
  if (!sourcePanel || !targetPanel || targetPanel.type !== 'editor') return

  const source = await resolveContextSource({
    workspaceId: params.workspaceId,
    workspaceRoot: params.workspaceRoot,
    sourcePanel,
    sourceNodeId: sourceNode.id,
    targetPanelId: targetPanel.id,
    targetNodeId: targetNode.id,
    connectionId: connection.id,
  })
  if (!source.text) return

  const section = `## Output from ${source.title}\n\n${source.text}`
  if (writeEditorBuffer(targetPanel.id, section, 'append')) return
  if (targetPanel.filePath) {
    const current = await window.electronAPI.fsReadFile(targetPanel.filePath, params.workspaceId)
    await window.electronAPI.fsWriteFile(targetPanel.filePath, `${current}${current ? '\n\n' : ''}${section}`, params.workspaceId)
    return
  }
  const current = targetPanel.unsavedContent ?? ''
  useAppStore.getState().setPanelUnsavedContent(params.workspaceId, targetPanel.id, `${current}${current ? '\n\n' : ''}${section}`)
}

function arrayBufferToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function imageMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}
