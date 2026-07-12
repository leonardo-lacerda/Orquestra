// =============================================================================
// shellEnvStamp — set ORQUESTRA_RUN_ID in an already-running PTY shell.
//
// Must match the actual shell dialect. PowerShell `$env:…` fails in cmd.exe
// (and vice-versa). Used when arming Maestro so multi-run CLI/extension stamp
// the correct run without relying on last-armed legacy crown.json.
// =============================================================================

export type ShellFamily = 'cmd' | 'powershell' | 'bash'

/** Classify a resolved shell executable path. */
export function shellFamilyFromPath(shellPath: string | null | undefined): ShellFamily {
  const base = String(shellPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.toLowerCase() || ''
  if (base === 'cmd.exe' || base === 'cmd') return 'cmd'
  if (base === 'powershell.exe' || base === 'pwsh.exe' || base === 'pwsh' || base === 'powershell') {
    return 'powershell'
  }
  // Git bash, WSL bash, mac/linux shells
  return 'bash'
}

/** Sanitize runId for embedding in shell / agent-visible text. */
export function sanitizeRunId(runId: string): string {
  return String(runId || '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 120) || 'unknown'
}

/**
 * One line (+ CR/LF) that sets ORQUESTRA_RUN_ID in an interactive *shell*.
 * Do NOT inject this into a terminal that is running an agent TUI (Claude/Verboo/Grok):
 * those treat keystrokes as a user message and may start recruiting. Prefer
 * {@link buildMaestroArmSystemNote} for agent PTYs.
 */
export function buildOrquestraRunIdExport(
  runId: string,
  shellPath?: string | null,
  platform: NodeJS.Platform = process.platform,
): string {
  const safe = sanitizeRunId(runId)
  const family =
    platform === 'win32'
      ? shellFamilyFromPath(shellPath || process.env.COMSPEC || 'cmd.exe')
      : shellFamilyFromPath(shellPath || process.env.SHELL || 'bash')

  switch (family) {
    case 'cmd':
      // cmd.exe — never use $env: (that's PowerShell; causes "syntax of file name" error)
      return `set "ORQUESTRA_RUN_ID=${safe}"\r\n`
    case 'powershell':
      return `$env:ORQUESTRA_RUN_ID='${safe}'\r`
    case 'bash':
    default:
      return `export ORQUESTRA_RUN_ID='${safe}'\n`
  }
}

/**
 * Short line written to the Maestro PTY when the crown is armed.
 *
 * Goals:
 * - Tell the agent (if any) the runId and to stay idle until a real user message
 * - Not look like a product request that triggers recruits
 * - Be safe when the PTY is still a plain shell (cmd.exe must not try to "run"
 *   a multi-line English paragraph as a command — that produced the infamous
 *   `'[ORQUESTRA' não é reconhecido…` spam)
 */
export function buildMaestroArmSystemNote(
  runId: string,
  shellPath?: string | null,
  platform: NodeJS.Platform = process.platform,
): string {
  const safe = sanitizeRunId(runId)
  // One short professional line — no demos, no "don't invent a calculator".
  const msg =
    `Maestro ready (run ${safe}). Pass --run ${safe} on CLI. Idle until your next request.`

  const family =
    platform === 'win32'
      ? shellFamilyFromPath(shellPath || process.env.COMSPEC || 'cmd.exe')
      : shellFamilyFromPath(shellPath || process.env.SHELL || 'bash')

  switch (family) {
    case 'cmd':
      // echo so cmd never treats the note as a command name
      return `echo ${msg}\r\n`
    case 'powershell':
      return `Write-Host '${msg.replace(/'/g, "''")}'\r`
    case 'bash':
    default:
      return `printf '%s\\n' '${msg.replace(/'/g, `'\\''`)}'\n`
  }
}
