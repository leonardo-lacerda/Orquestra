import { describe, expect, it } from 'vitest'
import {
  buildMaestroArmSystemNote,
  buildOrquestraRunIdExport,
  shellFamilyFromPath,
} from './shellEnvStamp'

describe('shellFamilyFromPath', () => {
  it('detects cmd, powershell, bash', () => {
    expect(shellFamilyFromPath('C:\\Windows\\System32\\cmd.exe')).toBe('cmd')
    expect(shellFamilyFromPath('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe(
      'powershell',
    )
    expect(shellFamilyFromPath('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('powershell')
    expect(shellFamilyFromPath('/bin/zsh')).toBe('bash')
    expect(shellFamilyFromPath('/usr/bin/bash')).toBe('bash')
  })
})

describe('buildOrquestraRunIdExport', () => {
  it('uses cmd set syntax on win32 with cmd.exe (not $env)', () => {
    const line = buildOrquestraRunIdExport('run-abc', 'C:\\Windows\\System32\\cmd.exe', 'win32')
    expect(line).toContain('set "ORQUESTRA_RUN_ID=run-abc"')
    expect(line).not.toContain('$env:')
    expect(line).not.toContain('export ')
  })

  it('uses $env for powershell on win32', () => {
    const line = buildOrquestraRunIdExport(
      'run-xyz',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'win32',
    )
    expect(line).toContain("$env:ORQUESTRA_RUN_ID='run-xyz'")
    expect(line).not.toContain('set "')
  })

  it('uses export on posix', () => {
    const line = buildOrquestraRunIdExport('run-1', '/bin/zsh', 'darwin')
    expect(line).toBe("export ORQUESTRA_RUN_ID='run-1'\n")
  })

  it('sanitizes dangerous runId characters', () => {
    const line = buildOrquestraRunIdExport("run'; rm -rf /", 'cmd.exe', 'win32')
    expect(line).not.toContain(';')
    expect(line).toMatch(/ORQUESTRA_RUN_ID=run/)
  })
})

describe('buildMaestroArmSystemNote', () => {
  it('is clearly not a product request and forbids inventing work', () => {
    const note = buildMaestroArmSystemNote('run-abc123')
    expect(note).toContain('[ORQUESTRA SYSTEM')
    expect(note).toContain('run-abc123')
    expect(note).toMatch(/--run run-abc123/)
    expect(note).toMatch(/Do NOT recruit/i)
    expect(note).toMatch(/Waiting for your request/i)
    expect(note).not.toMatch(/^set /)
    expect(note).not.toContain('$env:')
    expect(note).not.toContain('export ORQUESTRA')
    // Mentions forbidden demo products only as "do not invent …"
    expect(note).toMatch(/Do NOT invent a calculator/i)
  })
})
