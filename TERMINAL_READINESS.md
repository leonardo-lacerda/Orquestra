# Auditoria de Readiness — Sistema de Terminais

**Data:** 2026-07-08
**Escopo:** Sistema completo (PTY → Main Process → Renderer → xterm.js + SSH/WSL remote)

---

## Resumo

| Classificação | Qtd | 
|-------------|-----|
| 🔴 Bloqueante para lançamento | 0 (✅ corrigidas) |
| 🟠 Alta prioridade | 8 |
| 🟡 Média prioridade | 14 |
| 🟢 Baixa / Sugestão | 12 |
| ✅ Pronto | 12 |

**Veredito final: ✅ Pronto para lançamento.** Nenhum bloqueante restante. As 8 altas são melhorias de resiliência que podem ser feitas pós-lançamento.

---

## 🔴 Bloqueantes — ✅ Ambos corrigidos (commit 64ae434)

### B1 — PTYs órfãos quando o renderer crasha (✅ CORRIGIDO)
`handleWindowClosedTerminalTransfers` agora limpa TODOS os terminais da janela fechada, não apenas os em transferência.

### B2 — Scrollback perdido no restart (✅ FALSO ALARME)
O scrollback sempre foi salvo com o `panel.id` (estável). Os nomes dos parâmetros (`ptyId`, `terminalId`) eram enganosos mas o fluxo estava correto. Renomeados para `saveKey` / `readKey`.

---

## 🟠 Alta Prioridade

### H1 — PTY output sem backpressure

**Onde:** `terminal.ts` (batchedDispatcher 16ms)
**Problema:** Dispatcher acumula output sem limite (`buffer += data`). Com `yes`/`dd`, o heap do main process pode crescer sem controle.
**Correção:** `MAX_DISPATCHER_BUFFER = 1MB`, descartar quando excedido.

### H2 — setInterval leak no TerminalLogger

**Onde:** `terminalLogger.ts`
**Problema:** Cada logger cria seu próprio `setInterval` a 250ms. 100 terminais = 100 timers.
**Correção:** Timer compartilhado para flush de todos os loggers.

### H3 — Race: PTY exit antes dos listeners

**Onde:** `terminalLifecycle.ts:338-381`
**Problema:** Entry registrado com ptyId='' antes do spawn assíncrono. Um `dispose()` concorrente pode causar double-dispose do xterm Terminal.
**Correção:** Registra listeners IPC antes de criar PTY; guard contra double-dispose.

### H4 — `cachedSpawn` race + falta notificação de pipe quebrado

**Onde:** `process.ts:122-124` / `terminal.ts:579-588`
**Problema:** Dois `create()` concorrentes podem ambos importar node-pty. Pipe write failure é silencioso.
**Correção:** Singleton no cachedSpawn; remover pipe quebrado automaticamente.

### H5 — LEAK-1: Module-level subscriptions acumulam no HMR

**Onde:** `terminalSettings.ts:160-212`
**Problema:** `window.addEventListener('focus'/'blur')` e Zustand subscriptions nunca são limpas. Acumulam em hot reload.
**Correção:** Registrar via lifecycle do React com cleanup.

### H6 — SSH: `ensureConnected()` não detecta conexão morta

**Onde:** `sshTransport.ts:66`
**Problema:** `if (this.conn) return` — se a conexão SSH caiu, `this.conn` ainda é non-null. Próximo `exec()` falha sem tentar reconectar.
**Correção:** Escutar evento `close` do ssh2 Client e nullar `this.conn`.

### H7 — Remote: sem reconnection mechanism

**Onde:** `runtimeManager.ts:448-452`
**Problema:** Quando SSH/WSL cai, o runtime emite `'disconnected'` sem tentar reconectar. Usuário perde todos os terminais e precisa clicar Retry.
**Correção:** Adicionar auto-reconnect com backoff para SSH/WSL.

### H8 — PERF-1: Triple forceWebglRepaint em cada attach

**Onde:** `terminalDom.ts:275-279`
**Problema:** Cada `attach()` faz 3 `forceWebglRepaint()` que iteram TODOS os terminais. Com 20 terminais e troca de tab, são 60 repaints.
**Correção:** Escopar repaint ao terminal que attachou.

---

## 🟡 Médias

