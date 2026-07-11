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

/**
 * True when workspace package.json has "type":"module" — makes .js files ESM,
 * which breaks the CommonJS orquestra CLI if copied as orquestra.js alone.
 */
export function workspacePackageIsModule(workspacePath: string): boolean {
  try {
    const pkgPath = path.join(workspacePath, 'package.json')
    if (!fs.existsSync(pkgPath)) return false
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { type?: string }
    return String(raw.type || '').toLowerCase() === 'module'
  } catch {
    return false
  }
}

/** CJS bootstrap: re-exec orquestra.cjs (works when package is not "type":"module"). */
export const ORQUESTRA_JS_BOOTSTRAP_CJS = `#!/usr/bin/env node
'use strict'
// Workspace may later set "type":"module". Real CLI is always orquestra.cjs (CommonJS-safe).
const { spawnSync } = require('child_process')
const path = require('path')
const cli = path.join(__dirname, 'orquestra.cjs')
const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
  cwd: process.cwd(),
  windowsHide: true,
})
process.exit(r.status === null ? 1 : r.status)
`

/** ESM bootstrap: same, for workspaces with "type":"module". */
export const ORQUESTRA_JS_BOOTSTRAP_ESM = `#!/usr/bin/env node
// "type":"module" workspace — cannot use require() in .js; always run the .cjs CLI.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'orquestra.cjs')
const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
  cwd: process.cwd(),
  windowsHide: true,
})
process.exit(r.status === null ? 1 : r.status)
`

/**
 * Install orchestration CLI into a user workspace.
 * Always writes orquestra.cjs (immune to package.json "type":"module").
 * Writes orquestra.js as a small bootstrap that matches the package type so
 * `node orquestra.js …` keeps working after workers add "type":"module".
 *
 * @returns paths written (for rollback lists)
 */
export function installOrquestraCliToWorkspace(
  workspacePath: string,
  cliSourceDir: string,
): { cjsPath: string; jsPath: string; cmdPath: string | null } {
  const srcJs = path.join(cliSourceDir, 'orquestra.js')
  if (!fs.existsSync(srcJs)) {
    throw new Error(`Missing maestro CLI source: ${srcJs}`)
  }
  const cjsPath = path.join(workspacePath, 'orquestra.cjs')
  const jsPath = path.join(workspacePath, 'orquestra.js')
  fs.copyFileSync(srcJs, cjsPath)

  const isModule = workspacePackageIsModule(workspacePath)
  fs.writeFileSync(jsPath, isModule ? ORQUESTRA_JS_BOOTSTRAP_ESM : ORQUESTRA_JS_BOOTSTRAP_CJS, 'utf-8')

  let cmdPath: string | null = null
  const cmdSrc = path.join(cliSourceDir, 'orquestra.cmd')
  if (fs.existsSync(cmdSrc)) {
    cmdPath = path.join(workspacePath, 'orquestra.cmd')
    // Always point at .cjs so Windows works under type:module too
    fs.writeFileSync(
      cmdPath,
      '@echo off\r\nnode "%~dp0orquestra.cjs" %*\r\n',
      'utf-8',
    )
  }
  return { cjsPath, jsPath, cmdPath }
}
