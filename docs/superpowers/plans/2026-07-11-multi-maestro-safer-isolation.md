# Multi-Maestro mais seguro — pesquisa e recomendação

**Data:** 2026-07-11  
**Pedido:** solução **mais segura** que “só namespacing de run no mesmo working tree”.  
**Pesquisa:** Claude Code docs, OpenAI Codex, open-source parallel agent tools (2025–2026).

---

## 1. Consenso da indústria (2026)

Para **vários agents/orquestrações no mesmo repositório**, o padrão dominante **não** é
compartilhar o working tree e isolar só metadados.

O padrão é:

> **Um agent (ou equipe) = um git worktree (e branch) = diretório de arquivos isolado.**

Conflitos de edição passam a ser **merge time** (git), não corrida silenciosa no disco.

Fontes / produtos:

| Fonte | O que faz |
| --- | --- |
| [Claude Code – worktrees](https://code.claude.com/docs/en/worktrees) | `--worktree`, desktop auto-worktree por sessão, subagents `isolation: worktree` |
| OpenAI Codex | Parallel agents + **isolated worktrees**; cloud = microVM sandbox |
| [parallel-code](https://github.com/johannesjo/parallel-code) | Electron: Claude/Codex/Gemini, **1 task = 1 worktree + branch**, merge UI |
| [AgentWrapper/agent-orchestrator](https://github.com/AgentWrapper/agent-orchestrator) | Sessions em worktrees separados |
| [stravu/crystal](https://github.com/stravu/crystal), [stablyai/orca](https://github.com/stablyai/orca), Superset | Parallel CLI agents em worktrees |
| [ccswarm](https://github.com/ruvnet/ccswarm) (citado em reviews) | Pools de agents + worktree isolation |
| Cline Kanban / Cursor parallel agents | Ephemeral worktrees por task/tab |

Pesquisas e guias (Augment, MindStudio, Upsun, Zylos) repetem: **worktree = primitiva de isolamento de FS para multi-agent**.

### O que worktree resolve

- Dois orquestradores **não podem sobrescrever o mesmo path no disco** (dirs diferentes).
- Cada um tem branch; review = diff/merge padrão.
- Barato vs clone completo (object store compartilhado).

### O que worktree **não** resolve sozinho

| Risco residual | Mitigação extra |
| --- | --- |
| Portas (3000, 5173) | Alocar portas por run / env |
| DB / Docker compartilhado | Container por run (parallel-code Dockerfile) ou DB name prefix |
| `.env` / secrets | `.worktreeinclude` (Claude) ou copy de env |
| Protocolo Orquestra (commands/results) | Namespace **por worktree path** (não por root só) |
| Rede / `rm -rf ~` | Sandbox OS (Codex sandbox, Docker, permission mode) |

---

## 2. Por que “runId no mesmo checkout” é menos seguro

A proposta anterior (run-scoped no **mesmo** working tree):

| Camada | Isola? |
| --- | --- |
| wait / results / commands | Sim (se bem feito) |
| **Arquivos do repo** | **Não** — dois workers ainda escrevem o mesmo `src/` |
| Merge review | Sujo (working tree misto) |
| Takeover / inject | Precisa de disciplina extra |

Isso é **isolamento de protocolo**, não de **efeito no código**.  
Para o usuário que pediu “mais seguro”, o industry bar é **isolamento de FS**.

---

## 3. Arquitetura recomendada para Orquestra

### Nome: **Worktree-bound Maestro** (1 crown por worktree path)

```
Canvas (visual único)
  ├── Maestro A  cwd = .orquestra/worktrees/run-auth     branch feat/auth
  │     └── workers A*  (mesmo cwd / worktree)
  └── Maestro B  cwd = .orquestra/worktrees/run-billing  branch feat/billing
        └── workers B*  (mesmo cwd / worktree)
```

**Invariants:**

1. Cada Maestro armado tem um **`rootPath` efetivo** = path do worktree (não o main checkout, salvo “direct mode”).
2. Todos os workers de um Maestro nascem com **cwd = esse worktree**.
3. `crown` / commands / results vivem **dentro do worktree** (ou chaveados por worktree path no main).
4. Dois Maestros no main checkout **ao mesmo tempo** = proibido (ou só com confirm “unsafe”).
5. Merge de volta ao main é passo **explícito** (UI “Merge run” / git).

Isso reutiliza o que o Orquestra **já tem**: worktrees, `worktreeId` em panels, parallel work UI.

### Relação com o “runId”

- `runId` continua útil (UI, setas, logs).
- **Identidade forte de isolamento** = `worktreePath` (+ branch), não só UUID no mesmo dir.
- Protocolo Orquestra: 1 watcher **por worktree path** (hoje já é “por rootPath” — o truque é cada Maestro ter rootPath = worktree).

Na prática: se cada crown arma com `workspacePath = worktreePath`, o isolamento atual de 1-Maestro-por-path **já permite N Maestros no canvas** desde que os paths sejam worktrees diferentes!

Hoje o “canvas único” ainda aponta o workspace root principal — a lacuna de produto é:

> Ligar **crown + recruit** a um **worktree** e mostrar vários worktrees no **mesmo** canvas espacial.

---

## 4. Comparativo de segurança

| Abordagem | Isola protocolo | Isola arquivos | Review limpo | Alinhado mercado | Esforço Orquestra |
| --- | --- | --- | --- | --- | --- |
| 1 Maestro / root (hoje) | Sim | N/A | Sim | Conservador | — |
| RunId no mesmo tree | Sim | **Não** | Fraco | Fraco | Médio |
| **Worktree-bound Maestro** | Sim | **Sim** | **Sim** | **Forte** | Médio (UI + arm path) |
| Worktree + Docker/sandbox | Sim | Sim + runtime | Sim | Máximo | Alto |
| Só multi-crown no root | Parcial | **Não** | Não | Anti-pattern | Baixo (perigoso) |

**Recomendação:** Worktree-bound Maestro como default de multi-orquestra.  
Docker/sandbox como fase 2 opcional (ports + deps).

---

## 5. Como fica no canvas (UX)

Ainda **um canvas visual**, mas cada orquestra é um **cluster**:

- Territory color já existe por worktree → reutilizar.
- Crown em terminal com `worktreeId` setado.
- “New Maestro run” = create worktree + terminal + arm crown (um clique).
- Workers herdando worktree do Maestro automaticamente.
- Ao fim: Merge / PR / Discard worktree (já próximos dos verbos de parallel work).

Isso é o modelo Parallel Code / Claude desktop, mapeado ao spatial canvas do Orquestra.

---

## 6. Repos / prior art úteis

| Repo / produto | Takeaway para Orquestra |
| --- | --- |
| [johannesjo/parallel-code](https://github.com/johannesjo/parallel-code) | UX: task → worktree → agent → merge; Electron como Orquestra |
| [AgentWrapper/agent-orchestrator](https://github.com/AgentWrapper/agent-orchestrator) | Session = worktree; status fleet |
| [Claude Code worktrees](https://code.claude.com/docs/en/worktrees) | `.worktreeinclude` para `.env`; subagent isolation |
| Codex worktrees / sandbox | Isolation levels: FS then OS |
| Cline Kanban | Ephemeral worktree per card |

---

## 7. Plano de implementação (seguro-first)

### Fase 0 — produto (já possível manualmente)
- Criar 2 worktrees, 2 terminais com cwd/worktreeId, 1 crown por worktree.
- Documentar: “multi-orquestra = multi-worktree no canvas”.

### Fase 1 — **New Maestro Run** (automático)
- Ação: cria worktree sob `.orquestra/worktrees/<slug>/`, branch `maestro/<slug>`.
- Spawna terminal Maestro com cwd = worktree; arma crown com esse path.
- Recruit/workers forçam o mesmo cwd/worktreeId.
- Proíbe segundo crown no **mesmo** path (busy atual).

### Fase 2 — UX canvas
- Label run + cor worktree nas setas.
- “Merge to main” / “Open PR” no crown popover.
- Copy `.env` via include list (como `.worktreeinclude`).

### Fase 3 — runtime isolation (opcional)
- Port allocator por run.
- Optional Docker (inspirado parallel-code).

### Testes de segurança
- Dois Maestros, ambos editam `src/app.ts` em worktrees diferentes → main intacto.
- Inject/result de A nunca chega em B.
- Crown no main + crown em worktree: OK; dois crowns no main: bloqueado.

---

## 8. Decisão

| | |
| --- | --- |
| **Mais seguro que runId no mesmo tree** | **Sim: worktree (FS isolation)** |
| **Mesmo canvas?** | **Sim** — painéis flutuam no board; cwd/worktree diferente |
| **Mesmo “projeto git”?** | **Sim** — um object store, N working trees |
| **O que não fazer** | Multi-crown no mesmo working tree “só com pastas de comando” |

---

## 9. Resposta ao “não gostei do run-scoped”

Concordo com o instinto de segurança: **isolar só metadados de orquestra e deixar o código compartilhado é frágil.**

O mercado (Claude, Codex, Parallel Code, Orca, …) escolheu **worktree** como barreira.  
Orquestra já tem worktrees — a solução “mais segura” é **produto = Maestro amarrado a worktree**, não multi-crown no checkout principal.
