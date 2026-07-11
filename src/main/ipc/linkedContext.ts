import path from 'path'
import fs from 'fs/promises'
import { createRequire } from 'module'
import { app, ipcMain } from 'electron'
import { createWorker } from 'tesseract.js'
import {
  LINKED_CONTEXT_READ,
  LINKED_CONTEXT_WRITE,
  LINKED_CONTEXT_OCR,
} from '../../shared/ipc-channels'
import type {
  LinkedContextBundleWriteRequest,
  LinkedContextBundleWriteResult,
  LinkedContextIndexEntry,
  LinkedContextManifest,
  LinkedContextSourcePayload,
} from '../../shared/linkedContext'
import {
  CLAUDE_LINKED_CONTEXT_BEGIN,
  CLAUDE_LINKED_CONTEXT_END,
  formatLinkedContextClaudeInstructions,
  formatLinkedContextIndex,
  formatLinkedContextMarkdown,
  formatLinkedContextSource,
  LINKED_CONTEXT_SKILL_SLUG,
  linkedContextClaudeRuleMarkdown,
  linkedContextSkillMarkdown,
  upsertManagedMarkdownSection,
} from '../../shared/linkedContext'
import { formatLocator } from '../runtime/locator'
import { resolveLocator } from '../runtime/runtimeManager'
import { windowFromEvent } from '../windowRegistry'
import { wrapHandler } from './handlerError'
import type { Runtime } from '../runtime/types'

const CONTEXT_DIR = '.orquestra/context'
const require = createRequire(import.meta.url)
let tessdataReady: Promise<string> | null = null

/** Agent skill roots (workspace-relative) that should discover linked context. */
const AGENT_SKILL_ROOTS: string[][] = [
  ['.claude', 'skills'],
  ['.agents', 'skills'],
  ['.orquestra', 'pi-agent', 'skills'],
  ['.opencode', 'skills'],
  ['.codex', 'skills'],
  ['.agent', 'skills'],
]

