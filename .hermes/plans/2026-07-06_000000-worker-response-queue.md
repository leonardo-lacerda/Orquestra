# Worker Response Queue — Implementation Plan

**Goal:** Workers report completion summaries back to the orchestrator via a queue, so the orchestrator knows what each worker did and can coordinate next steps.

## Architecture

```
Worker 1 (idle/exit) → Main Process detects → Enqueue summary
Worker 2 (idle/exit) → Main Process detects → Enqueue summary
Worker 3 (idle/exit) → Main Process detects → Enqueue summary
                                                    ↓
                                            Response Queue (FIFO)
                                                    ↓
                                    Orchestrator terminal receives summaries
                                    one at a time, with context
```

## Prompt Origin Markers

Every injected prompt must have a prefix so the AI knows who sent it:

| Prefix | Meaning | Example |
|--------|---------|---------|
| `[HUMANO]` | Real user typing | _(no prefix — natural input)_ |
| `[ORQUESTRADOR→WORKER]` | Task from orchestrator to worker | `[ORQUESTRADOR→WORKER] Sua tarefa: Criar landing page...` |
| `[WORKER→ORQUESTRADOR]` | Report from worker to orchestrator | `[WORKER→ORQUESTRADOR] Worker "landing" concluído: ...` |
| `[SISTEMA]` | System notification (skill, config) | `[SISTEMA] Você é um Maestro. Comandos: ...` |

### Why markers matter

Without markers, the AI treats all input as user input. With markers:
- **Worker** knows it received a task from the orchestrator, not a human → follows instructions strictly
- **Orchestrator** knows a worker finished → processes the report, doesn't confuse with user input
- **Both** can prioritize: system messages < orchestrator commands < human overrides

## How it works

### 1. Completion Detection (Main Process)

Monitor each recruited worker's PTY output. Two triggers:

- **Process exit:** Worker's shell process terminates → capture last 50 lines of output
- **Idle timeout:** No output for 30 seconds after agent was active → capture last 20 lines

When triggered:
1. Strip ANSI codes from captured output
2. Extract meaningful summary (last few lines of agent response)
3. Create a `WorkerResponse` object:
   ```typescript
   {
     workerName: string      // "landing-page"
     workerRole: string      // "Criar landing page HTML"
     status: 'completed' | 'idle'
     summary: string         // last N lines of output, cleaned
     timestamp: number
   }
   ```
4. Push to the response queue

### 2. Response Queue (Main Process)

A FIFO queue per orchestrator terminal:

```typescript
const responseQueues: Map<string, WorkerResponse[]> = new Map()
// Key: orchestrator ptyId
```

When a response is enqueued:
1. Check if the orchestrator terminal is idle (no output for 3+ seconds)
2. If idle → inject the next response immediately
3. If busy → wait for idle, then inject

Injection format (written to orchestrator's stdin):
```
[WORKER→ORQUESTRADOR] Worker "landing-page" concluído:
→ Landing page HTML criada com tema dark, seções hero/features/CTA
→ Arquivo: index.html
```

### 3. Skill Injection Updates

#### For Workers (orquestra-skill.md)
Add instruction at the end of their task:
```
[ORQUESTRADOR→WORKER] Sua tarefa: Criar landing page HTML...
Ao concluir, imprima um resumo:
✓ [nome-do-arquivo]: o que foi feito
```

The `[ORQUESTRADOR→WORKER]` prefix tells the AI this is a delegated task.

#### For Orchestrator
Add instruction about receiving worker updates:
```
[SISTEMA] Quando um worker terminar, você receberá uma mensagem com prefixo [WORKER→ORQUESTRADOR].
Aguarde todos os workers antes de responder ao usuário.
Se um worker falhar, recrute um replacement ou ajuste o plano.
```

### 4. Integration with Existing System

The flow becomes:
1. Orchestrator runs `node orquestra.js recruit --role "..." --name w1`
2. Main process creates terminal, starts agent, sends role with `[ORQUESTRADOR→WORKER]` prefix
3. Agent works on the task
4. When agent finishes (idle 30s or exit):
   - Main process captures output
   - Enqueues response
   - Injects summary into orchestrator with `[WORKER→ORQUESTRADOR]` prefix
5. Orchestrator reads summary, decides next steps
6. After all workers report, orchestrator summarizes for user

## Files to modify

| File | Change |
|------|--------|
| `src/main/ipc/terminal.ts` | Add idle detection, output capture, queue, injection |
| `scripts/maestro/orquestra-skill.md` | Add summary instruction for workers |
| `src/renderer/hooks/useOrquestra.ts` | Track worker → orchestrator mapping, add markers to prompts |

## Implementation order

1. **Worker → orchestrator mapping** — track which worker belongs to which orchestrator
2. **Idle detection** — monitor PTY output, detect when agent finishes
3. **Output capture** — buffer last N lines per worker
4. **Response queue** — FIFO per orchestrator, inject when idle
5. **Skill update** — tell workers to print summary on completion
6. **Add origin markers** — all injected prompts get `[ORQUESTRADOR→WORKER]` or `[WORKER→ORQUESTRADOR]` prefix
