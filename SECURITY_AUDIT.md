# Auditoria de Segurança — Sistema de Login Orquestra Desktop

**Data:** 2026-07-08
**Escopo:** Integração entre Orquestra Desktop (Electron/React) e Website (Next.js/Supabase)

---

## Sumário Executivo

| Camada | Avaliação |
|--------|-----------|
| Credenciais & Sessão | ✅ Seguro |
| IPC Bridge | ✅ Seguro |
| Supabase RLS | ✅ Seguro |
| CSP & Hardening | ✅ Seguro |
| Build & Packaging | ⚠️ Precauções necessárias |
| Logs | ⚠️ Melhorias recomendadas |
| Revalidação | ❌ Falta revalidação periódica |

**Veredito:** A implementação é segura para um MVP. Nenhuma vulnerabilidade crítica foi encontrada. Existem 2 recomendações de **prioridade alta** e 3 de **prioridade média** que devem ser implementadas antes do lançamento comercial.

---

## 1. Análise Detalhada por Camada

### 1.1 Credenciais e Sessão (electronAuth.ts)

**ANON Key**
- A `SUPABASE_ANON_KEY` está embarcada no código do main process — é uma chave **pública por design** (mesmo modelo de apps web/mobile)
- O Supabase usa RLS para proteger os dados; a anon key sozinha não permite acesso a dados de outros usuários
- **Risco:** Baixo. A anon key é facilmente extraível do asar, mas isso não compromete dados

**Senhas**
- A senha do usuário trafega do renderer → main process via IPC invoke
- Permanece em memória no renderer (input field) e no main process (parâmetro da função) durante o login
- Não é armazenada em disco em nenhum momento
- **Risco:** Baixo. contextIsolation impede que scripts maliciosos no renderer interceptem

**Session Token**
- Armazenado em disco criptografado com `safeStorage` (DPAPI no Windows)
- Arquivo: `<userData>/auth/session.enc` com permissões `0o600`
- Contém apenas `access_token` + `refresh_token` (sem senha)
- **Risco:** Mínimo. DPAPI é criptografia do SO, vinculada à conta do usuário Windows

**SafeStorage Fallback**
- Se `safeStorage` não estiver disponível, a sessão simplesmente não persiste entre restarts
- O usuário precisa fazer login toda vez que abre o app
- **Risco:** Baixo. safeStorage está disponível em Windows, macOS e Linux com desktop environment

### 1.2 IPC Bridge (authApp.ts, preload/index.ts)

**Separação de Processos**
- ✅ Renderer NUNCA tem acesso direto ao Supabase
- ✅ contextIsolation: true
- ✅ nodeIntegration: false
- ✅ sandbox: true (habilitado por padrão)
- ✅ Todas as operações de auth passam por `ipcMain.handle()` / `ipcRenderer.invoke()`

**Tratamento de Erros**
- ✅ Erros são envoltos em mensagens genéricas (não vazam stack traces ou detalhes internos)
- ✅ Casos de borda tratados: sessão corrompida, network failure, sessão expirada
- ✅ Operações são seguras para idempotência (double signOut não causa erro)

**Broadcast de Estado**
- ✅ Mudanças assíncronas de estado (token expirado) são propagadas para todas as janelas via `broadcastAuthState()`

### 1.3 Supabase RLS & Data Access

**RLS Policies**
- ✅ `subscriptions`: `auth.uid() = user_id` para SELECT
- ✅ `profiles`: `auth.uid() = id` para SELECT e UPDATE
- ✅ service_role key NUNCA está no desktop app
- ✅ Apenas o JWT do usuário autenticado é usado

**Query Pattern**
- A query de subscription usa `.eq('user_id', userId)` explícito + RLS — defesa em profundidade
- ✅ Uso de `maybeSingle()` previne erros se não houver subscription

### 1.4 CSP & Hardening (index.ts, webSecurity.ts)

**CSP Atual**
```
default-src 'self';
script-src 'self' [unsafe-inline + unsafe-eval apenas em dev];
style-src 'self' 'unsafe-inline';
img-src 'self' data: https: file:;
connect-src 'self' https: ws: wss: sentry-ipc:;
font-src 'self' data:;
base-uri 'self'
```

- ✅ `connect-src` permite `https:` (necessário para main process se comunicar com Supabase)
- ⚠️ `'unsafe-inline'` e `'unsafe-eval'` em dev mode são aceitáveis (dev apenas)
- ✅ `script-src 'self'` em produção bloqueia XSS

**Webview Security**
- ✅ `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`
- ✅ Preload de webviews deletado (não confia em preloads de terceiros)
- ✅ Permissões restritas: apenas `cookies` e `storage-access`
- ✅ Navegação bloqueada para URLs não confiáveis
- ✅ OAuth URLs forçadas para o browser do sistema

### 1.5 Build & Packaging (electron-builder.yml)

**Asar**
- O app é empacotado em `app.asar` — não é criptografado, apenas ofuscado
- ✅ `asarUnpack` mínimo: apenas módulos nativos que não funcionam dentro do asar
- ⚠️ `@supabase/supabase-js` fica dentro do asar (carrega sem problemas)
- ⚠️ A ANON_KEY pode ser extraída do asar com `npx asar extract` e grep

**Code Signing**
- ✅ Configurado para Windows (NSIS + signtoolOptions)
- ⚠️ Requer CI env vars `CSC_LINK` / `CSC_KEY_PASSWORD` — sem elas o build não é assinado
- Builds não assinados disparam SmartScreen "Unknown publisher"