| ID | Arquivo | Problema |
|----|---------|----------|
| M1 | `terminal.ts:731` | Truncation de scrollback quebra UTF-8 (corta no byte) |
| M2 | `terminal.ts:101-103` | Heartbeat desiste se scanActivity falha |
| M3 | `TerminalPanel.tsx:380-381` | Focus polling cria 80 timers por painel montado |
| M4 | `terminal.ts:422-426` | Transfer abort pode ler terminalOwners desatualizado |
| M5 | `terminal.ts:519-521` | cleanupTerminal itera Set enquanto deleta |
| M6 | `terminal.ts:480-495` | Duas janelas fechando simultaneamente — race |
| M7 | `captureAndSaveScrollback.ts:25` | Scrollback save falha silenciosamente |
| M8 | `terminalInput.ts:70-73` | Unhandled promise rejection no link handler |
| M9 | `terminalLifecycle.ts:515-520` | Uncanceled 150ms timeout sobrevive dispose |
| M10 | `terminalLifecycle.ts:355-357` | awaitWorkspaceSync stall bloqueia criação |
| M11 | `TerminalPanel.tsx:213-258` | runFit não verifica `cancelled` |
| M12 | `terminalSettings.ts:172-200` | Cada mudança de setting itera terminais independentemente |
| M13 | `sshTransport.ts:76` | Nenhum handler de erro para conexão SSH pós-connect |
| M14 | `terminalLifecycle.ts:399-408` | cleanupListeners não invocado em falha de criação |

---

## 🟢 Baixas / Sugestões

| ID | Arquivo | Problema |
|----|---------|----------|
| S1 | — | Worker heartbeat 60s — melhor notificar via evento de exit |
| S2 | `terminalLifecycle.ts:499-520` | Col-1 no SIGWINCH nudge pode ser 0 |
| S3 | — | Double-fork escapa SIGKILL no shutdown |
| S4 | — | Logs acumulam sem TTL |
| S5 | — | Sem teste de carga para 100 terminais |
| S6 | `registryState.ts:163-165` | entries() aloca array em cada chamada |
| S7 | `terminalFileLinkProvider.ts:28` | existsCache cresce sem limites |
| S8 | `terminalDom.ts:228-234` | Container zero-size — fit silenciosamente no-op |
| S9 | `wslTransport.ts:46-53` | wslSh() não distingue "não instalado" de "falhou" |
| S10 | `wslTransport.ts:60,68` | Erro ENOENT do wsl.exe propaga sem formatação |
| S11 | `RemoteRuntime.ts:74-78` | fire-and-forget .catch(noop) engole erros |
| S12 | `process.ts:122-124` | Race no cachedSpawn — dois imports concorrentes |

---

## ✅ O que está PRONTO (12 itens)

| Componente | Status |
|-----------|--------|
| Criação de PTY via node-pty | ✅ Estável |
| Output coalescing (16ms dispatcher) | ✅ Otimizado |
| Cross-window transfer com buffer 64KB | ✅ Funcional |
| Idle-suspend (SIGSTOP após 2min offscreen) | ✅ POSIX |
| Rotação de logs (2MB/terminal) | ✅ Funcional |
| Resize SIGWINCH com double-nudge | ✅ Funcional |
| Zoom render-scale discreto | ✅ Funcional |
| Mouse coordinate correction | ✅ Funcional |
| Instant-exit detection | ✅ Funcional |
| Pipe entre terminais (mesmo runtime) | ✅ Funcional |
| Maestro file polling com dedup | ✅ Funcional |
| Worker tracking com idle timeout 30s | ✅ Funcional |

---

## 🚀 Plano de Ação

### Antes do .exe (já corrigido)
- B1: Orphan PTYs cleanup ✅
- B2: Scrollback key naming ✅

### Primeira semana pós-lançamento
1. **H1** — Backpressure no dispatcher (~2h)
2. **H3** — Race create/dispose (~1h)
3. **H5** — LEAK-1 subscriptions no HMR (~1h)
4. **H8** — PERF-1 forceWebglRepaint (~2h)

### Segunda semana
5. **H2** — Timer compartilhado no logger (~3h)
6. **H6** — SSH stale connection detection (~2h)
7. **H7** — Auto-reconnect remoto (~4h)

### Terceira semana
8. **H4** — Pipe quebrado + notification (~1h)
9. **M1-M14** — Correções médias (~8h total)
10. **S1-S12** — Sugestões (~4h total)
