// =============================================================================
// subscriptionAccess — pure rules for desktop auth gate (no Supabase I/O).
// =============================================================================

/** Statuses that grant desktop access (must stay in sync with electronAuth fetch filter). */
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const

export type ActiveSubscriptionStatus = (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number]

export const SUBSCRIPTION_INACTIVE_REASON =
  'Sua assinatura não está ativa. Acesse orquestra.space para assinar.'

/**
 * True when a subscription status string is considered paid/trialing access.
 * past_due / canceled / null → not authorized for the desktop app.
 */
export function isDesktopSubscriptionAuthorized(
  status: string | null | undefined,
): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  return (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(s)
}

/**
 * Human-readable denial when the user is logged in but must not enter the app.
 * Returns undefined when authorized.
 */
export function desktopSubscriptionDenialReason(
  status: string | null | undefined,
): string | undefined {
  return isDesktopSubscriptionAuthorized(status)
    ? undefined
    : SUBSCRIPTION_INACTIVE_REASON
}
