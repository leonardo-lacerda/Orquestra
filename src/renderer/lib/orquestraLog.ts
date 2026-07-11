// =============================================================================
// Quiet orchestrator console — one short line per lifecycle event.
// Intermediate noise (terminal ready, inject settle, pipes) stays off console.
// =============================================================================

const PREFIX = '[orquestra]'

/** Lifecycle / action the user should see while debugging a run. */
export function orq(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`${PREFIX} ${message}`)
}

/** Soft failures (reject, reuse miss) — still useful, not fatal. */
export function orqWarn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`${PREFIX} ${message}`)
}

/** Hard failures only. */
export function orqError(message: string): void {
  // eslint-disable-next-line no-console
  console.error(`${PREFIX} ${message}`)
}
