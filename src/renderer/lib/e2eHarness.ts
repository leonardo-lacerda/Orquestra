// E2E test harness — exposes a tiny inspect/seed API on window.__orquestraE2E
// when the app is launched with ORQUESTRA_E2E=1.
//
// Why a harness: drag tests need deterministic seed (1-2 nodes at known
// positions, known zoom) and assertions against canvas-space state. Driving
// the UI for setup is brittle; reaching into stores is reliable.

import { useAppStore } from '../stores/appStore'
import { useUIStore, type SidebarView } from '../stores/uiStore'
import { getOrCreateCanvasStoreForPanel } from '../stores/canvasStore'
import { gitStatusStore, type GitWorktreeEntry } from '../stores/gitStatusStore'
import { useDragStore } from '../drag/store'
import { useSearchStore } from '../stores/searchStore'
import { useOrchestrationRunStore } from '../stores/orchestrationRunStore'
import { getLastReveal } from './editor/editorReveal'
import { applyTheme } from './themeManager'
import { BUILT_IN_THEMES } from '../../shared/themes'
import { terminalRegistry } from './terminal/terminalRegistry'
import { getEditorBuffer, writeEditorBuffer } from './editor/editorSaveRegistry'
import type { CanvasConnectionType, Point, WorktreeMeta } from '../../shared/types'

/** Serializable snapshot of the search store for e2e assertions. */
export interface SearchSnapshot {
  query: string
  isRegex: boolean
  matchCase: boolean
  wholeWord: boolean
  includes: string
  excludes: string
  respectIgnore: boolean
  optionsExpanded: boolean
  status: string
  searchId: string | null
  truncated: boolean
  error: string | null
  fileCount: number
  filePaths: string[]
  totalMatches: number
  dismissedFiles: number
  dismissedLines: number
}

