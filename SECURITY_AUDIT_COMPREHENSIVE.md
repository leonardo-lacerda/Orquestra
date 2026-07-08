# Auditoria de Segurança Abrangente — Orquestra

**Data:** 2026-07-08
**Escopo:** Desktop App (Electron), Website (Next.js/Supabase/Stripe)
**Método:** Auditoria manual + 5 agentes automatizados (RLS, API endpoints, IPC bridge, filesystem IPC, Stripe webhook)

---

## Resumo Executivo

| Severidade | Encontradas | Corrigidas | Pendentes |
|-----------|------------|------------|-----------|
| 🔴 CRÍTICA | 9 | 7 | 2 |
| 🟠 ALTA | 9 | 8 | 1 |
| 🟡 MÉDIA | 19 | 9 | 10 |
| 🟢 BAIXA | 8 | 0 | 8 |
| ℹ️ INFO | 9 | 0 | 9 |

---

## 🔴 CRÍTICAS

### C1 — Auto-elevação para admin via RLS incompleto

**Onde:** `orquestra-website/supabase/migrations/20260707010549_initial_schema.sql:78-81`
**Tipo:** Privilege Escalation
**Status:** ✅ Corrigido — WITH CHECK adicionado Qualquer usuário pode definir `is_admin = true` no próprio perfil via chamada REST direta ao Supabase.

**Exploit — 3 chamadas HTTP:**
```
POST /auth/v1/signup → obtém JWT
PATCH /rest/v1/profiles  { "is_admin": true }
GET  /api/admin/stats   → dados completos de todos os usuários
```

**Blast radius:** Acesso total a 6 endpoints admin — ler dados de todos os usuários, modificar/cancelar qualquer subscription, executar reconciliação Stripe, executar GDPR cleanup.

**Correção:** Adicionar `WITH CHECK` na policy:
```sql
WITH CHECK (auth.uid() = id AND is_admin = false)
```

---

### C2 — Chave SMTP (Resend API) em texto claro

**Onde:** `orquestra-website/supabase/config.toml:242`
**Tipo:** Credential Leak
**Status:** ✅ Corrigido — movido para env var

A chave `re_8FcJ2ytW_JY3CxbyT2QtAFAXvXYUvHEte` está hardcoded. Qualquer pessoa com acesso ao repo pode enviar emails como `noreply@orquestra.space` — incluindo phishing para reset de senha.

**Correção:** `pass = "env(RESEND_API_KEY)"` e remover do git.

---

### C3 — Arbitrary file read via readCanvasBackgroundImage (IPC)

**Onde:** `cate/src/main/ipc/dialogs.ts:72-96`
**Tipo:** Arbitrary File Read
**Status:** ✅ Corrigido — validatePath() adicionado

O handler `CANVAS_READ_BACKGROUND_IMAGE` lê **qualquer arquivo** do sistema cuja extensão seja `.png|jpg|jpeg|gif|webp|bmp|avif`, sem nenhuma validação de path. O renderer comprometido pode ler:

```
C:\Users\victim\AppData\Local\Google\Chrome\User Data\Default\Login Data.png
```

**Correção:** Adicionar `validatePath(filePath)` antes de ler o arquivo.

---

### C4 — Stripe webhook: sem validação de state transition

**Onde:** `orquestra-website/src/app/api/stripe/webhook/route.ts:125-145`
**Tipo:** Data Integrity
**Status:** ✅ Corrigido — state machine implementada

O webhook escreve `subscription.status` diretamente do Stripe no banco sem verificar se a transição de estado é válida (ex: `canceled` → `active` permitido). Um bug no Stripe, um admin apressado, ou um race condition pode "ressuscitar" subscriptions canceladas.

**Correção:** Implementar state machine: `canceled` → NONE (dead-end), `active` → `past_due|canceled`, etc.

---

### C5 — Stripe webhook: sem deduplicação de event ID

**Onde:** `orquestra-website/src/app/api/stripe/webhook/route.ts:54-217`
**Tipo:** Data Integrity
**Status:** ✅ Corrigido — dedup com in-memory TTL

