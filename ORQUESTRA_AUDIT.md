# Auditoria do Sistema de Orquestração (Maestro/Worker)

**Data:** 2026-07-08
**Escopo:** Sistema completo: Maestro Extension, Worker Tracking, Comando Dispatch, Canvas Integration

## Arquitetura Geral

```
AI Agent (pi-coding-agent)
  └── Maestro Extension ──escreve──► .orquestra-commands/*.json
                                         │
                                    fs.watch (main process)
                                         │
                                    IPC sendToWindow
                                         │
                              ┌──────────┴──────────┐
                              │                     │
                     useOrquestra hook         Cria terminais
                     (renderer)                no canvas
                              │
                              └── ORQUESTRA_TRACK_WORKER
                                         │
                              Worker Tracking (main)
                              ├── feedWorkerOutput (onData)
                              ├── onWorkerExit
                              ├── onWorkerIdle (30s timeout)
                              └── enqueueResponse → writeTerminal
```

---

## 🔴 Falhas Críticas

### 1. Comandos via arquivo não são confiáveis

**Onde:** `terminal.ts:79-116` (startOrquestraWatcher)
**Problema:** `fs.watch` é notoriamente não confiável — no Windows dispara múltiplos eventos para o mesmo arquivo, no macOS com certos editores perde eventos. Isso causa:
- Comandos processados duas vezes (recruit duplicado)
- Comandos perdidos sem notificação

**Cenário:** Maestro recruta 3 workers. `fs.watch` no Windows dispara 2 eventos para cada arquivo. 3 workers viram 6.

**Prova:** O `fs.watch` usa `fs.unlinkSync(filePath)` logo após processar (linha 112). Se um segundo evento chegar antes do `unlinkSync`, o mesmo arquivo é processado de novo.

### 2. Sem deduplicação de comandos

**Onde:** `terminal.ts:85-113`
**Problema:** Cada arquivo de comando tem nome único baseado em timestamp + random (`cmd-${Date.now()}-${random}.json`). Não há ID de comando no payload para detectar duplicatas.

### 3. Sem cleanup de comandos órfãos na inicialização

**Onde:** `terminal.ts:79-81`
**Problema:** Na inicialização, o watcher não limpa arquivos `.json` antigos em `.orquestra-commands/`. Se o app crashar após o maestro escrever o comando mas antes de processar, o comando fica órfão para sempre.

---

## 🟠 Problemas Altos

### 4. Hardcoded 8s delay no envio do papel ao worker

**Onde:** `useOrquestra.ts:88-96`
```ts
setTimeout(() => {
  const markedRole = '[ORQUESTRADOR→WORKER] ' + args.role
  window.electronAPI?.terminalWrite?.(ptyId, markedRole + cr)
}, 8000)
```
O worker recebe a tarefa **exatamente 8 segundos depois** de criado. Na prática:
- Agentes rápidos (DeepSeek, Claude) podem já estar processando outra coisa
- Agentes lentos (modelos grandes) podem nem ter inicializado ainda
- Em canvas lentos (muitos nós), 8s pode ser insuficiente

### 5. Polling infinito no startAgent

**Onde:** `useOrquestra.ts:67-73`
```ts
const startAgent = () => {
  const ptyId = terminalRegistry.ptyIdForPanel(panelId!)
  if (!ptyId) {
    setTimeout(startAgent, 500)  // ← infinito
    return
  }
```
Se um terminal nunca inicializar (bug, deadlock), o polling roda pra sempre. Sem limite de tentativas.

### 6. Workers órfãos quando orquestrador morre

**Onde:** `terminal.ts:236,256`
**Problema:** Quando um orquestrador terminal é fechado, os workers associados continuam rodando e sendo trackeados. Não há cascading cleanup.

**Cenário:** Usuário fecha terminal do Maestro. Workers continuam rodando em background para sempre, acumulando output no buffer.

### 7. responseQueues sem limite de crescimento

**Onde:** `terminal.ts:261-268`
**Problema:** Se workers completam mais rápido que o orquestrador consome, a fila cresce sem limites. Cada entrada contém output buffer inteiro.

### 8. writeTerminal sem verificação de existência

**Onde:** `terminal.ts:281`
```ts
writeTerminal(orchestratorId, message + cr)
```
Se o terminal do orquestrador já foi fechado quando um worker completa, `writeTerminal` pode lançar erro não tratado.

