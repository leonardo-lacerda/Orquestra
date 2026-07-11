// =============================================================================
// WelcomeDialog — first-run welcome screen.
//
// Shown once on first run, before the guided tour. A simple welcome card with
// feature highlights and a Continue button that marks onboarding as started.
// =============================================================================

import { useState } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { useTranslation } from '../i18n/useTranslation'
import type { Translations } from '../i18n/translations'
import { OrquestraLogo } from '../ui/OrquestraLogo'
import headerImg from '../assets/welcome-header.jpg'
import { AnimatedDotGrid } from './AnimatedDotGrid'

export function WelcomeDialog() {
  const { t } = useTranslation()
  const loaded = useSettingsStore((s) => s._loaded)
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted)
  const setSetting = useSettingsStore((s) => s.setSetting)

  const [saving, setSaving] = useState(false)
  const [exiting, setExiting] = useState(false)

  if (!loaded || onboardingCompleted) return null

  const onContinue = (): void => {
    if (saving) return
    setSaving(true)
    setExiting(true)
    window.setTimeout(() => {
      setSetting('onboardingCompleted', true)
    }, 320)
  }

  // Opaque themed fill — the welcome is a takeover screen, not a modal over the
  // app, so the UI behind is hidden. bg-canvas-bg uses the active theme's canvas
  // color (default/basic theme on first start, the user's theme later), overlaid
  // with the canvas dot grid animated as soft waves (AnimatedDotGrid).
  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-canvas-bg transition-opacity duration-300 ease-out ${exiting ? 'opacity-0' : 'opacity-100'}`}
    >
      <AnimatedDotGrid className="absolute inset-0 w-full h-full pointer-events-none" />
      <div className={`relative z-10 w-[440px] max-w-[92vw] rounded-xl overflow-hidden border border-strong bg-surface-2/95 backdrop-blur-xl shadow-[0_24px_64px_rgba(0,0,0,0.55)] transition-all duration-300 ease-out ${exiting ? 'opacity-0 scale-[0.98] translate-y-1' : 'opacity-100 scale-100'}`}>
        {/* Moebius landscape header — slightly blurred and fading out, so it's
            only visible at the very top of the card. */}
        <img
          src={headerImg}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 w-full h-[240px] object-cover select-none"
          style={{
            filter: 'blur(2.5px)',
            opacity: 0.85,
            transform: 'scale(1.06)',
            // Softer, more gradual fade-out with extra stops so there's no hard edge.
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.72) 28%, rgba(0,0,0,0.42) 52%, rgba(0,0,0,0.16) 74%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.72) 28%, rgba(0,0,0,0.42) 52%, rgba(0,0,0,0.16) 74%, transparent 100%)',
          }}
        />

        {/* Header content over the image. */}
        <div className="relative flex flex-col items-center pt-9 pb-7">
          <div
            className="relative w-16 h-16 rounded-[18px] flex items-center justify-center"
            style={{
              // Subtle vertical bevel — lighter top, darker bottom.
              background: 'linear-gradient(180deg, #27272c 0%, #161619 100%)',
              boxShadow: '0 12px 30px rgba(0,0,0,0.5), inset 0 -1px 1px rgba(0,0,0,0.5)',
            }}
          >
            {/* macOS-style asymmetric highlight border: a 1px gradient ring that's
                brightest at the top-left and bottom-right corners and dimmer in
                between. The mask cuts out the centre so only the border shows. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[18px]"
              style={{
                padding: '1px',
                background:
                  'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.02) 42%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.48) 100%)',
                WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
              }}
            />
            <OrquestraLogo size={30} className="relative text-white" />
          </div>
          <h2 className="mt-5 text-primary text-[22px] font-bold tracking-tight [text-shadow:0_2px_12px_rgba(0,0,0,0.5)]">{t('welcome.welcomeTitle')}</h2>
          <p className="mt-1.5 px-10 text-center text-muted text-[12.5px] leading-relaxed">
            {t('welcome.welcomeDesc')}
          </p>
        </div>

        {/* Feature highlights */}
        <div className="relative px-6 pb-3 flex flex-col gap-2.5">
          {([
            ['featureTerminal', 'featureTerminalDesc'],
            ['featureEditor', 'featureEditorDesc'],
            ['featureBrowser', 'featureBrowserDesc'],
            ['featureAgent', 'featureAgentDesc'],
            ['featureCanvas', 'featureCanvasDesc'],
          ] as const).map(([titleKey, descKey]) => {
            const featureKeys: Record<string, keyof Translations> = {
              featureTerminal: 'welcome.featureTerminal',
              featureTerminalDesc: 'welcome.featureTerminalDesc',
              featureEditor: 'welcome.featureEditor',
              featureEditorDesc: 'welcome.featureEditorDesc',
              featureBrowser: 'welcome.featureBrowser',
              featureBrowserDesc: 'welcome.featureBrowserDesc',
              featureAgent: 'welcome.featureAgent',
              featureAgentDesc: 'welcome.featureAgentDesc',
              featureCanvas: 'welcome.featureCanvas',
              featureCanvasDesc: 'welcome.featureCanvasDesc',
            }
            return (
            <div key={titleKey} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
              <span className="text-blue-400 text-[13px] font-semibold leading-snug min-w-[72px]">{t(featureKeys[titleKey])}</span>
              <span className="text-secondary text-[12px] leading-snug">{t(featureKeys[descKey])}</span>
            </div>
            )
          })}
        </div>

        {/* Continue */}
        <div className="relative px-6 pb-6 flex flex-col gap-4">
          <button
            onClick={onContinue}
            disabled={saving}
            className="mt-1 h-10 rounded-lg bg-blue-500 text-white text-[13.5px] font-semibold hover:bg-blue-400 transition-colors disabled:opacity-50"
          >
            {saving ? t('welcome.saving') : t('welcome.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
