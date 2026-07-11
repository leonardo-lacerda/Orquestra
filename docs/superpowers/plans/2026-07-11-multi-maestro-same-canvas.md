# Multi-Maestro no mesmo canvas — estudo e recomendação

**Data:** 2026-07-11  
**Contexto:** Hoje o produto impõe **1 Maestro (crown) por workspace root**. O usuário quer **vários orquestradores no mesmo canvas** (mesmo projeto / mesma pasta).  
**Relacionado:** `2026-07-11-multi-maestro-isolation.md` (incidente de takeover e mitigações).

---

## 1. Problema de produto

### O que o usuário quer
- Dois (ou mais) terminais com crown no **mesmo** canvas.
- Cada um com seu plano, seus workers, seu `wait`, sem cancelar o outro.
- Continuar vendo tudo espacialmente no mesmo board (não abrir outro workspace).

### O que o sistema assume hoje
Invariant forte:

> **Por `workspacePath` (root do projeto) existe no máximo 1 Maestro vivo.**

Isso não é um detalhe de UI — está enfiado em **disco, main process, CLI e inject**.

---

## 2. Acoplamento atual (por que “só desligar o busy” quebra)

```
┌─────────────┐     crown.json (1 terminalPtyId)
│ Maestro A   │◄──── watcherByWorkspace[root] (1 entry)
│  PTY rpty-1 │     .orquestra-commands/ (1 pasta)
└──────┬──────┘     .orquestra-results/worker-{name}.json (nome global)
       │ recruit
       ▼
┌─────────────┐
│ Workers     │     orchestratorId → um único maestro
└─────────────┘
       │ DONE inject
       ▼
  writeTerminal(maestroPty)
```

| Recurso | Escopo atual | Conflito se multi-crown |
| --- | --- | --- |
| `watcherByWorkspace` | 1 por root | Segundo enable **substitui** o primeiro |
| `crown.json` | 1 PTY | CLI carimba o dono “atual” — A e B batem no mesmo |
| `.orquestra-commands/` | 1 fila | Comandos de A e B misturam (só `maestroId` filtra) |
| `.orquestra-results/worker-{name}.json` | **nome global** | Dois Maestros com worker `api` → **sobrescrevem wait** |
| `orquestraTerminals` | set de PTYs | Inject ok se multi, mas wait/results não |
| `CLAUDE.local.md` + skills | workspace inteiro | Todo agent lê instruções de orquestra |
| `maxWorkers` / titles | workspace | Capacidade e “html”/“api” colidem |
| Setas orchestration | canvas nodes | Visualmente ok multi, sem namespace de run |
| `orchestrationRunStore` | por `maestroPtyId` | Já multi-key no renderer; main/disco não |

**Conclusão:** permitir 2 crowns sem re-namespace de **disco + wait + nomes** reabre o incidente (status no terminal errado, wait mentiroso, cascade acidental).

---

## 3. Alternativas

### A. Status quo reforçado (1 Maestro / workspace)
**Como:** o que temos agora (`MAESTRO_BUSY`, force confirm, rebind, inject gate).  
**Prós:** simples, estável, sem corrida em arquivos.  
**Contras:** não atende o pedido.  
**Quando usar:** default de produção até multi-run existir.

### B. “Multi-Maestro” falso = vários workspaces / worktrees
**Como:** cada orquestra em worktree ou pasta; canvas pode mostrar vários projects.  
**Prós:** zero redesign de orquestra; isolamento natural de git/fs.  
**Contras:** não é “mesmo canvas / mesmo repo” de verdade; fricção de setup.  
**Nota:** worktrees ajudam **código paralelo**, não o modelo de crown.

### C. Nested only (Maestro → workers que recrutam)
**Como:** um crown; workers podem spawn (nested) se setting permitir.  
**Prós:** já parcialmente no produto.  
**Contras:** não são orquestradores **pares**; um dono único.

### D. Secondary “coordinator” sem crown de disco
**Como:** segundo terminal só conversa; não escreve commands/results.  
**Prós:** barato.  
**Contras:** não é orquestrador real.

