#!/usr/bin/env node
// =============================================================================
// orquestra — CLI for Maestro mode terminals.
//
// Writes JSON command files to .orquestra-commands/ that the Orquestra main process
// watches and executes as canvas operations.
//
// Usage:
//   orquestra recruit --role "Desenvolvedor" [--agent verboo] [--name dev-1]
//   orquestra dismiss <terminal-name-or-id>
//   orquestra connect <terminal-name> <note-path>
//   orquestra list
//   orquestra reassign <terminal-name> --role "Nova responsabilidade"
// =============================================================================

const COMMANDS_DIR = '.orquestra-commands'

function send(cmd, args = {}) {
  const fs = require('fs')
  const path = require('path')
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
  print('  reassign   Change a terminal\'s role/prompt')
  print('')
  print('Examples:')
  print('  orquestra recruit --role "Desenvolvedor" --agent verboo')
  print('  orquestra dismiss dev-1')
  print('  orquestra connect dev-1 ./spec.md')
  print('  orquestra list')
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

  case 'list': {
    send('list')
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