declare global {
  interface Window {
    __orquestraE2E?: {
      ready: true
      activeCanvasPanelId(): string | null
      createTerminal(point: Point): string
      createEditor(point: Point): string
      createCanvasPanel(point: Point): string
      nodes(): { id: string; panelId: string; origin: Point; size: { width: number; height: number } }[]
      zoom(): number
      setZoom(z: number): void
      resetViewport(): void
      /** Set the canvas viewport offset (canvas-space pan), for driving a pan
       *  sweep deterministically from a test (the windowless e2e harness doesn't
       *  reliably route wheel-pan to the canvas). */
      setViewport(offset: Point): void
      /** Move a node's origin in the canvas store — drives the same per-frame
       *  geometry-rebuild + redraw path a live node-drag does, without depending
       *  on synthetic mouse drag working in the hidden window. */
      moveNode(nodeId: string, origin: Point): void
      /** Close every panel in the selected workspace (clears the canvas between
       *  perf scenarios so node counts/layout don't accumulate). */
      clearCanvas(): void
      addWorkspace(name?: string, rootPath?: string, id?: string): string
      selectWorkspace(id: string): Promise<void>
      /** Seed N worktrees on the selected workspace (index 0 = primary, keyed by
       *  the workspace root) WITHOUT a real on-disk repo: writes UI metadata
       *  (id/color/label) and injects a pinned live `git worktree list` so the
       *  worktree terrace / minimap outlines render. Returns the seeded records. */
      seedWorktrees(specs: { color: string; label?: string }[]): { id: string; path: string; color: string }[]
      /** Tag a terminal/agent node's panel with a worktree id (the real path,
       *  flowing through CanvasNode → setNodeActiveWorktree). Returns false if the
       *  node has no resolvable panel. */
      tagNodeWorktree(nodeId: string, worktreeId: string): boolean
      /** Inspect the worktree-terrace pipeline for perf-test assertions: how many
       *  live worktrees, how many nodes are tagged, how many distinct groups they
       *  form, and whether the GL (vs CPU-fallback) territory backend is active. */
      worktreeDebug(): {
        liveWorktrees: number
        metaWorktrees: number
        taggedNodes: number
        distinctGroups: number
        glActive: boolean
      }
      /** Resolve the PTY id backing a terminal node (null until the PTY spawns). */
      terminalPtyId(nodeId: string): string | null
      /** Write raw data to a terminal node's PTY (e.g. a flooding command). */
      writeTerminal(nodeId: string, data: string): boolean
      /** Read the current xterm scrollback for a node or panel id. */
      terminalOutput(nodeOrPanelId: string): string
      /** Paste through xterm's real input path and focus its hidden textarea. */
      pasteTerminal(nodeOrPanelId: string, text: string): boolean
      /** Type through xterm.onData in small user-input chunks, avoiding TUI paste mode. */
      typeTerminal(nodeOrPanelId: string, text: string, delayMs?: number): Promise<boolean>
      /** Submit Enter through xterm.onData as user input (works in hidden windows). */
      submitTerminal(nodeOrPanelId: string): boolean
      addConnection(sourceNodeId: string, targetNodeId: string, type: CanvasConnectionType): string | null
      connections(): Array<{ id: string; sourceNodeId: string; targetNodeId: string; type: string }>
      setEditorContent(nodeId: string, content: string): boolean
      editorContent(nodeId: string): string | null
      /** Point the selected workspace at a real directory (registers it as an
       *  allowed root) so content search has files to scan. */
      setWorkspaceRoot(rootPath: string): Promise<boolean>
      /** Activate a sidebar view (e.g. 'search') on the left activity bar. */
      openSidebarView(view: SidebarView): void
      /** Set (or clear, with null) the active left sidebar view. Passing null
       *  collapses the sidebar panel — used by canvas geometry tests that need
       *  the full-width canvas the pushed sidebar would otherwise shrink. */
      setActiveLeftSidebarView(view: SidebarView | null): void
      /** File paths of currently-open editor panels (for open-at-match asserts). */
      editorPaths(): string[]
      /** Serializable snapshot of the search store (query, options, results). */
      getSearchSnapshot(): SearchSnapshot
      /** The most recent editor reveal request (panelId + line/column), or null. */
      lastEditorReveal(): { panelId: string; line: number; column?: number } | null
      /** Apply a theme by id (for cross-theme visual checks). */
      setTheme(id: string): void
      /** All available theme ids + their light/dark type. */
      themeIds(): { id: string; type: string }[]
      dragSnapshot(): {
        isDragging: boolean
        sourceKind: string | null
        sourceNodeId: string | null
        targetKind: string | null
      }
      /**
       * Enable Maestro on a terminal node (crown path): marks panel.maestro and
       * calls terminalSetMaestro so CLI/skills are copied into the workspace.
       */
      enableMaestro(nodeId: string): Promise<boolean>
      /**
       * Seed a worker terminal + run-tracker entry as if recruited by Maestro.
       * Returns the new worker node id (or null on failure).
       */
      recruitWorker(args: {
        maestroNodeId: string
        name: string
        role: string
        point?: Point
      }): string | null
      /** Snapshot of orchestration run-tracker workers for a maestro node. */
      orchestrationWorkers(maestroNodeId: string): Array<{
        panelId: string
        name: string
        role: string
        status: string
      }>
      /** Mark a tracked worker done/failed (simulates result transition). */
      markWorkerDone(panelId: string, status?: 'done' | 'failed'): void
    }
  }
}

