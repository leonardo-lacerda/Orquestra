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

/**
 * One line (+ CR/LF) that sets ORQUESTRA_RUN_ID in the interactive shell.
 * runId is sanitized to [A-Za-z0-9._-] only for safe embedding.
 */
export function buildOrquestraRunIdExport(
  runId: string,
  shellPath?: string | null,
  platform: NodeJS.Platform = process.platform,
): string {
  const safe = String(runId || '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 120) || 'unknown'
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