### E. Multi-crown com **Run namespace** (recomendado)
**Como:** cada Maestro cria/usa um `runId`; tudo de orquestra é scoped por run.  
**Prós:** mesmo canvas, mesmo repo, isolamento correto.  
**Contras:** redesign médio (CLI + main + paths + UI).  
**Detalhe na §4.**

### F. Multi-crown sem namespace (só N crowns no set)
**Como:** vários em `orquestraTerminals`, watcher demux por `maestroId`.  
**Prós:** parece simples.  
**Contras:** **insuficiente** — colisão em `worker-{name}.json`, wait, nomes, CLAUDE.local.  
**Rejeitar** como “solução completa”.

### G. Maestro por **canvas panel** (não por workspace root)
**Como:** nested canvases, cada um com crown.  
**Prós:** encaixa na UI espacial.  
**Contras:** projetos reais são 1 root; secondary canvas ainda compartilha disco se mesmo rootPath → **ainda precisa de run namespace**.  
Útil como **UI de agrupamento** em cima de E, não sozinho.

---

## 4. Arquitetura recomendada: **Run-scoped multi-Maestro**

### 4.1 Ideia central

```
Workspace (repo root) ──N──► Orchestration Run (runId)
                              │
                              ├── 1 Maestro PTY (crown)
                              ├── 0..K workers (names unique WITHIN run)
                              ├── commands/  results/  plan
                              └── canvas: setas / cor por runId
```

**Invariant novo:**

> Em um workspace pode haver **N runs ativos**, cada um com **exatamente 1 Maestro**.  
> Workers, wait, results e comandos são isolados por `runId`.

### 4.2 Layout em disco

```
.orquestra/
  crowns.json                    # lista de runs ativos (opcional registry)
  runs/
    {runId}/
      crown.json                 # { runId, terminalPtyId, panelId, createdAt }
      commands/                  # cmd-*.json (só deste run)
      results/                   # worker-{name}.json
      plan.json                  # opcional
      ROLE files → workers/{name}/ROLE.md
  # legado: migrar single-crown → run "default" ou "legacy"
```

`orquestra.js`:

- Lê `ORQUESTRA_RUN_ID` do ambiente do PTY Maestro (setado no arm), **ou**
- Resolve via `crowns` qual run pertence ao `terminalPtyId` atual.
- Escreve em `runs/{runId}/commands` e lê results em `runs/{runId}/results`.

### 4.3 Main process

| Hoje | Depois |
| --- | --- |
| `watcherByWorkspace[root]` | `watcherByRun[runId]` **ou** 1 watcher no root que demuxa por path de subpasta |
| `cascade(orchestratorId)` | só workers daquele `runId` / maestro |
| Takeover global | **não existe** entre runs; desarmar crown = end run |
| Enable busy | busy só se **mesmo run** re-arm em outro PTY |

### 4.4 Nomes de workers

- Únicos **por run** (`api` ok em run A e run B).
- Result file: `runs/{runId}/results/worker-api.json`.
- Wait: `wait --run {runId} --workers api,tests` (run default = do crown atual).

### 4.5 Renderer / canvas

- `panel.maestro` + `panel.orchestrationRunId` (persistido).
- Várias crowns verdes; popover mostra run curto (`a3f2`).
- Setas orchestration: só entre nodes do mesmo `runId` (cor por run).
- `maxWorkers`: **por run** (setting global = ceiling por run, ou ceiling total opcional).

### 4.6 Instruções de agent (sem envenenar o Codex)

Problema: `CLAUDE.local.md` é workspace-wide.

**Recomendação:**

1. **Não** depender de CLAUDE.local para multi-run.
2. Instruções de Maestro **só no terminal crown** (inject / system do CLI / env).
3. Skills de orquestra: opt-in ou gated por “este PTY é crown”.
4. Workers recebem só ROLE.md do run.

Assim abrir Codex **sem crown** não vira segundo orquestrador por texto de system.

### 4.7 Conflito de arquivos (produto honesto)

Dois runs no **mesmo** repo podem editar o mesmo path.

| Política | Comportamento |
| --- | --- |
| **Open (default v1)** | Permitir; risco do usuário (como 2 devs no mesmo branch) |
| **Soft warn** | Se accept paths de runs ativos se intersectam → aviso no crown |
| **Hard partition** | Exigir worktree por run (melhor isolamento, mais fricção) |