---

## 🟡 Problemas Médios

### 9. Heurística de auto-dispatch frágil

**Onde:** `orquestra-maestro/index.ts:23-70`
- Score de 7 padrões: verbos, conjunções, listas, quantidade, file patterns
- `hasPluralNouns` inclui "arquivos", "files", "páginas", "pages", "telas", "screens"...
- Isso significa que "Criar páginas de login" (uma única tarefa) dispara auto-dispatch
- Enquanto "Build a REST API with authentication and database schema" (múltiplas tarefas, em inglês) pode não disparar

### 10. List command mostra todos os terminais, não só workers

**Onde:** `useOrquestra.ts:138-147`
```ts
const terminals = Object.values(ws.panels)
  .filter((p) => p.type === 'terminal' || p.type === 'agent')
```
O comando `list` retorna todos os painéis terminais/agent no workspace, não apenas os workers trackeados. Inclui o próprio maestro.

### 11. Posicionamento assume recruitCount do mesmo maestro

**Onde:** `useOrquestra.ts:36`
```ts
const position: Point = { x: 0, y: 420 * (count + 1) }
```
- Todos os workers empilhados em x=0
- Se múltiplos maestros recrutam, o count mistura
- No canvas, workers podem sobrepor ou ficar fora da viewport

### 12. Tracking sem workspacePath perde resultados

**Onde:** `terminal.ts:181` — `workspacePath = ''`
**Onde:** `useOrquestra.ts:84` — `ws.rootPath || ''`
Se o workspace não tem rootPath, workspacePath fica vazio. `writeWorkerResultFile` é pulado (linha 233, 253). Resultados do worker nunca são salvos em disco.

### 13. Sem heartbeat entre maestro e workers

**Onde:** Sistema todo
**Problema:** O maestro não tem como verificar se workers estão vivos. O único mecanismo é o idle timeout de 30s. Um worker pode estar:
- Processando lentamente (não idle, mas não progredindo)
- Travado em um loop infinito
- Desconectado sem notificação

---

## 🟢 Problemas Baixos / Sugestões

### 14. heurística português-inglês inconsistente

Padrão 2 busca `(e ... também|um|uma) OR (and ... also|a|an)`. O "a" em inglês é falso positivo: "create a function" ativa o padrão.

### 15. Sem logging de erro visível ao usuário

Erros de processamento de comando vão apenas para `log.error`. Maestro e usuário nunca sabem que um comando falhou.

### 16. `fs.existsSync` → `readFileSync` → `unlinkSync` é síncrono

Bloqueia o event loop do main process durante IO. Em workspaces grandes (NFS, slow disks), isso pode causar latência perceptível.

### 17. Instalação da extensão copia arquivo .ts sem compilar

**Onde:** `installMaestro.ts:41` — copia `index.ts` direto para o host. O pi-agent precisa compilar o TypeScript em runtime, o que adiciona latência e pode falhar em ambientes sem suporte a TS.

---

## 💡 Recomendações

### Imediatas
1. **Substituir `fs.watch` por abordagem mais confiável** — IPC direto do agente para o main process (via ACP message), ou polling periódico com deduplicação por content hash
2. **Adicionar ID único de comando** e rejeitar duplicatas
3. **Limpar `.orquestra-commands/` na inicialização** para remover comandos órfãos

### Curtíssimo prazo
4. **Adicionar mecanismo de health check** — ping periódico do main process nos workers (via terminal alive check)
5. **Cascading cleanup** — quando um orquestrador fecha, limpar workers associados
6. **Limitar responseQueues** — max 100 entradas, descartar mais antigas
7. **Proteger writeTerminal** com try/catch + log se terminal já fechou

### Médio prazo
8. **Remover hardcoded 8s delay** — usar detecção de "terminal pronto" (detectar prompt) via output parsing
9. **Melhorar heurística de auto-dispatch** — usar LLM para decidir se a tarefa é multi-parte
10. **Adicionar notificação visual** quando workers completam / erros de orquestração
11. **Posicionamento inteligente no canvas** — distribuir workers em grid, não empilhados

### Arquitetural
12. **Substituir file-based IPC por mensagens diretas** — ACP protocol ou WebSocket entre agente e main process
13. **Persistir tracking** — salvar estado dos workers em disco para sobreviver a restart
14. **Compilar extensão antes de copiar** — `esbuild` ou `tsc` no installMaestro
