# Como publicar uma nova versão do Orquestra

Tutorial completo para gerar o instalador Windows e disponibilizar a atualização automática via **Cloudflare R2**.

O repositório GitHub pode ficar **privado**. Só os arquivos de release (`.exe`, `.yml`, etc.) ficam públicos no R2.

---

## Visão geral (o que acontece)

```
1. Você sobe o número da versão no package.json
2. Gera o .exe / .zip (package:win)
3. Envia os arquivos para o Cloudflare R2 (publish:release)
4. O app dos usuários lê latest.yml no R2 e oferece a atualização
```

| Quem | O que usa |
|------|-----------|
| Usuário novo | Baixa `Orquestra Setup x.y.z.exe` (você manda o link ou o arquivo) |
| Usuário que já tem o app | Auto-update + botão **Verificar atualizações** na sidebar |

**Feed público (não é segredo):**  
https://pub-1fcb183da34e46ba9cbbfa5cda797554.r2.dev

Arquivo que o updater consulta:  
https://pub-1fcb183da34e46ba9cbbfa5cda797554.r2.dev/latest.yml

---

## Pré-requisitos

- [ ] Node.js instalado (ideal 20–22; 24 costuma funcionar no pack)
- [ ] Dependências: `npm install` na pasta do projeto
- [ ] Bucket R2 `orquestra-releases` com **URL pública** ligada
- [ ] Token R2 (Access Key + Secret) com permissão de escrita no bucket
- [ ] `@aws-sdk/client-s3` instalado: `npm install -D @aws-sdk/client-s3`
- [ ] Pasta do projeto: `C:\Users\Leo\Documents\cate` (ou o clone local)

### Variáveis de ambiente

```powershell
$env:R2_ACCOUNT_ID = "940fe2949f46ad21d2e0aa9dd2cebdac"
$env:R2_ACCESS_KEY_ID = "86bb59b0b8c8f5facf953b45819c64b6"
$env:R2_SECRET_ACCESS_KEY = "184ed8d6a2782be985fc7f534b4e60067be04930a6a83bb0ff299ec379b7d2af"
$env:R2_BUCKET = "orquestra-releases"
$env:ORQUESTRA_RELEASES_URL = "https://pub-1fcb183da34e46ba9cbbfa5cda797554.r2.dev"
```

> ⚠️ **Nunca torne este repositório público** com essas credenciais. Se vazar, revogue o token no Cloudflare Dashboard e gere outro.

---

## Passo a passo (Windows / PowerShell)

### Passo 1 — Atualizar o número da versão

Abra `package.json` e altere:

```json
"version": "1.3.3"
```

