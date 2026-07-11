# Diagnóstico profundo: erros de FS, false fail do worker, Interjected no Maestro

| Field | Value |
|-------|-------|
| **Date** | 2026-07-10 |
| **Type** | Root-cause analysis (not an implementation PR) |
| **Evidence** | User console logs + Maestro UI screenshot + source audit |

---

## 1. Resumo executivo

Há **três problemas distintos** misturados no mesmo ecrã:

| # | O que parece | O que é de verdade | Bloqueia o trabalho? |
|---|--------------|--------------------|----------------------|
| **P1** | Sistema a rebentar com `ENOENT latest.json` | Leitura **opcional** de um ficheiro que ainda não existe, tratada como erro IPC | Não (só spam) |
| **P2** | Access denied em `orquestra.js` | Path **mal formado** (`\Downloads\ladings\...` sem drive / pasta errada) | Parcial (stat falha; agents podem continuar) |
| **P3** | Worker `js` completed → reassign → **failed** | O runtime **declara falha cedo demais** (idle + accept com marker em falta) enquanto o agent ainda está a trabalhar (“Waiting for permission”) | **Sim — confunde o Maestro e o `wait` sai 1** |
| **P4** | Ruído `Project state saved` | Autosave a logar sucesso | Não |
| **P5** | Flood de `Interjected` no Maestro | O app **escreve no stdin do Maestro** resumos longos de cada worker | Sim (polui o agent orquestrador) |

**O trabalho real (editar ficheiros) pode estar a correr bem.** O “failed” que vês no reassign do `js` é, na análise do código + do teu summary, um **falso negativo de conclusão**, não necessariamente “o agent não fez o fix”.

---

## 2. Linha do tempo reconstruída (a partir da UI)

```
t0  Worker js completa tarefa de "confirm app.js is final"
    → status done + inject no Maestro: [WORKER→ORQUESTRADOR] completed

t1  Maestro reassign js: "change nav-links--open to open..."
    → writeToMaestro: [orquestra] Reassigned "js"...
    → trackWorker de novo + inject da nova role no worker

t2  Worker começa Update(app.js), fica em "Waiting for permission..."

t3  Silêncio ~60s com ≥3 linhas de "trabalho" no buffer
    → isWorkerIdleEligible = true (caminho MIN_LINES, SEM exigir marker)

t4  onWorkerIdle → finalizeWorkerCompletion
    → inferAcceptFromRole(role) pede file_exists(app.js, styles.css) + MARKER
    → ficheiros provavelmente OK; MARKER ainda não (agent não acabou)
    → status = FAILED, exitCode 1
    → inject no Maestro: Worker "js" failed + summary cheio de lixo de inject

t5  Maestro wait --workers js,css → exit 1 → "Task failed"
    → Maestro tenta de novo reassign js + css
```

Isto encaixa **pixel a pixel** no screenshot (Interjected completed → reassign → failed com “Waiting for permission” no summary → wait fail → novo reassign).

---

## 3. Problema P3 em profundidade (o “real problem” do failed)

### 3.1 Dois estágios de “acabou?”

O código separa **elegibilidade de idle** e **aceitação**:

```
feedWorkerOutput
  → isWorkerIdleEligible?  (só “está quieto e tem output?”)
  → onWorkerIdle
  → finalizeWorkerCompletion  (accept: ficheiros + marker)
  → escreve done | failed
```

### 3.2 Idle pode disparar **sem** o agent ter acabado

Em `isWorkerIdleEligible` (`terminal.ts`):

1. Se há **≥ 3 realWorkLines** e passaram **≥ 10s** desde o inject → elegível.
2. Depois **60s** de silêncio → `onWorkerIdle`.

**Não exige** `ORQUESTRA_WORKER_DONE` neste caminho.

Quando o agent está em **“Waiting for permission…”**:

- Já houve linhas de tool (`Update(app.js)`, paths, etc.) → contam como real work.
- Pode haver silêncio longo à espera do user/always-approve.
- Idle dispara **a meio da tarefa**.

### 3.3 Accept transforma “ainda a trabalhar” em **failed**

`finalizeWorkerCompletion` + `inferAcceptFromRole`:

```ts
// role de reassign típico:
// "In app.js change class nav-links--open to open so it matches styles.css..."
// → file_exists: app.js, styles.css
// → marker: ORQUESTRA_WORKER_DONE  (sempre)
```

- Se os ficheiros existem (já da 1ª task) → file_exists **passa**.
- Se o agent **ainda não imprimiu** o marker → marker **falha**.
- `acceptOk = false` → **`status: failed`**, `exitCode: 1`.

Ou seja: **não é “o fix falhou”**; é **“declarámos falha porque o agent ainda não disse DONE”**.

### 3.4 O summary “prova” isto

O summary de failed no screenshot inclui fragmentos do **inject** e “Waiting for permission” — típico de buffer de meio de tarefa, não de conclusão limpa.

### 3.5 Reassign não “limpa o tempo” de forma suficiente

`reassignExistingWorker` faz:

