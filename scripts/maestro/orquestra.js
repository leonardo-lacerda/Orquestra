#!/usr/bin/env node
// =============================================================================
// orquestra — CLI for Maestro mode terminals.
//
// Writes JSON command files to .orquestra-commands/ that the Orquestra main process
// watches and executes as canvas operations.
//
// Local-only commands (no IPC, read filesystem directly):
//   wait — block until worker result files appear in .orquestra-results/
//   status — read and print worker result files as JSON
//
// Usage:
//   orquestra recruit --role "Desenvolvedor" [--agent verboo] [--name dev-1]
//   orquestra dismiss <terminal-name-or-id>
//   orquestra connect <terminal-name> <note-path>
//   orquestra list
//   orquestra wait --workers name1,name2 --timeout 300
//   orquestra status
//   orquestra reassign <terminal-name> --role "Nova responsabilidade"
// =============================================================================

const fs = require('fs')
const path = require('path')
const COMMANDS_DIR = '.orquestra-commands'

function send(cmd, args = {}) {
  const dir = path.resolve(COMMANDS_DIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const payload = JSON.stringify({ cmd, args, timestamp: Date.now() })
  const filename = 'cmd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.json'
  fs.writeFileSync(path.join(dir, filename), payload)
  process.stdout.write('OK:' + cmd + '\n')
}

function print(msg) {
  process.stderr.write(msg + '\n')
}

const args = process.argv.slice(2)
const cmd = args[0]

if (!cmd || cmd === '--help' || cmd === '-h') {
  print('orquestra — Maestro CLI for Orquestra')
  print('')
  print('Commands:')
  print('  recruit    Create a new terminal on the canvas')
  print('  dismiss    Close a terminal')
  print('  connect    Connect a terminal to a file/note')
  print('  list       List all terminals and their roles')
  print('  wait       Block until workers complete (polls .orquestra-results/)')
  print('  status     Show worker result files as JSON')
  print('  reassign   Change a terminal\'s role/prompt')
  print('')
  print('Examples:')
  print('  orquestra recruit --role "Desenvolvedor" --agent verboo')
  print('  orquestra dismiss dev-1')
  print('  orquestra connect dev-1 ./spec.md')
  print('  orquestra list')
  print('  orquestra wait --workers dev-1,dev-2 --timeout 300')
  print('  orquestra status')
  print('  orquestra reassign dev-1 --role "Revisor de código"')
  process.exit(0)
}

// Parse --key value pairs
function parseFlags(args) {
  const flags = {}
  const positional = []
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true
      flags[key] = val
    } else {
      positional.push(args[i])
    }
  }
  return { flags, positional }
}

switch (cmd) {
  case 'recruit': {
    const { flags } = parseFlags(args.slice(1))
    if (!flags.role) {
      print('Error: --role is required')
      print('Usage: orquestra recruit --role "Desenvolvedor" [--agent verboo] [--name my-dev]')
      process.exit(1)
    }
    send('recruit', {
      role: flags.role,
      agent: flags.agent || null,
      name: flags.name || null,
    })
    print(`Recruiting: ${flags.role}${flags.agent ? ` (${flags.agent})` : ''}`)
    break
  }

  case 'dismiss': {
    const { positional } = parseFlags(args.slice(1))
    if (!positional[0]) {
      print('Error: terminal name or id is required')
      print('Usage: orquestra dismiss <terminal-name>')
      process.exit(1)
    }
    send('dismiss', { target: positional[0] })
    print(`Dismissing: ${positional[0]}`)
    break
  }

  case 'connect': {
    const { positional } = parseFlags(args.slice(1))
    if (!positional[0] || !positional[1]) {
      print('Error: terminal name and file path are required')
      print('Usage: orquestra connect <terminal-name> <file-path>')
      process.exit(1)
    }
    send('connect', { target: positional[0], path: positional[1] })
    print(`Connecting ${positional[0]} to ${positional[1]}`)
    break
  }

  // ── list: send IPC command + print local worker status ──
  case 'list': {
    send('list')
    const resultsDir = path.resolve('.orquestra-results')
    if (fs.existsSync(resultsDir)) {
      const files = fs.readdirSync(resultsDir).filter(f => /^worker-.+\.json$/.test(f))
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(resultsDir, file), 'utf-8'))
          process.stdout.write(`WORKER:${data.workerName}:${data.status}:${data.workerRole.slice(0, 60)}\n`)
        } catch {}
      }
    }
    break
  }

  // ── wait: block until workers complete (polls .orquestra-results/) ──
  case 'wait': {
    const { flags } = parseFlags(args.slice(1))
    const workerNames = (flags.workers || '').split(',').filter(Boolean)
    const timeoutSec = parseInt(flags.timeout, 10) || 300
    const pollIntervalMs = 2000

    if (workerNames.length === 0) {
      print('Error: --workers is required (comma-separated names)')
      print('Usage: orquestra wait --workers name1,name2 --timeout 300')
      process.exit(1)
    }

    const startTime = Date.now()
    while (Date.now() - startTime < timeoutSec * 1000) {
      const resultDir = path.resolve('.orquestra-results')
      const doneFiles = fs.existsSync(resultDir) ? fs.readdirSync(resultDir) : []
      const doneNames = new Set(
        doneFiles.map(f => { const m = f.match(/^worker-(.+)\.json$/); return m ? m[1] : null }).filter(Boolean),
      )
      const allDone = workerNames.every(name => doneNames.has(name))
      if (allDone) {
        for (const name of workerNames) {
          const rp = path.join(resultDir, `worker-${name}.json`)
          if (fs.existsSync(rp)) {
            const result = JSON.parse(fs.readFileSync(rp, 'utf-8'))
            const marker = result.status === 'completed' ? 'DONE' : 'IDLE'
            process.stdout.write(`WORKER_RESULT:${name}:${marker}:${result.summary.slice(0, 200)}\n`)
          }
        }
        process.exit(0)
      }
      // Poll interval
      const deadline = Date.now() + pollIntervalMs
      while (Date.now() < deadline) { /* spin */ }
    }

    print(`Timeout (${timeoutSec}s) — not done: ` + workerNames.filter(n => {
      const rp = path.resolve(`.orquestra-results/worker-${n}.json`)
      return !fs.existsSync(rp)
    }).join(', '))
    process.exit(1)
    break
  }

  // ── status: show worker results as JSON ──
  case 'status': {
    const resultDir = path.resolve('.orquestra-results')
    const statuses = []
    if (fs.existsSync(resultDir)) {
      for (const file of fs.readdirSync(resultDir)) {
        const m = file.match(/^worker-(.+)\.json$/)
        if (m) {
          try {
            statuses.push(JSON.parse(fs.readFileSync(path.join(resultDir, file), 'utf-8')))
          } catch {}
        }
      }
    }
    process.stdout.write(JSON.stringify({
      workers: statuses,
      total: statuses.length,
      completed: statuses.filter(s => s.status === 'completed').length,
      idle: statuses.filter(s => s.status === 'idle').length,
    }, null, 2) + '\n')
    break
  }

  case 'reassign': {
    const { flags, positional } = parseFlags(args.slice(1))
    if (!positional[0] || !flags.role) {
      print('Error: terminal name and --role are required')
      print('Usage: orquestra reassign <terminal-name> --role "Nova responsabilidade"')
      process.exit(1)
    }
    send('reassign', { target: positional[0], role: flags.role })
    print(`Reassigning ${positional[0]} to: ${flags.role}`)
    break
  }

  default:
    print(`Unknown command: ${cmd}`)
    print('Run "orquestra --help" for usage')
    process.exit(1)
}
