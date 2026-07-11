// =============================================================================
// Blackboard (SPEC + CONTRACTS) content builders for a run (pure strings).
// =============================================================================

import type { OrchestrationPlan } from './types'
import { DEFAULT_COMPLETION_TOKEN } from './types'

export function buildSpecMarkdown(plan: OrchestrationPlan): string {
  const lines = [
    `# Run specification`,
    '',
    `**Run id:** ${plan.id}`,
    `**Goal:** ${plan.goal}`,
    `**Created:** ${new Date(plan.createdAt).toISOString()}`,
    '',
    '## Tasks',
    '',
  ]
  for (const t of plan.tasks) {
    lines.push(`### \`${t.name}\``)
    lines.push(`- **id:** ${t.id}`)
    if (t.deps.length) lines.push(`- **depends on:** ${t.deps.join(', ')}`)
    lines.push(`- **role:** ${t.role}`)
    lines.push('')
  }
  lines.push('## Rules')
  lines.push('- Workers implement only their own task.')
  lines.push('- Shared contracts live in CONTRACTS.md — honor file names and interfaces there.')
  lines.push(`- When finished, print a short summary and \`${DEFAULT_COMPLETION_TOKEN}\` on its own line.`)
  lines.push('')
  return lines.join('\n')
}

export function buildContractsMarkdown(plan: OrchestrationPlan): string {
  const lines = [
    `# Shared contracts`,
    '',
    'Workers must agree on names and ownership so parallel work integrates cleanly.',
    '',
    '## Function ownership',
    '',
  ]
  for (const t of plan.tasks) {
    lines.push(`- **${t.name}** (\`${t.id}\`): ${t.role.slice(0, 120)}`)
  }
  lines.push('')
  lines.push('## Integration notes')
  lines.push('- Prefer explicit file paths and stable identifiers in each role.')
  lines.push('- Do not invent a second panel for a function that already exists — reassign instead.')
  lines.push('- After the run is consolidated, dismiss workers that are no longer needed.')
  lines.push('')
  return lines.join('\n')
}

export function buildRoleMarkdown(args: {
  functionName: string
  role: string
  plan?: OrchestrationPlan | null
  templateId?: string
}): string {
  const lines = [
    `# Worker function: ${args.functionName}`,
    '',
    args.templateId ? `**Template:** ${args.templateId}` : '',
    '',
    '## Your only job',
    args.role.trim(),
    '',
    '## Shared context',
    '- Read `../shared/SPEC.md` and `../shared/CONTRACTS.md` if present (under the run directory).',
    '',
    '## Rules',
    '- Start immediately. Use your tools to complete this job.',
    '- Do not wait for other workers. Do not recruit other workers.',
    '- Complete ONLY this function\'s deliverable.',
    '',
    '## When finished',
    `Print a short summary, then on its own line exactly: ${DEFAULT_COMPLETION_TOKEN}`,
    '',
  ].filter((l) => l !== undefined)
  return lines.join('\n')
}

export const ROLE_TEMPLATES: Record<
  string,
  { id: string; description: string; rolePrefix: string }
> = {
  'implement.file': {
    id: 'implement.file',
    description: 'Implement or edit specific files only',
    rolePrefix: 'Implement only the assigned files.',
  },
  'review.diff': {
    id: 'review.diff',
    description: 'Review outputs; do not re-implement everything',
    rolePrefix: 'Review worker outputs and list issues. Prefer not to rewrite all files.',
  },
  'test.unit': {
    id: 'test.unit',
    description: 'Add or run tests',
    rolePrefix: 'Add or run verification/tests for the change.',
  },
  'scout.repo': {
    id: 'scout.repo',
    description: 'Read-only exploration',
    rolePrefix: 'Scout the codebase; summarize relevant files; do not implement yet.',
  },
}

export function applyRoleTemplate(
  templateId: string,
  role: string,
): { role: string; templateId: string } {
  const t = ROLE_TEMPLATES[templateId]
  if (!t) return { role, templateId: templateId }
  const merged = `${t.rolePrefix} ${role}`.trim().slice(0, 220)
  return { role: merged, templateId: t.id }
}