**v1 recomendado:** open + soft warn. Worktree-per-run como opção avançada depois.

---

## 5. Comparativo

| Critério | A Status quo | B Worktrees | E Run-scoped | F Multi sem namespace |
| --- | --- | --- | --- | --- |
| Mesmo canvas / repo | Não multi | Parcial | **Sim** | Sim (quebrado) |
| Isolamento wait/results | N/A | Sim | **Sim** | Não |
| Sem takeover acidental | Sim | Sim | **Sim** | Não |
| Esforço eng | — | Baixo ops | **Médio** | Baixo (falso) |
| Risco regredir | — | Baixo | Médio | **Alto** |
| Alinha com pedido do user | Não | Fraco | **Forte** | Ilusório |

---

## 6. Melhor solução (decisão)

### Recomendação: **Opção E — Run-scoped multi-Maestro**

É a única que entrega “vários orquestradores no mesmo canvas” **sem** reabrir o incidente de coroa única, porque ataca a causa: **namespace de orquestra no disco e no routing**, não só a UI da crown.

### Por que não F
F deixa wait/results/nomes globais. Dois Maestros com worker `tests` corrompem o protocolo. Foi a mesma classe de bug do takeover.

### Por que não só B
Worktrees são excelentes para **código paralelo**, mas o user pediu **mesmo canvas** — run-scoped mantém o board único e isola o protocolo.

---

## 7. Plano de implementação (PR-sized)

### PR1 — Foundation (sem UI multi ainda)
- Introduzir `runId` no arm: criar `runs/{runId}/`.
- Migrar single-crown legado → um run `legacy` transparente.
- CLI + wait + results sob o run do crown.
- Manter 1 crown visível na UI se flag off (`orchestrationMultiMaestro: false`).

### PR2 — Multi-crown enable
- Remover `MAESTRO_BUSY` entre **runs diferentes**.
- Busy só re-arm do **mesmo** run em outro PTY.
- N crowns; `clearOtherMaestroFlags` vira “não limpar outros runs”.
- Inject/commands já scoped por run.

### PR3 — Canvas UX
- Cor/etiqueta de run nas setas e nos workers.
- Popover: run id, “End run”, maxWorkers por run.
- Soft warn de overlap de paths.

### PR4 — (Opcional) Worktree binding
- “New run in worktree…” para isolamento forte de FS.

### Testes mandatórios
- Dois Maestros, workers homônimos `api` — waits independentes.
- Disable A não afeta workers de B.
- Inject de A nunca escreve no PTY de B.
- Comando de A em pasta de B dropado.
- Migração legado 1-crown → run.

### Feature flag
```ts
orchestrationMultiMaestro: boolean  // default false até dogfood
orchestrationMaxConcurrentRuns: number  // default 3
```

---

## 8. Critérios de sucesso

1. Dois crowns no mesmo canvas, dois `wait` paralelos, zero mensagens cruzadas.
2. Workers com o mesmo `--name` em runs diferentes não colidem.
3. Abrir Codex **sem** crown não inicia orquestra nem recebe inject de workers.
4. Desligar crown A encerra só run A.
5. Flag off = comportamento atual (1 Maestro).

---

## 9. Não-objetivos (v1)

- Orquestradores em rede entre máquinas.
- Merge automático de planos de dois runs.
- Resolução automática de conflitos de arquivo entre runs.

---

## 10. Resposta curta ao produto

| Pergunta | Resposta |
| --- | --- |
| Posso hoje? | **Não** (1 crown / workspace, de propósito). |
| Dá para no futuro no mesmo canvas? | **Sim**, com **runs isolados** (não com “várias crowns no mesmo namespace”). |
| Melhor caminho | **Run-scoped multi-Maestro** + flag + migração legada. |
| Atalho frágil | Multi-crown sem namespace de disco → **não fazer**. |

---

## 11. Próximo passo de eng

Se aprovado:

1. Spec de IPC/CLI (`runId` em recruit/wait/crown).  
2. PR1 foundation atrás da flag (ainda single-crown na UI).  
3. Dogfood 2 Maestros no mesmo `Lading-page` canvas.  
4. Ligar flag default em beta.
