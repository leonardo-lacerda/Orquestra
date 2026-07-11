// =============================================================================
// Maestro crown popover — full orchestrator controls, compact and sectioned.
// Runtime status (workers, workspace) + all orchestration AppSettings.
// =============================================================================

import React from 'react'
import { createPortal } from 'react-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
import { useTranslation } from '../i18n/useTranslation'
import {
  applyAgentPermissionFlags,
  resolveWorkerAgentBaseCommand,
} from '../../shared/orchestration'
import type {
  OrchestrationContextPolicy,
  OrchestrationMode,
  OrchestrationPermissionMode,
  OrchestrationReviewPolicy,
  OrchestrationTaskSplitStrategy,
  OrchestrationWorkerAgent,
  OrchestrationWorkerDoneAction,
  OrchestrationWorkerKind,
} from '../../shared/types'

const selectStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  background: 'var(--surface-1, #12121a)',
  border: '1px solid var(--border, #444)',
  borderRadius: 5,
  color: 'inherit',
  fontSize: 11,
  padding: '4px 6px',
}

const inputStyle: React.CSSProperties = {
  ...selectStyle,
  textAlign: 'right',
}

const toggleBtn = (on: boolean): React.CSSProperties => ({
  minWidth: 40,
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid var(--border, #444)',
  background: on ? 'rgba(168, 85, 247, 0.25)' : 'var(--surface-1, #12121a)',
  color: on ? '#e9d5ff' : 'var(--text-muted, #999)',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
})

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted, #888)',
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: '1px solid var(--border, #333)',
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '100px 1fr',
        gap: 8,
        alignItems: 'center',
      }}
      title={hint}
    >
      <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.3 }}>{label}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}

export interface MaestroSettingsPopoverProps {
  anchor: { top: number; right: number } | null
  maestroEnabled: boolean
  maestroPaused?: boolean
  maestroError?: string | null
  workspacePath?: string
  activeWorkers: number
  workers: Array<{ panelId: string; name: string; role: string; status: string }>
  onFocusWorker: (panelId: string) => void
  onDisable: () => void
  onClose: () => void
}

