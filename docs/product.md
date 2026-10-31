# ⚡ Edgekit Platform — Especificação Oficial do Produto & Arquitetura (Product Spec)

> **Documento Canônico de Produto, Arquitetura e Decisões Técnicas**  
> Este documento consolida todas as decisões estratégicas, premissas de engenharia, responsabilidades de cada módulo e as justificativas técnicas (*o porquê de cada escolha*) para o desenvolvimento do **Edgekit Platform**.

---

## 1. Visão Geral & Posicionamento Estratégico

### 1.1. O que é o Edgekit Platform?
O **Edgekit Platform** é um **Backend as a Service (BaaS) Open-Source, Serverless, Self-Hosted e Completo**, projetado especificamente para a infraestrutura da **Cloudflare** (Workers, D1, R2 e Durable Objects), com suporte a desenvolvimento local ágil via **SQLite (`better-sqlite3`)**.

O desenvolvedor obtém, em um único deploy:
- **Banco de Dados Relacional:** Cloudflare D1 com Policy Engine declarativa (estilo PocketBase).
- **Autenticação Moderna:** Better Auth integrado nativamente, com suporte a sessões, 2FA, Magic Links e Organizações.
- **Armazenamento de Arquivos:** Cloudflare R2 com URLs pré-assinadas criptográficas (HMAC-SHA256) e streaming com suporte a Range requests (HTTP 206).
- **Tempo Real & Eventos:** Cloudflare Durable Objects com WebSockets hibernáveis multiplexados por tags e Change Data Capture (CDC).
- **Webhooks Seguros:** Envio de eventos em background com assinaturas digitais HMAC-SHA256 (`X-Edgekit-Signature`).
- **Dashboard Studio Integrado:** Painel web SPA (React 19, Tailwind CSS v4) para gerenciar dados, schemas, arquivos, usuários e logs.

---

### 1.2. Independência Absoluta na Família Edgekit
Dentro do ecossistema Edgekit existem dois conceitos fundamentais que **não se misturam**:

1. **Edgekit Kits (Serviços Especializados):**
   - Ferramentas isoladas para quem já possui um backend próprio (ex: *Edgekit Auth*, *Edgekit Realtime*, *Edgekit Storage*).
2. **Edgekit Platform (A Plataforma Integrada):**
   - O backend **completo** para quem deseja concentrar toda a infraestrutura da aplicação em um só lugar.
   - **Regra de Ouro:** O Edgekit Platform **não gerencia, não importa e não depende de nenhum outro produto da família Edgekit**. O Platform possui sua própria implementação nativa de banco, auth, storage e realtime.

---

### 1.3. O Foco: Self-Hosted e Gratuito no Plano Free da Cloudflare
- Não estamos construindo um SaaS comercial centralizado.
- O desenvolvedor faz o deploy do Platform diretamente na **sua própria conta Cloudflare**.
- Toda a arquitetura básica (D1, R2, Durable Objects, Workers e Static Assets) é **100% funcional no plano Free da Cloudflare**, com custo de infraestrutura zero para o desenvolvedor.

---

## 2. Decisões Arquiteturais Fundamentais & Seus Porquês

### 2.1. Modelo de Instância: 1 Deploy = 1 Projeto (Single-Instance)
* **Decisão:** Cada deploy do Edgekit Platform representa **um único projeto de backend**. Não existe uma camada central de gerenciamento de múltiplos projetos ou "Workspaces" no core do Platform.
* **O Porquê:**
  - Em plataformas como o Supabase, um cluster multi-tenant global precisa rotear milhares de bancos de dados isolados, criando uma sobrecarga monumental de infraestrutura.
  - Na Cloudflare, subir um novo Worker + D1 + R2 é instantâneo e gratuito.
  - Para separar ambientes (ex: `staging` e `production`), o desenvolvedor simplesmente usa o recurso nativo de ambientes do Wrangler (`pnpm deploy --env staging`) ou sobe uma segunda instância isolada.
  - Isso garante **isolamento físico de dados**: um bug ou vazamento em uma aplicação jamais atingirá dados de outra.

---

