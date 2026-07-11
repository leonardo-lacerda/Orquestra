// =============================================================================
// Onboarding tour steps.
//
// `target` is a CSS selector for the element to spotlight; omit it for a
// centered card. Anchored steps gracefully fall back to centered if the target
// isn't currently on screen, so the tour never breaks on a hidden element.
// =============================================================================

import { t } from '../i18n/useTranslation'

export interface OnboardingStep {
  id: string
  title: string
  body: string
  /** CSS selector of the element to highlight. Omit for a centered card. */
  target?: string
  /** Optional keycap chips (e.g. ['\u2318', 'K']). */
  keys?: string[]
  /** Clip the spotlight to the visible canvas area (between the sidebars),
   *  not the full canvas element which extends edge-to-edge behind them. */
  clipToVisibleCanvas?: boolean
  /** Hug the target's edges exactly (no outward padding, outline inset inward).
   *  Use for large container targets (canvas, sidebar) where padding would
   *  overshoot the real boundary; small targets keep the breathing room. */
  tight?: boolean
  /** Force the \u2318K command palette open while this step is active (and close it
   *  again on leaving), so the step can spotlight the real palette. */
  openCommandPalette?: boolean
  /** Render the larger, image-topped "hero" card layout (used for the finale). */
  hero?: boolean
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'canvas',
    target: '[data-canvas-container]',
    clipToVisibleCanvas: true,
    tight: true,
    title: t('onboarding.step1Title'),
    body: t('onboarding.step1Body'),
  },
  {
    id: 'toolbar',
    // Prefer the first-run welcome launcher; fall back to the canvas toolbar
    // (which only appears once the canvas has panels, e.g. on replay).
    target: '[data-onboarding="welcome-actions"], [data-onboarding="toolbar"]',
    title: t('onboarding.step2Title'),
    body: t('onboarding.step2Body'),
  },
  {
    id: 'sidebar',
    target: '[data-app-sidebar="left"]',
    tight: true,
    title: t('onboarding.step3Title'),
    body: t('onboarding.step3Body'),
  },
  {
    id: 'palette',
    target: '[data-onboarding="command-palette"]',
    openCommandPalette: true,
    title: t('onboarding.step4Title'),
    body: t('onboarding.step4Body'),
    keys: ['\u2318', 'K'],
  },
  {
    id: 'maestro',
    // Centered: first-run may not have a terminal crown on screen yet.
    title: t('onboarding.step5Title'),
    body: t('onboarding.step5Body'),
  },
  {
    id: 'done',
    hero: true,
    title: t('onboarding.step6Title'),
    body: t('onboarding.step6Body'),
  },
]
