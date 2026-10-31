# ⚡ Edgekit Platform

> **Backend as a Service (BaaS) Open-Source, Independente e Self-Hosted na Cloudflare**, inspirado em Supabase e PocketBase.
> Desenvolvido sobre **Cloudflare Workers, D1 Database, R2 Storage e Durable Objects**, com suporte a desenvolvimento local ágil via **SQLite (`better-sqlite3`)**.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![D1 Database](https://img.shields.io/badge/Cloudflare-D1-F38020?logo=sqlite&logoColor=white)](https://developers.cloudflare.com/d1/)
[![R2 Storage](https://img.shields.io/badge/Cloudflare-R2-F38020?logo=amazon-s3&logoColor=white)](https://developers.cloudflare.com/r2/)
[![Durable Objects](https://img.shields.io/badge/Durable-Objects-F38020?logo=websocket&logoColor=white)](https://developers.cloudflare.com/durable-objects/)
[![Hono](https://img.shields.io/badge/Hono-v4-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🎯 Visão do Produto

O **Edgekit Platform** é uma plataforma completa e integrada para desenvolvedores construírem e operarem o backend de suas aplicações em um único lugar.

- **Produto 100% Independente:** Não depende, não executa e não gerencia outros produtos da família Edgekit.
- **Modelo 1 Deploy = 1 Projeto (Single-Instance):** Cada aplicação roda como uma instância isolada na conta Cloudflare do desenvolvedor (1 Worker + 1 D1 + 1 Bucket R2 + Durable Objects), com custo zero no plano Free da Cloudflare.
- **Desenvolvimento Local Sem Atrito:** Miniflare + `better-sqlite3` para execução local e scripts sem custos na nuvem.
- **Segurança Deny-by-Default:** Tabelas fechadas por padrão, chaves de API com hash SHA-256 e Policy Engine compilada diretamente em consultas SQL seguras.
- **Identidades Separadas:** Administradores da plataforma (`_ek_admins`) são isolados dos usuários finais da aplicação (`users`).

📖 **Para detalhes completos da arquitetura, consulte a documentação oficial em [`docs/architecture/`](./docs/architecture/README.md).**

---

## 🚀 Estrutura do Repositório

```
Edgekit Platform/
├── apps/
│   ├── api/                     # Cloudflare Worker unificado (@edgekit/platform-api)
│   │   ├── src/                 # Hono, D1, R2, Durable Objects, Better Auth, Policy Engine
│   │   ├── test/                # Testes de integração (Vitest)
│   │   └── wrangler.jsonc       # Configurações do Worker & Static Assets (../web/dist)
│   │
│   └── web/                     # Frontend Dashboard SPA (@edgekit/platform-web)
│       ├── src/                 # React 19, TanStack Router, TanStack Query, Base UI
│       │   ├── components/      # UI components, layout, TopHeader, AppSidebar
│       │   ├── i18n/            # Internacionalização dinâmica (pt-BR / en)
│       │   └── pages/           # Overview, Database Studio, Auth, Storage, Realtime, Settings
│       └── vite.config.ts       # Vite + Tailwind v4 + Proxy reverso
│
├── packages/
│   └── client/                  # SDK Isomórfico TypeScript (@edgekit/platform-client)
├── docs/
│   └── architecture/            # Documentação técnica e decisões de arquitetura
└── scripts/                     # Automações de setup, chaves e migrações
```

---

## 🛠️ Comandos Principais

```bash
# Instalar dependências de todos os workspaces
pnpm install

# Iniciar ambiente de desenvolvimento local unificado (Worker em :8787 e Vite em :5173)
pnpm dev

# Iniciar apenas o backend ou frontend individualmente
pnpm dev:api
pnpm dev:web

# Compilar todo o projeto para produção (Web SPA + Worker API)
pnpm build

# Realizar o deploy na Cloudflare (Static Assets + Worker)
pnpm deploy

# Executar checagem de tipos estrita no monorepo
pnpm typecheck

# Executar testes automatizados (Web + API)
pnpm test

# Executar linter
pnpm lint
```

---

## 📦 SDK do Cliente

```bash
pnpm add @edgekit/platform-client
```

```typescript
import { createEdgekitClient } from '@edgekit/platform-client'

const client = createEdgekitClient({
  url: 'https://seu-worker.workers.dev',
  anonKey: 'sua-chave-anon'
})

// Consultas fluentes e seguras com Policy Engine
const { data, error } = await client
  .from('posts')
  .select('id, title, content, created_at')
  .eq('status', 'published')
  .order('created_at', 'desc')
  .limit(10)
  .execute()
```

---

## 📄 Licença

Distribuído sob a licença MIT. Consulte `LICENSE` para mais informações.
