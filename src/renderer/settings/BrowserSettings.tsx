import { useSettingsStore } from '../stores/settingsStore'
import { useTranslation } from '../i18n/useTranslation'
import type { BrowserSearchEngine, TerminalLinkOpenTarget } from '../../shared/types'
import { SettingRow, TextInput, Select } from './SettingsComponents'

export function BrowserSettings() {
  const store = useSettingsStore()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-1">
      <SettingRow label={t('browser.homepage')}>
        <TextInput
          value={store.browserHomepage}
          onChange={(v) => store.setSetting('browserHomepage', v)}
          placeholder="about:blank"
        />
      </SettingRow>
      <SettingRow label={t('browser.searchEngine')}>
        <Select
          value={store.browserSearchEngine}
          onChange={(v) => store.setSetting('browserSearchEngine', v as BrowserSearchEngine)}
          options={[
            { value: 'google', label: 'Google' },
            { value: 'duckDuckGo', label: 'DuckDuckGo' },
            { value: 'bing', label: 'Bing' },
            { value: 'brave', label: 'Brave' },
          ]}
        />
      </SettingRow>
      <SettingRow
        label={t('browser.terminalLinkTarget')}
        description={t('browser.terminalLinkTarget.desc')}
      >
        <Select
          value={store.terminalLinkOpenTarget}
          onChange={(v) => store.setSetting('terminalLinkOpenTarget', v as TerminalLinkOpenTarget)}
          options={[
            { value: 'ask', label: 'Ask each time' },
            { value: 'canvas', label: 'On canvas' },
            { value: 'external', label: 'In system browser' },
          ]}
        />
      </SettingRow>
    </div>
  )
}
