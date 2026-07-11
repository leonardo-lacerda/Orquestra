import type { PanelState } from '../../shared/types'
import type { LinkedContextSourcePayload } from '../../shared/linkedContext'
import { getEditorBuffer } from '../lib/editor/editorSaveRegistry'
import { getBrowserContext } from '../lib/browser/browserContextRegistry'
import { useSettingsStore } from '../stores/settingsStore'
import { terminalRegistry } from '../lib/terminal/terminalRegistry'
import { getAgentPanelSession } from '../../agent/renderer/agentSessionRegistry'
import { useAgentStore } from '../../agent/renderer/agentStore'

export async function resolveContextSource(params: {
  workspaceId: string
  workspaceRoot: string
  sourcePanel: PanelState
  sourceNodeId: string
  targetPanelId: string
  targetNodeId: string
  connectionId: string
}): Promise<LinkedContextSourcePayload> {
  const updatedAt = Date.now()
  const base = {
    connectionId: params.connectionId,
    sourcePanelId: params.sourcePanel.id,
    sourceNodeId: params.sourceNodeId,
    targetPanelId: params.targetPanelId,
    targetNodeId: params.targetNodeId,
    title: params.sourcePanel.title || params.sourcePanel.id,
    updatedAt,
  }

  try {
    switch (params.sourcePanel.type) {
      case 'editor':
        return await resolveEditorSource(params, base)
      case 'document':
        return await resolveDocumentSource(params, base)
      case 'browser':
        return await resolveBrowserSource(params, base)
      case 'terminal':
        return resolveTerminalSource(params, base)
      case 'agent':
        return resolveAgentSource(params, base)
      case 'orchestration':
        return { ...base, kind: 'orchestration' }
      default:
        return {
          ...base,
          kind: 'terminal',
          error: `Panel type "${params.sourcePanel.type}" is not a supported context source yet.`,
        }
    }
  } catch (err) {
    return {
      ...base,
      kind: params.sourcePanel.type === 'browser' ? 'browser' : 'file',
      path: params.sourcePanel.filePath,
      url: params.sourcePanel.url,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function resolveEditorSource(
  params: Parameters<typeof resolveContextSource>[0],
  base: Omit<LinkedContextSourcePayload, 'kind'>,
): Promise<LinkedContextSourcePayload> {
  const panel = params.sourcePanel
  const settings = useSettingsStore.getState()
  const liveBuffer = getEditorBuffer(panel.id)
  const isScratch = !panel.filePath

  if (panel.diffMode && panel.filePath) {
    const diff = panel.diffMode === 'staged'
      ? await window.electronAPI.gitDiffStaged(params.workspaceRoot, panel.filePath)
      : await window.electronAPI.gitDiff(params.workspaceRoot, panel.filePath)
    const prepared = prepareText(diff, settings.linkedContextMaxFileBytes, settings.linkedContextRedactSecrets)
    return {
      ...base,
      kind: 'git-diff',
      path: panel.filePath,
      language: 'diff',
      text: prepared.text,
      truncated: prepared.truncated,
    }
  }

  if (panel.filePath) {
    const stat = await window.electronAPI.fsStat(panel.filePath, params.workspaceId)
    if (stat.isDirectory) return resolveFolderSource(params, base, panel.filePath)
  }
  // Prefer the live Monaco buffer whenever the editor is mounted — even for
  // clean file-backed panels — so linked-context refresh sees keystrokes that
  // haven't hit disk or the 150ms unsavedContent debounce yet.
  const shouldUseBuffer = isScratch || panel.isDirty || liveBuffer != null
  const text = shouldUseBuffer
    ? (liveBuffer !== null ? liveBuffer : (panel.unsavedContent ?? ''))
    : await window.electronAPI.fsReadFile(panel.filePath!, params.workspaceId)
  const shouldIncludeText = settings.linkedContextDefaultMode !== 'path' || isScratch
  const preparedText = shouldIncludeText
    ? prepareText(text, settings.linkedContextMaxFileBytes, settings.linkedContextRedactSecrets)
    : { text: undefined, truncated: false }

  return {
    ...base,
    kind: isScratch ? 'editor-buffer' : 'file',
    path: panel.filePath,
    language: detectLanguage(panel.filePath ?? panel.title),
    text: preparedText.text,
    isDirty: panel.isDirty,
    isScratch,
    truncated: preparedText.truncated,
  }
}

async function resolveDocumentSource(
  params: Parameters<typeof resolveContextSource>[0],
  base: Omit<LinkedContextSourcePayload, 'kind'>,
): Promise<LinkedContextSourcePayload> {
  const panel = params.sourcePanel
  const settings = useSettingsStore.getState()
  const kind = panel.documentType === 'pdf'
    ? 'pdf'
    : panel.documentType === 'docx'
      ? 'docx'
      : 'image'

  const payload: LinkedContextSourcePayload = {
    ...base,
    kind,
    path: panel.filePath,
    mimeType: panel.documentType,
  }

  if (!panel.filePath) return payload

  if (kind === 'image') {
    if (settings.linkedContextDefaultMode === 'path') return payload
    try {
      const text = await window.electronAPI.linkedContextOcr(panel.filePath, params.workspaceId)
      if (!text.trim()) return payload
      const limited = prepareText(text, settings.linkedContextMaxFileBytes, settings.linkedContextRedactSecrets)
      return { ...payload, text: limited.text, truncated: limited.truncated }
    } catch (err) {
      return { ...payload, error: `Image OCR failed: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  try {
    const data = await window.electronAPI.fsReadBinary(panel.filePath, params.workspaceId)
    const extracted = kind === 'pdf'
      ? await extractPdfText(data)
      : kind === 'docx'
        ? await extractDocxText(data)
        : ''
    if (!extracted.trim()) return payload
    if (settings.linkedContextDefaultMode === 'path') return payload
    const limited = prepareText(extracted, settings.linkedContextMaxFileBytes, settings.linkedContextRedactSecrets)
    return {
      ...payload,
      text: limited.text,
      truncated: limited.truncated,
    }
  } catch (err) {
    return {
      ...payload,
      error: `Document text extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function resolveTerminalSource(
  params: Parameters<typeof resolveContextSource>[0],
  base: Omit<LinkedContextSourcePayload, 'kind'>,
): LinkedContextSourcePayload {
  const settings = useSettingsStore.getState()
  const entry = terminalRegistry.getEntry(params.sourcePanel.id)
  const serialized = entry ? terminalRegistry.serializeTerminalState(entry) : undefined
  const plainText = serialized ? stripAnsi(serialized) : ''
  const prepared = prepareText(plainText, settings.linkedContextMaxFileBytes, settings.linkedContextRedactSecrets)
  return {
    ...base,
    kind: 'terminal',
    language: 'text',
    text: prepared.text,
    truncated: prepared.truncated,
    error: entry ? undefined : 'Terminal scrollback is unavailable because the terminal is not mounted.',
  }
}

function resolveAgentSource(
  params: Parameters<typeof resolveContextSource>[0],
  base: Omit<LinkedContextSourcePayload, 'kind'>,
): LinkedContextSourcePayload {
  const settings = useSettingsStore.getState()
  const session = getAgentPanelSession(params.sourcePanel.id)
  const agentKey = session?.activeAgentKey
  const messages = agentKey ? useAgentStore.getState().panels[agentKey]?.messages ?? [] : []
  const transcript = messages.map((message) => {
    if (message.type === 'tool') {
      const body = message.result || message.partialText || message.error || ''
      return body ? `[tool:${message.name}]\n${body}` : `[tool:${message.name}]`
    }
    return `[${message.type}]\n${message.text}`
  }).join('\n\n')
  const prepared = prepareText(transcript, settings.linkedContextMaxFileBytes, settings.linkedContextRedactSecrets)
  return {
    ...base,
    kind: 'agent',
    language: 'text',
    text: prepared.text,
    truncated: prepared.truncated,
    error: agentKey ? undefined : 'Agent transcript is unavailable because no active chat is registered.',
  }
}

async function resolveFolderSource(
  params: Parameters<typeof resolveContextSource>[0],
  base: Omit<LinkedContextSourcePayload, 'kind'>,
  rootPath: string,
): Promise<LinkedContextSourcePayload> {
  const settings = useSettingsStore.getState()
  const lines: string[] = [rootPath]
  let seen = 0

  const visit = async (dir: string, prefix: string, depth: number): Promise<void> => {
    if (depth > 3 || seen >= 500) return
    const entries = await window.electronAPI.fsReadDir(dir, params.workspaceId)
    for (const entry of entries) {
      if (seen++ >= 500) break
      lines.push(`${prefix}${entry.isDirectory ? '[dir] ' : ''}${entry.name}`)
      if (entry.isDirectory) await visit(entry.path, `${prefix}  `, depth + 1)
    }
  }

  await visit(rootPath, '', 0)
  if (seen >= 500) lines.push('[Folder tree limited to 500 entries]')
  const prepared = prepareText(lines.join('\n'), settings.linkedContextMaxFileBytes, false)
  return {
    ...base,
    kind: 'folder',
    path: rootPath,
    language: 'text',
    text: prepared.text,
    truncated: prepared.truncated || seen >= 500,
  }
}

async function resolveBrowserSource(
  params: Parameters<typeof resolveContextSource>[0],
  base: Omit<LinkedContextSourcePayload, 'kind'>,
): Promise<LinkedContextSourcePayload> {
  const settings = useSettingsStore.getState()
  const panel = params.sourcePanel
  const activeTab = panel.tabs?.find((tab) => tab.id === panel.activeTabId)
  const fallbackTitle = activeTab?.title || panel.title || panel.url || 'Browser'
  const fallbackUrl = activeTab?.url || panel.url
  const provider = getBrowserContext(panel.id)

  if (!provider) {
    return {
      ...base,
      kind: 'browser',
      title: fallbackTitle,
      url: fallbackUrl,
    }
  }

  try {
    const snapshot = await provider.getSnapshot({
      includeScreenshot: settings.linkedContextIncludeBrowserScreenshots,
    })
    const preparedText = settings.linkedContextDefaultMode === 'path'
      ? { text: undefined, truncated: false }
      : prepareText(snapshot.visibleText ?? '', settings.linkedContextMaxFileBytes, settings.linkedContextRedactSecrets)
    return {
      ...base,
      kind: 'browser',
      title: snapshot.title || fallbackTitle,
      url: snapshot.url || fallbackUrl,
      text: preparedText.text,
      screenshotPath: snapshot.screenshotPath,
      truncated: preparedText.truncated,
    }
  } catch (err) {
    return {
      ...base,
      kind: 'browser',
      title: fallbackTitle,
      url: fallbackUrl,
      error: `Browser context extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function prepareText(text: string, maxBytes: number, redactSecrets: boolean): { text?: string; truncated: boolean } {
  const redacted = redactSecrets ? redactText(text) : text
  const limited = limitText(redacted, maxBytes)
  return { text: limited.text, truncated: limited.truncated }
}

function limitText(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const limit = Math.max(1000, Math.min(maxBytes || 80_000, 1_000_000))
  const bytes = new TextEncoder().encode(text)
  if (bytes.byteLength <= limit) return { text, truncated: false }

  const head = text.slice(0, Math.floor(limit / 2))
  const tail = text.slice(-Math.floor(limit / 4))
  return {
    text: `${head}\n\n[... truncated by Orquestra linked context ...]\n\n${tail}`,
    truncated: true,
  }
}

function redactText(text: string): string {
  return text
    .replace(/(api[_-]?key|token|secret|password|passwd|pwd)(\s*[:=]\s*)(["']?)[^\s"']+/gi, '$1$2$3[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(sk-[A-Za-z0-9_-]{20,})\b/g, '[REDACTED TOKEN]')
}

function detectLanguage(pathOrTitle?: string): string {
  const ext = (pathOrTitle?.split('.').pop() ?? '').toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    md: 'markdown',
    mdx: 'mdx',
    py: 'python',
    html: 'html',
    css: 'css',
    scss: 'scss',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    ps1: 'powershell',
    txt: 'text',
  }
  return map[ext] ?? 'text'
}

async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) })
  const pdf = await loadingTask.promise
  const pages: string[] = []
  const maxPages = Math.min(pdf.numPages, 25)
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) pages.push(`Page ${pageNumber}\n\n${text}`)
  }
  if (pdf.numPages > maxPages) {
    pages.push(`[Extraction limited to first ${maxPages} of ${pdf.numPages} pages]`)
  }
  await loadingTask.destroy().catch(() => {})
  return pages.join('\n\n---\n\n')
}

async function extractDocxText(data: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: data })
  return result.value
}

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '')
}
