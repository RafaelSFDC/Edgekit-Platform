# 06. Experiência do Desenvolvedor (DX), SDK e CLI

> Especificação da experiência de uso do desenvolvedor: SDK isomórfico TypeScript, gerador de tipos estáticos e automações de linha de comando.

---

## 1. SDK Isomórfico (`@edgekit/platform-client`)

O SDK oficial é reescrito do zero para ser **isomórfico** (funciona no Browser, Node.js, Cloudflare Workers, Next.js Server Components, React Native, etc.), eliminando os bugs de design da versão legada.

### 1.1. Inicialização do Cliente
```typescript
import { createEdgekitClient } from '@edgekit/platform-client'
import type { Database } from './edgekit-types'

// Cliente com tipagem estrita gerada a partir do D1
export const edgekit = createEdgekitClient<Database>({
  url: 'https://meu-app.meu-subdominio.workers.dev',
  anonKey: 'ek_anon_123456...',
})
```

### 1.2. Consultas e Mutações no Banco de Dados (Database)
Ao contrário do SDK legado (que ignorava o nome da coluna no `update` e no `delete`), a nova API respeita estritamente os critérios informados:

```typescript
// 1. SELECT com filtros encadeados e ordenação
const { data: posts, error } = await edgekit
  .from('posts')
  .select('id, title, content, created_at')
  .eq('status', 'published')
  .gt('views', 100)
  .order('created_at', 'desc')
  .limit(20)
  .execute()

// 2. INSERT
const { data: newPost, error: insertError } = await edgekit
  .from('posts')
  .insert({
    title: 'Novo Artigo',
    content: 'Conteúdo do artigo...',
    status: 'draft',
  })

// 3. UPDATE por coluna arbitrária (Corrigido da versão legada)
const { data: updated, error: updateError } = await edgekit
  .from('posts')
  .update({ status: 'archived' })
  .eq('category_id', 'cat_789') // Aplica o filtro na coluna real!

// 4. DELETE com múltiplos critérios
const { error: deleteError } = await edgekit
  .from('posts')
  .delete()
  .eq('id', 'post_456')
```

### 1.3. Autenticação Integrada (Better Auth)
```typescript
// Login com Email e Senha
const { data, error } = await edgekit.auth.signInWithPassword({
  email: 'usuario@exemplo.com',
  password: 'senha-segura-123',
})

// Login com Passkey (WebAuthn)
await edgekit.auth.signInWithPasskey()

// Suporte a Multi-tenancy / Organizações
const { data: orgs } = await edgekit.auth.organization.list()
await edgekit.auth.organization.setActive({ organizationId: 'org_123' })

// Observador de Estado de Autenticação
edgekit.auth.onAuthStateChange((user, session) => {
  console.log('Estado de auth atualizado:', user?.name)
})
```

### 1.4. Storage (Upload, Download e URLs Assinadas)
```typescript
// Upload de Arquivo em Bucket Lógico
const fileInput = document.querySelector('input[type="file"]')
const file = fileInput.files[0]

const { data: uploadResult, error: uploadErr } = await edgekit.storage
  .from('avatars')
  .upload('usuarios/user_123.png', file)

// Geração de URL Assinada para Download de Arquivo Privado
const { data: signedUrl } = await edgekit.storage
  .from('invoices')
  .createSignedUrl('2026/fatura-001.pdf', { expiresIn: 3600 }) // Válida por 1 hora
```

### 1.5. Realtime com Reconexão Automática
```typescript
const channel = edgekit.realtime.channel('chat-geral')

// Escutar mensagens de broadcast
channel.on('novo_chat', (payload) => {
  console.log('Nova mensagem recebida:', payload)
})

// Sincronização de Presença
channel.trackPresence({ status: 'online', typing: false })

channel.on('presence.sync', (users) => {
  console.log('Usuários online no momento:', users)
})

// Conectar ao canal
channel.subscribe()
```

---

## 2. Automações de Linha de Comando (CLI & Scripts)

### 2.1. Assistente de Provisionamento (`pnpm setup:cf`)
Script interativo que configura a infraestrutura Cloudflare da instância:
1. Valida a autenticação do desenvolvedor com a Cloudflare (`wrangler whoami`).
2. Cria o banco D1 da aplicação (`wrangler d1 create <app-name>-db`).
3. Cria o bucket R2 de armazenamento (`wrangler r2 bucket create <app-name>-storage`).
4. Gera segredos criptográficos fortes (`BETTER_AUTH_SECRET`, `SETUP_TOKEN`, chaves `anon` e `service_role`).
5. Atualiza automaticamente o arquivo `apps/api/wrangler.jsonc` com os IDs reais criados.

### 2.2. Gerador de Tipos TypeScript (`pnpm db:types`)
Script que inspeciona o schema do D1 (ou `dev.db` local) e gera o arquivo `edgekit-types.d.ts`:
```bash
pnpm db:types
# Output:
# ✔ Schema inspecionado com sucesso.
# ✔ 8 tabelas encontradas.
# ✔ Arquivo edgekit-types.d.ts gerado com sucesso.
```

### 2.3. Fluxo de Deploy em 1 Comando
- Produção: `pnpm deploy` (compila o SPA do Dashboard em Static Assets e publica o Worker na Cloudflare).
- Staging / Testes: `pnpm deploy --env staging`.
