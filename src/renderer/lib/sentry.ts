// =============================================================================
// Sentry renderer init — attaches to the main-process Sentry instance via the
// @sentry/electron IPC bridge. No-op when DSN is unset.
// =============================================================================

import * as Sentry from '@sentry/electron/renderer'

declare const __SENTRY_DSN__: string

let initialized = false

export function initRendererSentry(): void {
  if (initialized) return
  // Keep this in lockstep with main/sentry.ts. In dev without a DSN the main
  // SDK intentionally does not initialize, which means its sentry-ipc protocol
  // is not registered. Initializing only the renderer in that state makes every
  // captured interaction issue a failing fetch to sentry-ipc.
  if (typeof __SENTRY_DSN__ !== 'string' || !__SENTRY_DSN__) return

  // The renderer SDK reads release/environment and scope options from main.
  Sentry.init({})
  initialized = true
}

/** Capture a caught exception (e.g. from a React error boundary). Best-effort;
 *  no-ops if Sentry never initialized. Optional context is attached as extra. */
export function captureRendererException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined)
  } catch {
    /* best-effort */
  }
}
