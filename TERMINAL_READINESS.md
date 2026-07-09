# Auditoria de Readiness — Sistema de Terminais

**Data:** 2026-07-08
**Escopo:** Sistema completo de terminais (PTY → Main Process → Renderer → xterm.js)

---

## Resumo

| Classificação | Qtd |
|-------------|-----|
| 🔴 Bloqueante para lançamento | 2 |
| 🟠 Alta prioridade | 5 |
| 🟡 Média prioridade | 6 |
| 🟢 Baixa / Sugestão | 5 |
| ✅ Pronto | 12 |

**Veredito:** 🟡 **Quase pronto** — 2 issues bloqueantes precisam ser corrigidas antes do .exe comercial.

---

## 🔴 Bloqueantes

### B1 — PTYs órfãos quando o renderer crasha

**Onde:** `src/main/ipc/terminal.ts`
**Tipo:** Resource Leak / Data Loss
**Severidade:** 🔴 Crítica

**Problema:**
Quando uma janela do renderer fecha inesperadamente (crash), `handleWindowClosedTerminalTransfers` só gerencia terminais que estão **em transferência entre janelas**. Terminais que pertencem à janela que crashou **continuam rodando** no daemon:

- `terminalOwners` ainda aponta para o windowId morto
- Output do PTY é enviado via `sendToWindow` para uma janela que não existe mais (silenciosamente descartado)
- Os PTYs consomem recursos (memória, processos) até o app ser fechado
- Sem notificação ao usuário

**Impacto:** Se o usuário tiver 10 terminais abertos e o renderer crashar, todos continuam rodando em background. O usuário abre o app de novo e vê terminais vazios (recriados via session restore), enquanto os antigos ainda rodam consumindo recursos.

**Correção:** No `handleWindowClosedTerminalTransfers`, também limpar terminais que pertencem à janela fechada:
```typescript
// After transfer cleanup, kill all terminals owned by this window
for (const [id, owner] of terminalOwners) {
  if (owner === windowId) {
    killTerminal(id)
  }
}
```

---

### B2 — Scrollback perdido no restart do app

**Onde:** `src/main/ipc/terminal.ts:736`
**Tipo:** Data Loss
**Severidade:** 🔴 Crítica

**Problema:**
O scrollback serializado é salvo em `<userData>/TerminalLogs/<ptyId>.scrollback`, mas o ptyId é **regenerado** a cada restart. Quando o app reinicia, o novo terminal lê `<novoPtyId>.scrollback` que não existe. O scrollback cai no fallback (raw TerminalLogs), que pode conter ANSI garbage ou ter sido rotacionado.

**Fluxo:**
1. App aberto → terminal com ptyId="pty-abc-123" → scrollback salvo em `pty-abc-123.scrollback`
2. App fecha e reabre → terminal recriado com ptyId="pty-def-456" → tenta ler `pty-def-456.scrollback` → não existe
3. Fallback: raw TerminalLogs de "pty-abc-123" → mas o TerminalLogger já foi limpo/disposed

**Correção:** Usar `panelId` (estável) em vez de `ptyId` (transiente) para nomear o arquivo de scrollback:
```typescript
const scrollbackFile = path.join(logDir, `${panelId}.scrollback`)
```
O `panelId` precisa ser passado da renderer para o handler de scrollback save.

---

## 🟠 Altas

### H1 — Sem backpressure no pipeline de output

**Onde:** `src/main/ipc/terminal.ts:553-558` (batchedDispatcher)
**Tipo:** Memory Leak sob estresse

**Problema:** O dispatcher de 16ms acumula output em uma string sem limite (`buffer += data`). Com comandos de alto throughput (`yes`, `dd`, `cat /dev/zero`), o buffer de heap do main process cresce sem controle. Não há mecanismo de flow control.

**Impacto:** Em condições extremas, o main process pode exaurir memória. Comandos `yes` rodando por 30s produzem ~2GB de output em Linux.

**Correção:** Adicionar `MAX_DISPATCHER_BUFFER` (ex: 1MB). Quando excedido, descartar dados mais antigos ou pausar o PTY (SIGSTOP).

---

### H2 — setInterval leak no TerminalLogger

**Onde:** `src/main/ipc/terminalLogger.ts`
**Tipo:** Resource Leak

**Problema:** Cada `TerminalLogger` cria seu próprio `setInterval` a cada 250ms. Se `removeLogger()` não for chamado (terminal órfão), o timer vaza. Isso também impede o Electron de fechar corretamente (`app.quit()` espera timers).

**Correção:** Usar um **timer compartilhado** para flush de todos os loggers, em vez de um timer por instância.

---

### H3 — Race: PTY exit antes dos listeners

