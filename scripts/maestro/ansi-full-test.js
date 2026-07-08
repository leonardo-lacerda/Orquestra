const ANSI_RE = /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|[\[\]()#;?]*[0-9;]*[A-Za-z~<>=]|.)/g

const tests = [
  ['\x1b[32m', 'CSI color'],
  ['\x1b[?25l', 'cursor hide'],
  ['\x1b[?25h', 'cursor show'],
  ['\x1b=', 'application keypad'],
  ['\x1b>', 'normal keypad'],
  ['\x1b[200~', 'bracketed paste'],
  ['\x1b[2J\x1b[H', 'screen clear + cursor home'],
  ['\x1b]0;title\x07', 'OSC title'],
  ['\x1b[K', 'erase line'],
  ['\x1b[2K', 'erase entire line'],
  ['\x1b[10;20H', 'cursor position'],
  ['hello \x1b[32mworld\x1b[0m', 'mixed text+CSI'],
  ['no ansi here', 'plain text'],
  ['', 'empty string'],
]

let pass = 0, fail = 0
for (const [input, name] of tests) {
  ANSI_RE.lastIndex = 0
  const result = input.replace(ANSI_RE, '')
  const hasAnsi = /[\x1b\x9b]/.test(input)
  const ok = hasAnsi ? !/[\x1b\x9b]/.test(result) : result === input
  if (ok) pass++; else fail++
  console.log(ok ? 'OK' : 'FAIL', name, ok ? '' : '→ ' + JSON.stringify(result))
}
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail > 0 ? 1 : 0)
