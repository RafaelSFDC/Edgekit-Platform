# ⚡ Edgekit Platform - Cloudflare Serverless BaaS

> **Backend-as-a-Service (BaaS) Open-Source e Self-Hosted na Cloudflare**, inspirado em Supabase, Appwrite e Firebase.
> Parte do ecossistema **Edgekit**, compartilhando a mesma arquitetura de monorepo e frontend estabelecida em **Edgekit Events**.
> Projetado para hospedar seu próprio backend com **custo zero** no plano gratuito da Cloudflare com hibernação nativa de WebSockets e Static Assets.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![D1 Database](https://img.shields.io/badge/Cloudflare-D1-F38020?logo=sqlite&logoColor=white)](https://developers.cloudflare.com/d1/)
[![R2 Storage](https://img.shields.io/badge/Cloudflare-R2-F38020?logo=amazon-s3&logoColor=white)](https://developers.cloudflare.com/r2/)
[![Durable Objects](https://img.shields.io/badge/Durable-Objects-F38020?logo=websocket&logoColor=white)](https://developers.cloudflare.com/durable-objects/)
[![Hono](https://img.shields.io/badge/Hono-v4-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🚀 Arquitetura do Monorepo

O repositório adota a estrutura unificada do ecossistema Edgekit:

```
Edgekit Platform/
├── apps/
│   ├── api/                     # Cloudflare Worker (@edgekit/platform-api)
│   │   ├── src/                 # Hono, D1, R2, Durable Objects, Better-Auth
│   │   ├── test/                # Testes de integração (Vitest)
│   │   └── wrangler.jsonc       # Configurações do Worker & Static Assets (../web/dist)
│   │
│   └── web/                     # Frontend Dashboard SPA (@edgekit/platform-web)
│       ├── src/                 # React 19, TanStack Router, TanStack Query, Base UI
│       │   ├── components/      # UI shadcn base-nova, TopHeader, AppSidebar
│       │   ├── i18n/            # Internacionalização dinâmica (pt-BR / en)
│       │   ├── pages/           # Overview, Database Studio, Auth, Storage, Realtime, Settings
│       │   └── theme/           # Dark / Light ThemeProvider
│       └── vite.config.ts       # Vite 6 + Tailwind v4 + Proxy reverso (:5173 -> :8787)
│
├── packages/
│   └── client/                  # SDK TypeScript (@edgekit/platform-client)
├── drizzle/                     # Migrações D1 SQLite
└── scripts/                     # Scripts de automação e setup
```

---

## 🛠️ Comandos Principais

```bash
# Instalar dependências de todos os workspaces
pnpm install

# Iniciar ambiente de desenvolvimento unificado (Worker em :8787 e Vite em :5173)
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

// Consultas com sintaxe fluente inspirada no Supabase
const { data, error } = await client
  .from('users')
  .select('id, name, email')
  .limit(10)
  .execute()
```

---

## 📄 Licença

Distribuído sob a licença MIT. Consulte `LICENSE` para mais informações.
