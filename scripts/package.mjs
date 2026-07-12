import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const args = process.argv.slice(2)
const node = process.execPath
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

if (!process.env.SENTRY_DSN) {
  process.env.SENTRY_DSN = 'https://any@analytics.cero-ai.com/1'
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: 'inherit',
      env: process.env,
      ...options,
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(
          signal
            ? `${command} exited from signal ${signal}`
            : `${command} exited with code ${code}`,
        ),
      )
    })
  })
}

/**
 * Fail the build if the packaged app.asar has a broken root package.json.
 * A corrupted package.json (e.g. accidental PowerShell UTF-16 redirect into the
 * file during packaging) makes Electron exit immediately with code 1 and no UI.
 */
function assertPackagedPackageJson() {
  const asarPath = path.join(repoRoot, 'release', 'win-unpacked', 'resources', 'app.asar')
  if (!existsSync(asarPath)) {
    // Non-Windows pack or --dir skipped; nothing to check.
    return
  }
  const asar = require('@electron/asar')
  let raw
  try {
    raw = asar.extractFile(asarPath, 'package.json').toString('utf8').replace(/^\uFEFF/, '').trim()
  } catch (err) {
    throw new Error(`[package] cannot read package.json from ${asarPath}: ${err.message}`)
  }
  let pkg
  try {
    pkg = JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `[package] app.asar package.json is not valid JSON (${raw.slice(0, 80).replace(/\s+/g, ' ')}…). ` +
        `Electron will refuse to start. Check that package.json was not overwritten during the build ` +
        `(PowerShell \`>\` / Tee-Object can write UTF-16).`,
    )
  }
  if (!pkg.main || typeof pkg.main !== 'string') {
    throw new Error(`[package] app.asar package.json missing "main" field`)
  }
  // Resolve main via asar header tree (extractFile path separators vary by platform).
  const parts = pkg.main.replace(/\\/g, '/').split('/').filter(Boolean)
  let node = asar.getRawHeader(asarPath).header.files
  for (const part of parts) {
    if (!node?.[part]) {
      throw new Error(`[package] app.asar main entry missing: ${pkg.main} (at ${part})`)
    }
    node = node[part].files ?? node[part]
  }
  if (node?.files) {
    throw new Error(`[package] app.asar main entry is a directory: ${pkg.main}`)
  }
  console.log(`[package] asar package.json OK (main=${pkg.main}, version=${pkg.version ?? '?'})`)
}

// Ship the host-target runtime tarball into the installer under a fixed name.
// electron-builder can't compute the per-target name (orquestra-runtime-<version>-<target>.tgz),
// so copy it to dist-runtime/runtime-host.tgz (extraResources → resources/runtime-host.tgz).
function plat(p) {
  return p === 'win32' ? 'win32' : p // darwin | linux pass through
}
function stageHostRuntimeTarball() {
  const version = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')).version
  const target = `${plat(process.platform)}-${process.arch}`
  const src = path.join(repoRoot, 'dist-runtime', `orquestra-runtime-${version}-${target}.tgz`)
  const dest = path.join(repoRoot, 'dist-runtime', 'runtime-host.tgz')
  if (!existsSync(src)) {
    throw new Error(
      `[package] host runtime tarball missing: ${src}\n` +
        'Packaging a local-daemon app requires it — run `npm run runtime:tarball` first.',
    )
  }
  copyFileSync(src, dest)
  console.log(`[package] staged ${path.relative(repoRoot, src)} → ${path.relative(repoRoot, dest)}`)
}

// electron-builder publish.url uses ${env.ORQUESTRA_RELEASES_URL} — ensure set
// so empty env does not produce a broken generic feed URL.
if (!process.env.ORQUESTRA_RELEASES_URL) {
  // Keep in sync with src/shared/releasesFeed.ts default (override before package
  // with the real public R2 URL once the bucket exists).
  process.env.ORQUESTRA_RELEASES_URL =
    'https://pub-1fcb183da34e46ba9cbbfa5cda797554.r2.dev'
  console.log(
    '[package] ORQUESTRA_RELEASES_URL default →',
    process.env.ORQUESTRA_RELEASES_URL,
  )
}

// Refuse to package if root package.json is already garbage (common when a
// PowerShell `2>&1 | Tee-Object` was pointed at the wrong file).
{
  const rootPkgPath = path.join(repoRoot, 'package.json')
  try {
    const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'))
    if (!rootPkg.main) throw new Error('missing main')
  } catch (err) {
    throw new Error(
      `[package] ${rootPkgPath} is not valid JSON / missing main before packaging: ${err.message}`,
    )
  }
}

await run(node, ['scripts/generate-icons.js'])
await run(node, ['node_modules/electron-vite/bin/electron-vite.js', 'build'])
stageHostRuntimeTarball()
await run(node, ['node_modules/electron-builder/out/cli/cli.js', ...args])
assertPackagedPackageJson()
