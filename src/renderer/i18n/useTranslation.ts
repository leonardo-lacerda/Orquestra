import { translations, type Language, type Translations } from './translations'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * Translation hook — reads language from settingsStore and returns the `t()`
 * function for looking up translated strings.
 *
 * Usage:
 *   const { t } = useTranslation()
 *   return <h1>{t('settings.title')}</h1>
 */
export function useTranslation(): { t: (key: keyof Translations) => string; lang: Language } {
  const lang = useSettingsStore((s) => s.language) as Language
  const t = (key: keyof Translations): string => {
    const dict = translations[lang] ?? translations.en
    return dict[key] ?? translations.en[key] ?? key
  }
  return { t, lang }
}

/**
 * Standalone translation function (non-hook) for use outside React components,
 * e.g. in zustand selectors or utility functions. Reads the store directly.
 */
export function t(key: keyof Translations): string {
  const lang = useSettingsStore.getState().language as Language
  const dict = translations[lang] ?? translations.en
  return dict[key] ?? translations.en[key] ?? key
}
