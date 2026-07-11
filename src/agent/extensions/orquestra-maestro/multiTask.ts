// =============================================================================
// maestroMultiTask — detect when a user request must be orchestrated (not
// self-executed). Used by the orquestra-maestro Pi extension and unit tests.
// =============================================================================

/** File / stack tokens that usually mean separate deliverables. */
const FILE_OR_STACK_TOKENS = [
  'html', 'css', 'js', 'javascript', 'ts', 'typescript', 'tsx', 'jsx',
  'python', 'py', 'rust', 'go', 'java', 'kotlin',
  'react', 'vue', 'svelte', 'next',
  'api', 'backend', 'frontend', 'front-end', 'back-end',
  'dockerfile', 'docker-compose', 'sql', 'db', 'database',
  'scss', 'sass', 'tailwind',
]

const IMPLEMENTATION_VERBS = [
  'criar', 'crie', 'fazer', 'faça', 'desenvolver', 'desenvolva',
  'implementar', 'implemente', 'construir', 'construa',
  'gerar', 'gere', 'montar', 'monte', 'escrever', 'escreva',
  'adicionar', 'adicione', 'build', 'create', 'make', 'write',
  'implement', 'develop', 'generate', 'code', 'add', 'ship',
]

/**
 * True when the request looks like multi-part / multi-file work that Maestro
 * must orchestrate (never self-implement).
 */
export function hasMultipleTasks(text: string): boolean {
  const lower = text.toLowerCase().trim()
  if (!lower) return false

  // Explicit user demand
  if (/\b(orquestr|orchestrat|workers?|delegat|recrut)/i.test(lower)) return true

  // Numbered / bulleted lists
  if (/^\s*\d+[.)\]]|^\s*[-*]\s+/m.test(lower)) return true

  // "HTML + CSS + JS" / "html, css e js" / "a, b and c"
  const stackHits = FILE_OR_STACK_TOKENS.filter((t) => {
    const re = new RegExp(`(?:^|[^a-z])${t}(?:[^a-z]|$)`, 'i')
    return re.test(lower)
  })
  if (stackHits.length >= 2) return true

  // Multiple implementation verbs
  const words = lower.split(/[\s,;.()+\/\\]+/).filter(Boolean)
  let verbCount = 0
  for (const w of words) {
    if (IMPLEMENTATION_VERBS.includes(w)) verbCount++
  }
  if (verbCount >= 2) return true

  // One verb + "e"/"and" between noun-ish parts: "html e css", "page and api"
  if (verbCount >= 1 && /\b(e|and|&|\+)\b/.test(lower) && stackHits.length >= 1) {
    return true
  }

  // "X, Y e Z" with at least two commas or comma+e
  if (/,.+\be\b|,.+,/.test(lower) && verbCount >= 1) return true

  return false
}

/**
 * True for pure Q&A that Maestro may answer without workers.
 * Conservative: only short question-like text without implementation verbs.
 */
export function isPureQuestion(text: string): boolean {
  const t = text.trim()
  if (t.length > 200) return false
  if (hasMultipleTasks(t)) return false
  const lower = t.toLowerCase()
  const hasImplVerb = IMPLEMENTATION_VERBS.some((v) => new RegExp(`\\b${v}\\b`, 'i').test(lower))
  if (hasImplVerb) return false
  return /\?$|^(o que|what|who|when|where|why|how|qual|quem|quando|onde|por que|como)\b/i.test(lower)
}