export function registerHandlers(): void {
  ipcMain.handle(LINKED_CONTEXT_WRITE, wrapHandler(`[${LINKED_CONTEXT_WRITE}]`, async (event, request: LinkedContextBundleWriteRequest): Promise<LinkedContextBundleWriteResult> => {
    const win = windowFromEvent(event)
    const { runtime, path: rootPath, runtimeId } = resolveLocator(request.workspaceRoot)
    const safeRoot = await runtime.validatePathStrict(rootPath, win?.id, request.workspaceId)
    const bundleDir = path.join(safeRoot, CONTEXT_DIR, safeSegment(request.targetPanelId))
    const safeBundleDir = await runtime.validatePathForCreation(bundleDir, win?.id, request.workspaceId)

    await runtime.file.mkdir(safeBundleDir)

    const updatedAt = Date.now()
    const sources = request.sources.map((source) => sanitizeSource(source, request, updatedAt))
    const limitedSources = enforceBundleLimit(
      sources,
      request.targetPanelId,
      request.targetNodeId,
      updatedAt,
      request.maxBundleBytes,
    )
    const connectionPaths: Record<string, string> = {}

    for (const [index, source] of limitedSources.entries()) {
      const fileName = `${safeSegment(source.connectionId || `source-${index + 1}`)}.md`
      const connectionPath = path.join(safeBundleDir, fileName)
      await runtime.file.writeFile(connectionPath, formatLinkedContextSource(source, index + 1))
      connectionPaths[source.connectionId] = formatLocator({ runtimeId, path: connectionPath })
    }

    const latestPath = path.join(safeBundleDir, 'latest.md')
    const manifestPath = path.join(safeBundleDir, 'manifest.json')
    const latestMarkdown = formatLinkedContextMarkdown({
      targetPanelId: request.targetPanelId,
      targetNodeId: request.targetNodeId,
      sources: limitedSources,
      updatedAt,
    })
    const manifest: LinkedContextManifest = {
      targetPanelId: request.targetPanelId,
      targetNodeId: request.targetNodeId,
      updatedAt,
      latestPath: formatLocator({ runtimeId, path: latestPath }),
      connections: limitedSources.map((source) => ({
        connectionId: source.connectionId,
        sourcePanelId: source.sourcePanelId,
        sourceNodeId: source.sourceNodeId,
        kind: source.kind,
        title: source.title,
        path: source.path,
        url: source.url,
        status: source.error ? 'error' : 'ok',
        bytes: source.text ? Buffer.byteLength(source.text, 'utf8') : undefined,
        truncated: source.truncated,
        error: source.error,
      })),
    }

    await runtime.file.writeFile(latestPath, latestMarkdown)
    await runtime.file.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    // Index + agent discovery. Never inject into the TTY — Verboo/Claude load
    // CLAUDE.md + CLAUDE.local.md, so we embed content previews there.
    const currentPreviews = limitedSources.map((s) => ({
      title: s.title || s.sourcePanelId,
      text: s.text,
    }))
    await writeLinkedContextIndex(runtime, safeRoot, updatedAt, {
      targetPanelId: request.targetPanelId,
      previews: currentPreviews,
      latestMarkdown,
    })
    await ensureLinkedContextAgentHints(runtime, safeRoot)

    return {
      targetPanelId: request.targetPanelId,
      targetNodeId: request.targetNodeId,
      bundleDir: formatLocator({ runtimeId, path: safeBundleDir }),
      latestPath: formatLocator({ runtimeId, path: latestPath }),
      manifestPath: formatLocator({ runtimeId, path: manifestPath }),
      connectionPaths,
      updatedAt,
      sourceCount: limitedSources.length,
    }
  }))

  ipcMain.handle(LINKED_CONTEXT_READ, wrapHandler(`[${LINKED_CONTEXT_READ}]`, async (event, workspaceRoot: string, targetPanelId: string, workspaceId?: string): Promise<string | null> => {
    const win = windowFromEvent(event)
    const { runtime, path: rootPath } = resolveLocator(workspaceRoot)
    const safeRoot = await runtime.validatePathStrict(rootPath, win?.id, workspaceId)
    const latestPath = path.join(safeRoot, CONTEXT_DIR, safeSegment(targetPanelId), 'latest.md')
    try {
      return await runtime.file.readFile(await runtime.validatePathStrict(latestPath, win?.id, workspaceId))
    } catch {
      return null
    }
  }))

  ipcMain.handle(LINKED_CONTEXT_OCR, wrapHandler(`[${LINKED_CONTEXT_OCR}]`, async (event, filePath: string, workspaceId?: string): Promise<string> => {
    const win = windowFromEvent(event)
    const { runtime, path: runtimePath } = resolveLocator(filePath)
    const safePath = await runtime.validatePathStrict(runtimePath, win?.id, workspaceId)
    const image = await runtime.file.readBinary(safePath)
    if (image.byteLength > 15_000_000) throw new Error('Image OCR is limited to 15 MB per image.')
    const langPath = await ensureTessdata()
    const worker = await createWorker(['eng', 'por'], undefined, { langPath, gzip: true })
    try {
      const result = await worker.recognize(Buffer.from(image))
      return result.data.text
    } finally {
      await worker.terminate()
    }
  }))
}

async function ensureTessdata(): Promise<string> {
  if (tessdataReady) return tessdataReady
  tessdataReady = (async () => {
    const targetDir = path.join(app.getPath('userData'), 'tessdata')
    await fs.mkdir(targetDir, { recursive: true })
    for (const language of ['eng', 'por'] as const) {
      const packageJson = require.resolve(`@tesseract.js-data/${language}/package.json`)
      const source = path.join(path.dirname(packageJson), '4.0.0_best_int', `${language}.traineddata.gz`)
      const target = path.join(targetDir, `${language}.traineddata.gz`)
      await fs.copyFile(source, target).catch(async (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error
      })
    }
    return targetDir
  })()
  return tessdataReady
}

function sanitizeSource(
  source: LinkedContextSourcePayload,
  request: LinkedContextBundleWriteRequest,
  updatedAt: number,
): LinkedContextSourcePayload {
  return {
    ...source,
    connectionId: source.connectionId || `${source.sourceNodeId}-${source.targetNodeId}`,
    targetPanelId: request.targetPanelId,
    targetNodeId: request.targetNodeId,
    title: source.title || source.sourcePanelId,
    updatedAt,
  }
}

function safeSegment(value: string): string {
  return (value || 'unknown')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unknown'
}