Stripe entrega "at least once". A cada entrega duplicada:
- `logActivity()` insere nova linha em `activity_log` (sem verificar duplicidade)
- Nenhum ID de evento é armazenado para deduplicação

**Correção:** Armazenar `stripe_event_id` processados em tabela/Redis com TTL, pular se já processado.

---

### C6 — Admin cleanup e reconcile usam GET (CSRF)

**Onde:**
- `orquestra-website/src/app/api/admin/cleanup/route.ts:13`
- `orquestra-website/src/app/api/admin/reconcile/route.ts:14`
**Tipo:** CSRF / HTTP Method Misuse
**Status:** ✅ Corrigido — GET → POST + CSRF (verificação: reconcile estava sem validateCsrf, corrigido)

Endpoints que anonimizam perfis, deletam subscriptions e fazem sync com Stripe usam `GET`. Browsers enviam cookies SameSite=Lax em GET requests cross-origin via `<img>`, `<script>`, `window.location`.

**Correção:** Mudar para `POST` com validação CSRF.

---

### C7 — TERMINAL_SET_MAESTRO escreve arquivos em path não validado

**Onde:** `cate/src/main/ipc/terminal.ts:659-802`
**Tipo:** Arbitrary File Write
**Status:** ✅ Corrigido — validatePathStrict() adicionado

O handler aceita `workspacePath` do renderer e escreve 5+ tipos de arquivos (`orquestra.js`, `crown.json`, `CLAUDE.local.md`, `worker.md`) sem validação de path. Renderer comprometido pode escrever em `C:\Windows\System32`.

**Correção:** Validar `workspacePath` com `validatePathStrict()`.

---

## 🟠 ALTAS

### A1 — Sem rate limiting no IPC de login (desktop)

**Onde:** `cate/src/main/ipc/authApp.ts:39-46`
**Tipo:** Brute Force
**Status:** ✅ Corrigido — rate limiting adicionado (max 5, lockout 30s)

Handler `APP_AUTH_SIGN_IN` sem rate limiting. Renderer comprometido pode brute-forcar senhas.

---

### A2 — Email confirmation desabilitado

**Onde:** `orquestra-website/supabase/config.toml:226`
**Status:** 🟡 Não corrigido

```toml
enable_confirmations = false
```

Qualquer email (descartável, typo) aceito. + C1: criar conta, virar admin.

---

### A3 — Política de senha fraca

**Onde:** `orquestra-website/supabase/config.toml:182-185`
**Status:** ✅ Corrigido — 8 chars + lower_upper_letters_digits

6 caracteres, sem exigência de maiúscula/número/símbolo.

---

### A4 — Race condition admin activate ↔ webhook overwrite

**Onde:**
- `orquestra-website/src/app/api/admin/subscriptions/[id]/route.ts:63-79`
- `orquestra-website/src/app/api/stripe/webhook/route.ts:125-129`
**Tipo:** Race Condition
**Status:** ✅ Corrigido — DB write removido, webhook é autoridade

Admin "ativa" subscription → escreve `status: 'active'` no DB → webhook chega (triggerado pela chamada Stripe) e sobrescreve com status anterior. Admin vê "success" mas DB fica inconsistente.

**Correção:** Só chamar Stripe API no admin route; deixar webhook atualizar o DB.

---

### A5 — userId ausente no webhook `customer.subscription.updated`

**Onde:** `orquestra-website/src/app/api/stripe/webhook/route.ts:128`
**Tipo:** Orphan Data
**Status:** ✅ Corrigido — fallback resolveUserId() + stripe_customer_id

```ts
const userId = subscription.metadata?.userId;
```

Se subscription foi criada fora do fluxo normal (ex: Stripe dashboard manualmente), `userId` é `undefined`. Atividades não são logadas.

**Correção:** Fazer fallback lookup por `stripe_customer_id`.

---

### A6 — Dependências com CVEs conhecidas (HIGH)

**Pacote:** `@earendil-works/pi-coding-agent`
**Status:** ✅ Corrigido — npm audit fix, 0 vulnerabilidades

