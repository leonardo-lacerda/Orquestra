# HTTP API Orchestrator — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace ACP agent-based orchestration with direct HTTP API calls. The orchestrator calls an OpenAI-compatible API (Verboo, Claude, etc.) directly, parses structured responses, and injects clean commands into worker terminals.

**Architecture:** 
```
User → OrchestrationPanel → HTTP POST → AI API → JSON response
                                                  ↓
                                          Parse [1]/[2] markers
                                                  ↓
                                    Inject commands into worker terminals (writeTerminal)
```

**Why:** No CLI dependency, no PTY scraping, no ACP needed. Clean structured responses via HTTP. Works with any OpenAI-compatible API.

---

## Files to modify

| File | Change |
|------|--------|
| `src/main/acp/apiOrchestrator.ts` | **Create** — HTTP client for AI API calls |
| `src/main/ipc/acp.ts` | **Modify** — Add IPC for API orchestrator |
| `src/shared/ipc-channels.ts` | **Modify** — Add API orchestrator channels |
| `src/shared/acp-types.ts` | **Modify** — Add API config types |
| `src/preload/index.ts` | **Modify** — Add API orchestrator bridge |
| `src/shared/electron-api.d.ts` | **Modify** — Add API orchestrator types |
| `src/renderer/stores/acpStore.ts` | **Modify** — Add orchestrator state |
| `src/renderer/panels/OrchestrationPanel.tsx` | **Modify** — HTTP orchestrator mode |

---

## Task 1: API Orchestrator types and IPC channels

**Objective:** Define the API config and add IPC channels for the HTTP orchestrator.

**Step 1:** Add types to `src/shared/acp-types.ts`:
```typescript
/** Config for calling an AI API directly (no CLI needed). */
export interface ApiOrchestratorConfig {
  /** API endpoint URL (e.g., 'https://code.verboo.ai/router/v1/chat/completions') */
  endpoint: string
  /** API key for authentication */
  apiKey: string
  /** Model name (e.g., 'pro/deepseek-v4-flash') */
  model: string
  /** Optional system prompt prefix */
  systemPrompt?: string
}
```

**Step 2:** Add IPC channels to `src/shared/ipc-channels.ts`:
```typescript
// API Orchestrator — direct HTTP calls to AI APIs
export const API_ORCHESTRATE = 'api:orchestrate'  // renderer -> main
```

**Step 3:** Verify typecheck passes.

---

## Task 2: API Orchestrator main process handler

**Objective:** Create the HTTP client that calls the AI API and returns the response.

**Create:** `src/main/acp/apiOrchestrator.ts`

```typescript
import { ipcMain } from 'electron'
import { API_ORCHESTRATE } from '../../shared/ipc-channels'
import type { ApiOrchestratorConfig } from '../../shared/acp-types'
import log from '../logger'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Call an OpenAI-compatible API and return the assistant's response text.
 */
export async function callApi(
  config: ApiOrchestratorConfig,
  messages: ChatMessage[],
): Promise<string> {
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
    const error = await response.text()
    throw new Error(`API error ${response.status}: ${error}`)
  }

  const data = await response.json() as any
  return data.choices?.[0]?.message?.content || ''
}

export function registerApiOrchestratorHandlers(): void {
  ipcMain.handle(
    API_ORCHESTRATE,
    async (_event, config: ApiOrchestratorConfig, task: string, workerCount: number): Promise<string> => {
      const systemPrompt = config.systemPrompt || buildOrchestratorPrompt(workerCount)
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task },
      ]

      log.info('[api-orchestrator] calling %s with %d workers', config.endpoint, workerCount)
      const response = await callApi(config, messages)
      log.info('[api-orchestrator] response: %d chars', response.length)
      return response
    },
  )
}

function buildOrchestratorPrompt(workerCount: number): string {
  return `Você é um orquestrador. Você tem ${workerCount} workers disponíveis.

Quando o usuário pedir uma tarefa, divida em subtarefas e responda EXATAMENTE neste formato (uma linha por worker, sem texto extra):

[1]comando para o worker 1
[2]comando para o worker 2

IMPORTANTE: cada linha DEVE começar com [N] onde N é o número do worker.
Responda APENAS com os comandos, sem explicação, sem markdown, sem texto antes ou depois.`
}
```

**Step 2:** Register in `src/main/index.ts`:
```typescript
import { registerApiOrchestratorHandlers } from './acp/apiOrchestrator'
// ... in init:
registerApiOrchestratorHandlers()
```

---

## Task 3: Preload bridge and types

**Objective:** Expose the API orchestrator to the renderer.

**Step 1:** Add to preload:
```typescript
apiOrchestrate: makeInvoker<'apiOrchestrate'>(API_ORCHESTRATE),
```

**Step 2:** Add to electron-api.d.ts:
```typescript
apiOrchestrate(config: ApiOrchestratorConfig, task: string, workerCount: number): Promise<string>
```

---

## Task 4: Update OrchestrationPanel for API mode

**Objective:** The panel uses HTTP API calls instead of ACP agents for orchestration.

The panel changes:
- Add "API Config" section (endpoint, API key, model)
- "Orquestrar" mode calls the API directly instead of spawning ACP agents
- Workers are plain terminal panels (not ACP sessions)
- Response is parsed for [N] markers and injected into workers via writeTerminal

**Key flow:**
1. User configures API (endpoint, key, model) — persisted in settings
2. User adds worker terminals (plain bash/cmd terminals on the canvas)
3. User types task in OrchestrationPanel
4. Panel calls `apiOrchestrate(config, task, workerCount)`
5. Response arrives, parse [N] markers
6. For each marker, find the corresponding worker terminal
7. Send the command to the worker via `window.electronAPI.terminalWrite(ptyId, command)`

---

## Verification

After each task:
```bash
npm run typecheck
npm test
```

End-to-end test:
1. `npm run dev`
2. Open OrchestrationPanel, configure API (Verboo endpoint + key)
3. Open 2 terminal panels as workers
4. Type task in OrchestrationPanel
5. Verify API is called, response is parsed, commands are injected into workers
6. Verify workers show clean output (no ANSI, no escape codes)