1. `orquestraTrackWorker` → **novo** tracking (buffer vazio) ✓  
2. `injectWorkerTaskToPty` + fingerprint ✓  

Mas **não** impede o caminho idle por min-lines **sem marker**.  
Assim que o agent produzir 3 linhas e ficar 60s à espera de permission → **mesmo bug**.

### 3.6 Cascata no Maestro

1. `failed` → `processNextResponse` injecta texto longo no PTY do Maestro.  
2. `wait` lê JSON `failed` → exit 1.  
3. Maestro “pensa” que precisa reassign de novo → loop de reassign.

**Conclusão P3 (causa raiz):**  
A combinação **idle por silêncio/mid-permission** + **accept que exige marker** marca **failed** tarefas ainda em curso. O primeiro “completed” estava certo; o segundo “failed” é em grande parte **erro de protocolo de conclusão do Orquestra**, não necessariamente erro do agent.

---

## 4. Problema P1 — ENOENT `latest.json` (spam, não corrupção)

### 4.1 Cadeia

```
useOrquestra mount / loadActivePlan / persist pre-read
  → fsReadFile(.../.orquestra/runs/latest.json)
  → main FS_READ_FILE + wrapHandler
  → ficheiro não existe
  → log.error('[fs:readFile]', ENOENT) + rethrow
  → Electron: "Error occurred in handler for 'fs:readFile'"
```

Chamadas (várias vezes no arranque / por workspace):

- Hydrate no `useEffect` de `useOrquestra`
- `loadActivePlan` em cada recruit
- `persistOrchestrationSnapshot` tenta ler plan antes de escrever

### 4.2 Por que o `catch` no renderer não basta

O erro é **logado no main** *antes* de o promise rejeitar. O `catch` no renderer só evita crash — **não silencia o log**.

### 4.3 Conclusão P1

**Não há “sistema a falhar a carregar o run”.**  
Há **API de leitura obrigatória** usada para um ficheiro **opcional**, com logging de erro em falta esperada.

---

## 5. Problema P2 — Access denied `\Downloads\ladings\orquestra.js`

### 5.1 O que o path revela

```
\Downloads\ladings\orquestra.js
```

- **Sem** `C:\Users\Leo`
- Pasta **`ladings`** (não `Lading-page`)
- Começa com `\` → no Windows parece path absoluto “da raiz do drive actual”, não workspace root

`validatePathStrict` compara com roots permitidos (workspace real) → **Access denied** (comportamento **correcto** de segurança).

### 5.2 Quem pede o path?

Não há no renderer Orquestra um `fsStat('orquestra.js')` óbvio. Origens prováveis:

1. **Agent tool** (verboo/Grok) a fazer stat de um path relativo mal resolvido pelo runtime RPC.
2. **File tree / open** com path truncado ou colado errado.
3. Runtime remoto/local a reescrever paths de forma incompleta (`FrameDecoder` / RPC no stack).

O stack (`RuntimeRpcClient`, `FrameDecoder`) aponta para **caminho via runtime RPC**, não só IPC renderer clássico — reforça hipótese de **agent/tool no runtime** a pedir path inválido.

### 5.3 Conclusão P2

**Não é “orquestra.js em falta no crown”.**  
É **alguém a pedir um path inválido/fora da sandbox**. O Orquestra recusa bem; o problema é **quem gera o path** e o **log a assustar**.

---

## 6. Problema P4 — `Project state saved to ...\.orquestra`

**Código:** `projectWorkspaceStore.ts` → `log.debug('Project state saved to %s', ...)`.

Com nível de log a incluir debug, cada autosave imprime. **Não indica erro.**  
É ruído de telemetria de save.

---

## 7. Problema P5 — Interjected no Maestro

### 7.1 Dois injects distintos

| Origem | Texto típico |
|--------|----------------|
| `processNextResponse` | `[WORKER→ORQUESTRADOR] Worker "js" failed:\n` + **summary inteiro** |
| `writeToMaestro` | `[orquestra] Reassigned "js" new task...` |

Ambos usam `terminalWrite` → PTY stdin do Maestro → UI do agent mostra **Interjected**.

### 7.2 Efeito colateral

- O summary de failed contém **lixo do inject do worker** (porque o buffer do worker misturou task + UI).
- O Maestro recebe isso como se fosse input/evento e pode **disparar novas tools** (wait, reassign) em cascata.

### 7.3 Conclusão P5

Há um **feedback loop de UI/protocolo**:

```
worker status → inject longo no Maestro → Maestro reage → reassign → …
```

Isto agrava P3 (mais reassigns sobre workers a meio).

---

## 8. Diagrama de causas (visão única)

```
                    ┌─────────────────────────────┐
                    │  User / Maestro pede work   │
                    └─────────────┬───────────────┘
                                  ▼
              recruit / reassign → inject no worker
                                  │
                                  ▼
                    agent trabalha (tools, permission)
                                  │
              ┌───────────────────┼───────────────────┐
              │ 60s quiet + ≥3    │                   │ agent acaba de
              │ real work lines   │                   │ verdade + DONE
              ▼                   │                   ▼
        IDLE ELIGIBLE             │            (caminho correcto)
              ▼                   │
     finalizeWorkerCompletion     │
     accept precisa MARKER ───────┼── se ainda sem DONE ──► FAILED (falso)
              │                   │
              │ se DONE ok ───────┴──► DONE
              ▼
     processNextResponse
     inject TEXTO LONGO no Maestro  ──► Interjected / confusão / mais reassign
              │
              ▼
     wait exit 1 se failed
