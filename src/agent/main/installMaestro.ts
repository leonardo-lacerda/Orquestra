// =============================================================================
// installMaestro — copy the bundled orquestra-maestro extension into a
// workspace's pi-agent extensions dir on first use, where pi auto-discovers it.
//
// Mirrors installPlanMode exactly. The extension auto-injects the Maestro
// orchestration prompt when .orquestra/crown.json exists.
// =============================================================================

import path from 'path'
import { app } from 'electron'
import log from '../../main/logger'
import { hostAgentDir, hostJoin } from './agentDir'
import { copyFileToHost, createIdempotencyTracker, findSourceDir } from './extensionInstall'
import type { Runtime } from '../../main/runtime/types'

/** Source dir of the bundled extension. Dev path first, then production. */
function sourceDir(): string | null {
  return findSourceDir([
    path.join(app.getAppPath(), 'src', 'agent', 'extensions', 'orquestra-maestro'),
    path.join(process.resourcesPath ?? '', 'orquestra-extensions', 'orquestra-maestro'),
  ])
}

// Keyed on runtimeId + host path so the same host path on different runtimes
// doesn't collide.
const installed = createIdempotencyTracker()

/** Idempotent — safe to call on every session. */
export async function installMaestroExtension(runtime: Runtime, cwd: string): Promise<void> {
  const home = hostAgentDir(runtime.id, cwd)
  const key = runtime.id + '\0' + home
  if (!installed.shouldInstall(key)) return
  installed.markInstalled(key)
  try {
    const src = sourceDir()
    if (!src) {
      log.warn('[installMaestro] source dir not found — maestro extension not installed')
      return
    }
    const destDir = hostJoin(runtime.id, home, 'extensions', 'orquestra-maestro')
    await copyFileToHost(runtime, path.join(src, 'index.ts'), destDir, 'index.ts', 'if-changed', '[installMaestro]')
    await copyFileToHost(runtime, path.join(src, 'package.json'), destDir, 'package.json', 'if-changed', '[installMaestro]')
  } catch (err) {
    log.warn('[installMaestro] install failed: %O', err)
  }
}