export function installE2EHarness(): void {
  if (window.__orquestraE2E) return

  // Kill CSS transitions/animations under e2e. The windows are hidden (main's
  // revealWindow is a no-op under ORQUESTRA_E2E), and a hidden window throttles the
  // compositor — so anything animated over time (node enter/exit, drag opacity,
  // layout) would otherwise leave the timing-sensitive specs reading a
  // mid-animation rect. Making every transition instant keeps geometry/visual
  // state final the moment it changes. (Node enter/exit state is also forced to
  // its final value at the source — see canvasStore/CanvasNode — since those are
  // rAF/timer driven, not pure CSS.)
  const noAnim = document.createElement('style')
  noAnim.setAttribute('data-orquestra-e2e-no-animations', '')
  noAnim.textContent =
    '*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; }'
  document.head.appendChild(noAnim)

  // The Canvas component stamps data-canvas-panel-id on its root — use the
  // DOM as the source of truth for which canvas is currently mounted/active.
  const activeCanvasPanelId = (): string | null => {
    const el = document.querySelector('[data-canvas-panel-id]')
    return el?.getAttribute('data-canvas-panel-id') ?? null
  }

  const activeCanvasStore = () => {
    const pid = activeCanvasPanelId()
    return pid ? getOrCreateCanvasStoreForPanel(pid) : null
  }

  const createTerminal = (point: Point): string => {
    const wsId = useAppStore.getState().selectedWorkspaceId
    // Pin to the currently mounted canvas panel. After setWorkspaceRoot remounts
    // the shell, default placement can miss the live canvas store and leave a
    // panel with no node — seedTerminal then times out waiting for the node.
    const canvasId = activeCanvasPanelId()
    const placement = canvasId
      ? { target: 'canvas' as const, canvasPanelId: canvasId, position: point }
      : undefined
    const panelId = useAppStore.getState().createTerminal(
      wsId,
      undefined,
      point,
      placement,
    )
    const cs = activeCanvasStore()
    if (!cs) return panelId
    for (const n of Object.values(cs.getState().nodes)) {
      if (n.panelId === panelId) {
        // Focus + pin so viewport culling always mounts the node (hidden e2e
        // windows often have odd containerSize/offset → empty visible set).
        const st = cs.getState()
        st.focusNode(n.id)
        if (!st.nodes[n.id]?.isPinned) st.togglePin(n.id)
        st.setZoom(1)
        cs.setState({ viewportOffset: { x: 0, y: 0 } })
        // Ensure container size is non-zero for culling math (hidden windows)
        if (st.containerSize.width === 0 || st.containerSize.height === 0) {
          cs.setState({ containerSize: { width: 1280, height: 800 } })
        }
        return n.id
      }
    }
    return panelId
  }

  const createEditor = (point: Point): string => {
    const wsId = useAppStore.getState().selectedWorkspaceId
    const panelId = useAppStore.getState().createEditor(wsId, undefined, point)
    const cs = activeCanvasStore()
    if (!cs) return panelId
    for (const n of Object.values(cs.getState().nodes)) {
      if (n.panelId === panelId) return n.id
    }
    return panelId
  }

  const createCanvasPanel = (point: Point): string => {
    const wsId = useAppStore.getState().selectedWorkspaceId
    useAppStore.getState().createCanvas(wsId, point)
    const cs = activeCanvasStore()
    if (!cs) return ''
    const nodes = Object.values(cs.getState().nodes)
    return nodes.length ? nodes[nodes.length - 1].id : ''
  }

  const nodes = () => {
    const cs = activeCanvasStore()
    if (!cs) return []
    return Object.values(cs.getState().nodes).map((n) => ({
      id: n.id,
      panelId: n.panelId,
      origin: { x: n.origin.x, y: n.origin.y },
      size: { width: n.size.width, height: n.size.height },
    }))
  }

  const zoom = () => activeCanvasStore()?.getState().zoomLevel ?? 1

  const setZoom = (z: number) => {
    activeCanvasStore()?.getState().setZoom(z)
  }

  const resetViewport = () => {
    activeCanvasStore()?.setState({ viewportOffset: { x: 0, y: 0 } })
  }

  const setViewport = (offset: Point) => {
    activeCanvasStore()?.getState().setViewportOffset(offset)
  }

  const moveNode = (nodeId: string, origin: Point) => {
    activeCanvasStore()?.getState().moveNode(nodeId, origin)
  }

  const clearCanvas = () => {
    const wsId = useAppStore.getState().selectedWorkspaceId
    const ws = useAppStore.getState().workspaces.find((w) => w.id === wsId)
    for (const panelId of Object.keys(ws?.panels ?? {})) {
      useAppStore.getState().closePanel(wsId, panelId)
    }
  }

  const addWorkspace = (name?: string, rootPath?: string, id?: string): string => {
    return useAppStore.getState().addWorkspace(name, rootPath, id)
  }

  const selectWorkspace = async (id: string): Promise<void> => {
    await useAppStore.getState().selectWorkspace(id)
  }

  const seedWorktrees = (
    specs: { color: string; label?: string }[],
  ): { id: string; path: string; color: string }[] => {
    const wsId = useAppStore.getState().selectedWorkspaceId
    const ws = useAppStore.getState().workspaces.find((w) => w.id === wsId)
    if (!ws) return []
    // The primary worktree is keyed by the workspace root; synthesize a path if
    // the e2e workspace has none so useWorktrees has a stable join key.
    const rootPath = ws.rootPath || `/private/tmp/orquestra-e2e-wt-${wsId}`
    const metas: WorktreeMeta[] = specs.map((s, i) => ({
      id: `wt-e2e-${i}`,
      path: i === 0 ? rootPath : `${rootPath}/.orquestra-wt/feature-${i}`,
      color: s.color,
      label: s.label,
    }))
    // Set the workspace root + worktree metadata in one go (deterministic — no
    // dependence on ensurePrimaryWorktree / upsert ordering).
    useAppStore.setState((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === wsId ? { ...w, rootPath, worktrees: metas } : w,
      ),
    }))
    // Inject the matching live worktree list so membership sees 2+ live (the
    // metadata alone would all read as orphans and gate the terrace off).
    const live: GitWorktreeEntry[] = metas.map((m, i) => ({
      path: m.path,
      branch: i === 0 ? 'main' : `feature-${i}`,
      isPrimary: i === 0,
      isCurrent: i === 0,
    }))
    gitStatusStore._seedWorktrees(rootPath, live)
    return metas.map((m) => ({ id: m.id, path: m.path, color: m.color }))
  }

  const tagNodeWorktree = (nodeId: string, worktreeId: string): boolean => {
    const wsId = useAppStore.getState().selectedWorkspaceId
    const cs = activeCanvasStore()
    const node = cs?.getState().nodes[nodeId]
    const panelId = node?.panelId ?? nodeId
    if (!panelId) return false
    useAppStore.getState().setPanelWorktreeId(wsId, panelId, worktreeId)
    return true
  }

  const worktreeDebug = () => {
    const wsId = useAppStore.getState().selectedWorkspaceId
    const ws = useAppStore.getState().workspaces.find((w) => w.id === wsId)
    const rootPath = ws?.rootPath ?? ''
    const cs = activeCanvasStore()
    const tags = cs ? cs.getState().nodeActiveWorktreeId : {}
    const values = Object.values(tags).filter((v): v is string => !!v)
    const glCanvas = document.querySelector('[data-worktree-territory]') as HTMLElement | null
    const glActive = !!glCanvas && getComputedStyle(glCanvas).display !== 'none'
    return {
      liveWorktrees: gitStatusStore.getSnapshot(rootPath).worktrees.length,
      metaWorktrees: ws?.worktrees?.length ?? 0,
      taggedNodes: values.length,
      distinctGroups: new Set(values).size,
      glActive,
    }
  }

  const terminalPtyId = (nodeId: string): string | null => {
    const cs = activeCanvasStore()
    if (!cs) return null
    const node = cs.getState().nodes[nodeId]
    const panelId = node?.panelId ?? nodeId
    return terminalRegistry.getEntry(panelId)?.ptyId || null
  }

  const writeTerminal = (nodeId: string, data: string): boolean => {
    const ptyId = terminalPtyId(nodeId)
    if (!ptyId) return false
    void window.electronAPI?.terminalWrite(ptyId, data)
    return true
  }

  const terminalOutput = (nodeOrPanelId: string): string => {
    const cs = activeCanvasStore()
    const panelId = cs?.getState().nodes[nodeOrPanelId]?.panelId ?? nodeOrPanelId
    const entry = terminalRegistry.getEntry(panelId)
    return entry ? terminalRegistry.serializeTerminalState(entry) ?? '' : ''
  }

  const pasteTerminal = (nodeOrPanelId: string, text: string): boolean => {
    const cs = activeCanvasStore()
    const panelId = cs?.getState().nodes[nodeOrPanelId]?.panelId ?? nodeOrPanelId
    const entry = terminalRegistry.getEntry(panelId)
    if (!entry) return false
    entry.terminal.focus()
    entry.terminal.paste(text)
    return true
  }

  const submitTerminal = (nodeOrPanelId: string): boolean => {
    const cs = activeCanvasStore()
    const panelId = cs?.getState().nodes[nodeOrPanelId]?.panelId ?? nodeOrPanelId
    const entry = terminalRegistry.getEntry(panelId)
    if (!entry) return false
    entry.terminal.input('\r', true)
    return true
  }

  const typeTerminal = async (
    nodeOrPanelId: string,
    text: string,
    delayMs = 2,
  ): Promise<boolean> => {
    const cs = activeCanvasStore()
    const panelId = cs?.getState().nodes[nodeOrPanelId]?.panelId ?? nodeOrPanelId
    const entry = terminalRegistry.getEntry(panelId)
    if (!entry) return false
    entry.terminal.focus()
    for (const char of text) {
      entry.terminal.input(char, true)
      if (delayMs > 0) await new Promise((resolve) => window.setTimeout(resolve, delayMs))
    }
    return true
  }

  const addConnection = (
    sourceNodeId: string,
    targetNodeId: string,
    type: CanvasConnectionType,
  ): string | null => activeCanvasStore()?.getState().addConnection(sourceNodeId, targetNodeId, type) ?? null

  const connections = () => Object.values(activeCanvasStore()?.getState().connections ?? {}).map((connection) => ({
    id: connection.id,
    sourceNodeId: connection.sourceNodeId,
    targetNodeId: connection.targetNodeId,
    type: connection.type ?? 'pipe',
  }))

  const panelIdForNode = (nodeId: string): string | null =>
    activeCanvasStore()?.getState().nodes[nodeId]?.panelId ?? null

  const setEditorContent = (nodeId: string, content: string): boolean => {
    const panelId = panelIdForNode(nodeId)
    return panelId ? writeEditorBuffer(panelId, content, 'replace') : false
  }

  const editorContent = (nodeId: string): string | null => {
    const panelId = panelIdForNode(nodeId)
    return panelId ? getEditorBuffer(panelId) : null
  }

  const setWorkspaceRoot = (rootPath: string): Promise<boolean> => {
    const wsId = useAppStore.getState().selectedWorkspaceId
    return useAppStore.getState().setWorkspaceRootPath(wsId, rootPath)
  }

  const setActiveLeftSidebarView = (view: SidebarView | null): void => {
    useUIStore.getState().setActiveLeftSidebarView(view)
  }

  const openSidebarView = (view: SidebarView): void => {
    useUIStore.getState().setActiveLeftSidebarView(view)
  }

  const editorPaths = (): string[] => {
    const s = useAppStore.getState()
    const ws = s.workspaces.find((w) => w.id === s.selectedWorkspaceId)
    if (!ws) return []
    return Object.values(ws.panels)
      .filter((p) => p.type === 'editor' && !!p.filePath)
      .map((p) => p.filePath as string)
  }

  const getSearchSnapshot = (): SearchSnapshot => {
    const s = useSearchStore.getState()
    return {
      query: s.query,
      isRegex: s.isRegex,
      matchCase: s.matchCase,
      wholeWord: s.wholeWord,
      includes: s.includes,
      excludes: s.excludes,
      respectIgnore: s.respectIgnore,
      optionsExpanded: s.optionsExpanded,
      status: s.status,
      searchId: s.currentSearchId,
      truncated: s.truncated,
      error: s.error,
      fileCount: s.files.length,
      filePaths: s.files.map((f) => f.relativePath),
      totalMatches: s.files.reduce((n, f) => n + f.matchCount, 0),
      dismissedFiles: s.dismissedFiles.size,
      dismissedLines: s.dismissedLines.size,
    }
  }

  const lastEditorReveal = () => getLastReveal()

  const setTheme = (id: string): void => applyTheme(id)
  const themeIds = (): { id: string; type: string }[] =>
    BUILT_IN_THEMES.map((t) => ({ id: t.id, type: t.type }))

  const dragSnapshot = () => {
    const s = useDragStore.getState()
    return {
      isDragging: s.isDragging,
      sourceKind: s.source?.origin.kind ?? null,
      sourceNodeId:
        s.source?.origin.kind === 'canvas-node' ? s.source.origin.nodeId : null,
      targetKind: s.target?.kind ?? null,
    }
  }

  const enableMaestro = async (nodeId: string): Promise<boolean> => {
    const cs = activeCanvasStore()
    const node = cs?.getState().nodes[nodeId]
    if (!node) return false
    const panelId = node.panelId
    const app = useAppStore.getState()
    const wsId = app.selectedWorkspaceId
    const ws = app.workspaces.find((w) => w.id === wsId)
    if (!ws?.panels[panelId]) return false
    const ptyId = terminalRegistry.getEntry(panelId)?.ptyId
    if (!ptyId || !window.electronAPI?.terminalSetMaestro) return false
    const result = await window.electronAPI.terminalSetMaestro(ptyId, true, ws.rootPath || '')
    if (!result || (typeof result === 'object' && 'ok' in result && !result.ok)) return false
    app.setPanelMaestro(wsId, panelId, true)
    return true
  }

  const recruitWorker = (args: {
    maestroNodeId: string
    name: string
    role: string
    point?: Point
  }): string | null => {
    const cs = activeCanvasStore()
    const maestroNode = cs?.getState().nodes[args.maestroNodeId]
    if (!maestroNode) return null
    const maestroPty = terminalRegistry.getEntry(maestroNode.panelId)?.ptyId
    if (!maestroPty) return null
    const point = args.point ?? {
      x: maestroNode.origin.x + 600,
      y: maestroNode.origin.y,
    }
    const workerNodeId = createTerminal(point)
    const workerNode = cs?.getState().nodes[workerNodeId]
    const workerPanelId = workerNode?.panelId
    if (!workerPanelId) return null
    const app = useAppStore.getState()
    app.updatePanelTitle(app.selectedWorkspaceId, workerPanelId, args.name)
    useOrchestrationRunStore.getState().noteRecruit({
      maestroPtyId: maestroPty,
      panelId: workerPanelId,
      name: args.name,
      role: args.role,
    })
    return workerNodeId
  }

  const orchestrationWorkers = (maestroNodeId: string) => {
    const cs = activeCanvasStore()
    const maestroNode = cs?.getState().nodes[maestroNodeId]
    if (!maestroNode) return []
    const maestroPty = terminalRegistry.getEntry(maestroNode.panelId)?.ptyId
    if (!maestroPty) return []
    return useOrchestrationRunStore.getState().listForMaestro(maestroPty).map((w) => ({
      panelId: w.panelId,
      name: w.name,
      role: w.role,
      status: w.status,
    }))
  }

  const markWorkerDone = (panelId: string, status: 'done' | 'failed' = 'done') => {
    useOrchestrationRunStore.getState().noteWorkerDone(panelId, status)
  }

  window.__orquestraE2E = {
    ready: true,
    activeCanvasPanelId,
    createTerminal,
    createEditor,
    createCanvasPanel,
    nodes,
    zoom,
    setZoom,
    resetViewport,
    setViewport,
    moveNode,
    clearCanvas,
    addWorkspace,
    selectWorkspace,
    seedWorktrees,
    tagNodeWorktree,
    worktreeDebug,
    terminalPtyId,
    writeTerminal,
    terminalOutput,
    pasteTerminal,
    typeTerminal,
    submitTerminal,
    addConnection,
    connections,
    setEditorContent,
    editorContent,
    setWorkspaceRoot,
    openSidebarView,
    setActiveLeftSidebarView,
    editorPaths,
    getSearchSnapshot,
    lastEditorReveal,
    setTheme,
    themeIds,
    dragSnapshot,
    enableMaestro,
    recruitWorker,
    orchestrationWorkers,
    markWorkerDone,
  }
}
