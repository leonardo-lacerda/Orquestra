// =============================================================================
// maestroAssets — resolve packaged Maestro CLI + crown extension sources.
//
// Dev: app.getAppPath()/scripts/maestro and .../src/agent/extensions/...
// Prod: process.resourcesPath/orquestra-maestro-cli and .../orquestra-extensions/...
// Mirrors installMaestro's findSourceDir pattern (electron-builder extraResources).
// =============================================================================

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { findSourceDir } from '../../agent/main/extensionInstall'

export function resolveMaestroCliDir(): string | null {
  return findSourceDir([
    path.join(app.getAppPath(), 'scripts', 'maestro'),
    path.join(process.resourcesPath ?? '', 'orquestra-maestro-cli'),
  ])
}

export function resolveMaestroExtensionDir(): string | null {
  return findSourceDir([
    path.join(app.getAppPath(), 'src', 'agent', 'extensions', 'orquestra-maestro'),
    path.join(process.resourcesPath ?? '', 'orquestra-extensions', 'orquestra-maestro'),
  ])
}

export interface MaestroAssetCheck {
  ok: boolean
  cliDir: string | null
  extensionDir: string | null
  missing: string[]
}

/** Required files for fail-closed crown enable (raw TS extension — KD12). */
export function checkMaestroAssets(): MaestroAssetCheck {
  const cliDir = resolveMaestroCliDir()
  const extensionDir = resolveMaestroExtensionDir()
  const missing: string[] = []
  if (!cliDir) {
    missing.push('cli')
  } else {
    for (const f of ['orquestra.js', 'orquestra-worker-skill.md'] as const) {
      if (!fs.existsSync(path.join(cliDir, f))) missing.push(`cli:${f}`)
    }
  }
  if (!extensionDir) {
    missing.push('extension')
  } else {
    for (const f of ['index.ts', 'package.json', 'multiTask.ts'] as const) {
      if (!fs.existsSync(path.join(extensionDir, f))) missing.push(`extension:${f}`)
    }
  }
  return { ok: missing.length === 0, cliDir, extensionDir, missing }
}

/** @deprecated Use resolveMaestroCliDir — kept for call sites that need a non-null path string. */
export function getOrquestraCliDir(): string {
  return resolveMaestroCliDir() ?? path.join(app.getAppPath(), 'scripts', 'maestro')
}
