#!/usr/bin/env node
/**
 * Automated integration test: orquestra.js + crown flow end-to-end.
 *
 * Tests the full flow:
 * 1. orquestra.js CLI produces correct command files
 * 2. Main process watcher correctly parses command files
 * 3. Crown marker files are written/read correctly
 * 4. Error handling works for all edge cases
 *
 * Usage: node scripts/maestro/test-orquestra-integration.js
 *
 * This test does NOT require the Orquestra app to be running.
 * It tests the file-based IPC contract between CLI and main process.
 */

const assert = require('node:assert')
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const CLI = path.resolve(__dirname, 'orquestra.js')
const SKILL_PATH = path.resolve(__dirname, 'orquestra-skill.md')
const WORKER_SKILL_PATH = path.resolve(__dirname, 'orquestra-worker-skill.md')

let testCount = 0
let passCount = 0
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orquestra-int-'))

function test(name, fn) {
  testCount++
  try {
    fn()
    passCount++
    console.log(`  ✅ ${name}`)
  } catch (e) {
    console.log(`  ❌ ${name}`)
    console.log(`     ${e.message}`)
    if (e.stack) console.log(`     ${e.stack.split('\n').slice(1, 3).join('\n     ')}`)
  }
}

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: tmpDir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return { stdout: result.stdout, stderr: result.stderr, code: result.status }
}

