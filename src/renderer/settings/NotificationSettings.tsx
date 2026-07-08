import { useSettingsStore } from '../stores/settingsStore'
import { useTranslation } from '../i18n/useTranslation'
import { SettingRow, Toggle } from './SettingsComponents'

export function NotificationSettings() {
  const store = useSettingsStore()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-1">
      <SettingRow
        label={t('notifications.enabled')}
        description={t('notifications.enabled.desc')}
      >
        <Toggle
          checked={store.notificationsEnabled}
          onChange={(v) => store.setSetting('notificationsEnabled', v)}
        />
      </SettingRow>

      <SettingRow
        label={t('notifications.onlyWhenUnfocused')}
        description={t('notifications.onlyWhenUnfocused.desc')}
      >
        <Toggle
          checked={store.notifyOnlyWhenUnfocused}
          onChange={(v) => store.setSetting('notifyOnlyWhenUnfocused', v)}
        />
      </SettingRow>
    </div>
  )
}
