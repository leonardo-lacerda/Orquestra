// =============================================================================
// One .gitignore for the whole .orquestra/ dir.
//
// Only workspace.json is meant to be shared/committed; everything else under
// .orquestra/ is machine-local — session.json, the *.tmp/*.bak atomic-write scratch
// files, the pi-agent dir (sessions + the auth.json copy), and worktrees. A
// single ignore-all-but-workspace rule covers all of it, so the subsystems that
// create .orquestra/ (project state, agent dir, worktrees) all funnel through here
// instead of dropping their own per-dir .gitignore.
// =============================================================================

import fsp from 'fs/promises'
import path from 'path'

/** The single ignore-all-but-workspace rule for `.orquestra/.gitignore`. Exported so
 *  the remote project-state path can write the same file on the runtime. */
export const ORQUESTRA_GITIGNORE_CONTENT = `# Orquestra project-local state. Only workspace.json is shared; everything else
# (session state, backups, the pi-agent dir, and worktrees) stays local.
*
!.gitignore
!workspace.json
`
const CONTENT = ORQUESTRA_GITIGNORE_CONTENT

/** Ensure <orquestraDir>/.gitignore exists. Best-effort and write-once: an existing
 *  file (e.g. one the user customised) is left untouched. */
export async function ensureOrquestraGitignore(orquestraDir: string): Promise<void> {
  try {
    await fsp.mkdir(orquestraDir, { recursive: true })
    await fsp.writeFile(path.join(orquestraDir, '.gitignore'), CONTENT, { flag: 'wx' })
  } catch {
    /* already exists, or dir not writable — nothing to do */
  }
}