**Onde:** `src/renderer/lib/terminal/terminalLifecycle.ts:342-366`
**Tipo:** Race Condition

**Problema:** `getOrCreate()` cria o PTY assincronamente. O listener IPC (`onTerminalData`, `onTerminalExit`) é registrado APÓS a criação do PTY. Se o PTY morre entre a criação e o registro do listener, o evento `TERMINAL_EXIT` chega ao renderer ANTES do listener estar pronto e é silenciosamente descartado.

**Correção:** Registrar os listeners IPC ANTES de criar o PTY (ou usar um buffer de eventos até os listeners estarem prontos).

---

### H4 — Pipe write failure é silencioso

**Onde:** `src/main/ipc/terminal.ts:579-588`
**Tipo:** UX Silenciosa

**Problema:** Quando um pipe target morre, `rt.process.write` lança erro que é silenciosamente capturado. O terminal fonte continua produzindo output que não vai pra lugar nenhum. Usuário não vê que o pipe quebrou.

**Correção:** Logar warning e, opcionalmente, remover o pipe quebrado automaticamente.

---

### H5 — Failures Map nunca é limpo

**Onde:** `src/renderer/lib/terminal/registryState.ts`
**Tipo:** Memory Leak

**Problema:** `failures` Map acumula entradas de painéis que foram dispostos enquanto em estado de erro. A menos que o painel seja recriado com sucesso, a entrada nunca é removida.

**Correção:** Limpar a entrada quando `dispose()` for chamado.

---

## 🟡 Médias

### M1 — Truncation de scrollback quebra UTF-8 e ANSI

**Onde:** `src/main/ipc/terminal.ts:731`
**Problema:** `content.slice(0, 10 * 1024 * 1024)` corta no byte, não no character. Pode quebrar um multi-byte UTF-8 ou ANSI escape sequence no meio.

**Correção:** Usar `Buffer.byteLength` para contagem e `Buffer.from(content).subarray(0, MAX)` para truncar com segurança.

### M2 — Heartbeat desiste após scanActivity falhar

**Onde:** `src/main/ipc/terminal.ts:101-103`
**Problema:** Se `scanActivity` lança (runtime gone), `return` silencioso. Workers mortos não são limpos até o próximo heartbeat (60s).

### M3 — Focus polling 80x25ms = 2s sem limite por painel

**Onde:** `src/renderer/panels/TerminalPanel.tsx:380-381`
**Problema:** Cada panel montado cria 80 timers de 25ms para detectar o elemento xterm. Com 20 painéis, são 1600 timers concorrentes.

### M4 — Transfer abort pode ler terminalOwners desatualizado

**Onde:** `src/main/ipc/terminal.ts:422-426`
**Problema:** Race entre transferências concorrentes — `terminalOwners.get(ptyId)` pode já ter sido atualizado por outra operação.

### M5 — cleanupTerminal itera Set modificando

**Onde:** `src/main/ipc/terminal.ts:519-521`
**Problema:** `for (const t of targets)` enquanto dá `targets.delete(t)` — comportamento indefinido por spec.

### M6 — Duas janelas fechando simultaneamente

**Onde:** `src/main/ipc/terminal.ts:480-495`
**Problema:** Se source e target fecham ao mesmo tempo, a ordem de `handleWindowClosedTerminalTransfers` pode causar abort/complete incorreto.

---

## 🟢 Baixas / Sugestões

### S1 — Worker heartbeat 60s em vez de verificação imediata

Quando um worker morre, leva até 60s para ser detectado. Ideal: notificação via evento de exit.

### S2 — Col-0 no SIGWINCH nudge

`Math.max(1, cols-1)` previne col-0, mas 1-col pode confundir programas.

### S3 — Double-fork escapa kill no shutdown

Processos que daemonizam (double-fork) escapam do `killAllGroups` (SIGKILL no group).

### S4 — Logs acumulam sem TTL

Arquivos .log e .prev.log acumulam até `pruneOrphaned()` ser chamado. Sempre.

### S5 — Sem teste para 100 terminais abertos

Não há teste de carga/stress no sistema de terminais.

---

## ✅ O que está PRONTO

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

## Plano de Ação

### Antes do .exe (corrigir B1 + B2)
1. **B1** — Limpar `terminalOwners` quando janela fecha (15 min)
2. **B2** — Usar `panelId` para scrollback files (15 min)

### Semana 1 pós-lançamento
3. **H1** — Limitar buffer do dispatcher (1h)
4. **H2** — Timer compartilhado no TerminalLogger (2h)
5. **H3** — Registrar listeners antes de criar PTY (1h)
6. **H5** — Limpar failures Map no dispose (15 min)

### Semana 2-3
7. **H4** — Notificar pipe quebrado (1h)
8. **M1-M6** — Correções médias (2h cada)
