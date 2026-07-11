import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import {
  completionState,
  inferredReadyPattern,
  parseArgs,
  queuedCount,
  stripAnsi,
} from './maestro-test-runner.mjs'

test('parses an agent-friendly invocation', () => {
  const args = parseArgs([
    '--workspace', 'fixture',
    '--prompt', 'build two files',
    '--timeout', '12',
    '--expect-workers', '2',
    '--no-build',
  ], path.parse(process.cwd()).root)
  assert.equal(args.workspace, path.resolve(path.parse(process.cwd()).root, 'fixture'))
  assert.equal(args.prompt, 'build two files')
  assert.equal(args.timeoutMs, 12_000)
  assert.equal(args.expectWorkers, 2)
  assert.equal(args.build, false)
})

test('requires a prompt source', () => {
  assert.throws(() => parseArgs([], '/repo'), /Provide --prompt or --prompt-file/)
})

test('infers the Verboo ready marker and respects an explicit marker', () => {
  assert.equal(inferredReadyPattern('verboo --dangerously-skip-permissions'), '/help')
  assert.equal(inferredReadyPattern('verboo.cmd', 'READY>'), 'READY>')
  assert.equal(inferredReadyPattern('node -i'), null)
})

test('counts only queued items', () => {
  assert.equal(queuedCount({ items: [{ status: 'queued' }, { status: 'dispatched' }] }), 1)
})

test('settles only after enough workers finish and the queue drains', () => {
  const base = {
    workers: [{ name: 'a', status: 'done' }],
    results: [{ workerName: 'a', status: 'done' }],
    expectWorkers: 1,
    maxWorkers: 4,
  }
  assert.equal(completionState({ ...base, queued: 1 }).complete, false)
  assert.equal(completionState({ ...base, queued: 0 }).complete, true)
})

test('reports pool ceiling violations', () => {
  const workers = Array.from({ length: 5 }, (_, i) => ({ name: `w${i}`, status: 'running' }))
  const state = completionState({ workers, results: [], queued: 0, expectWorkers: 1, maxWorkers: 4 })
  assert.match(state.fatal, /exceeded/)
})

test('removes terminal control sequences from captured output', () => {
  assert.equal(stripAnsi('\u001b[32mDONE\u001b[0m\r\n'), 'DONE\n')
})
