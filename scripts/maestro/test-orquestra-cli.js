#!/usr/bin/env node
/**
 * Test suite for orquestra.js CLI — orchestrator worker management.
 * Usage: node scripts/maestro/test-orquestra-cli.js
 */

const assert = require('node:assert')
const { spawnSync } = require('child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const CLI = path.resolve(__dirname, 'orquestra.js')

let testCount = 0
let passCount = 0
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orquestra-test-'))

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: tmpDir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    code: result.status,
  }
}

function readCommands() {
  const dir = path.join(tmpDir, '.orquestra-commands')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      file: f,
      data: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')),
    }))
    .sort((a, b) => a.data.timestamp - b.data.timestamp)
}

function cleanCommands() {
  const dir = path.join(tmpDir, '.orquestra-commands')
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true })
  }
}

function test(name, fn) {
  testCount++
  try {
    fn()
    passCount++
    console.log(`  ✅ ${name}`)
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`)
  }
}

// Setup
console.log(`\n📋 Orquestra CLI Test Suite | tmp: ${tmpDir}\n`)
cleanCommands()

// =============================================================================
console.log(`── CLI Commands ──`)

test('recruit creates a command file', () => {
  cleanCommands()
  const r = run(['recruit', '--role', 'Build login page', '--name', 'worker-1'])
  assert.equal(r.code, 0)
  const cmds = readCommands()
  assert.equal(cmds.length, 1)
  assert.equal(cmds[0].data.cmd, 'recruit')
  assert.equal(cmds[0].data.args.role, 'Build login page')
})

test('recruit without --role exits 1', () => {
  const r = run(['recruit', '--name', 'no-role'])
  assert.equal(r.code, 1)
  assert.ok(r.stderr.includes('--role'))
})

test('recruit without --name exits 1', () => {
  const r = run(['recruit', '--role', 'only role text'])
  assert.equal(r.code, 1)
  assert.ok(r.stderr.includes('--name'))
})

test('dismiss creates a command file', () => {
  cleanCommands()
  const r = run(['dismiss', 'worker-1'])
  assert.equal(r.code, 0)
  const cmds = readCommands()
  assert.equal(cmds[0].data.cmd, 'dismiss')
  assert.equal(cmds[0].data.args.target, 'worker-1')
})

test('dismiss without target exits 1', () => {
  assert.equal(run(['dismiss']).code, 1)
})

test('connect creates a command file', () => {
  cleanCommands()
  const r = run(['connect', 'worker-1', './src/index.ts'])
  assert.equal(r.code, 0)
  const cmds = readCommands()
  assert.equal(cmds[0].data.cmd, 'connect')
  assert.equal(cmds[0].data.args.target, 'worker-1')
  assert.equal(cmds[0].data.args.path, './src/index.ts')
})

test('connect without path exits 1', () => {
  assert.equal(run(['connect', 'worker-1']).code, 1)
})

test('list creates a command file with empty args', () => {
  cleanCommands()
  const r = run(['list'])
  assert.equal(r.code, 0)
  const cmds = readCommands()
  assert.equal(cmds[0].data.cmd, 'list')
  assert.deepEqual(cmds[0].data.args, {})
})

test('reassign creates a command file', () => {
  cleanCommands()
  const r = run(['reassign', 'worker-1', '--role', 'New task'])
  assert.equal(r.code, 0)
  const cmds = readCommands()
  assert.equal(cmds[0].data.cmd, 'reassign')
  assert.equal(cmds[0].data.args.target, 'worker-1')
  assert.equal(cmds[0].data.args.role, 'New task')
})

test('reassign without --role exits 1', () => {
  assert.equal(run(['reassign', 'worker-1']).code, 1)
})

test('unknown command exits 1', () => {
  const r = run(['unknown-cmd'])
  assert.equal(r.code, 1)
  assert.ok(r.stderr.includes('Unknown'))
})

test('help flag shows usage and exits 0', () => {
  const r = run(['--help'])
  assert.equal(r.code, 0)
  assert.ok(r.stderr.includes('Commands:'), `stderr should list commands: "${r.stderr.slice(0, 100)}"`)
})

test('recruit with special characters in role', () => {
  cleanCommands()
  const role = "Fix bug #123 & deploy to prod! <test>"
  run(['recruit', '--role', role, '--name', 'special'])
  const cmd = readCommands()[0]
  assert.equal(cmd.data.args.role, role)
})

test('recruit with unicode in name', () => {
  cleanCommands()
  const name = 'dev-\u65e5\u672c\u8a9e'
  run(['recruit', '--role', 'test', '--name', name])
  assert.equal(readCommands()[0].data.args.name, name)
})

// =============================================================================
console.log(`\n── File-based IPC ──`)

test('command file is written to .orquestra-commands/', () => {
  cleanCommands()
  run(['recruit', '--role', 'test-role', '--name', 'test'])
  const cmds = readCommands()
  assert.equal(cmds.length, 1)
  assert.ok(cmds[0].file.startsWith('cmd-'))
  assert.ok(cmds[0].file.endsWith('.json'))
  assert.ok(cmds[0].data.timestamp > 0)
})

test('multiple commands create multiple files', () => {
  cleanCommands()
  run(['recruit', '--role', 'role-1', '--name', 'w1'])
  run(['recruit', '--role', 'role-2', '--name', 'w2'])
  run(['list'])
  assert.equal(readCommands().length, 3)
})

// =============================================================================
console.log(`\n── Output Format ──`)

test('recruit prints OK:recruit', () => {
  cleanCommands()
  const r = run(['recruit', '--role', 'test', '--name', 'w'])
  assert.ok(r.stdout.includes('OK:recruit'))
})

test('list prints OK:list', () => {
  cleanCommands()
  assert.ok(run(['list']).stdout.includes('OK:list'))
})

test('dismiss prints OK:dismiss', () => {
  cleanCommands()
  assert.ok(run(['dismiss', 'some-worker']).stdout.includes('OK:dismiss'))
})

// =============================================================================
// Results
// =============================================================================
console.log(`\n── Results ──`)
console.log(`   ${passCount}/${testCount} passed`)
const failed = testCount - passCount
if (failed > 0) { process.exit(1) }
else { console.log(`   All passed ✅`) }

fs.rmSync(tmpDir, { recursive: true, force: true })
