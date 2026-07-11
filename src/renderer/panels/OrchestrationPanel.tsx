// =============================================================================
// Orchestration Panel — AI API-based orchestration.
//
// Calls an OpenAI-compatible API directly (no CLI, no PTY, no ACP).
// Parses [N] markers from the response and injects commands into
// worker terminals on the canvas.
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAcpStore } from '../stores/acpStore'
import { useAppStore } from '../stores/appStore'
import { terminalRegistry } from '../lib/terminal/terminalRegistry'
import type { ApiOrchestratorConfig } from '../../shared/acp-types'
import { useTranslation } from '../i18n/useTranslation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkerTask {
  workerIndex: number
  command: string
}

interface WorkerTerminal {
  panelId: string
  title: string
  ptyId: string | null
}

const WORKER_RE = /^\[(\d)\]\s*(.+)/m

function parseWorkerCommands(text: string): WorkerTask[] {
  const tasks: WorkerTask[] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(WORKER_RE)
    if (match) {
      tasks.push({ workerIndex: parseInt(match[1], 10), command: match[2].trim() })
    }
  }
  return tasks
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ApiOrchestratorConfig = {
  endpoint: 'https://code.verboo.ai/router/v1/chat/completions',
  apiKey: '',
  model: 'deepseek-v4-flash',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const WorkerBadge: React.FC<{ terminal: WorkerTerminal; index: number }> = ({ terminal, index }) => (
  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--surface-1)] text-xs">
    <span className="text-blue-400 font-bold">W{index}</span>
    <span className="text-[var(--text-muted)] truncate max-w-32">{terminal.title}</span>
    {terminal.ptyId
      ? <span className="w-2 h-2 rounded-full bg-green-500" />
      : <span className="w-2 h-2 rounded-full bg-red-500" />
    }
  </div>
)

const LogLine: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-xs font-mono text-[var(--text-muted)] leading-tight">{text}</div>
)

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

const OrchestrationPanel: React.FC<{ panelId: string }> = () => {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [config, setConfig] = useState<ApiOrchestratorConfig>(DEFAULT_CONFIG)
  const [showConfig, setShowConfig] = useState(false)
  const [workers, setWorkers] = useState<WorkerTerminal[]>([])
  const [log, setLog] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Discover terminal panels in the workspace
  const refreshWorkers = useCallback(() => {
    const ws = useAppStore.getState().workspaces[0]
    if (!ws) return
    const terminals: WorkerTerminal[] = []
    for (const panel of Object.values(ws.panels)) {
      if (panel.type === 'terminal') {
        const ptyId = terminalRegistry.ptyIdForPanel(panel.id)
        terminals.push({ panelId: panel.id, title: panel.title, ptyId })
      }
    }
    setWorkers(terminals)
  }, [])

  useEffect(() => { refreshWorkers() }, [refreshWorkers])

  // Auto-scroll log
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  // --- Orchestrate ---

  const handleOrchestrate = useCallback(async () => {
    if (!input.trim() || workers.length === 0 || !config.apiKey || !window.electronAPI) return
    setIsRunning(true)
    setLog((l) => [...l, `→ ${input}`])

    try {
      // Call the AI API
      const response = await window.electronAPI.apiOrchestrate(config, input, workers.length)
      setLog((l) => [...l, `← ${response.slice(0, 200)}${response.length > 200 ? '...' : ''}`])

      // Parse [N] markers
      const tasks = parseWorkerCommands(response)
      if (tasks.length === 0) {
        setLog((l) => [...l, t('orchestration.noCommandsFound')])
        setIsRunning(false)
        return
      }

      setLog((l) => [...l, `  ${tasks.length} comandos parseados`])

      // Inject commands into worker terminals
      for (const task of tasks) {
        const worker = workers[task.workerIndex - 1]
        if (!worker?.ptyId) {
          setLog((l) => [...l, t('orchestration.workerNotFound').replace('{index}', String(task.workerIndex))])
          continue
        }
        // Send command + Enter to the terminal
        await window.electronAPI.terminalWrite(worker.ptyId, task.command + '\r')
        setLog((l) => [...l, `  ✓ Worker ${task.workerIndex} (${worker.title}): ${task.command.slice(0, 60)}`])
      }
    } catch (err) {
      setLog((l) => [...l, `✗ Erro: ${err}`])
    }

    setIsRunning(false)
    setInput('')
  }, [input, workers, config])

  return (
    <div className="flex flex-col h-full bg-[var(--surface-0)] text-[var(--text)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <span className="text-sm font-medium">{t('orchestration.panelTitle')}</span>
        <span className="text-xs text-[var(--text-muted)]">{workers.length} workers</span>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          ⚙️ Config
        </button>
        <button
          onClick={refreshWorkers}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
          title="Refresh workers"
        >
          🔄
        </button>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="px-3 py-2 border-b border-[var(--border)] space-y-1.5">
          <div className="flex gap-1.5 items-center">
            <label className="text-xs text-[var(--text-muted)] w-16">Endpoint</label>
            <input
              value={config.endpoint}
              onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
              className="flex-1 bg-[var(--surface-1)] text-xs px-2 py-1 rounded border border-[var(--border)] outline-none"
            />
          </div>
          <div className="flex gap-1.5 items-center">
            <label className="text-xs text-[var(--text-muted)] w-16">API Key</label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="sk-..."
              className="flex-1 bg-[var(--surface-1)] text-xs px-2 py-1 rounded border border-[var(--border)] outline-none"
            />
          </div>
          <div className="flex gap-1.5 items-center">
            <label className="text-xs text-[var(--text-muted)] w-16">Model</label>
            <input
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              className="flex-1 bg-[var(--surface-1)] text-xs px-2 py-1 rounded border border-[var(--border)] outline-none"
            />
          </div>
        </div>
      )}

      {/* Workers */}
      <div className="flex flex-wrap gap-1.5 px-3 py-1.5 border-b border-[var(--border)]">
        {workers.length === 0 ? (
          <span className="text-xs text-[var(--text-muted)]">
            {t('orchestration.noTerminals')}
          </span>
        ) : (
          workers.map((w, i) => <WorkerBadge key={w.panelId} terminal={w} index={i + 1} />)
        )}
      </div>

      {/* Log */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {log.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] text-sm">
            <p className="mb-2">{t('orchestration.describeTask')}</p>
            <p className="text-xs">{t('orchestration.aiGenerateInfo')}</p>
          </div>
        ) : (
          log.map((line, i) => <LogLine key={i} text={line} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-[var(--border)]">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isRunning && handleOrchestrate()}
            placeholder={t('orchestration.taskPlaceholder')}
            className="flex-1 bg-[var(--surface-1)] text-sm px-3 py-2 rounded border border-[var(--border)] outline-none"
            disabled={isRunning || workers.length === 0 || !config.apiKey}
          />
          <button
            onClick={handleOrchestrate}
            disabled={isRunning || !input.trim() || workers.length === 0 || !config.apiKey}
            className="px-3 py-2 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed rounded"
          >
            {isRunning ? '⏳' : '🎯'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default OrchestrationPanel
