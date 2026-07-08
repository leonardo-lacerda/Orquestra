// Quick ANSI regex test
const CSI = '\\x1b[[0-9;]*[?]?[a-zA-Z~]'
const OSC = '\\x1b][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)'
const SINGLE = '\\x1b[()\\[\\]#@-Z\\\\-_]'
const ANSI_RE = new RegExp(`(?:${CSI}|${OSC}|${SINGLE})`, 'g')

const tests = [
  ['\x1b[32m', 'CSI color'],
  ['\x1b[?2026h', 'DEC private enable'],
  ['\x1b[?2026l', 'DEC private disable'],
  ['\x1b[200~', 'bracketed paste start'],
  ['\x1b[201~', 'bracketed paste end'],
  ['\x1b]0;title\x07', 'OSC title'],
  ['hello \x1b[32mworld\x1b[0m', 'mixed text+CSI'],
]

let pass = 0, fail = 0
for (const [input, name] of tests) {
  ANSI_RE.lastIndex = 0
  const result = input.replace(ANSI_RE, '')
  const hasAnsi = /[\x1b\x9b]/.test(input)
  const stripped = !/[\x1b\x9b]/.test(result)
  if (stripped) { pass++; console.log('  OK', name) }
  else { fail++; console.log('  FAIL', name, '→', JSON.stringify(result)) }
}
console.log(`\nResults: ${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