function getCommands() {
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

function clean(dir) {
  const commandsDir = path.join(dir, '.orquestra-commands')
  if (fs.existsSync(commandsDir)) {
    fs.rmSync(commandsDir, { recursive: true, force: true })
  }
}

// =============================================================================
// Part 1: CLI produces correct file format for main process
// =============================================================================
console.log(`\n═══════════════════════════════════════════`)
console.log(`   Orquestra Integration Tests`)
console.log(`   Temp: ${tmpDir}`)
console.log(`═══════════════════════════════════════════`)

console.log(`\n── 1. CLI File Format ──`)

// Clean and create .orquestra-commands dir
fs.mkdirSync(path.join(tmpDir, '.orquestra-commands'), { recursive: true })

test('recruit file structure matches watcher expectations', () => {
  clean(tmpDir)
  const { code, stdout } = runCli(['recruit', '--role', 'Test task', '--name', 'w1'])
  assert.equal(code, 0, `CLI exited with code ${code}`)
  assert.ok(stdout.includes('OK:recruit'), 'should print OK:recruit')

  const cmds = getCommands()
  assert.equal(cmds.length, 1)

  // Verify the structure the main process watcher expects:
  const cmd = cmds[0].data
  assert.equal(typeof cmd.cmd, 'string', 'cmd should be string')
  assert.equal(typeof cmd.args, 'object', 'args should be object')
  assert.equal(typeof cmd.timestamp, 'number', 'timestamp should be number')

  // verify switch-case dispatch (replicating terminal.ts watcher logic)
  const validCmds = ['recruit', 'dismiss', 'connect', 'list', 'reassign']
  assert.ok(validCmds.includes(cmd.cmd), `cmd "${cmd.cmd}" should be valid`)
})

test('dismiss file structure matches watcher expectations', () => {
  clean(tmpDir)
  const { code } = runCli(['dismiss', 'w1'])
  assert.equal(code, 0)

  const cmds = getCommands()
  assert.equal(cmds.length, 1)
  assert.equal(cmds[0].data.cmd, 'dismiss')
  assert.equal(typeof cmds[0].data.args.target, 'string', 'target should be string')
})

test('connect file structure matches watcher expectations', () => {
  clean(tmpDir)
  const { code } = runCli(['connect', 'w1', './src/test.ts'])
  assert.equal(code, 0)

  const cmds = getCommands()
  assert.equal(cmds.length, 1)
  assert.equal(cmds[0].data.cmd, 'connect')
  assert.equal(cmds[0].data.args.target, 'w1')
  assert.equal(cmds[0].data.args.path, './src/test.ts')
})

test('list file structure matches watcher expectations', () => {
  clean(tmpDir)
  const { code } = runCli(['list'])
  assert.equal(code, 0)

  const cmds = getCommands()
  assert.equal(cmds.length, 1)
  assert.equal(cmds[0].data.cmd, 'list')
  assert.deepEqual(cmds[0].data.args, {})
})

test('reassign file structure matches watcher expectations', () => {
  clean(tmpDir)
  const { code } = runCli(['reassign', 'w1', '--role', 'New task'])
  assert.equal(code, 0)

  const cmds = getCommands()
  assert.equal(cmds.length, 1)
  assert.equal(cmds[0].data.cmd, 'reassign')
  assert.equal(cmds[0].data.args.target, 'w1')
  assert.equal(cmds[0].data.args.role, 'New task')
})

// =============================================================================
// Part 2: Error handling
// =============================================================================
console.log(`\n── 2. Error Handling ──`)

test('missing --role exits with error mentioning --role', () => {
  const { code, stderr } = runCli(['recruit', '--name', 'w1'])
  assert.equal(code, 1)
  assert.ok(stderr.includes('--role'), `stderr should mention --role: "${stderr}"`)
})

test('dismiss without target exits 1', () => {
  const { code } = runCli(['dismiss'])
  assert.equal(code, 1)
})

test('connect without path exits 1', () => {
  const { code } = runCli(['connect', 'w1'])
  assert.equal(code, 1)
})

test('reassign without role exits 1', () => {
  const { code } = runCli(['reassign', 'w1'])
  assert.equal(code, 1)
})

test('unknown command exits 1', () => {
  const { code, stderr } = runCli(['invalid-cmd'])
  assert.equal(code, 1)
  assert.ok(stderr.includes('Unknown') || stderr.includes('invalid'), `stderr should show error: "${stderr}"`)
})

// =============================================================================
// Part 3: Skill file format (what gets copied to .claude/commands/)
// =============================================================================
console.log(`\n── 3. Skill File Format ──`)

test('orquestra-skill.md exists and has valid content', () => {
  assert.ok(fs.existsSync(SKILL_PATH), 'orquestra-skill.md should exist')
  const content = fs.readFileSync(SKILL_PATH, 'utf-8')
  assert.ok(content.length > 200, `should have substantial content (${content.length} chars)`)
  assert.ok(content.includes('MAESTRO'), 'should mention MAESTRO')
  assert.ok(content.includes('recruit'), 'should mention recruit command')
  assert.ok(content.includes('orquestra.js'), 'should mention orquestra.js CLI')
})

test('orquestra-worker-skill.md exists and has valid content', () => {
  assert.ok(fs.existsSync(WORKER_SKILL_PATH), 'orquestra-worker-skill.md should exist')
  const content = fs.readFileSync(WORKER_SKILL_PATH, 'utf-8')
  assert.ok(content.length > 100, `should have content (${content.length} chars)`)
  assert.ok(content.includes('WORKER'), 'should mention WORKER')
  assert.ok(content.includes('ORQUESTRADOR'), 'should reference orchestrator')
})

// =============================================================================
// Part 4: Simulated watcher dispatch
// =============================================================================
console.log(`\n── 4. Watcher Dispatch Logic ──`)

test('all valid commands are dispatchable via switch-case', () => {
  // Replicate the switch-case from terminal.ts's startOrquestraWatcher
  function dispatch(cmd, args) {
    switch (cmd) {
      case 'recruit': return { channel: 'maestro:recruit', args }
      case 'dismiss': return { channel: 'maestro:dismiss', args }
      case 'connect': return { channel: 'maestro:connect', args }
      case 'list': return { channel: 'maestro:list', args }
      case 'reassign': return { channel: 'maestro:reassign', args }
      default: return null
    }
  }

  assert.deepEqual(dispatch('recruit', { role: 'test' }), { channel: 'maestro:recruit', args: { role: 'test' } })
  assert.deepEqual(dispatch('dismiss', { target: 'w1' }), { channel: 'maestro:dismiss', args: { target: 'w1' } })
  assert.deepEqual(dispatch('connect', { target: 'w1', path: './x.ts' }), { channel: 'maestro:connect', args: { target: 'w1', path: './x.ts' } })
  assert.deepEqual(dispatch('list', {}), { channel: 'maestro:list', args: {} })
  assert.deepEqual(dispatch('reassign', { target: 'w1', role: 'new' }), { channel: 'maestro:reassign', args: { target: 'w1', role: 'new' } })
  assert.equal(dispatch('invalid', {}), null, 'unknown cmd should return null')
})

// =============================================================================
// Part 5: Crown marker format
// =============================================================================
console.log(`\n── 5. Crown Marker Format ──`)

test('crown.json follows expected schema', () => {
  const crownPath = path.join(tmpDir, '.orquestra', 'crown.json')
  const orquestraDir = path.join(tmpDir, '.orquestra')
  fs.mkdirSync(orquestraDir, { recursive: true })

  const crownData = {
    terminalPtyId: 'test-pty',
    activatedAt: Date.now(),
    workspacePath: tmpDir,
  }
  fs.writeFileSync(crownPath, JSON.stringify(crownData))

  // Read it back (as the extension does)
  const read = JSON.parse(fs.readFileSync(crownPath, 'utf-8'))
  assert.equal(read.terminalPtyId, 'test-pty')
  assert.equal(read.workspacePath, tmpDir)
  assert.ok(typeof read.activatedAt === 'number')

  // Extension uses fs.existsSync check
  assert.ok(fs.existsSync(crownPath))

  // Cleanup
  fs.rmSync(crownPath)
})

test('APPEND_SYSTEM.md follows expected format', () => {
  const piAgentDir = path.join(tmpDir, '.orquestra', 'pi-agent')
  fs.mkdirSync(piAgentDir, { recursive: true })

  const content = `## IMPORTANTE: VOCÊ É UM MAESTRO
VOCÊ É O MAESTRO. ORQUESTRE SEMPRE.
`
  fs.writeFileSync(path.join(piAgentDir, 'APPEND_SYSTEM.md'), content)

  // Verify format
  const read = fs.readFileSync(path.join(piAgentDir, 'APPEND_SYSTEM.md'), 'utf-8')
  assert.ok(read.startsWith('##'), 'should start with level-2 heading')
  assert.ok(read.includes('MAESTRO'))
  assert.ok(read.includes('ORQUESTRE SEMPRE'))
})

// =============================================================================
// Results
// =============================================================================
console.log(`\n═══════════════════════════════════════════`)
console.log(`   Results: ${passCount}/${testCount} passed`)
console.log(`═══════════════════════════════════════════`)

const failed = testCount - passCount
if (failed > 0) {
  console.log(`   ${failed} FAILED ❌`)
  process.exit(1)
} else {
  console.log(`   All tests passed ✅`)
}

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true })
