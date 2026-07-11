# AGENTS.md — contexto do projeto Orquestra

Instruções para qualquer agente de código (Claude, Codex, Grok, Cursor, etc.) trabalhando neste repositório.

Há também um **`CLAUDE.md`** com overview técnico curto (Electron/React/canvas). Este arquivo **complementa** e aprofunda, sobretudo o **orquestrador (Maestro)**. Em conflito de detalhes de orquestração, prefira este arquivo + o código em `src/shared/orchestration/` e `src/renderer/hooks/useOrquestra.ts`.

---

## 1. O que é o Orquestra

**Orquestra** é um IDE desktop (Electron + React + TypeScript) centrado num **canvas infinito** (estilo Figma/Miro), onde terminais, editores Monaco, browsers e agents flutuam como nós espaciais.

Não é “só um wrapper de terminal”. O diferencial de produto é **orquestração visual de agents**:

- O usuário arma a **coroa (crown)** num terminal → esse terminal vira **Maestro** (orquestrador).
- O Maestro **não implementa** o pedido do usuário; ele planeja tarefas, abre/reusa workers e espera resultados.
- Workers são outros terminais/agents no canvas, ligados por setas de orquestração.
- Tudo roda no **mesmo working tree** do projeto aberto (sem worktree obrigatório por Maestro).

Repo de app: raiz deste monólito (`package.json` na raiz, **electron-vite**).

```bash
npm install
npm run dev      # app com hot reload
npm run build
npm test         # Vitest (*.test.ts ao lado do código)
```

---

## 2. Mapa mental da arquitetura

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (React)                                        │
│  canvas + panels + Zustand + useOrquestra (recruit UI)   │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC (preload)
┌───────────────────────────▼─────────────────────────────┐
│  Main (Electron)                                         │
│  terminals (node-pty), FS, git, crown arm, result inject │
└───────────────────────────┬─────────────────────────────┘
                            │ command JSON + results
┌───────────────────────────▼─────────────────────────────┐
│  Workspace do usuário                                    │
│  .orquestra/runs/{runId}/…  + CLI orquestra.js           │
└─────────────────────────────────────────────────────────┘
```

| Camada | Path principal | Papel |
|--------|----------------|--------|
| Main | `src/main/` | Janelas, PTY, IPC, arm/disable crown, watch de commands, results |
| Preload | `src/preload/` | Bridge tipada renderer ↔ main |
| Renderer | `src/renderer/` | Canvas, panels, stores, hooks de orquestração |
| Shared | `src/shared/` | Types, IPC channels, **policy pura** de orquestração |
| Agent ext | `src/agent/extensions/orquestra-maestro/` | Tools do Maestro no agent embutido |
| CLI | `orquestra.js`, `scripts/maestro/orquestra.js` | recruit / wait / reassign / dismiss (copiada no arm) |

**Estado:** Zustand no renderer; persistência JSON em `userData` e em `<projeto>/.orquestra/`.

**Painéis detacháveis:** terminal, browser, editor, canvas, agent, document (`src/shared/panels.ts`). File tree e lista de projetos são **sidebar**, não painéis flutuantes.

---

## 3. Orquestrador (Maestro) — modelo de produto

### 3.1 Papéis

| Papel | O que é | O que **não** é |
|-------|---------|------------------|
| **Maestro** | Terminal com crown ativa; planeja e comanda workers | Implementador dos arquivos do usuário |
| **Worker** | Terminal/agent recrutado; executa um `--role` | Orquestrador (em geral não recruta nested) |
| **Run** | Instância de orquestra com `runId` estável | Branch/worktree git |
| **Slot** | Um panel worker vivo no **pool** | Uma subtarefa eternamente 1:1 com panel |
| **Task** | Item de backlog / fila (`name` + `role`) | Motivo automático para abrir PTY novo |

### 3.2 Fluxo feliz (um Maestro)

```
Usuário pede feature no terminal crown
        │
        ▼
Maestro: PLAN de TASKS (backlog ordenado)
        │
        ▼
Abre K slots (K = 1–2 em geral, teto maxWorkers=4)
        │
        ▼
loop:  wait → reassign próxima task no slot livre → …
        │
        ▼
