const ANSI_RE = /\x1b(?:\[[0-9;]*[?]?[a-zA-Z~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[\(\)\[\]#@-Z\\-_])/g;
function stripAnsi(s) { return s.replace(ANSI_RE, '') }

console.log('ESC=:', JSON.stringify(stripAnsi('\x1b=')), 'len:', stripAnsi('\x1b=').length);
console.log('ESC[?1h:', JSON.stringify(stripAnsi('\x1b[?1h')), 'len:', stripAnsi('\x1b[?1h').length);
console.log('combined:', JSON.stringify(stripAnsi('\x1b[?1h\x1b=')), 'len:', stripAnsi('\x1b[?1h\x1b=').length);
