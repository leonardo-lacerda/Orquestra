import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tempRoots: string[] = []

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/mock/app'),
  },
}))

vi.mock('../../agent/main/extensionInstall', () => ({
  findSourceDir: vi.fn((candidates: string[]) => {
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c
    }
    return null
  }),
}))

import {
  checkMaestroAssets,
  installOrquestraCliToWorkspace,
  resolveMaestroCliDir,
  resolveMaestroExtensionDir,
  workspacePackageIsModule,
  ORQUESTRA_JS_BOOTSTRAP_ESM,
} from './maestroAssets'
import { app } from 'electron'
import { spawnSync } from 'node:child_process'

function seedCliDir(root: string): string {
  const dir = path.join(root, 'scripts', 'maestro')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'orquestra.js'), '#!/usr/bin/env node\n')
  fs.writeFileSync(path.join(dir, 'orquestra-worker-skill.md'), '# worker\n')
  return dir
}

function seedExtDir(root: string): string {
  const dir = path.join(root, 'src', 'agent', 'extensions', 'orquestra-maestro')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.ts'), 'export {}\n')
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"orquestra-maestro"}\n')
  fs.writeFileSync(path.join(dir, 'multiTask.ts'), 'export function hasMultipleTasks(){return false}\n')
  return dir
}

beforeEach(() => {
  vi.mocked(app.getAppPath).mockReset()
})

afterEach(() => {
  for (const r of tempRoots.splice(0)) {
    try {
      fs.rmSync(r, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})

describe('maestroAssets', () => {
  it('resolves CLI and extension from app path when present', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-assets-'))
    tempRoots.push(root)
    seedCliDir(root)
    seedExtDir(root)
    vi.mocked(app.getAppPath).mockReturnValue(root)

    expect(resolveMaestroCliDir()).toBe(path.join(root, 'scripts', 'maestro'))
    expect(resolveMaestroExtensionDir()).toBe(
      path.join(root, 'src', 'agent', 'extensions', 'orquestra-maestro'),
    )
    const check = checkMaestroAssets()
    expect(check.ok).toBe(true)
    expect(check.missing).toEqual([])
  })

  it('reports missing assets when dirs absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-assets-empty-'))
    tempRoots.push(root)
    vi.mocked(app.getAppPath).mockReturnValue(root)

    const check = checkMaestroAssets()
    expect(check.ok).toBe(false)
    expect(check.missing).toContain('cli')
    expect(check.missing).toContain('extension')
  })

  it('reports missing files when dir exists but incomplete', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-assets-partial-'))
    tempRoots.push(root)
    const cli = path.join(root, 'scripts', 'maestro')
    fs.mkdirSync(cli, { recursive: true })
    fs.writeFileSync(path.join(cli, 'orquestra.js'), 'x')
    // missing worker skill
    seedExtDir(root)
    vi.mocked(app.getAppPath).mockReturnValue(root)

    const check = checkMaestroAssets()
    expect(check.ok).toBe(false)
    expect(check.missing).toContain('cli:orquestra-worker-skill.md')
  })

  it('installOrquestraCliToWorkspace: type module still runs node orquestra.js via cjs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cli-esm-'))
    tempRoots.push(root)
    const cliSrc = seedCliDir(root)
    // Real-ish CLI body that prints ok (overwrite seed stub)
    fs.writeFileSync(
      path.join(cliSrc, 'orquestra.js'),
      "#!/usr/bin/env node\nconsole.log('cli-ok', process.argv[2] || '')\n",
    )
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'demo', type: 'module' }, null, 2),
    )
    expect(workspacePackageIsModule(root)).toBe(true)

    const { cjsPath, jsPath } = installOrquestraCliToWorkspace(root, cliSrc)
    expect(fs.existsSync(cjsPath)).toBe(true)
    expect(fs.readFileSync(jsPath, 'utf-8')).toContain('import.meta.url')
    expect(fs.readFileSync(jsPath, 'utf-8')).toContain(ORQUESTRA_JS_BOOTSTRAP_ESM.slice(0, 40))

    const r = spawnSync(process.execPath, [jsPath, 'wait'], {
      encoding: 'utf-8',
      cwd: root,
    })
    expect(r.status).toBe(0)
    expect(String(r.stdout || '')).toMatch(/cli-ok/)
  })

  it('installOrquestraCliToWorkspace: commonjs package uses require bootstrap', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cli-cjs-'))
    tempRoots.push(root)
    const cliSrc = seedCliDir(root)
    fs.writeFileSync(
      path.join(cliSrc, 'orquestra.js'),
      "#!/usr/bin/env node\nconsole.log('cli-ok')\n",
    )
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'demo' }))
    expect(workspacePackageIsModule(root)).toBe(false)

    const { jsPath } = installOrquestraCliToWorkspace(root, cliSrc)
    expect(fs.readFileSync(jsPath, 'utf-8')).toContain("require('child_process')")

    const r = spawnSync(process.execPath, [jsPath], { encoding: 'utf-8', cwd: root })
    expect(r.status).toBe(0)
    expect(String(r.stdout || '')).toMatch(/cli-ok/)
  })
})