### 2.2. Por que NÃO forçar Workspaces ou Organizações por padrão?
* **Decisão:** O usuário final da aplicação **não é forçado a pertencer a uma organização ou grupo**. O suporte a organizações existe como um recurso *opt-in* via Better Auth (`organization()`).
* **O Porquê:**
  - Muitos projetos construídos com o Platform são aplicações B2C, e-commerces, aplicativos móveis simples, jogos ou blogs pessoais onde o conceito de "Empresa/Organização" não faz nenhum sentido.
  - Forçar todo usuário em uma organização padrão (`default_org`) criaria tabelas infladas com dados fantasmas, regras de RLS desnecessariamente complexas e atrito no fluxo de cadastro.
  - Quem constrói um SaaS B2B ativa o recurso de organizações com 1 clique; quem constrói um app B2C mantém usuários simples e diretos.

---

### 2.3. Dual Identity: Separação Rígida entre Administrador e Usuário
* **Decisão:** A plataforma mantém tabelas e fluxos de autenticação completamente separados:
  1. `_ek_admins`: Equipe de desenvolvimento que administra a plataforma (Owner, Admin, Developer, Viewer).
  2. `users`: Usuários finais cadastrados na aplicação desenvolvida.
* **O Porquê:**
  - Se os administradores da plataforma e os usuários do app compartilhassem a mesma tabela (ex: apenas uma coluna `role = 'admin'`), qualquer brecha no fluxo de cadastro ou atualização de perfil de usuário do app poderia permitir escalonamento de privilégios para acesso total ao banco D1 e ao storage R2.
  - As senhas dos administradores são protegidas com `WebCrypto PBKDF2` (100.000 iterações, salt 16 bytes) e sessões HttpOnly isoladas (`edgekit_admin_session`).
  - O SQL Runner do painel possui guardrail no servidor que impede mutações diretas em `_ek_admins` e `_ek_api_keys`.

---

### 2.4. Setup Wizard Imutável (`/setup`)
* **Decisão:** O endpoint `/api/v1/admin/setup` só funciona exatamente **uma vez**, no primeiro deploy da plataforma, para registrar o primeiro Proprietário (`Owner`).
* **O Porquê:**
  - Assim que o primeiro admin é registrado, o endpoint é permanentemente bloqueado com **HTTP 403 Forbidden**.
  - Isso elimina qualquer possibilidade de ataque de sequestro de instância (*instance takeover*), mesmo que o deploy fique exposto publicamente antes de o desenvolvedor acessar.

---

### 2.5. Armazenamento Seguro de Chaves de API (Zero Chaves em Texto Puro)
* **Decisão:** As chaves de API (`anon_key` e `service_role_key`) são armazenadas na tabela `_ek_api_keys` exclusivamente através do seu **hash SHA-256**.
* **O Porquê:**
  - Em plataformas antigas ou mal configuradas, chaves de administração ficam salvas em texto claro no banco. Se um dump do banco vazar, todas as chaves vazam juntas.
  - No Edgekit Platform, o backend computa `SHA-256(chave_recebida)` em tempo de requisição e compara com o hash indexado no banco. O valor original nunca pode ser recuperado a partir do banco.

---

### 2.6. Dual Runtime: `better-sqlite3` no Desenvolvimento Local e D1 na Nuvem
* **Decisão:** O código suporta execução híbrida:
  - Localmente (Node.js, Vitest, Drizzle Kit, scripts): usa `better-sqlite3` gravando em `dev.db`.
  - Produção (Cloudflare Workers): usa a API nativa do binding `env.DB` (Cloudflare D1).
* **O Porquê:**
  - O Cloudflare D1 em modo local nem sempre oferece paridade perfeita com scripts externos ou ferramentas de migração do Drizzle Kit.
  - O `better-sqlite3` permite rodar testes unitários e de integração em milissegundos no Vitest sem precisar inicializar emuladores pesados ou depender de conexão de rede.

---

