# Runner headless de testes do Maestro

Este documento explica como usar e como funciona o script
`scripts/maestro/maestro-test-runner.mjs`. Ele foi criado para que uma IA de
desenvolvimento consiga executar um cenário real do Maestro sem abrir e operar
manualmente o Orquestra a cada teste.

## O que o runner testa

O runner percorre o caminho real do produto:

1. Compila o aplicativo Electron, salvo quando `--no-build` é usado.
2. Abre uma instância do Orquestra com `ORQUESTRA_E2E=1`.
3. Aponta o canvas para o workspace informado.
4. Cria um terminal real, espera o PTY e arma a coroa.
5. Descobre o `runId` criado em `.orquestra/registry.json`.
6. Inicia o agente interativo configurado no terminal Maestro.
7. Digita o prompt pelo xterm e pressiona Enter pelo mesmo caminho de input do usuário.
8. Monitora o pool de workers, a fila e os arquivos do control plane.
9. Encerra sozinho quando todo o trabalho termina ou quando ocorre uma falha.

Ele não simula decisões de pool/fila. Recrutamento, reassign, queue, drain e
resultados passam pelos watchers e stores usados pelo aplicativo.

## O que é acompanhado

Durante a execução, eventos são impressos no terminal que iniciou o teste:

- `maestro-ready`: coroa armada e `runId` descoberto;
- `agent-started`: comando do agente enviado ao PTY;
- `agent-waiting`: autenticação, onboarding ou inicialização ainda em andamento;
- `prompt-injected`: prompt enviado ao Maestro;
- `state`: workers, status, comandos, fila e resultados atuais;
- `maestro-output`: trecho recente do scrollback do Maestro;
- `complete`: resumo final e trecho da saída de cada worker;
- `renderer-error`: erro inesperado ocorrido no renderer;
- `FAILED`: timeout, falha estrutural ou violação de uma asserção.

O estado em disco é lido apenas dentro do run criado pelo teste:

```text
.orquestra/
  registry.json
  runs/{runId}/
    commands/
    results/
    queue.json
    plan.json
```

Isso mantém o acompanhamento compatível com multi-Maestro e evita misturar
resultados de runs diferentes.

## Pré-requisitos do agente

O runner não falsifica autenticação nem corrige o shell interno da IA. Antes de
um cenário totalmente autônomo, o agente escolhido precisa:

- estar instalado e acessível pelo shell usado no terminal;
- estar autenticado;
- ter concluído diálogos de primeira execução, como tema ou confiança;
- conseguir executar `node orquestra.js` no próprio mecanismo de ferramentas;
- reconhecer as instruções do Maestro e emitir recruits.

Se algum desses pontos falhar, o teste deve falhar: isso representa o que
aconteceria no produto real. `agent-waiting`, `--ready-timeout`,
`--recruit-timeout` e o tail do terminal existem para que outra IA diagnostique
o problema sem abrir a interface.

## Uso básico

```powershell
npm run test:maestro -- `
  --workspace C:\caminho\do\projeto-de-teste `
  --prompt "Crie uma página e uma API; delegue as partes independentes"
```

O comando padrão do Maestro é:

```text
verboo --dangerously-skip-permissions
```

É possível trocar o agente por variável de ambiente:

```powershell
$env:ORQUESTRA_MAESTRO_COMMAND = "meu-agente --modo-interativo"
npm run test:maestro -- --workspace C:\tmp\fixture --prompt-file .\prompt.txt
```

Ou apenas para uma execução:

```powershell
npm run test:maestro -- `
  --workspace C:\tmp\fixture `
  --prompt-file .\prompt.txt `
  --maestro-command "meu-agente --modo-interativo"
```

## Opções importantes

| Opção | Padrão | Função |
|---|---:|---|
| `--workspace <dir>` | diretório atual | Workspace em que Maestro e workers trabalharão |
| `--prompt <texto>` | — | Prompt curto enviado ao Maestro |
| `--prompt-file <arquivo>` | — | Lê o prompt de um arquivo |
| `--maestro-command <cmd>` | `verboo ...` | Comando do agente interativo |
| `--expect-workers <n>` | `1` | Quantidade mínima de workers que deve ser observada |
| `--max-workers <n>` | `4` | Falha se o pool ultrapassar esse teto |
| `--timeout <segundos>` | `600` | Tempo máximo do teste |
| `--recruit-timeout <segundos>` | `120` | Falha cedo se nenhum worker aparecer |
| `--startup-delay <segundos>` | `5` | Espera entre iniciar o agente e enviar o prompt |
| `--ready-pattern <regex>` | inferido | Aguarda o TUI ficar pronto antes de injetar; para Verboo procura `/help` |
| `--ready-timeout <segundos>` | `90` | Limite para autenticação/inicialização do agente |
| `--type-delay <ms>` | `2` | Intervalo por caractere ao simular digitação real |
| `--settle <segundos>` | `8` | Período quieto exigido antes de concluir |
| `--poll <ms>` | `1000` | Intervalo de acompanhamento |
| `--report <arquivo>` | — | Grava todos os eventos também como JSONL |
| `--no-build` | desligado | Reutiliza o conteúdo atual de `dist/` |
| `--allow-worker-failures` | desligado | Não falha o processo por falha de worker |

Exemplo para uma IA de desenvolvimento:

```powershell
npm run test:maestro -- `
  --workspace C:\tmp\orquestra-fixture `
  --prompt-file .\prompts\pool-queue.txt `
  --expect-workers 2 `
  --max-workers 4 `
  --timeout 900 `
  --report C:\tmp\maestro-run.jsonl `
  --no-build
```