export function MaestroSettingsPopover({
  anchor,
  maestroEnabled,
  maestroPaused,
  maestroError,
  workspacePath,
  activeWorkers,
  workers,
  onFocusWorker,
  onDisable,
  onClose,
}: MaestroSettingsPopoverProps) {
  const { t } = useTranslation()
  const setSetting = useSettingsStore((s) => s.setSetting)

  const mode = useSettingsStore((s) => s.orchestrationMode)
  const maxWorkers = useSettingsStore((s) => s.orchestrationMaxWorkers)
  const workerKind = useSettingsStore((s) => s.orchestrationDefaultWorkerKind)
  const workerAgent = useSettingsStore((s) => s.orchestrationDefaultWorkerAgent) ?? 'verboo'
  const agentCommand = useSettingsStore((s) => s.orchestrationDefaultAgentCommand)
  const workerPrefix = useSettingsStore((s) => s.orchestrationWorkerNamePrefix)
  const permissionMode = useSettingsStore((s) => s.orchestrationPermissionMode) ?? 'ask'
  const allowFileEdits = useSettingsStore((s) => s.orchestrationAllowFileEdits)
  const allowCommands = useSettingsStore((s) => s.orchestrationAllowCommands)
  const allowNetwork = useSettingsStore((s) => s.orchestrationAllowNetwork)
  const allowNested = useSettingsStore((s) => s.orchestrationAllowNestedWorkers)
  const taskSplit = useSettingsStore((s) => s.orchestrationTaskSplitStrategy)
  const contextPolicy = useSettingsStore((s) => s.orchestrationContextPolicy)
  const reviewPolicy = useSettingsStore((s) => s.orchestrationReviewPolicy)
  const onWorkerDone = useSettingsStore((s) => s.orchestrationOnWorkerDone)

  if (!anchor) return null

  const statusColor = (status: string) => {
    if (status === 'running' || status === 'recruiting') return '#22c55e'
    if (status === 'done') return '#3b82f6'
    if (status === 'failed') return '#ef4444'
    return '#666'
  }
  const statusLabel = maestroError
    ? 'Error'
    : maestroPaused
      ? 'Paused'
      : maestroEnabled
        ? 'Active'
        : 'Inactive'
  const statusDot = maestroError
    ? '#ef4444'
    : maestroPaused
      ? '#a78bfa'
      : maestroEnabled
        ? '#22c55e'
        : '#666'

  const launchCmd = applyAgentPermissionFlags(
    resolveWorkerAgentBaseCommand({
      orchestrationDefaultWorkerAgent: workerAgent,
      orchestrationDefaultAgentCommand: agentCommand,
    }),
    permissionMode,
    workerAgent,
  )

  const doneValue =
    onWorkerDone === 'hide' ? 'keep-open' : onWorkerDone

  return createPortal(
    <div
      data-maestro-settings-popover
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: Math.min(anchor.top, Math.max(8, window.innerHeight - 520)),
        right: anchor.right,
        background: 'var(--surface-2, #1e1e2e)',
        border: '1px solid var(--border, #333)',
        borderRadius: 10,
        padding: '10px 12px 12px',
        zIndex: 100000,
        width: 340,
        maxHeight: 'min(78vh, 640px)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12,
        lineHeight: 1.45,
        color: 'var(--text, #ccc)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 700, color: '#A855F7', fontSize: 13 }}>
          Maestro
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusDot,
              display: 'inline-block',
            }}
          />
          <span style={{ opacity: 0.9 }}>{statusLabel}</span>
          <span style={{ opacity: 0.45 }}>·</span>
          <span style={{ opacity: 0.75 }}>
            {activeWorkers}/{maxWorkers}
          </span>
        </div>
      </div>

      {(maestroError || maestroPaused || (maestroEnabled && !maestroPaused)) && (
        <div
          style={{
            fontSize: 10,
            marginBottom: 8,
            padding: '6px 8px',
            borderRadius: 6,
            background: maestroError
              ? 'rgba(239,68,68,0.12)'
              : 'rgba(168,85,247,0.08)',
            color: maestroError ? '#fca5a5' : 'var(--text-muted, #aaa)',
            flexShrink: 0,
          }}
        >
          {maestroError
            ? maestroError
            : maestroPaused
              ? 'Terminal exited — restart shell to re-arm Maestro.'
              : 'Start the agent after enabling Maestro so it loads CLAUDE.local.md.'}
        </div>
      )}

      {/* Scrollable settings body */}
      <div
        style={{
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
          paddingRight: 2,
          marginRight: -2,
        }}
      >
        <Section title={t('orchestration.group.mode')}>
          <Row label={t('orchestration.mode')} hint={t('orchestration.mode.desc')}>
            <select
              data-maestro-mode
              value={mode}
              onChange={(e) => setSetting('orchestrationMode', e.target.value as OrchestrationMode)}
              style={selectStyle}
            >
              <option value="manual">{t('orchestration.mode.manual')}</option>
              <option value="assisted">{t('orchestration.mode.assisted')}</option>
              <option value="auto">{t('orchestration.mode.auto')}</option>
            </select>
          </Row>
        </Section>

        <Section title={t('orchestration.group.workers')}>
          <Row label={t('orchestration.maxWorkers')} hint={t('orchestration.maxWorkers.desc')}>
            <input
              data-maestro-max-workers
              type="number"
              min={1}
              max={16}
              value={maxWorkers}
              onChange={(e) => {
                const n = Math.max(1, Math.min(16, Math.floor(Number(e.target.value) || 1)))
                setSetting('orchestrationMaxWorkers', n)
              }}
              style={inputStyle}
            />
          </Row>
          <Row label={t('orchestration.defaultWorkerKind')} hint={t('orchestration.defaultWorkerKind.desc')}>
            <select
              data-maestro-worker-kind
              value={workerKind}
              onChange={(e) =>
                setSetting('orchestrationDefaultWorkerKind', e.target.value as OrchestrationWorkerKind)
              }
              style={selectStyle}
            >
              <option value="terminal">{t('orchestration.workerKind.terminal')}</option>
              <option value="agent">{t('orchestration.workerKind.agent')}</option>
            </select>
          </Row>
          <Row label={t('orchestration.defaultWorkerAgent')} hint={t('orchestration.defaultWorkerAgent.desc')}>
            <select
              data-maestro-worker-agent
              value={workerAgent}
              onChange={(e) => {
                const agent = e.target.value as OrchestrationWorkerAgent
                setSetting('orchestrationDefaultWorkerAgent', agent)
                if (agent !== 'custom') {
                  setSetting(
                    'orchestrationDefaultAgentCommand',
                    resolveWorkerAgentBaseCommand({
                      orchestrationDefaultWorkerAgent: agent,
                      orchestrationDefaultAgentCommand: agentCommand,
                    }),
                  )
                }
              }}
              style={selectStyle}
            >
              <option value="verboo">{t('orchestration.workerAgent.verboo')}</option>
              <option value="claude">{t('orchestration.workerAgent.claude')}</option>
              <option value="codex">{t('orchestration.workerAgent.codex')}</option>
              <option value="opencode">{t('orchestration.workerAgent.opencode')}</option>
              <option value="custom">{t('orchestration.workerAgent.custom')}</option>
            </select>
          </Row>
          {workerAgent === 'custom' && (
            <Row label={t('orchestration.defaultAgentCommand')} hint={t('orchestration.defaultAgentCommand.desc')}>
              <input
                data-maestro-custom-cmd
                type="text"
                value={agentCommand}
                onChange={(e) => setSetting('orchestrationDefaultAgentCommand', e.target.value)}
                placeholder="my-agent --flags"
                style={inputStyle}
              />
            </Row>
          )}
          <Row label={t('orchestration.workerNamePrefix')} hint={t('orchestration.workerNamePrefix.desc')}>
            <input
              data-maestro-name-prefix
              type="text"
              value={workerPrefix}
              onChange={(e) => setSetting('orchestrationWorkerNamePrefix', e.target.value)}
              placeholder="worker"
              style={inputStyle}
            />
          </Row>
          <Row label={t('orchestration.effectiveAgentCommand')} hint={t('orchestration.effectiveAgentCommand.desc')}>
            <div
              data-maestro-launch-cmd
              title={launchCmd}
              style={{
                fontSize: 10,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                wordBreak: 'break-all',
                textAlign: 'right',
                padding: '4px 6px',
                borderRadius: 5,
                background: 'var(--surface-1, #12121a)',
                border: '1px solid var(--border, #333)',
                color: permissionMode === 'bypass' ? '#86efac' : 'inherit',
              }}
            >
              {launchCmd || '—'}
            </div>
          </Row>
        </Section>

        <Section title={t('orchestration.group.permissions')}>
          <Row label={t('orchestration.permissionMode')} hint={t('orchestration.permissionMode.desc')}>
            <select
              data-maestro-permission-mode
              value={permissionMode}
              onChange={(e) =>
                setSetting('orchestrationPermissionMode', e.target.value as OrchestrationPermissionMode)
              }
              style={selectStyle}
            >
              <option value="ask">{t('orchestration.permissionMode.ask')}</option>
              <option value="bypass">{t('orchestration.permissionMode.bypass')}</option>
            </select>
          </Row>
          <Row label={t('orchestration.allowFileEdits')} hint={t('orchestration.allowFileEdits.desc')}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={toggleBtn(allowFileEdits)}
                onClick={() => setSetting('orchestrationAllowFileEdits', !allowFileEdits)}
              >
                {allowFileEdits ? 'ON' : 'OFF'}
              </button>
            </div>
          </Row>
          <Row label={t('orchestration.allowCommands')} hint={t('orchestration.allowCommands.desc')}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={toggleBtn(allowCommands)}
                onClick={() => setSetting('orchestrationAllowCommands', !allowCommands)}
              >
                {allowCommands ? 'ON' : 'OFF'}
              </button>
            </div>
          </Row>
          <Row label={t('orchestration.allowNetwork')} hint={t('orchestration.allowNetwork.desc')}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={toggleBtn(allowNetwork)}
                onClick={() => setSetting('orchestrationAllowNetwork', !allowNetwork)}
              >
                {allowNetwork ? 'ON' : 'OFF'}
              </button>
            </div>
          </Row>
          <Row label={t('orchestration.allowNestedWorkers')} hint={t('orchestration.allowNestedWorkers.desc')}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={toggleBtn(allowNested)}
                onClick={() => setSetting('orchestrationAllowNestedWorkers', !allowNested)}
              >
                {allowNested ? 'ON' : 'OFF'}
              </button>
            </div>
          </Row>
        </Section>

        <Section title={t('orchestration.group.delegation')}>
          <Row label={t('orchestration.taskSplitStrategy')} hint={t('orchestration.taskSplitStrategy.desc')}>
            <select
              data-maestro-task-split
              value={taskSplit}
              onChange={(e) =>
                setSetting('orchestrationTaskSplitStrategy', e.target.value as OrchestrationTaskSplitStrategy)
              }
              style={selectStyle}
            >
              <option value="auto">{t('orchestration.taskSplit.auto')}</option>
              <option value="by-task">{t('orchestration.taskSplit.byTask')}</option>
              <option value="by-file">{t('orchestration.taskSplit.byFile')}</option>
              <option value="by-stage">{t('orchestration.taskSplit.byStage')}</option>
            </select>
          </Row>
          <Row label={t('orchestration.contextPolicy')} hint={t('orchestration.contextPolicy.desc')}>
            <select
              data-maestro-context-policy
              value={contextPolicy}
              onChange={(e) =>
                setSetting('orchestrationContextPolicy', e.target.value as OrchestrationContextPolicy)
              }
              style={selectStyle}
            >
              <option value="summary">{t('orchestration.context.summary')}</option>
              <option value="relevant-files">{t('orchestration.context.relevantFiles')}</option>
              <option value="full">{t('orchestration.context.full')}</option>
            </select>
          </Row>
          <Row label={t('orchestration.reviewPolicy')} hint={t('orchestration.reviewPolicy.desc')}>
            <select
              data-maestro-review-policy
              value={reviewPolicy}
              onChange={(e) =>
                setSetting('orchestrationReviewPolicy', e.target.value as OrchestrationReviewPolicy)
              }
              style={selectStyle}
            >
              <option value="never">{t('orchestration.review.never')}</option>
              <option value="on-changes">{t('orchestration.review.onChanges')}</option>
              <option value="always">{t('orchestration.review.always')}</option>
            </select>
          </Row>
        </Section>

        <Section title={t('orchestration.group.completion')}>
          <Row label={t('orchestration.onWorkerDone')} hint={t('orchestration.onWorkerDone.desc')}>
            <select
              data-maestro-on-done
              value={doneValue}
              onChange={(e) =>
                setSetting('orchestrationOnWorkerDone', e.target.value as OrchestrationWorkerDoneAction)
              }
              style={selectStyle}
            >
              <option value="keep-open">{t('orchestration.done.keepOpen')}</option>
              <option value="close-on-success">{t('orchestration.done.closeOnSuccess')}</option>
            </select>
          </Row>
        </Section>

        {workers.length > 0 && (
          <Section title="Active run">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
              {workers.map((w) => (
                <button
                  key={w.panelId}
                  type="button"
                  onClick={() => onFocusWorker(w.panelId)}
                  title={w.role || w.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: '3px 0',
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: statusColor(w.status),
                    }}
                  />
                  <span style={{ fontWeight: 600, flexShrink: 0 }}>{w.name}</span>
                  <span
                    style={{
                      opacity: 0.55,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {w.status}
                    {w.role ? ` · ${w.role.slice(0, 36)}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {workspacePath && (
          <Section title="Workspace">
            <div style={{ fontSize: 10, wordBreak: 'break-all', opacity: 0.75 }}>{workspacePath}</div>
          </Section>
        )}
      </div>

      {/* Footer actions */}
      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--border, #333)',
          paddingTop: 8,
          marginTop: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <button
          type="button"
          onClick={() => {
            useUIStore.getState().openSettings('orchestration')
            onClose()
          }}
          className="w-full h-7 px-2 rounded-md border border-subtle text-left text-[12px] text-secondary hover:text-primary hover:bg-hover transition-colors"
        >
          Open full Orquestra Settings
        </button>
        <button
          type="button"
          onClick={() => {
            onDisable()
            onClose()
          }}
          className="w-full h-7 px-2 rounded-md border border-subtle text-left text-[12px] text-secondary hover:text-primary hover:bg-hover transition-colors"
        >
          Disable Maestro
        </button>
        <div style={{ opacity: 0.45, fontSize: 10, lineHeight: 1.35 }}>
          Launch/bypass apply on the next worker recruit. Policy toggles guide prompts (not a hard sandbox).
        </div>
      </div>
    </div>,
    document.body,
  )
}