Consolida resposta · dismiss slots se não precisar mais
```

**Regra de ouro:** *Workers são um pool pequeno reutilizável; trabalho é fila de tasks. Reassign é o default; recruit é raro; 5º terminal é bug.*

### 3.3 Pool + fila (dispatch atual)

Setting: `orchestrationDispatchMode` default **`pool_queue`**.

| Situação | Sistema faz |
|----------|-------------|
| Recruit com `--name` já aberto neste Maestro | **Reassign** no mesmo panel |
| Pool com vaga (`open + pending < maxWorkers`) | **Recruit** (novo panel) |
| Pool cheio + slot idle/done | **Reassign idle** (reusa PTY) |
| Pool cheio e todos busy | **Enqueue** em `runs/{runId}/queue.json` (não abre 5º) |
| Recruit name+role duplicado em ~2s | **Drop** (dedupe) |
| Worker `done`/`failed` + fila + auto-drain | **`claimHead` atômico** → reassign no slot livre |

- **Hard ceiling:** `orchestrationMaxWorkers` (default **4**).
- **Soft target nas instruções:** abrir **1–2** slots; max não é meta a encher.
- Anti-burst: reservas síncronas (`pendingReserves`) para N recruits no mesmo tick não passarem todos.
- Claim atômico: `claimHead` no coordinator (peek+dequeue no mesmo lock) — evita dois drains pegarem a mesma task.

Policy pura (testável, sem Electron):

- `src/shared/orchestration/poolQueuePolicy.ts` — `disposeRecruit`, fila, drain decision  
- `src/shared/orchestration/runQueueCoordinator.ts` — enqueue/claim serializados por chave  
- `src/shared/orchestration/multiMaestroPolicy.ts` — inject/cascade/comando por run  

Wire no UI:

- `src/renderer/hooks/useOrquestra.ts` — `onMaestroRecruit` / dismiss / reassign / status / drain  

Instruções injetadas no crown:

- `src/main/maestro/maestroInstructions.ts`  
- Extension: `src/agent/extensions/orquestra-maestro/index.ts`  

### 3.4 Multi-Maestro (várias crowns no mesmo projeto)

Setting: `orchestrationMultiMaestro` default **`true`**.

- **N Maestros** no mesmo canvas / mesmo tree são permitidos.
- Isolamento é de **control plane** (`runId` + PTY), **não** de filesystem (dois agents podem editar o mesmo arquivo — aceito).
- Cada run tem: crown, commands, results, workers/ROLE, **queue** próprios.
- Cascade/disable/inject de A **não** toca workers de B.
- `sanitizeMaestroFlags` com multi on **não** colapsa para 1 crown.
- Worktree por Maestro foi **rejeitado** como solução de produto.

Layout em disco (workspace do usuário):

```
.orquestra/
  registry.json                 # runs ativos
  runs/{runId}/
    crown.json
    commands/                   # cmd-*.json
    results/                    # worker-{name}.json
    workers/{name}/ROLE.md
    queue.json                  # backlog quando pool cheio
  # legado (single / migração): crown.json flat, .orquestra-commands/, etc.
```

CLI resolve run por `--run` / env `ORQUESTRA_RUN_ID` / registry de um único run.

### 3.5 Pipeline de um comando

```
Maestro agent / CLI
  → write .orquestra/runs/{runId}/commands/cmd-….json
  → main demux por run + disposition (maestroId/runId batem?)
  → IPC onMaestroRecruit | Dismiss | Reassign | …
  → useOrquestra: disposeRecruit / ownership / createTerminal|reassign
  → worker PTY + track + ROLE.md + inject task
  → result file + inject status de volta só no Maestro dono