### 2.7. Motor de Políticas Declarativo (PocketBase-style com Deny-by-Default)
* **Decisão:** Cada tabela criada no banco de dados nasce **completamente bloqueada** (`deny-by-default`). O acesso é liberado por operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) através de regras declarativas:
  - `disabled`: Ninguém acessa (apenas admin/service_role).
  - `public`: Acesso livre (mesmo com chave anônima).
  - `authenticated`: Exige usuário logado (`auth.id IS NOT NULL`).
  - `owner`: Permite acesso se `coluna_dono = auth.id`.
  - `org_member`: Permite acesso se `coluna_org = auth.active_organization_id`.
  - `custom_sql`: Expressões dinâmicas compiladas de forma segura.
* **O Porquê:**
  - O SQLite do D1 não possui Row Level Security (RLS) nativo do PostgreSQL.
  - Criar um compilador de políticas no nível da aplicação que injeta as cláusulas `WHERE` diretamente nas consultas SQL garante a mesma segurança do Supabase com a velocidade e simplicidade do PocketBase.

---

### 2.8. Storage R2 com URLs Pré-Assinadas (HMAC-SHA256) e Range Requests
* **Decisão:** O acesso a arquivos privados é feito via URLs assinadas temporalmente (`POST /:bucket/signed-url`). O endpoint de streaming suporta cabeçalhos `Range: bytes=start-end`.
* **O Porquê:**
  - **URLs Assinadas:** Permitem que o frontend compartilhe links temporários de documentos confidenciais (ex: relatórios, comprovantes) sem tornar o bucket público e sem sobrecarregar o Worker com proxy constante de arquivos.
  - **Range Requests (HTTP 206):** Essencial para streaming de mídia (vídeo e áudio) e visualizadores de PDF, permitindo que o player carregue apenas o pedaço do arquivo que está sendo reproduzido.
  - **Políticas de Bucket:** Cada bucket define seu limite máximo em bytes (`maxSizeBytes`) e tipos de arquivos aceitos (`allowedMimeTypes`), rejeitando uploads maliciosos antes de consumir espaço no R2.

---

### 2.9. Realtime: 1 Hub Durable Object com Multiplexação por Tags
* **Decisão:** Em vez de abrir múltiplas conexões WebSocket ou forçar 1 DO por organização, o cliente mantém **uma única conexão WebSocket** com um Hub Durable Object, utilizando as **WebSocket Tags** nativas da Cloudflare para assinar e desassinar canais dinamicamente.
* **O Porquê:**
  1. **Apenas 1 conexão no cliente:** Dispositivos móveis e navegadores sofrem com consumo de bateria e latência ao manter vários WebSockets abertos. Com multiplexação, um único túnel recebe mensagens de posts, chat, notificações e status.
  2. **Hibernação Nativa (Custo Zero de CPU):** A Cloudflare Hibernation API suspende conexões ociosas. O DO só gasta ciclos de CPU no instante em que transmite uma mensagem.
  3. **Capacidade Massiva:** Um único DO suporta até **32.768 conexões simultâneas**. Para a arquitetura de 1 deploy por projeto, isso cobre a necessidade de praticamente qualquer aplicação em produção.
  4. **Entrega Cirúrgica:** `ctx.getWebSockets("canal")` entrega o evento instantaneamente apenas aos sockets inscritos naquela tag.

---

### 2.10. Webhooks com Assinatura Criptográfica HMAC-SHA256
* **Decisão:** Eventos de banco (CDC) ou gatilhos manuais podem ser despachados para URLs externas via HTTP POST, acompanhados dos cabeçalhos:
  - `X-Edgekit-Signature: sha256=<hash_hex>`
  - `X-Edgekit-Timestamp: <timestamp>`
* **O Porquê:**
  - Garante aos servidores de destino (ex: Slack, Stripe, ERPs, lambdas externas) que a mensagem foi genuinamente gerada pelo Edgekit Platform e não foi adulterada no trânsito (*replay attacks* ou spoofing).
  - O envio usa `c.executionCtx.waitUntil`, executando em background sem atrasar a resposta da API para o cliente.

---

