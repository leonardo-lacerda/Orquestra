// =============================================================================
// installMaestro — compile and copy the orquestra-maestro extension into a
// workspace's pi-agent extensions dir on first use, where pi auto-discovers it.
//
// The extension is compiled with esbuild so the pi-agent doesn't need to
// compile TypeScript at runtime (faster startup, no runtime TS dependency).
// =============================================================================

import path from 'path'
import { app } from 'electron'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import { build as esbuild } from 'esbuild'
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

/** Compile the maestro extension TS to JS using esbuild, then copy to host. */
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

    // Compile the extension TS → JS (bundled, single file)
    const tsEntry = path.join(src, 'index.ts')
    const jsOutDir = path.join(app.getPath('temp'), 'orquestra-maestro-build')
    await fsp.mkdir(jsOutDir, { recursive: true })

    await esbuild({
      entryPoints: [tsEntry],
      outfile: path.join(jsOutDir, 'index.js'),
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'esm',
      sourcemap: false,
      minify: true,
      logLevel: 'silent',
    })

    // Copy the compiled JS + package.json to the host
    await copyFileToHost(runtime, path.join(jsOutDir, 'index.js'), destDir, 'index.js', 'if-changed', '[installMaestro]')
    await copyFileToHost(runtime, path.join(src, 'package.json'), destDir, 'package.json', 'if-changed', '[installMaestro]')

    // Cleanup temp build directory
    await fsp.rm(jsOutDir, { recursive: true, force: true }).catch(() => {})
  } catch (err) {
    log.warn('[installMaestro] install failed: %O', err)
  }
}