### 1.6 Dev-Only Feature Flags

- `ORQUESTRA_DISABLE_TRUST_SCOPING` — desabilita restrições de path (dev apenas)
- `ORQUESTRA_DISABLE_WEBVIEW_HARDENING` — desabilita hardening de webview
- `ORQUESTRA_DISABLE_RENDERER_SANDBOX` — desabilita sandbox do renderizador
- ✅ Todos os flags são ignorados quando `app.isPackaged === true`

---

## 2. Matriz de Ameaças

| Ameaça | Risco | Mitigação Atual | Resíduo |
|--------|-------|-----------------|---------|
| Extrair ANON_KEY do asar | 🟡 Médio | Chave é pública por design | Nenhum |
| Extrair session token do disco | 🟢 Baixo | safeStorage (DPAPI) + 0o600 | Mínimo |
| Bypass de auth via IPC | 🟢 Baixo | contextIsolation + preload bridge | Mínimo |
| Roubo de sessão (token reuse) | 🟡 Médio | safeStorage criptografa em repouso | Baixo (se malware já tem acesso ao processo) |
| Subscription expirada em uso | 🟡 **Médio** | Verificada no startup + revalidação a cada 30 min | Baixo |
| MITM entre app e Supabase | 🟢 Baixo | HTTPS obrigatório + Supabase rejeita HTTP | Nenhum |
| SQL injection | 🟢 Baixo | Supabase client usa queries parametrizadas | Nenhum |
| Brute force de senha | 🟡 Médio | Sem rate limiting no IPC | **Possível via chamadas repetidas ao IPC** |
| Memdump de credenciais | 🟢 Baixo | Senha em memória apenas durante signIn | Muito baixo (requer acesso local ao processo) |
| Modificação do asar | 🟡 Médio | Sem checksum/verificação de integridade | **Possível distribuir versão modificada** |

---

## 3. Recomendações

### 🔴 Prioridade Alta

#### R1 — Revalidação periódica da subscription ✅ IMPLEMENTADO

**Problema:** A subscription é verificada apenas no login e no startup. Se o usuário cancela a assinatura enquanto o app está aberto, ele continua usando até reiniciar o app.

**Solução:** Adicionado timer de revalidação de 30 minutos em `ElectronAuth.startRevalidation()`. Quando uma subscription expirada é detectada, o callback `onStateChange` força o logout imediatamente.

#### R2 — Verificação de integridade do executável / asar

**Problema:** O asar pode ser extraído, modificado e re-empacotado, permitindo que alguém distribua uma versão modificada que bypassa o login.

**Mitigação:** Code signing com timestamp + verificador de integridade no runtime que compara hash de módulos críticos contra um checksum embarcado ou obtido via API.

---

### 🟡 Prioridade Média

#### R3 — Rate limiting no IPC de login

**Problema:** O handler `APP_AUTH_SIGN_IN` pode ser chamado repetidamente sem restrição, permitindo brute force de senhas.

**Implementação sugerida:**
```ts
const loginAttempts = new Map<string, { count: number; until: number }>()

ipcMain.handle(APP_AUTH_SIGN_IN, async (_event, email: string, password: string) => {
  const key = email.toLowerCase()
  const entry = loginAttempts.get(key)
  if (entry && entry.until > Date.now()) {
    return { authorized: false, user: null, subscription: null, reason: 'Muitas tentativas. Tente novamente em 30 segundos.' }
  }
  // ... signIn ...
  if (error) {
    const newEntry = loginAttempts.get(key) ?? { count: 0, until: 0 }
    newEntry.count++
    if (newEntry.count >= 5) newEntry.until = Date.now() + 30_000
    else newEntry.until = Date.now() + (newEntry.count * 1000)
    loginAttempts.set(key, newEntry)
  }
})
```

#### R4 — Sanitização de logs

**Problema:** Logs de warning incluem `error.message` do Supabase que pode vazar informações como "Email not confirmed" ou detalhes internos.

**Mitigação:** Sanitizar mensagens de erro em logs e nunca logar o corpo completo do erro.

#### R5 — Auto-lock por inatividade

**Problema:** Se o usuário deixa o app aberto em uma estação compartilhada, qualquer pessoa pode usar o Orquestra.

**Implementação sugerida:** Timer de inatividade (ex: 60 min sem interação) que faz signOut automático.

---

### 🟢 Prioridade Baixa

#### R6 — Modo offline com verificação de license key

Se o usuário eventualmente precisar de acesso offline, implementar cache da subscription com TTL e uso de license key para ativação offline.

#### R7 — Certificate Pinning

Para segurança extra contra MITM, implementar pinning do certificado SSL do Supabase no Electron main process usando `net.fetch` com `certificateSubject` ou uma abordagem customizada.

---

## 4. Conclusão

A implementação atual estabelece uma **base sólida e segura** para o sistema de login. As principais decisões de arquitetura estão corretas:

1. ✅ Supabase no main process (não no renderer)
2. ✅ Sessão criptografada com safeStorage
3. ✅ contextIsolation + sandbox + CSP
4. ✅ RLS no Supabase
5. ✅ IPC bridge tipada

As recomendações R1 e R2 devem ser implementadas **antes do lançamento comercial** (R$39/mês). As demais podem ser priorizadas conforme o roadmap.

**Score geral de segurança: 7.5/10** — seguro para MVP, com gaps conhecidos e planos de mitigação.