/**
 * Rebuild `.orquestra/context/INDEX.md`, `ACTIVE.md`, and the managed block in
 * CLAUDE.md / CLAUDE.local.md from every target folder that has a manifest.
 */
async function writeLinkedContextIndex(
  runtime: Runtime,
  workspaceRoot: string,
  updatedAt: number,
  current?: {
    targetPanelId: string
    previews: Array<{ title: string; text?: string }>
    latestMarkdown: string
  },
): Promise<void> {
  const contextRoot = path.join(workspaceRoot, CONTEXT_DIR)
  await runtime.file.mkdir(contextRoot)

  const entries: LinkedContextIndexEntry[] = []
  let dirs: Array<{ name: string; path: string }> = []
  try {
    const nodes = await runtime.file.readDir(contextRoot)
    dirs = nodes.filter((n) => n.isDirectory).map((n) => ({ name: n.name, path: n.path }))
  } catch {
    dirs = []
  }

  for (const { name, path: dir } of dirs) {
    if (name.startsWith('.')) continue
    const manifestPath = path.join(dir, 'manifest.json')
    const latestRel = `${CONTEXT_DIR}/${name}/latest.md`.replace(/\\/g, '/')
    try {
      const raw = await runtime.file.readFile(manifestPath)
      const manifest = JSON.parse(raw) as LinkedContextManifest
      const sourceCount = Array.isArray(manifest.connections) ? manifest.connections.length : 0
      // Empty source list = links were removed; skip so the agent doesn't chase
      // a hollow bundle.
      if (sourceCount === 0) continue

      let sourcePreviews: Array<{ title: string; text?: string }> | undefined
      if (current && (manifest.targetPanelId === current.targetPanelId || name === safeSegment(current.targetPanelId))) {
        sourcePreviews = current.previews
      } else {
        sourcePreviews = await extractPreviewsFromLatest(runtime, path.join(dir, 'latest.md'))
      }

      entries.push({
        targetPanelId: manifest.targetPanelId || name,
        targetNodeId: manifest.targetNodeId,
        latestRelativePath: latestRel,
        updatedAt: manifest.updatedAt || updatedAt,
        sourceCount,
        sourceTitles: (manifest.connections ?? []).map((c) => c.title || c.sourcePanelId || c.kind),
        sourcePreviews,
      })
    } catch {
      // No manifest — still index if latest.md exists and is non-trivial.
      try {
        const latest = await runtime.file.readFile(path.join(dir, 'latest.md'))
        if (latest.includes('## Sources') && !latest.includes('_No linked context')) {
          entries.push({
            targetPanelId: name,
            latestRelativePath: latestRel,
            updatedAt,
            sourceCount: 1,
            sourceTitles: ['(see latest.md)'],
            sourcePreviews: await extractPreviewsFromLatest(runtime, path.join(dir, 'latest.md')),
          })
        }
      } catch {
        /* skip */
      }
    }
  }

  entries.sort((a, b) => b.updatedAt - a.updatedAt)
  const indexPath = path.join(contextRoot, 'INDEX.md')
  await runtime.file.writeFile(indexPath, formatLinkedContextIndex(entries, updatedAt))

  // ACTIVE.md = most recently updated full bundle (easy single-file read).
  if (current?.latestMarkdown) {
    await runtime.file.writeFile(path.join(contextRoot, 'ACTIVE.md'), current.latestMarkdown)
  } else if (entries[0]) {
    try {
      const newest = await runtime.file.readFile(
        path.join(workspaceRoot, entries[0].latestRelativePath.replace(/\//g, path.sep)),
      )
      await runtime.file.writeFile(path.join(contextRoot, 'ACTIVE.md'), newest)
    } catch {
      /* ignore */
    }
  }

  // Verboo/Claude always load CLAUDE.md + CLAUDE.local.md — embed content there.
  await upsertClaudeLinkedContextInstructions(runtime, workspaceRoot, entries, updatedAt)
}

/** Best-effort pull of fenced content blocks from an existing latest.md. */
async function extractPreviewsFromLatest(
  runtime: Runtime,
  latestPath: string,
): Promise<Array<{ title: string; text?: string }>> {
  try {
    const md = await runtime.file.readFile(latestPath)
    return extractPreviewsFromMarkdown(md)
  } catch {
    return []
  }
}

/**
 * Upsert the managed linked-context block into CLAUDE.md and CLAUDE.local.md.
 * Verboo documents these as auto-loaded project instructions.
 */
export async function upsertClaudeLinkedContextInstructions(
  runtime: Runtime,
  workspaceRoot: string,
  entries: LinkedContextIndexEntry[],
  updatedAt = Date.now(),
): Promise<void> {
  const section = formatLinkedContextClaudeInstructions(entries, updatedAt)
  for (const fileName of ['CLAUDE.local.md', 'CLAUDE.md'] as const) {
    const filePath = path.join(workspaceRoot, fileName)
    let existing = ''
    try {
      existing = await runtime.file.readFile(filePath)
    } catch {
      // CLAUDE.md may not exist — only create CLAUDE.local.md so we don't
      // surprise users with a new top-level CLAUDE.md unless they already have one.
      if (fileName === 'CLAUDE.md') continue
    }
    // If nothing is linked and file never had our block, skip creating noise.
    if (entries.length === 0 && !existing.includes(CLAUDE_LINKED_CONTEXT_BEGIN)) {
      if (fileName === 'CLAUDE.local.md' && !existing) continue
      if (fileName === 'CLAUDE.md') continue
    }
    const next = upsertManagedMarkdownSection(
      existing,
      CLAUDE_LINKED_CONTEXT_BEGIN,
      CLAUDE_LINKED_CONTEXT_END,
      section,
    )
    if (next !== existing) {
      try {
        await runtime.file.writeFile(filePath, next)
      } catch {
        /* non-fatal */
      }
    }
  }
}

/**
 * Local-fs reapply after something (e.g. maestro mode) rewrites CLAUDE.local.md.
 * Safe to call fire-and-forget from the terminal IPC path.
 */
export async function reapplyLinkedContextClaudeInstructionsLocal(
  workspaceRoot: string,
): Promise<void> {
  try {
    const contextRoot = path.join(workspaceRoot, CONTEXT_DIR)
    const entries: LinkedContextIndexEntry[] = []
    let dirNames: string[] = []
    try {
      dirNames = await fs.readdir(contextRoot)
    } catch {
      return
    }
    for (const name of dirNames) {
      if (name.startsWith('.') || name === 'INDEX.md' || name === 'ACTIVE.md') continue
      const dir = path.join(contextRoot, name)
      try {
        const st = await fs.stat(dir)
        if (!st.isDirectory()) continue
        const raw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')
        const manifest = JSON.parse(raw) as LinkedContextManifest
        if (!manifest.connections?.length) continue
        const latest = await fs.readFile(path.join(dir, 'latest.md'), 'utf8').catch(() => '')
        const previews = extractPreviewsFromMarkdown(latest)
        entries.push({
          targetPanelId: manifest.targetPanelId || name,
          targetNodeId: manifest.targetNodeId,
          latestRelativePath: `${CONTEXT_DIR}/${name}/latest.md`.replace(/\\/g, '/'),
          updatedAt: manifest.updatedAt || Date.now(),
          sourceCount: manifest.connections.length,
          sourceTitles: manifest.connections.map((c) => c.title || c.sourcePanelId || c.kind),
          sourcePreviews: previews,
        })
      } catch {
        /* skip */
      }
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt)
    if (entries.length === 0) return
    const section = formatLinkedContextClaudeInstructions(entries)
    for (const fileName of ['CLAUDE.local.md', 'CLAUDE.md'] as const) {
      const filePath = path.join(workspaceRoot, fileName)
      let existing = ''
      try {
        existing = await fs.readFile(filePath, 'utf8')
      } catch {
        if (fileName === 'CLAUDE.md') continue
      }
      const next = upsertManagedMarkdownSection(
        existing,
        CLAUDE_LINKED_CONTEXT_BEGIN,
        CLAUDE_LINKED_CONTEXT_END,
        section,
      )
      if (next !== existing) await fs.writeFile(filePath, next, 'utf8')
    }
  } catch {
    /* non-fatal */
  }
}

function extractPreviewsFromMarkdown(md: string): Array<{ title: string; text?: string }> {
  const previews: Array<{ title: string; text?: string }> = []
  const headingRe = /^###\s+\d+\.\s+(.+)$/gm
  const fenceRe = /```[^\n]*\n([\s\S]*?)```/g
  const titles: string[] = []
  let m: RegExpExecArray | null
  while ((m = headingRe.exec(md)) !== null) titles.push(m[1].trim())
  const bodies: string[] = []
  while ((m = fenceRe.exec(md)) !== null) bodies.push(m[1].replace(/\n$/, ''))
  const n = Math.max(titles.length, bodies.length)
  for (let i = 0; i < n; i++) {
    previews.push({ title: titles[i] || `Source ${i + 1}`, text: bodies[i] })
  }
  return previews
}

/**
 * Install/refresh the project skill + Claude rule so agents discover linked
 * context without anything being typed into the terminal TUI.
 */
async function ensureLinkedContextAgentHints(
  runtime: Runtime,
  workspaceRoot: string,
): Promise<void> {
  const skillBody = linkedContextSkillMarkdown()
  for (const segs of AGENT_SKILL_ROOTS) {
    try {
      const skillDir = path.join(workspaceRoot, ...segs, LINKED_CONTEXT_SKILL_SLUG)
      await mkdirpWorkspace(runtime, workspaceRoot, skillDir)
      await runtime.file.writeFile(path.join(skillDir, 'SKILL.md'), skillBody)
    } catch {
      /* remote mkdir race or path reject — non-fatal */
    }
  }

  // Claude Code project rules are always-on (more reliable than skill matching).
  try {
    const rulesDir = path.join(workspaceRoot, '.claude', 'rules')
    await mkdirpWorkspace(runtime, workspaceRoot, rulesDir)
    await runtime.file.writeFile(
      path.join(rulesDir, `${LINKED_CONTEXT_SKILL_SLUG}.md`),
      linkedContextClaudeRuleMarkdown(),
    )
  } catch {
    /* non-fatal */
  }
}

/** Create each path segment under workspaceRoot (runtime.mkdir needs parents). */
async function mkdirpWorkspace(
  runtime: Runtime,
  workspaceRoot: string,
  targetDir: string,
): Promise<void> {
  const normalizedRoot = workspaceRoot.replace(/[/\\]+$/, '')
  if (!targetDir.startsWith(normalizedRoot)) {
    await runtime.file.mkdir(targetDir)
    return
  }
  const rel = targetDir.slice(normalizedRoot.length).replace(/^[/\\]+/, '')
  let cur = normalizedRoot
  for (const part of rel.split(/[/\\]+/).filter(Boolean)) {
    cur = path.join(cur, part)
    await runtime.file.mkdir(cur)
  }
}

function enforceBundleLimit(
  sources: LinkedContextSourcePayload[],
  targetPanelId: string,
  targetNodeId: string,
  updatedAt: number,
  maxBundleBytes?: number,
): LinkedContextSourcePayload[] {
  const limit = Math.max(10_000, Math.min(maxBundleBytes || 250_000, 2_000_000))
  let current = sources.map((source) => ({ ...source }))
  let markdown = formatLinkedContextMarkdown({ targetPanelId, targetNodeId, sources: current, updatedAt })
  if (Buffer.byteLength(markdown, 'utf8') <= limit) return current

  current = current.map((source) => {
    if (!source.text) return source
    const textLimit = Math.max(500, Math.floor(limit / Math.max(current.length, 1) / 2))
    return {
      ...source,
      text: `${source.text.slice(0, textLimit)}\n\n[... trimmed to fit linked-context bundle limit ...]`,
      truncated: true,
    }
  })
  markdown = formatLinkedContextMarkdown({ targetPanelId, targetNodeId, sources: current, updatedAt })
  if (Buffer.byteLength(markdown, 'utf8') <= limit) return current

  return current.map((source, index) => index === 0
    ? {
        ...source,
        text: source.text
          ? `${source.text.slice(0, Math.max(500, Math.floor(limit / 3)))}\n\n[... trimmed to fit linked-context bundle limit ...]`
          : source.text,
        truncated: true,
      }
    : {
        ...source,
        text: source.text ? '[Content omitted to fit linked-context bundle limit.]' : source.text,
        truncated: !!source.text || source.truncated,
      })
}