### 2.11. Edge Functions: Desabilitadas por Padrão (Guardrail do Plano Free)
* **Decisão:** O suporte a Dynamic Workers (Workers for Platforms) é estritamente opcional e vem com a flag `ENABLE_FUNCTIONS=false` por padrão.
* **O Porquê:**
  - Dynamic Workers exigem o plano pago da Cloudflare (*Workers Paid / Workers for Platforms*).
  - Se deixássemos habilitado, qualquer desenvolvedor que fizesse o deploy no plano gratuito receberia erros fatais de runtime.
  - Com o guardrail, o endpoint retorna **HTTP 501 `DYNAMIC_WORKERS_UNAVAILABLE`** com instruções claras de como habilitar caso o usuário possua um plano pago.

---

## 3. Matriz de Responsabilidades por Módulo

| Módulo / Pacote | Responsabilidade Primária | O que NÃO deve fazer |
| :--- | :--- | :--- |
| **`apps/api`** | Cloudflare Worker unificado. Contém rotas Hono, Better Auth, D1 runtime, R2 streaming, DO Realtime, motor de políticas e despacho de webhooks. | Não deve conter lógica específica de UI nem depender de serviços externos proprietários fora da Cloudflare. |
| **`apps/web`** | Dashboard SPA administrativo (React 19, Vite, Tailwind v4). Gestão de tabelas, visualização de dados, explorador de arquivos, usuários e logs. | Não deve armazenar credenciais sensíveis em LocalStorage nem executar regras de negócio críticas (toda segurança deve ser garantida pela API). |
| **`packages/client`** | SDK TypeScript universal e tipado para desenvolvedores consumirem o backend em suas próprias aplicações (web, mobile, Node). | Não deve ter dependências do ambiente Cloudflare Workers nem de bibliotecas pesadas de Node.js. |
| **`scripts/`** | Automações de setup local e provisionamento na Cloudflare (`wrangler d1`, `wrangler r2`, geração de chaves). | Não deve conter segredos hardcoded nem alterar arquivos fora do diretório do projeto. |

---

## 4. Regras Inegociáveis de Engenharia (Guardrails)

1. **Nunca quebrar a independência do produto:**
   - Jamais adicione imports, chamadas de rede ou dependências de outros produtos Edgekit (Edgekit Auth, Edgekit Realtime, etc.). O Platform é auto-suficiente.
2. **Deny-by-Default em tudo:**
   - Qualquer nova tabela ou novo bucket de arquivos deve nascer fechado para acesso público até que uma regra explícita seja cadastrada.
3. **Zero chaves em texto claro:**
   - Senhas sempre via WebCrypto PBKDF2; chaves de API sempre em hash SHA-256.
4. **Sem concessões na qualidade:**
   - Todo código novo deve compilar com 0 erros no TypeScript (`pnpm typecheck`), ter 0 erros no linter (`pnpm lint`) e possuir testes automatizados no Vitest (`pnpm test`).
5. **Simplicidade sobre abstrações desnecessárias:**
   - Se uma funcionalidade puder ser resolvida de maneira elegante com recursos nativos da Cloudflare (como WebSocket Tags ou R2 Ranges), nunca introduza bibliotecas pesadas de terceiros.

---

## 5. Especificações Técnicas Aprofundadas por Domínio

Para detalhes completos de implementação, algoritmos, rotas e payloads de cada subsistema, consulte a documentação dedicada:

- 🗄️ [**Banco de Dados & Policy Engine**](./domains/database.md): D1 + better-sqlite3 local, motor de políticas PocketBase-style compilado para SQL, filtros avançados e Change Data Capture (CDC).
- 🔐 [**Autenticação & Identidade**](./domains/auth.md): Dual Identity (`_ek_admins` vs `users`), PBKDF2 WebCrypto, sessões HttpOnly, Setup Wizard imutável e plugins Better Auth.
- 🪣 [**Armazenamento de Arquivos**](./domains/storage.md): Cloudflare R2, URLs pré-assinadas com HMAC-SHA256, HTTP Range streaming (206) e quotas por bucket.
- ⚡ [**Tempo Real & Durable Objects**](./domains/realtime.md): Hub DO com multiplexação por tags sobre uma única conexão WebSocket (Cloudflare Hibernation API) e Presence API.
- 🪝 [**Webhooks HTTP & Assinaturas**](./domains/webhooks.md): Despacho assíncrono em background (`waitUntil`), assinaturas criptográficas `X-Edgekit-Signature` e ferramenta de Ping Test com latência.
