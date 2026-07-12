import { describe, expect, it } from 'vitest'
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  desktopSubscriptionDenialReason,
  isDesktopSubscriptionAuthorized,
  SUBSCRIPTION_INACTIVE_REASON,
} from './subscriptionAccess'

describe('isDesktopSubscriptionAuthorized', () => {
  it('allows active and trialing only', () => {
    expect(isDesktopSubscriptionAuthorized('active')).toBe(true)
    expect(isDesktopSubscriptionAuthorized('trialing')).toBe(true)
    expect(isDesktopSubscriptionAuthorized('ACTIVE')).toBe(true)
  })

  it('denies past_due, canceled, empty, null', () => {
    expect(isDesktopSubscriptionAuthorized('past_due')).toBe(false)
    expect(isDesktopSubscriptionAuthorized('canceled')).toBe(false)
    expect(isDesktopSubscriptionAuthorized('')).toBe(false)
    expect(isDesktopSubscriptionAuthorized(null)).toBe(false)
    expect(isDesktopSubscriptionAuthorized(undefined)).toBe(false)
  })

  it('ACTIVE_SUBSCRIPTION_STATUSES matches authorized set', () => {
    for (const s of ACTIVE_SUBSCRIPTION_STATUSES) {
      expect(isDesktopSubscriptionAuthorized(s)).toBe(true)
    }
  })
})

describe('desktopSubscriptionDenialReason', () => {
  it('returns undefined when authorized', () => {
    expect(desktopSubscriptionDenialReason('active')).toBeUndefined()
    expect(desktopSubscriptionDenialReason('trialing')).toBeUndefined()
  })

  it('returns honest Portuguese reason when not authorized', () => {
    expect(desktopSubscriptionDenialReason('past_due')).toBe(SUBSCRIPTION_INACTIVE_REASON)
    expect(desktopSubscriptionDenialReason(null)).toBe(SUBSCRIPTION_INACTIVE_REASON)
    expect(SUBSCRIPTION_INACTIVE_REASON).toMatch(/orquestra\.space/i)
  })
})
