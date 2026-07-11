# Publicar uma nova versão (Cloudflare R2)

O auto-updater (`electron-updater`, provider **generic**) lê o feed público no **Cloudflare R2**.  
O repositório GitHub pode permanecer **privado** — só os artefatos de release ficam públicos.

## Pré-requisitos

1. Conta [Cloudflare](https://dash.cloudflare.com/) com R2 ativado  
2. `npm run package:win` (ou mac/linux) gerando arquivos em `release/`  
3. Credenciais de API R2 (upload) + URL pública do bucket (download)

---

## Setup R2 (uma vez)

### 1. Criar o bucket

1. Dashboard → **R2** → **Create bucket**  
2. Nome sugerido: `orquestra-releases`  
3. Location: Automatic  

### 2. Acesso público de leitura

**Opção A — r2.dev (rápido)**  
1. Bucket → **Settings** → **Public access** → **Allow Access**  
2. Copie a URL pública, ex.:  
   `https://pub-xxxxxxxxxxxxxxxx.r2.dev`  
3. Se os arquivos ficam na raiz do bucket, o feed é:  
   `https://pub-xxxxxxxxxxxxxxxx.r2.dev`  
   Se preferir “pasta” lógica, use prefixo no upload (`R2_KEY_PREFIX`) e aponte a URL com o path.

**Opção B — domínio próprio (recomendado em produção)**  
1. Bucket → **Settings** → **Custom Domains** → `releases.seudominio.com`  
2. Feed: `https://releases.seudominio.com`

### 3. Token de API (só upload)

1. R2 → **Manage R2 API Tokens** → **Create API token**  
2. Permissions: **Object Read & Write** (só o bucket de releases)  
3. Anote:
   - **Access Key ID**
   - **Secret Access Key**
   - **Account ID** (sidebar do R2 / Overview)

### 4. Configurar o app / build

Defina a **mesma** URL pública em todos os lugares:

```bash
# Windows PowerShell (sessão atual)
$env:ORQUESTRA_RELEASES_URL = "https://pub-SEU_ID.r2.dev"
# se o bucket for a raiz; ou:
# $env:ORQUESTRA_RELEASES_URL = "https://releases.seudominio.com"
```

- `electron-builder.yml` → `publish.url: ${env.ORQUESTRA_RELEASES_URL}`  
- `src/shared/releasesFeed.ts` usa `process.env.ORQUESTRA_RELEASES_URL` (fallback PLACEHOLDER)  
- Para embutir a URL no binário sem env no runtime do usuário, **grave a URL final em** `src/shared/releasesFeed.ts` (substitua o PLACEHOLDER) **antes** do `package:win`.

Recomendação: no `releasesFeed.ts`, troque o default `pub-PLACEHOLDER...` pela sua URL pública real, para o `.exe` dos usuários não depender de env.

### 5. Dependência do script de upload

```bash
npm install -D @aws-sdk/client-s3
```

---

## Publicar

```bash
# 1. Build Windows (NSIS + zip)
npm run package:win

# 2. Credenciais R2 + URL pública
$env:R2_ACCOUNT_ID = "seu_account_id"
$env:R2_ACCESS_KEY_ID = "..."
$env:R2_SECRET_ACCESS_KEY = "..."
$env:R2_BUCKET = "orquestra-releases"
$env:ORQUESTRA_RELEASES_URL = "https://pub-xxxx.r2.dev"

# 3. Upload
node scripts/publish-release.mjs
```

Arquivos típicos enviados de `release/`:

| Arquivo | Função |
|---------|--------|
| `Orquestra Setup x.y.z.exe` | Instalador |
| `Orquestra Setup x.y.z.exe.blockmap` | Differential / integridade |
| `Orquestra-x.y.z-win.zip` | Portable (opcional) |
| `latest.yml` | **Obrigatório** para o auto-updater |

Confirme no browser:

```text
https://SEU_FEED/latest.yml
```

---

## Como o usuário atualiza

1. App checa o feed a cada ~15 min (packaged)  
2. Botão na sidebar: **Verificar atualizações**  
3. Download em background → modal **Restart now** / install on quit  

---

## Free tier R2 (ordem de grandeza)

- Storage free generoso (~10 GB class A)  
- Bom para instaladores ~400 MB e várias versões  
- Apague builds antigos do bucket para não acumular  

Valores oficiais: [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/).

---

## Checklist

- [ ] Bucket R2 + public access / custom domain  
- [ ] Token API com write no bucket  
- [ ] `ORQUESTRA_RELEASES_URL` / default em `releasesFeed.ts`  
- [ ] `npm install -D @aws-sdk/client-s3`  
- [ ] `npm run package:win`  
- [ ] `node scripts/publish-release.mjs`  
- [ ] Abrir `…/latest.yml` no browser (200 OK)  
- [ ] Testar “Verificar atualizações” no app empacotado  
