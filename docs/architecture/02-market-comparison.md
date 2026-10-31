# 02. Comparativo de Mercado e Lições Arquiteturais

> Análise das principais plataformas BaaS existentes no mercado (Supabase, PocketBase, Firebase, Appwrite, Convex e Nhost) para fundamentar as decisões do Edgekit Platform.

---

## 1. Matriz Comparativa

| Dimensão | Supabase | PocketBase | Firebase | Appwrite | Convex | Edgekit Platform |
|---|---|---|---|---|---|---|
| **Modelo Self-Hosted** | 1 Instância = 1 Projeto (~10 containers) | 1 Instância = 1 Projeto (1 binário Go) | Sem self-hosting | Multi-projeto em 1 host (~20 containers) | 1 Instância = 1 Projeto (Binário Rust/Node) | **1 Instância = 1 Projeto (Cloudflare Worker Serverless)** |
| **Banco de Dados** | PostgreSQL dedicado | SQLite embutido | NoSQL proprietário (Firestore/RTDB) | MariaDB compartilhado | Motor reativo customizado | **Cloudflare D1 (SQLite distribuído)** |
| **Controle de Acesso** | RLS nativo no Postgres | API Rules compiladas em SQL `WHERE` | Security Rules unificadas | Permissões por documento | Funções TypeScript com contexto | **Policy Engine compilada em SQL `WHERE` (PocketBase-style)** |
| **Realtime** | Elixir + WAL CDC | SSE por coleção | WebSockets / SDK listeners | WebSockets por canal | Reatividade automática em queries | **Durable Objects com Hibernation API + CDC** |
| **Storage** | S3-compatible + Postgres ACL | Disco local / S3 | Google Cloud Storage | S3-compatible | Storage integrado | **Cloudflare R2 + Buckets Lógicos + ACL** |
| **Functions** | Deno Edge Functions | Hooks em Go/JS no binário | Google Cloud Functions | Containers Open-Runtimes | Funções no próprio motor de DB | **Dynamic Workers (Opt-in via flag para plano pago)** |
| **Operação de Self-Host** | Complexa (Docker Compose pesado) | **Extremamente simples** (1 arquivo) | Impossível | Complexa (dezenas de serviços) | Média | **Ultra simples (1 deploy serverless na Cloudflare)** |

---

## 2. Principais Lições Aprendidas

### 2.1. Da Experiência do PocketBase (Simplicidade & Eficiência)
- **O modelo 1 Instância = 1 Projeto é imbatível para self-hosting:** Elimina a camada de roteamento multi-tenant interna, isola falhas e simplifica o deploy.
- **Separação de Identidades:** PocketBase separa rigidamente administradores do sistema (`_admins`) dos usuários das aplicações (`users`). Essa decisão elimina confusão de papéis e vetores de ataque por escalonamento de privilégio.
- **Regras compiladas para SQL:** Como SQLite não possui RLS nativo, compilar expressões declarativas em filtros SQL `WHERE` parametrizados é uma abordagem extremamente eficiente, segura e portável.

### 2.2. Do Supabase (Developer Experience & Integrações)
- **Integração Nativa de Serviços:** Autenticação e banco devem compartilhar contexto de forma transparente. Saber quem é `auth.uid` dentro das regras de acesso é indispensável.
- **Tipagem Automática:** Gerar tipos TypeScript diretamente das definições das tabelas é o recurso mais elogiado do ecossistema Supabase e deve ser nativo na CLI do Edgekit (`pnpm db:types`).
- **Segurança de Chaves:** Chaves públicas (`anon`) e secretas (`service_role`) com propósitos e níveis de autorização bem delimitados.

### 2.3. Do Firebase (Consistência Unificada)
- **Linguagem de Regras Transversal:** Ter uma convenção unificada para autorizar tanto linhas de banco quanto arquivos de Storage e canais de Realtime.

### 2.4. O que Evitar a Todo Custo (Falhas de Outras Soluções)
- **Complexidade Operacional Desnecessária:** Evitar arquiteturas que exigem gerenciar Redis, RabbitMQ, PostgreSQL, MinIO e múltiplos microserviços para rodar um projeto simples. A Cloudflare já entrega banco, storage e comunicação com manutenção zero.
- **Abstrações Prematuras:** Não tentar emular RDBMS de grande porte em SQLite; respeitar a natureza do SQLite/D1 e focar em velocidade e simplicidade.