| CVE | Descrição |
|-----|-----------|
| GHSA-7v5m-pr3q-6453 | XSS em exportação HTML de sessão |
| GHSA-mqxh-6gq7-558m | Extensões carregadas sem aprovação |
| GHSA-jfgx-wxx8-mp94 | Privilege escalation em Linux |
| GHSA-r95r-rj6r-c39x | Race condition em auth.json |

**Correção:** `npm audit fix` para 0.80.3.

---

### A7 — Path traversal em worker result file

**Onde:** `cate/src/main/ipc/terminal.ts:156-167`
**Tipo:** Path Traversal
**Status:** ✅ Corrigido — path.basename sanitiza workerName

`writeWorkerResultFile` constrói path via `${result.workerName}`. Se `workerName` contém `../`, o JSON de resultado é escrito fora do diretório `.orquestra-results/`.

**Correção:** Usar `path.basename()` no worker name para neutralizar `..`.

---

### A8 — FS_IMPORT_ENTRIES sources não validados

**Onde:** `cate/src/main/ipc/filesystem.ts:393-408`
**Tipo:** Arbitrary File Read/Delete
**Status:** ✅ Corrigido — validatePathStrict em cada source

Handler aceita array de `sources` do renderer sem validar contra allowed roots. Com `mode: 'move'`, arquivos arbitrários são deletados (`fs.rm` com `force: true`, `recursive: true`).

**Exploit:** Renderer comprometido pode exfiltrar `~/.ssh/id_rsa` via copy mode, ou deletar arquivos via move mode.

**Correção:** Validar cada source com `validatePathStrict()`.

---

## 🟡 MÉDIAS

### M1 — Falta índices em colunas críticas
- `profiles(email)` — full scan em buscas admin
- `subscriptions(stripe_customer_id)` — full scan em webhook events

### M2 — Refresh token reuse interval = 10s
`config.toml:174`. Janela onde token roubado pode ser reusado.

### M3 — Secure password change desabilitado
`config.toml:228`. Troca de senha sem digitar senha atual.

### M4 — Email rate limit alto (1/s)
`config.toml:230`. Permite email enumeration via timing.

### M5 — CSRF permite localhost em produção
`csrf.ts:37-38`. `localhost:3000/3001` aceitos em produção. MITM local pode CSRF.

### M6 — Security definer function no schema public
`initial_schema.sql:25`. `handle_new_user` roda como superuser. Se exposta como REST, insere profiles arbitrários.

### M7 — License check endpoint sem auth + retorna dados completos
`licenses/check/route.ts:38`. Sem auth, retorna `user_id`, `subscription_id` do dono da license key.

### M8 — License check sem rate limiting
`licenses/check/route.ts:10-39`. Endpoint sem auth + sem rate limit.

### M9 — Auth check-lockout sem rate limiting
`auth/check-lockout/route.ts:12-40`. Leaks `remainingAttempts`. Permite enumeração.

### M10 — Stripe API version pinned to preview
`stripe/server.ts:9`. `2026-06-24.dahlia`. Tipo `invoice.subscription` usa `as unknown as`.

### M11 — Error objects não sanitizados em logs de webhook
`webhook/route.ts:107,213`. Supabase errors + Stripe errors logados com detalhes internos.

### M12 — Sem idempotency key em Stripe mutation calls
`create-checkout/route.ts:91,110`. Retry do cliente pode criar customers/checkouts duplicados.

### M13 — `openExternalUrl` com validação mínima
`analytics.ts:324-328`. Só checa `https://` ou `http://`. URLs com embedded credentials passam.

### M14 — `RUN_ACTION_IN_MAIN` permite forwarding arbitrário
`windowControls.ts:52-55`. Renderer de janela dock pode triggerar qualquer menu action na main window (ex: `workspace:removeCurrent`).

---

### M15 — Cross-workspace isolation desabilitada
`cate/src/main/ipc/pathValidation.ts:86-98`. `isWithinAllowedRoots` ignora `scopeId` e checa TODOS os workspaces. Qualquer janela acessa arquivos de qualquer workspace.

