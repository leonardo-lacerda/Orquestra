import { useSettingsStore } from '../stores/settingsStore'
import { useTranslation } from '../i18n/useTranslation'
import { LANGUAGE_OPTIONS } from '../i18n/translations'
import { SettingRow, Select, Toggle, TextInput } from './SettingsComponents'

export function GeneralSettings() {
  const store = useSettingsStore()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-1">
      <SettingRow label={t('general.language')} description={t('general.language.desc')}>
        <Select
          value={store.language}
          onChange={(v) => store.setSetting('language', v)}
          options={LANGUAGE_OPTIONS}
        />
      </SettingRow>
      <SettingRow label={t('general.defaultShellPath')} description={t('general.defaultShellPath.desc')}>
        <TextInput value={store.defaultShellPath} onChange={(v) => store.setSetting('defaultShellPath', v)} placeholder={t('general.autoDetect')} />
      </SettingRow>
      <SettingRow label={t('general.warnBeforeQuit')} description={t('general.warnBeforeQuit.desc')}>
        <Toggle checked={store.warnBeforeQuit} onChange={(v) => store.setSetting('warnBeforeQuit', v)} />
      </SettingRow>
      <SettingRow
        label={t('general.privacy')}
        description={t('general.privacy.desc')}
      >
        <button
          type="button"
          onClick={() => window.electronAPI?.openExternalUrl('https://orquestra.cero-ai.com/privacy')}
          className="text-blue-400 hover:text-blue-300 text-[12px] font-medium whitespace-nowrap"
        >
          {t('general.privacyPolicy')}
        </button>
      </SettingRow>
    </div>
  )
}
