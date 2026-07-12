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
 * Text written to the Maestro agent PTY when the crown is armed.
 *
 * CRITICAL: must NOT look like a product request. Pasting `set ORQUESTRA_RUN_ID=…`
 * into an agent TUI is treated as a user turn — the model "runs" it then invents
 * a demo plan (calculator / html+css+js) from the workspace. This note only
 * announces the run id and forbids any recruit until a NEW real user message.
 */
export function buildMaestroArmSystemNote(runId: string): string {
  const safe = sanitizeRunId(runId)
  return (
    `[ORQUESTRA SYSTEM — not a user task] Maestro crown armed. Your runId is ${safe}. ` +
    `On every CLI call pass --run ${safe} (example: node .orquestra/cli/orquestra.cjs wait --run ${safe} --workers w1 --timeout 300). ` +
    `Do NOT recruit, reassign, plan a backlog, invent workers, or start any product work from this message. ` +
    `Do NOT invent a calculator, landing page, or html/css/js split from the folder name. ` +
    `Stay idle until the human sends a NEW real request after this line. Reply with one short line only: "Maestro ready (run ${safe}). Waiting for your request."\r`
  )
}