## Quando o processo termina

O teste só entra no período de `settle` quando:

- a quantidade mínima de workers foi observada;
- nenhum worker continua em `recruiting` ou `running`;
- a fila não possui itens com status `queued`;
- o pool não ultrapassou `--max-workers`.

Se o estado mudar durante o período de `settle`, a contagem recomeça. Isso evita
encerrar entre a conclusão de um worker e o drain da próxima tarefa.

O código de saída é diferente de zero quando há timeout, falha de worker,
problema ao abrir/armar o Maestro ou violação do teto do pool. Assim outra IA,
CI ou script pode tratar o resultado sem interpretar texto livre.

Quando `--expect-workers` é maior que zero, `--recruit-timeout` evita que uma
falha do agente ao chamar a CLI fique aguardando o timeout global. A mensagem de
erro inclui o trecho final do terminal do Maestro para a IA desenvolvedora
distinguir falha de autenticação, ferramenta shell ou decisão de dispatch.

O prompt e a tecla Enter passam por `terminal.input(..., true)` somente depois
do sinal de prontidão. Cada caractere é entregue separadamente ao mesmo
`xterm.onData → terminalWrite → PTY` usado pela interface real, mas sem depender
de foco visual — a janela E2E permanece oculta. A digitação progressiva também
evita que TUIs como o Verboo classifiquem o prompt como paste e ignorem o Enter.
Para agentes diferentes do Verboo, use `--ready-pattern` com algum texto estável
exibido quando o campo já aceita input e ajuste `--type-delay` se necessário.

## Isolamento e visibilidade para o usuário

O runner é uma ferramenta de desenvolvimento e não aparece na interface do
Orquestra. A configuração de empacotamento também o exclui explicitamente do
instalador e do `app.asar`.

Durante o teste:

- a janela Electron permanece oculta por causa de `ORQUESTRA_E2E=1`;
- o perfil Electron usa um diretório `userData` temporário;
- workspaces recentes, layout, sessão e configurações do aplicativo normal não
  são reutilizados;
- os eventos aparecem somente no terminal que executou o runner e, quando
  solicitado, no arquivo passado em `--report`;
- o runner não envia relatórios para usuários do aplicativo.

### Limite importante: o workspace não é descartável automaticamente

O diretório passado em `--workspace` é real. Armar a coroa instala ou atualiza
arquivos de controle, por exemplo `.orquestra/`, `orquestra.js`,
`orquestra.cjs`, `.claude/commands/` e as instruções gerenciadas em
`CLAUDE.local.md`. Além disso, Maestro e workers podem alterar qualquer arquivo
permitido pelo prompt e pelo modo de permissões do agente.

Portanto, para não afetar arquivos de um usuário ou do projeto principal, use
sempre um fixture, clone ou diretório temporário. O runner não apaga o workspace
ao terminar, pois isso poderia destruir artefatos que precisam ser inspecionados.

Também evite colocar segredos no prompt ou em `--report`: o JSONL registra o
prompt, resumos e trechos de saída para diagnóstico.

## Testando apenas o próprio runner

O parser, a contagem da fila, o teto do pool e as condições de término podem ser
verificados sem abrir Electron:

```powershell
npm run test:maestro:unit
```

Para um smoke sem uma IA externa, pode-se usar o REPL do Node e não exigir
workers:

```powershell
npm run test:maestro -- `
  --workspace C:\tmp\orquestra-fixture `
  --prompt "1+1" `
  --maestro-command "node -i" `
  --expect-workers 0 `
  --startup-delay 1 `
  --settle 2 `
  --no-build
```

Esse smoke confirma abertura do Electron, criação do PTY, arm da coroa, injeção
do prompt e leitura do scrollback, sem recrutar agentes reais.
