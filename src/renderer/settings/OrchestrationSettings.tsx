import { useSettingsStore } from '../stores/settingsStore'
import { useTranslation } from '../i18n/useTranslation'
import { SettingRow, TextInput, NumberInput, Toggle, Select, SearchableBlock } from './SettingsComponents'
import {
  applyAgentPermissionFlags,
  bypassFlagsDescription,
  resolveWorkerAgentBaseCommand,
} from '../../shared/orchestration'
import type {
  OrchestrationContextPolicy,
  LinkedContextDefaultMode,
  OrchestrationMode,
  OrchestrationPermissionMode,
  OrchestrationReviewPolicy,
  OrchestrationTaskSplitStrategy,
  OrchestrationWorkerAgent,
  OrchestrationWorkerDoneAction,
  OrchestrationWorkerKind,
} from '../../shared/types'

function SectionLabel({ children }: { children: string }) {
  return (
    <SearchableBlock keywords={children}>
      <div className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {children}
      </div>
    </SearchableBlock>
  )
}

export function OrchestrationSettings() {
  const store = useSettingsStore()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted mb-3">
        {t('orchestration.intro')}
      </p>

      <SectionLabel>{t('orchestration.group.mode')}</SectionLabel>
      <SettingRow
        label={t('orchestration.mode')}
        description={t('orchestration.mode.desc')}
      >
        <Select
          value={store.orchestrationMode}
          onChange={(v) => store.setSetting('orchestrationMode', v as OrchestrationMode)}
          options={[
            { value: 'manual', label: t('orchestration.mode.manual') },
            { value: 'assisted', label: t('orchestration.mode.assisted') },
            { value: 'auto', label: t('orchestration.mode.auto') },
          ]}
        />
      </SettingRow>

      <SectionLabel>Linked context</SectionLabel>
      <SettingRow
        label="Default mode"
        description="Controls how much content linked arrows include by default."
      >
        <Select
          value={store.linkedContextDefaultMode}
          onChange={(v) => store.setSetting('linkedContextDefaultMode', v as LinkedContextDefaultMode)}
          options={[
            { value: 'path', label: 'Path only' },
            { value: 'summary', label: 'Context text' },
            { value: 'full', label: 'Full text' },
          ]}
        />
      </SettingRow>
      <SettingRow
        label="Max source bytes"
        description="Maximum text captured from each linked file, editor, document, or browser page."
      >
        <NumberInput
          value={store.linkedContextMaxFileBytes}
          onChange={(v) => store.setSetting('linkedContextMaxFileBytes', v)}
          min={1000}
          max={1000000}
          step={1000}
        />
      </SettingRow>
      <SettingRow
        label="Max bundle bytes"
        description="Target maximum size for generated linked-context bundles."
      >
        <NumberInput
          value={store.linkedContextMaxBundleBytes}
          onChange={(v) => store.setSetting('linkedContextMaxBundleBytes', v)}
          min={10000}
          max={2000000}
          step={10000}
        />
      </SettingRow>
      <SettingRow
        label="Browser screenshots"
        description="Capture a screenshot path for linked browser panels."
      >
        <Toggle
          checked={store.linkedContextIncludeBrowserScreenshots}
          onChange={(v) => store.setSetting('linkedContextIncludeBrowserScreenshots', v)}
        />
      </SettingRow>
      <SettingRow
        label="Redact secrets"
        description="Redact obvious tokens, passwords, and private keys from linked text."
      >
        <Toggle
          checked={store.linkedContextRedactSecrets}
          onChange={(v) => store.setSetting('linkedContextRedactSecrets', v)}
        />
      </SettingRow>

      <SectionLabel>{t('orchestration.group.workers')}</SectionLabel>
      <SettingRow
        label={t('orchestration.maxWorkers')}
        description={t('orchestration.maxWorkers.desc')}
      >
        <NumberInput
          value={store.orchestrationMaxWorkers}
          onChange={(v) => store.setSetting('orchestrationMaxWorkers', v)}
          min={1}
          max={16}
          step={1}
        />
      </SettingRow>
      <SettingRow
        label={t('orchestration.maxWorkerRoleChars')}
        description={t('orchestration.maxWorkerRoleChars.desc')}
      >
        <NumberInput
          value={store.orchestrationMaxWorkerRoleChars ?? 1000}
          onChange={(v) => {
            const n = Math.max(80, Math.min(4000, Math.floor(Number(v) || 1000)))
            store.setSetting('orchestrationMaxWorkerRoleChars', n)
          }}
          min={80}
          max={4000}
          step={20}
        />
      </SettingRow>
      <SettingRow
        label={t('orchestration.defaultWorkerKind')}
        description={t('orchestration.defaultWorkerKind.desc')}
      >
        <Select
          value={store.orchestrationDefaultWorkerKind}
          onChange={(v) => store.setSetting('orchestrationDefaultWorkerKind', v as OrchestrationWorkerKind)}
          options={[
            { value: 'terminal', label: t('orchestration.workerKind.terminal') },
            { value: 'agent', label: t('orchestration.workerKind.agent') },
          ]}
        />
      </SettingRow>
      <SettingRow
        label={t('orchestration.defaultWorkerAgent')}
        description={t('orchestration.defaultWorkerAgent.desc')}
      >
        <Select
          value={store.orchestrationDefaultWorkerAgent ?? 'verboo'}
          onChange={(v) => {
            const agent = v as OrchestrationWorkerAgent
            store.setSetting('orchestrationDefaultWorkerAgent', agent)
            // Keep free-text field in sync for presets so legacy readers stay consistent.
            if (agent !== 'custom') {
              const base = resolveWorkerAgentBaseCommand({
                orchestrationDefaultWorkerAgent: agent,
                orchestrationDefaultAgentCommand: store.orchestrationDefaultAgentCommand,
              })
              store.setSetting('orchestrationDefaultAgentCommand', base)
            }
          }}
          options={[
            { value: 'verboo', label: t('orchestration.workerAgent.verboo') },
            { value: 'claude', label: t('orchestration.workerAgent.claude') },
            { value: 'codex', label: t('orchestration.workerAgent.codex') },
            { value: 'opencode', label: t('orchestration.workerAgent.opencode') },
            { value: 'custom', label: t('orchestration.workerAgent.custom') },
          ]}
        />
      </SettingRow>
      {(store.orchestrationDefaultWorkerAgent ?? 'verboo') === 'custom' && (
        <SettingRow
          label={t('orchestration.defaultAgentCommand')}
          description={t('orchestration.defaultAgentCommand.desc')}
        >
          <TextInput
            value={store.orchestrationDefaultAgentCommand}
            onChange={(v) => store.setSetting('orchestrationDefaultAgentCommand', v)}
            placeholder="my-agent --flags"
          />
        </SettingRow>
      )}
      <SettingRow
        label={t('orchestration.effectiveAgentCommand')}
        description={t('orchestration.effectiveAgentCommand.desc')}
      >
        <code className="text-[11px] text-muted break-all max-w-[280px] text-right">
          {applyAgentPermissionFlags(
            resolveWorkerAgentBaseCommand({
              orchestrationDefaultWorkerAgent: store.orchestrationDefaultWorkerAgent,
              orchestrationDefaultAgentCommand: store.orchestrationDefaultAgentCommand,
            }),
            store.orchestrationPermissionMode ?? 'ask',
            store.orchestrationDefaultWorkerAgent ?? 'verboo',
          ) || '—'}
        </code>
      </SettingRow>
      <SettingRow
        label={t('orchestration.workerNamePrefix')}
        description={t('orchestration.workerNamePrefix.desc')}
      >
        <TextInput
          value={store.orchestrationWorkerNamePrefix}
          onChange={(v) => store.setSetting('orchestrationWorkerNamePrefix', v)}
          placeholder="worker"
        />
      </SettingRow>

      <SectionLabel>{t('orchestration.group.delegation')}</SectionLabel>
      <SettingRow
        label={t('orchestration.taskSplitStrategy')}
        description={t('orchestration.taskSplitStrategy.desc')}
      >
        <Select
          value={store.orchestrationTaskSplitStrategy}
          onChange={(v) => store.setSetting('orchestrationTaskSplitStrategy', v as OrchestrationTaskSplitStrategy)}
          options={[
            { value: 'auto', label: t('orchestration.taskSplit.auto') },
            { value: 'by-task', label: t('orchestration.taskSplit.byTask') },
            { value: 'by-file', label: t('orchestration.taskSplit.byFile') },
            { value: 'by-stage', label: t('orchestration.taskSplit.byStage') },
          ]}
        />
      </SettingRow>
      <SettingRow
        label={t('orchestration.contextPolicy')}
        description={t('orchestration.contextPolicy.desc')}
      >
        <Select
          value={store.orchestrationContextPolicy}
          onChange={(v) => store.setSetting('orchestrationContextPolicy', v as OrchestrationContextPolicy)}
          options={[
            { value: 'summary', label: t('orchestration.context.summary') },
            { value: 'relevant-files', label: t('orchestration.context.relevantFiles') },
            { value: 'full', label: t('orchestration.context.full') },
          ]}
        />
      </SettingRow>
      <SettingRow
        label={t('orchestration.reviewPolicy')}
        description={t('orchestration.reviewPolicy.desc')}
      >
        <Select
          value={store.orchestrationReviewPolicy}
          onChange={(v) => store.setSetting('orchestrationReviewPolicy', v as OrchestrationReviewPolicy)}
          options={[
            { value: 'never', label: t('orchestration.review.never') },
            { value: 'on-changes', label: t('orchestration.review.onChanges') },
            { value: 'always', label: t('orchestration.review.always') },
          ]}
        />
      </SettingRow>

      <SectionLabel>{t('orchestration.group.permissions')}</SectionLabel>
      <SettingRow
        label={t('orchestration.permissionMode')}
        description={
          t('orchestration.permissionMode.desc')
          + ' '
          + bypassFlagsDescription(store.orchestrationDefaultWorkerAgent ?? 'verboo')
        }
      >
        <Select
          value={store.orchestrationPermissionMode ?? 'ask'}
          onChange={(v) => store.setSetting('orchestrationPermissionMode', v as OrchestrationPermissionMode)}
          options={[
            { value: 'ask', label: t('orchestration.permissionMode.ask') },
            { value: 'bypass', label: t('orchestration.permissionMode.bypass') },
          ]}
        />
      </SettingRow>
      <SettingRow
        label={t('orchestration.allowFileEdits')}
        description={t('orchestration.allowFileEdits.desc')}
      >
        <Toggle
          checked={store.orchestrationAllowFileEdits}
          onChange={(v) => store.setSetting('orchestrationAllowFileEdits', v)}
        />
      </SettingRow>
      <SettingRow
        label={t('orchestration.allowCommands')}
        description={t('orchestration.allowCommands.desc')}
      >
        <Toggle
          checked={store.orchestrationAllowCommands}
          onChange={(v) => store.setSetting('orchestrationAllowCommands', v)}
        />
      </SettingRow>
      <SettingRow
        label={t('orchestration.allowNetwork')}
        description={t('orchestration.allowNetwork.desc')}
      >
        <Toggle
          checked={store.orchestrationAllowNetwork}
          onChange={(v) => store.setSetting('orchestrationAllowNetwork', v)}
        />
      </SettingRow>
      <SettingRow
        label={t('orchestration.allowNestedWorkers')}
        description={t('orchestration.allowNestedWorkers.desc')}
      >
        <Toggle
          checked={store.orchestrationAllowNestedWorkers}
          onChange={(v) => store.setSetting('orchestrationAllowNestedWorkers', v)}
        />
      </SettingRow>

      <SectionLabel>{t('orchestration.group.completion')}</SectionLabel>
      <SettingRow
        label={t('orchestration.onWorkerDone')}
        description={t('orchestration.onWorkerDone.desc')}
      >
        <Select
          value={
            store.orchestrationOnWorkerDone === 'hide'
              ? 'keep-open'
              : store.orchestrationOnWorkerDone
          }
          onChange={(v) => store.setSetting('orchestrationOnWorkerDone', v as OrchestrationWorkerDoneAction)}
          options={[
            { value: 'keep-open', label: t('orchestration.done.keepOpen') },
            // hide is unimplemented — omit from UI (KD9)
            { value: 'close-on-success', label: t('orchestration.done.closeOnSuccess') },
          ]}
        />
      </SettingRow>
    </div>
  )
}