Use [semver](https://semver.org/):

| Tipo | Exemplo | Quando |
|------|---------|--------|
| Patch | `1.3.2` → `1.3.3` | Correções, pequenos ajustes |
| Minor | `1.3.2` → `1.4.0` | Features novas, compatível |
| Major | `1.3.2` → `2.0.0` | Mudanças grandes / quebra |

Opcional — versionar no Git:

```powershell
cd C:\Users\Leo\Documents\cate
git add package.json
# (e outros arquivos da release, se houver)
git commit -m "chore: release v1.3.3"
git push origin main
```

---

### Passo 2 — Gerar o instalador (build)

```powershell
cd C:\Users\Leo\Documents\cate

$env:ORQUESTRA_RELEASES_URL = "https://pub-1fcb183da34e46ba9cbbfa5cda797554.r2.dev"

npm run package:win
```

Isso:

1. Gera ícones  
2. Faz build do app (`electron-vite build`)  
3. Empacota com **electron-builder**  

**Saída em** `release\`:

| Arquivo | Para quê |
|---------|----------|
| `Orquestra Setup 1.3.3.exe` | Instalador NSIS (principal para usuários) |
| `Orquestra Setup 1.3.3.exe.blockmap` | Integridade / update |
| `Orquestra-1.3.3-win.zip` | Versão portable (zip) |
| `latest.yml` | **Obrigatório** — diz ao app qual é a versão mais nova |
| `win-unpacked\Orquestra.exe` | App descompactado (teste local) |

Tempo típico: vários minutos.

Se falhar por tarball de runtime:

```powershell
npm run runtime:tarball
npm run package:win
```

---

### Passo 3 — Publicar no Cloudflare R2

```powershell
cd C:\Users\Leo\Documents\cate

$env:R2_ACCOUNT_ID = "940fe2949f46ad21d2e0aa9dd2cebdac"
$env:R2_ACCESS_KEY_ID = "86bb59b0b8c8f5facf953b45819c64b6"
$env:R2_SECRET_ACCESS_KEY = "184ed8d6a2782be985fc7f534b4e60067be04930a6a83bb0ff299ec379b7d2af"
$env:R2_BUCKET = "orquestra-releases"
$env:ORQUESTRA_RELEASES_URL = "https://pub-1fcb183da34e46ba9cbbfa5cda797554.r2.dev"

npm run publish:release
```

O script sobe os arquivos de `release/` para o bucket.

Mensagem de sucesso esperada: `Upload complete` e o link do feed.

---

### Passo 4 — Conferir se o feed está público

No navegador, abra:

```text
https://pub-1fcb183da34e46ba9cbbfa5cda797554.r2.dev/latest.yml
```

Deve mostrar algo como:

```yaml
version: 1.3.3
files:
  - url: Orquestra Setup 1.3.3.exe
    ...
```

- **404 / Access Denied** → público desligado no bucket ou arquivo não subiu.  
- **version errada** → subiu build antigo; rode de novo o passo 2 e 3.

---

### Passo 5 — Distribuir e testar update

**Instalação nova (usuário sem o app):**  
Envie o arquivo:

`release\Orquestra Setup 1.3.3.exe`

**Quem já tem versão antiga (ex.: 1.3.2):**

1. Com o app aberto, clique **Verificar atualizações** (sidebar → Workspaces, embaixo da versão), **ou** espere o check automático (~15 min).  
2. Deve aparecer atualização disponível → download → reiniciar / instalar ao sair.

**Teste rápido do update:**

1. Deixe instalada a versão **anterior** (ex. 1.3.2).  
2. Publique a **nova** (1.3.3) no R2.  
3. Abra o app antigo → Verificar atualizações → deve achar 1.3.3.

> No `npm run dev` o botão só **consulta** o `latest.yml` (soft-check). Instalação automática de update = **app empacotado** (Setup.exe).

---

## Comando único (copiar e colar)

Ajuste versão no `package.json` antes. Depois:

```powershell
cd C:\Users\Leo\Documents\cate

$env:ORQUESTRA_RELEASES_URL = "https://pub-1fcb183da34e46ba9cbbfa5cda797554.r2.dev"
$env:R2_ACCOUNT_ID = "940fe2949f46ad21d2e0aa9dd2cebdac"
$env:R2_ACCESS_KEY_ID = "86bb59b0b8c8f5facf953b45819c64b6"
$env:R2_SECRET_ACCESS_KEY = "184ed8d6a2782be985fc7f534b4e60067be04930a6a83bb0ff299ec379b7d2af"
$env:R2_BUCKET = "orquestra-releases"

npm run package:win
npm run publish:release

# Conferir:
Start-Process "https://pub-1fcb183da34e46ba9cbbfa5cda797554.r2.dev/latest.yml"
```

---

## Onde está a configuração no código

| Arquivo | Função |
|---------|--------|
| `package.json` → `version` | Número da release |
| `src/shared/releasesFeed.ts` | URL pública do feed (embutida no app) |
| `electron-builder.yml` → `publish.url` | URL no empacotamento (`ORQUESTRA_RELEASES_URL`) |
| `scripts/package.mjs` | Build + electron-builder |
| `scripts/publish-release.mjs` | Upload S3/R2 |
| `src/main/auto-updater.ts` | Lógica do electron-updater |
| Sidebar (Workspaces) | Botão verificar / atualizar |

Se mudar a URL pública do R2 no futuro:

1. Atualize `src/shared/releasesFeed.ts`  
2. Faça um **novo** `package:win` (senão o .exe antigo continua no feed velho)  
3. Publique de novo  

---

## Arquivos no R2 — o que manter

Os arquivos são organizados em pastas por versão no bucket:

```
v1.5.1/
  Orquestra Setup 1.5.1.exe
  Orquestra Setup 1.5.1.exe.blockmap
  Orquestra-1.5.1-win.zip
```

O `latest.yml` fica na raiz e aponta pra pasta da versão mais recente.

**Dica de espaço:** apague pastas de versões antigas no bucket quando não precisar mais delas.

---

## Problemas comuns

| Problema | O que fazer |
|----------|-------------|
| `No release files found` | Rodar `package:win` antes do publish |
| `Cannot access bucket` | Token, Account ID ou nome do bucket errados |
| `latest.yml` 404 | Public access do R2 desligado ou upload falhou |
| Botão diz “atualizado” mas você esperava update | Versão instalada **igual** à do `latest.yml` — precisa bump (ex. 1.3.3) |
| Update não instala no `npm run dev` | Normal — use o Setup.exe empacotado |
| SmartScreen “editor desconhecido” | Build local sem certificado de código; normal em dev |

---

## Checklist final (imprimir / marcar)

- [ ] `package.json` com a versão nova  
- [ ] `npm run package:win` ok  
- [ ] Env R2 configuradas na sessão  
- [ ] `npm run publish:release` ok  
- [ ] Browser abre `…/latest.yml` com a versão certa  
- [ ] (Opcional) testar update a partir de versão anterior instalada  
- [ ] Enviar o Setup.exe para quem ainda não tem o app  

---

## Referências

- Cloudflare R2: https://dash.cloudflare.com → R2  
- Detalhes técnicos do feed: `PUBLISH.md`  
- Contexto do projeto / Maestro: `AGENTS.md`
