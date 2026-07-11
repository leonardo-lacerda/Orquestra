// =============================================================================
// editorSaveRegistry — module-level map of panelId -> save() function.
// EditorPanel registers itself on mount; CanvasNode invokes the save fn when
// the user chooses "Save" in the unsaved-changes dialog.
// =============================================================================

/** Internal save function — true on successful write, false when the user
 *  cancelled the Save-As picker (or the write failed). */
type SaveFn = () => Promise<boolean>
type BufferFn = () => string | null
type BufferWriteFn = (content: string, mode: 'append' | 'replace') => boolean

/** Result of {@link saveEditor}:
 *  - `saved`        — write completed
 *  - `cancelled`    — the user dismissed the Save-As picker for an untitled
 *                     buffer (the only case where close-confirm should abort)
 *  - `no-handler`   — no editor is registered for this panel (e.g. dirty
 *                     inactive tab in a dock stack that isn't mounted). The
 *                     caller cannot recover the buffer from here, so it must
 *                     decide whether to proceed without saving or surface
 *                     the situation; aborting the close would strand the
 *                     user without a path forward.
 */
export type SaveResult = 'saved' | 'cancelled' | 'no-handler'

const registry = new Map<string, SaveFn>()
const bufferRegistry = new Map<string, BufferFn>()
const bufferWriteRegistry = new Map<string, BufferWriteFn>()

export function registerEditorSave(panelId: string, fn: SaveFn): void {
  registry.set(panelId, fn)
}

export function unregisterEditorSave(panelId: string): void {
  registry.delete(panelId)
}

export function registerEditorBuffer(panelId: string, fn: BufferFn): void {
  bufferRegistry.set(panelId, fn)
}

export function unregisterEditorBuffer(panelId: string): void {
  bufferRegistry.delete(panelId)
}

export function getEditorBuffer(panelId: string): string | null {
  return bufferRegistry.get(panelId)?.() ?? null
}

/**
 * Snapshot every live Monaco buffer that belongs to a scratch editor (no
 * filePath) into the panel store. Call this immediately before session
 * persistence so a quit/restart cannot lose text still sitting in the 300ms
 * unsavedContent debounce (or never written if the user closed mid-keystroke).
 *
 * Returns how many panels were updated.
 */
export function flushScratchEditorBuffersToStore(
  getPanel: (panelId: string) => { type?: string; filePath?: string; unsavedContent?: string } | undefined,
  setUnsavedContent: (panelId: string, content: string | undefined) => void,
): number {
  let updated = 0
  for (const [panelId, getBuf] of bufferRegistry) {
    const panel = getPanel(panelId)
    if (!panel || panel.type !== 'editor' || panel.filePath) continue
    const live = getBuf()
    if (live == null) continue
    const next = live || undefined
    const prev = panel.unsavedContent || undefined
    if (next === prev) continue
    setUnsavedContent(panelId, next)
    updated++
  }
  return updated
}

export function registerEditorBufferWriter(panelId: string, fn: BufferWriteFn): void {
  bufferWriteRegistry.set(panelId, fn)
}

export function unregisterEditorBufferWriter(panelId: string): void {
  bufferWriteRegistry.delete(panelId)
}

export function writeEditorBuffer(
  panelId: string,
  content: string,
  mode: 'append' | 'replace' = 'append',
): boolean {
  return bufferWriteRegistry.get(panelId)?.(content, mode) ?? false
}

export async function saveEditor(panelId: string): Promise<SaveResult> {
  const fn = registry.get(panelId)
  if (!fn) return 'no-handler'
  const ok = await fn()
  return ok ? 'saved' : 'cancelled'
}

// Tracks which editor most recently held keyboard focus on its Monaco
// textarea. The window-level Cmd+S / Ctrl+S `save-file` event routes to
// THIS panel, not whichever editor happens to hold `hasTextFocus()` at the
// instant the key fires — so clicking the markdown preview toggle or any
// other panel chrome doesn't leave the user without a save target.
let activeEditorPanelId: string | null = null

export function markEditorActive(panelId: string): void {
  activeEditorPanelId = panelId
}

export function clearEditorActive(panelId: string): void {
  if (activeEditorPanelId === panelId) activeEditorPanelId = null
}

export function getActiveEditorPanelId(): string | null {
  return activeEditorPanelId
}