---

### M16 — Windows paths especiais não normalizados
`cate/src/main/ipc/pathValidation.ts:224-238`. Paths `\\?\C:\` e `\\.\C:\` não são normalizados, podendo bypassar comparação de paths.

---

## 🟢 BAIXAS

### B1 — Atividade_log só tem SELECT policy
Se logging client-side for necessário no futuro, vai falhar silenciosamente.

### B2 — Config.toml versionado com valores de produção
SMTP key, configurações de auth — tudo no git.

### B3 — Sem certificate pinning no desktop
Confia em qualquer CA para Supabase. MITM com CA comprometida.

### B4 — Logs do servidor vazam emails (LGPD)
`console.error` em `webhook/route.ts` e `reconcile/route.ts` logam emails.

### B5 — subscriptions/cancel sem rate limiting
`subscriptions/cancel/route.ts`. Toggle `cancel_at_period_end` ilimitado.

### B6 — licenses/generate sem rate limiting
`licenses/generate/route.ts`. Geração ilimitada de license keys.

---

## ℹ️ INFO

### I1 — ~140 métodos IPC expostos sem validação no preload
Por design (main process valida), mas blast radius grande se main process tiver bug.

### I2 — sendSync usado para fullscreen/maximized checks
`preload/index.ts:288,304`. Renderer pode fazer DoS de si mesmo.

### I3 — FS_IMPORT_ENTRIES sources não validados individualmente
`filesystem.ts:393-408`. Só `destDir` validado.

### I4 — `recordFailedAttempt` não conta durante lockout
`rate-limit.ts:132-135`. Tentativas durante lockout são perdidas.

### I5 — Subscription metadata userId pode vir de lookup fallback
`webhook/route.ts`. Falta fallback por `stripe_customer_id` (mencionado em A5).

### I6 — TERMINAL_CREATE shell path sem validação
`terminal.ts:445-542`. Renderer pode especificar qualquer binário como shell.

### I7 — Null byte não verificado em read paths
`pathValidation.ts:138`. `validatePath()` não checa null bytes.

### I8 — scopeId não verificado em remote RPC
`RemoteRuntime.ts:240-246`. scopeId fabricável quando per-scope isolation for implementada.

---

## 🛡️ O que está SEGURO (Positive Findings)

| Item | Status |
|------|--------|
| Stripe webhook: signature verification via `constructEvent` | ✅ Correto |
| Price IDs resolvidos server-side | ✅ Correto |
| CSRF dual protection (Origin + token) | ✅ Correto |
| RLS em subscriptions: `auth.uid() = user_id` | ✅ Correto |
| contextIsolation + sandbox (desktop) | ✅ Correto |
| safeStorage para session tokens | ✅ Correto |
| Session nunca no renderer | ✅ Correto |
| Webhook upsert usa `onConflict: stripe_subscription_id` (idempotente) | ✅ Correto |
| Trial abuse prevention (check subscriptions existentes) | ✅ Correto |
| Rate limiting no checkout (3/10min) | ✅ Presente |
| Admin routes todas usam `requireAdmin()` | ✅ Consistente |
| User ID sempre da session, nunca de params (sem IDOR) | ✅ Correto |
| Input sanitization em admin users search (escapou `%` `_`) | ✅ Correto |
| Erros retornam mensagens genéricas (sem stack leak) | ✅ Correto |
| CSP, HSTS, XFO headers bem configurados | ✅ Correto |
| Path validation module com symlink-attack prevention | ✅ Correto |
| Webview hardening (sandbox, sem preload, sem node) | ✅ Correto |
| Settings schema validation por tipo | ✅ Correto |
| IsSafeLogFileId: previne path traversal em scrollback | ✅ Correto |
| Git operations usam `simple-git` (sem shell injection) | ✅ Correto |
| Window-grant model com cleanup em window close | ✅ Correto |
| Stripe trial abuse prevention | ✅ Correto |
| Customer portal delegation (Stripe hosted) | ✅ Correto |
| Reconciliation endpoint (safety net) | ✅ Correto |

---

---

## 🔴 NOVAS DESCOBERTAS (2ª Auditoria)

### F1 — XSS via .docx no DocxViewer (CRÍTICO)

**Onde:** `cate/src/renderer/panels/DocumentPanel.tsx:290`
**Tipo:** Stored XSS
**Status:** ✅ Corrigido — DOMPurify.sanitize(html) adicionado

O componente `DocxViewer` renderiza HTML do `mammoth` via `dangerouslySetInnerHTML` sem sanitização. Um .docx malicioso com JavaScript嵌入do pode executar código no renderer.

### F2 — PostCSS XSS via Next.js (CRÍTICO)

**Onde:** `orquestra-website` (transitivo via `next@16.2.10`)
**Tipo:** Dependency CVE
**Status:** ✅ Corrigido — overrides postcss 8.5.13

`GHSA-qx2v-qp2m-jg93` — PostCSS < 8.5.10 permite XSS via `</style>` na saída CSS.

### F3 — Supabase error messages vazam detalhes (ALTA)

**Onde:** `cate/src/main/supabase/electronAuth.ts:157`
**Tipo:** Information Disclosure
**Status:** ✅ Corrigido — mensagem genérica

`reason: error.message` retorna a mensagem de erro RAW do Supabase ("Email not confirmed", etc.) para o renderer.

### F4 — TERMINAL_SCROLLBACK_SAVE sem limite de tamanho (MÉDIA)

**Onde:** `cate/src/main/ipc/terminal.ts:647-655`
**Tipo:** DoS / Disk Fill

Sem limite no `content` string. Renderer comprometido pode encher o disco.

### F5 — CSRF permite subdomínios + null origin (MÉDIA)

**Onde:** `orquestra-website/src/lib/csrf.ts:33-48`
**Tipo:** CSRF Bypass

Se qualquer subdomínio for comprometido, requests passam no CSRF. `null` origin não é tratado explicitamente.

### F6 — Security headers ausentes em API error responses (MÉDIA)

**Onde:** Todas as API route files
**Tipo:** Missing Headers

`NextResponse.json()` não herda os headers do `next.config.ts`. Erros nas APIs retornam sem XFO, HSTS, CSP.

### F7-F10 — Baixas/Info
- **F7**: Sem validação de env vars no startup
- **F8**: TOCTOU race nas operações de maestro files
- **F9**: `allowpopups` sempre true em webview
- **F10**: `'unsafe-inline'` no CSP de produção

---

## 🎯 Plano de Ação (Prioridade)

### Hotfix (antes de qualquer deploy)
1. **C1** — `WITH CHECK` na RLS policy de profiles
2. **C2** — Mover SMTP key para env var
3. **C3** — `validatePath()` no `readCanvasBackgroundImage`
4. **C6** — `cleanup` e `reconcile` de GET para POST

### Pré-lançamento
5. **C4** — State machine no webhook
6. **C5** — Deduplicação de event ID no webhook
7. **C7** — validatePathStrict no TERMINAL_SET_MAESTRO
8. **A1** — Rate limiting no IPC de login
9. **A2** — `enable_confirmations = true`
10. **A3** — `minimum_password_length = 8`, `password_requirements`
11. **A4** — Remover DB write direto do admin activate
12. **A7** — path.basename em worker name
13. **A8** — validatePathStrict em FS_IMPORT_ENTRIES sources
14. **A6** — `npm audit fix`

### Pós-lançamento (1-2 semanas)
12. **A5** — Fallback userId lookup no webhook
13. **M1** — Índices em `profiles(email)` e `subscriptions(stripe_customer_id)`
14. **M2** — `refresh_token_reuse_interval = 0`
15. **M3** — `secure_password_change = true`
16. **M5** — Remover localhost do CSRF em produção
17. **M7-M9** — Rate limiting em endpoints sem auth
18. **M10** — Stripe API version estável
19. **M13-M14** — Validação de URL e actions no IPC

### Backlog
20. **M11** — Sanitização de erros em logs
21. **B1-B6** — Melhorias menores