```

Dismiss/reassign **só** resolvem panels no `namesMap` daquele Maestro (`resolveOwnedWorkerPanel`) — nunca por title global no workspace (evita roubar o `logger` do outro run).

### 3.6 Settings relevantes

| Key | Default | Significado |
|-----|---------|-------------|
| `orchestrationMaxWorkers` | `4` | Tamanho máximo do **pool** por run |
| `orchestrationDispatchMode` | `pool_queue` | Pool+fila (vs `legacy_function_panels`) |
| `orchestrationAutoDrainQueue` | `true` | Free slot puxa `claimHead` da fila |
| `orchestrationMultiMaestro` | `true` | N crowns no mesmo tree |
| `orchestrationDefaultWorkerAgent` | `verboo` (ou config) | CLI do worker |
| `orchestrationPermissionMode` | `ask` / `bypass` | Flags de permissão no launch |
| `orchestrationAllowNestedWorkers` | `false` | Worker não recruta worker |

Tipos/defaults: `src/shared/types.ts` (`DEFAULT_SETTINGS`). Schema de load: `src/main/settingsFile.ts`.

---

## 4. O que NÃO fazer ao mexer no orquestrador

1. **Não** voltar ao modelo “1 subtarefa = 1 terminal novo” nas instruções ou no recruit path.  
2. **Não** usar title global do workspace para reusar/dismiss workers de outro Maestro.  
3. **Não** escrever results/commands só no path flat legado se multi-run estiver ativo — namespacing por `runId`.  
4. **Não** fazer cascade cross-run no disable/takeover.  
5. **Não** confiar só em instruções de LLM para o teto do pool — o **enforcement** está em `disposeRecruit` + reserves + extension que ainda envia recruit (para enfileirar).  
6. **Não** reintroduzir `peek` + `dequeue` separados no auto-drain — use **`claimHead`**.  
7. **Não** usar worktree como “fix” de isolamento multi-Maestro (produto rejeitou).  
8. Mudanças grandes: preferir funções **puras** testáveis em `src/shared/orchestration/*` e handlers finos.

---

## 5. Onde mudar o quê (cheat sheet)

| Quero… | Comece em |
|--------|-----------|
| Regra de pool/fila/dedupe | `poolQueuePolicy.ts` + testes |
| Persistência serializada da fila | `runQueueCoordinator.ts` |
| Abrir/reusar panel no canvas | `useOrquestra.ts` |
| Armar/desarmar crown, inject, results | `src/main/ipc/terminal.ts` |
| Texto do system prompt do Maestro | `maestroInstructions.ts` + extension `index.ts` |
| Isolamento multi-run (cascade/inject/cmd) | `multiMaestroPolicy.ts` |
| Paths `.orquestra/runs/…` | `runFiles.ts` |
| CLI wait/recruit | `scripts/maestro/orquestra.js` (+ root `orquestra.js`) |
| UI max workers / orchestration | `OrchestrationSettings.tsx`, `MaestroSettingsPopover.tsx` |
| Planos de produto recentes | `docs/superpowers/plans/2026-07-11-multi-maestro-control-plane.md`, `…-maestro-pool-queue.md` |

---

## 6. Testes e verificação

- **Vitest** ao lado do código: `*.test.ts`.  
- Orquestração: `src/shared/orchestration/*.test.ts`, `useOrquestra.test.ts`, `multiMaestro.isolation.test.ts`, `maestroInstructions.test.ts`, extension tests.  
- CLI legado: `scripts/maestro/orquestra.test.js`.  
- E2E Playwright: `e2e/orchestration-*.spec.ts` (quando o harness de Electron estiver ok).  

Ao alterar policy de pool/fila/multi-run, rode pelo menos:

```bash
node node_modules/vitest/vitest.mjs run src/shared/orchestration src/renderer/hooks/useOrquestra.test.ts src/main/maestro/maestroInstructions.test.ts
```

(PowerShell pode bloquear `npx`; usar `node node_modules/vitest/vitest.mjs` como acima.)

Critério de sucesso de produto (dogfood):

- Prompt detalhado com maxWorkers=4 → **≤4** panels de worker.  
- Duas crowns no mesmo projeto → recruits/dismiss/inject **não** se cruzam.  
- Overflow → `Queued "…"` e depois drain no slot livre.

---

## 7. Canvas e app (resumo para não se perder)

- Coordenadas canvas ↔ view: `src/renderer/lib/canvas/coordinates.ts`.  
- Nós: `CanvasNode.tsx` (drag, resize, crown toggle no terminal).  
- Stores: `canvasStore`, `appStore`, `settingsStore`, `orchestrationRunStore`.  
- Sessão do projeto: `<project>/.orquestra/workspace.json`, `session.json`.  
- Credenciais AI globais: `userData/pi-agent/`, espelhadas em `.orquestra/pi-agent/`.

---

## 8. Estilo de contribuição neste repo

- Mudanças **cirúrgicas**; não refatorar o canvas inteiro “de passagem”.  
- Preferir pure functions + testes que importam o **código shipado** (sem reimplementar a policy no teste).  
- Não commitar segredos; não editar `.orquestra` de projetos de usuário como se fosse código do app.  
- Docs de plano longos vivem em `docs/superpowers/plans/` — atualize status quando implementar de verdade.  
- Skill local de qualidade (quando disponível): `.claude/skills/karpathy-guidelines`.

---

## 9. Glossário rápido

| Termo | Significado |
|-------|-------------|
| Crown / coroa | Flag `panel.maestro` + arm no main; terminal vira Maestro |
| `runId` | UUID da orquestra naquele arm; chave de disco e wait |
| `maestroId` | PTY id do terminal Maestro (pode rebind no mesmo run) |
| Recruit | Pedido de worker (pode virar reassign/enqueue) |
| Reassign | Nova task no **mesmo** panel/PTY |
| Dismiss | Fecha/solta worker **deste** Maestro |
| Pool | Conjunto de slots ≤ maxWorkers |
| Queue | Tasks esperando slot (`queue.json` + coordinator) |
| Inject | Escrever no PTY do Maestro ou worker (status/task) |
| Control plane | Commands/results/cascade/inject — isolado por run, não por git |

---

## 10. One-liners para o agente

- **Orquestra** = canvas IDE + **Maestro** que orquestra workers de verdade.  
- **Maestro orquestra; workers implementam.**  
- **Pool ≤ 4, prefer 1–2; fila o resto; reassign > recruit.**  
- **Multi-Maestro = N runs no mesmo tree; sem roubar worker do vizinho.**  
- **Policy em `shared/orchestration`; UI em `useOrquestra`; main em `terminal.ts`.**

Se for implementar feature de orquestração: leia o plano em `docs/superpowers/plans/` correspondente, implemente enforcement no shared, wire fino no renderer/main, e cubra com Vitest no path real.
