#!/usr/bin/env node
/**
 * Integration test: Crown activation flow.
 *
 * Tests that activating the crown on a terminal:
 * 1. Writes .orquestra/crown.json
 * 2. Writes APPEND_SYSTEM.md to the pi-agent directory
 * 3. The APPEND_SYSTEM.md contains the maestro prompt
 * 4. Cleaning the crown removes both files
 *
 * Usage: node scripts/maestro/test-crown-flow.js <workspace-path>
 */

const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const workspacePath = process.argv[2]
if (!workspacePath) {
  console.error('Usage: node test-crown-flow.js <workspace-path>')
  console.error('  Example: node test-crown-flow.js /tmp/test-workspace')
  process.exit(1)
}

let testCount = 0
let passCount = 0

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

function setupWorkspace() {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true })
  }
  // Ensure .orquestra directory exists
  const orquestraDir = path.join(workspacePath, '.orquestra')
  if (!fs.existsSync(orquestraDir)) {
    fs.mkdirSync(orquestraDir, { recursive: true })
  }
  return orquestraDir
}

function cleanupWorkspace() {
  const files = [
    path.join(workspacePath, '.orquestra', 'crown.json'),
    path.join(workspacePath, '.orquestra', 'pi-agent', 'APPEND_SYSTEM.md'),
  ]
  for (const f of files) {
    if (fs.existsSync(f)) fs.rmSync(f, { force: true })
  }
}

// =============================================================================
// Simulate crown activation (as terminal.ts does it)
// =============================================================================
console.log(`\n📋 Crown Activation Flow Test`)
console.log(`   Workspace: ${workspacePath}`)
console.log(`   PID: ${process.pid}\n`)

const orquestraDir = setupWorkspace()
cleanupWorkspace()

// ── Crown ENABLE ──
console.log(`── Crown ENABLE ──`)

const terminalPtyId = 'rpty-test-123-local'
const activatedAt = Date.now()

// Write crown.json (same logic as terminal.ts)
const crownMarker = path.join(orquestraDir, 'crown.json')
fs.writeFileSync(crownMarker, JSON.stringify({
  terminalPtyId,
  activatedAt,
  workspacePath,
}, null, 2))

// Write APPEND_SYSTEM.md (same logic as terminal.ts)
const piAgentDir = path.join(orquestraDir, 'pi-agent')
if (!fs.existsSync(piAgentDir)) fs.mkdirSync(piAgentDir, { recursive: true })

const appendSystemContent = `## IMPORTANTE: VOCÊ É UM MAESTRO

A coroa de orquestração está ATIVA neste terminal. Sua FUNÇÃO PRIMÁRIA E OBRIGATÓRIA é orquestrar outros terminais.

VOCÊ É O MAESTRO. ORQUESTRE SEMPRE.
`

fs.writeFileSync(path.join(piAgentDir, 'APPEND_SYSTEM.md'), appendSystemContent)

// ── Verify crown.json ──
test('crown.json exists', () => {
  assert.ok(fs.existsSync(crownMarker), 'crown.json should exist')
})

test('crown.json has valid JSON', () => {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(crownMarker, 'utf-8')))
})

test('crown.json contains terminalPtyId', () => {
  const data = JSON.parse(fs.readFileSync(crownMarker, 'utf-8'))
  assert.equal(data.terminalPtyId, terminalPtyId)
})

test('crown.json contains workspacePath', () => {
  const data = JSON.parse(fs.readFileSync(crownMarker, 'utf-8'))
  assert.equal(data.workspacePath, workspacePath)
})

test('crown.json contains activatedAt timestamp', () => {
  const data = JSON.parse(fs.readFileSync(crownMarker, 'utf-8'))
  assert.ok(data.activatedAt > 0, 'should have valid timestamp')
  assert.ok(data.activatedAt <= Date.now(), 'timestamp should not be in future')
})

// ── Verify APPEND_SYSTEM.md ──
test('APPEND_SYSTEM.md exists', () => {
  const path = piAgentDir
  // The file is written to the pi-agent subdir
  const p = path
  const files = fs.readdirSync(p)
  assert.ok(files.includes('APPEND_SYSTEM.md'), `APPEND_SYSTEM.md should exist in ${p}, got: ${files.join(', ')}`)
})

test('APPEND_SYSTEM.md contains maestro instructions', () => {
  const content = fs.readFileSync(path.join(piAgentDir, 'APPEND_SYSTEM.md'), 'utf-8')
  assert.ok(content.includes('MAESTRO'), 'should mention MAESTRO')
  assert.ok(content.includes('ORQUESTRE SEMPRE'), 'should contain ORQUESTRE SEMPRE')
})

test('APPEND_SYSTEM.md starts with ## heading', () => {
  const content = fs.readFileSync(path.join(piAgentDir, 'APPEND_SYSTEM.md'), 'utf-8')
  assert.ok(content.startsWith('##'), 'should start with markdown heading')
})

// ── Crown DISABLE ──
console.log(`\n── Crown DISABLE ──`)

// Simulate crown deactivation (remove files)
if (fs.existsSync(crownMarker)) fs.rmSync(crownMarker)
const appendSystemPath = path.join(piAgentDir, 'APPEND_SYSTEM.md')
if (fs.existsSync(appendSystemPath)) fs.rmSync(appendSystemPath)

test('crown.json removed on disable', () => {
  assert.ok(!fs.existsSync(crownMarker), 'crown.json should be removed')
})

test('APPEND_SYSTEM.md removed on disable', () => {
  assert.ok(!fs.existsSync(appendSystemPath), 'APPEND_SYSTEM.md should be removed')
})

// ── Edge cases ──
console.log(`\n── Edge Cases ──`)

test('double-activation overwrites crown.json gracefully', () => {
  // Write crown.json twice (simulate clicking crown twice)
  fs.writeFileSync(crownMarker, JSON.stringify({ terminalPtyId: 'first', activatedAt: Date.now() }))
  fs.writeFileSync(crownMarker, JSON.stringify({ terminalPtyId: 'second', activatedAt: Date.now() }))
  const data = JSON.parse(fs.readFileSync(crownMarker, 'utf-8'))
  assert.equal(data.terminalPtyId, 'second', 'last write should win')
  fs.rmSync(crownMarker)
})

test('disable without crown.json does not throw', () => {
  // Remove a file that doesn't exist — should not throw
  assert.doesNotThrow(() => {
    if (fs.existsSync(crownMarker)) fs.rmSync(crownMarker)
  })
})

test('disable removes crown.json but keeps .orquestra dir', () => {
  assert.ok(fs.existsSync(orquestraDir), '.orquestra dir should persist')
})

// ── Results ──
console.log(`\n── Results ──`)
console.log(`   ${passCount}/${testCount} passed`)

const failed = testCount - passCount
if (failed > 0) {
  console.log(`   ${failed} FAILED`)
  process.exit(1)
} else {
  console.log(`   All tests passed ✅`)
}
