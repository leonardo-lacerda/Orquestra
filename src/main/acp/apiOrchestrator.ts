// =============================================================================
// API Orchestrator — direct HTTP calls to AI APIs (OpenAI-compatible).
//
// Calls the API endpoint directly, gets a clean JSON response, and returns
// the assistant's text. No PTY, no CLI, no TUI noise.
// =============================================================================

import { ipcMain } from 'electron'
import { API_ORCHESTRATE } from '../../shared/ipc-channels'
import type { ApiOrchestratorConfig } from '../../shared/acp-types'
import log from '../logger'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Default system prompt for orchestration. */
function buildOrchestratorPrompt(workerCount: number): string {
  return `Você é um orquestrador. Você tem ${workerCount} workers disponíveis.

Quando o usuário pedir uma tarefa, divida em subtarefas e responda EXATAMENTE neste formato (uma linha por worker, sem texto extra):

[1]comando para o worker 1
[2]comando para o worker 2

IMPORTANTE: cada linha DEVE começar com [N] onde N é o número do worker.
Responda APENAS com os comandos, sem explicação, sem markdown, sem texto antes ou depois.
Cada comando deve ser algo que pode ser executado diretamente em um terminal (bash/cmd).`
}

/**
 * Call an OpenAI-compatible chat completions API and return the assistant's
 * response text. Works with Verboo, OpenAI, DeepSeek, or any compatible API.
 */
export async function callApi(
  config: ApiOrchestratorConfig,
  messages: ChatMessage[],
): Promise<string> {
  log.info('[api-orchestrator] POST %s model=%s', config.endpoint, config.model)

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown')
    throw new Error(`API ${response.status}: ${errorText.slice(0, 200)}`)
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = data.choices?.[0]?.message?.content || ''
  log.info('[api-orchestrator] response: %d chars', content.length)
  return content
}

export function registerApiOrchestratorHandlers(): void {
  ipcMain.handle(
    API_ORCHESTRATE,
    async (
      _event,
      config: ApiOrchestratorConfig,
      task: string,
      workerCount: number,
    ): Promise<string> => {
      const systemPrompt = config.systemPrompt || buildOrchestratorPrompt(workerCount)
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task },
      ]

      return callApi(config, messages)
    },
  )
}