```

Paralelo:

```
hydrate / loadActivePlan → fsReadFile(latest.json) missing → ENOENT spam (P1)
agent/runtime path \Downloads\ladings\orquestra.js → Access denied (P2)
autosave → Project state saved debug (P4)
```

---

## 9. O que **não** é o problema

| Hipótese | Veredito |
|----------|----------|
| “Workers não executam de todo” | **Falso** — UI mostra Update(app.js), ficheiros, completed na 1ª task |
| “latest.json corrompido” | **Falso** — simplesmente **não existe** ainda |
| “Sandbox a bloquear o projeto todo” | **Falso** — só paths fora da root / mal formados |
| “Reassign não injecta a task” | **Falso** — inject aparece; o failed é na **conclusão** |
| “Precisamos de mais workers” | **Falso** — o reassign está a ser usado; o status é que mente |

---

## 10. Problema real (prioridade)

### Primário (correctness)

**Protocolo de conclusão do worker está errado para agents interativos com “permission wait”:**

- Idle por silêncio mid-task ≠ tarefa falhada.  
- Accept com **marker obrigatório** + idle **sem marker** ⇒ **failed artificial**.  
- Isso envenena `wait`, o Maestro e o utilizador.

### Secundário (observability / UX)

1. Leituras opcionais logadas como erros fatais (ENOENT).  
2. Inject de summaries longos no Maestro (Interjected).  
3. Path basura de tools/runtime (Access denied).  
4. Log de autosave.

---

## 11. Direcção de correção (só diagnóstico → o que tem de mudar)

Não é “mais prompt no Maestro”. É **protocolo + IPC**:

| Prioridade | Mudança | Porquê |
|------------|---------|--------|
| P0 | Idle **sem marker** não deve chamar finalize como failed se accept exige marker — ou idle exige marker **ou** fica `running` | Mata o false fail |
| P0 | Em reassign: não finalizar com “Waiting for permission” / tool mid-flight | Detectar estados de espera |
| P1 | `fsReadFile` opcional para `latest.json` (null, sem log.error) | Mata spam ENOENT |
| P1 | processNextResponse: 1 linha curta, sem dump de summary | Mata Interjected caos |
| P2 | Silenciar “Project state saved” | Ruído |
| P2 | Rastrear caller do path `\Downloads\ladings\orquestra.js` e normalizar | Access denied |

Detalhe P0 (desenho correcto):

```
onWorkerIdle:
  if accept requires marker AND no marker in post-inject meaningful lines:
    → NÃO escrever failed
    → rearmar idle timer (ainda running)
  if marker present AND accept files ok:
    → done
  if process exited non-zero:
    → failed
```

Ou: min-lines path **só** para tasks sem marker criterion (hoje quase todas têm marker via `inferAcceptFromRole`).

---

## 12. Como verificar que o diagnóstico está certo (sem adivinhar)

1. Abrir `.orquestra-results/worker-js.json` **no momento do failed** e ler `accept[]`:
   - Se `marker: missing` e files ok → confirma P3.
2. Ver timestamps: `roleInjectedAt` → idle fire ~60s+ com agent ainda em permission.
3. Reproduzir: reassign com always-approve off → esperar permission 70s → deve falhar com o código actual.
4. Console: contagem de `fs:readFile` ENOENT = número de hydrates/recruits sem ficheiro.

---

## 13. Conclusão

| Pergunta | Resposta |
|----------|----------|
| O Orquestra está “partido” e não executa? | **Não** — executa; a **declaração de fim** está errada em reassign mid-permission. |
| O failed do js é o agent a falhar o fix? | **Provavelmente não** — é **timeout de idle + accept incompleto**. |
| Os erros de FS são a causa do failed? | **Não** — são ruído paralelo (snapshot opcional + path basura). |
| O que é o “real problem” a resolver primeiro? | **Não marcar `failed` quando o worker só está quieto à espera de permission / sem marker pós-inject.** Depois: silenciar ENOENT opcional e encurtar inject no Maestro. |

---

## 14. Próximo passo

Implementar o P0 do §11 (idle/accept) + P1 (ENOENT soft + inject curto) com testes unitários que simulem:

- 3 linhas de tool + 60s quiet + sem DONE → **continua running**, não failed  
- DONE + files ok → done  
- missing `latest.json` → null sem log.error  

Este estudo deve ser a base de qualquer PR de fix; o plano de implementação anterior alinha-se com isto, mas a **causa raiz do failed do js** é especificamente o §3.
