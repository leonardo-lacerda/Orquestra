# Publicar uma nova versão

## Pré-requisitos

- `npm run package:win` funcionando (build do instalador)
- Bucket `orquestra-releases` criado no Supabase Storage (público)
- `SUPABASE_SERVICE_KEY` — Project Settings > API > service_role key

## Passo a passo

```bash
# 1. Buildar o instalador
npm run package:win

# 2. Publicar no Supabase Storage
SUPABASE_SERVICE_KEY=eyJ... node scripts/publish-release.mjs
```

O script cria o bucket automaticamente se não existir e sobe todos os artefatos da pasta `release/` (`.exe`, `.zip`, `latest.yml`, `.blockmap`).

## Como o usuário recebe a atualização

O app já vem com o `electron-updater` configurado para checar esse bucket a cada 15 minutos. Quando encontra uma versão mais nova:

1. Baixa em background
2. Instala na próxima vez que o app fechar
3. O usuário também pode clicar "Restart now" no modal que aparece

## Criar o bucket no Supabase (primeira vez)

1. Supabase Dashboard → **Storage** → **Create bucket**
2. Nome: `orquestra-releases`
3. **Public bucket** → ON
4. O script `publish-release.mjs` faz o resto automaticamente
