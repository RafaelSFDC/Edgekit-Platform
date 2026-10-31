# 🗄️ Domínio: Banco de Dados & Policy Engine (D1 + SQLite)

> Especificação técnica detalhada do subsistema de banco de dados, motor de políticas declarativas, Data API dinâmica e Change Data Capture (CDC) do Edgekit Platform.

---

## 1. Visão Geral da Arquitetura de Dados

O Edgekit Platform utiliza uma arquitetura de banco de dados híbrida (**Dual Runtime**) para garantir velocidade máxima no desenvolvimento local e escala global na nuvem:

| Ambiente | Motor de Banco de Dados | Driver / Acesso | Finalidade |
| :--- | :--- | :--- | :--- |
| **Produção** | **Cloudflare D1** | Binding nativo `c.env.DB` | Execução serverless distribuída nas bordas da Cloudflare. |
| **Local / Testes** | **SQLite (`better-sqlite3`)** | Arquivo local `dev.db` | Execução no Node.js, Vitest, Drizzle Kit e scripts CLI sem latência de rede. |

Ambos os runtimes executam a mesma dialética SQLite e compartilham as mesmas migrações do Drizzle ORM.

---

## 2. Estrutura do Schema & Isolamento de Tabelas

O banco de dados é estritamente particionado em dois blocos de tabelas:

### 2.1. Tabelas de Sistema da Plataforma (Prefixo `_ek_*`)
Gerenciam a infraestrutura interna do projeto. Nunca devem ser expostas para usuários finais:
* `_ek_admins`: Equipe com acesso ao Dashboard (Owner, Admin, Developer, Viewer).
* `_ek_admin_sessions`: Sessões ativas do painel administrativo via cookies HttpOnly.
* `_ek_admin_invites`: Convites pendentes para novos administradores.
* `_ek_api_keys`: Chaves de API (`anon` e `service_role`) armazenadas exclusivamente com **hash SHA-256**.
* `_ek_table_policies`: Regras de controle de acesso (Policy Engine) por tabela.
* `_ek_storage_buckets` & `_ek_storage_objects`: Metadados de arquivos e políticas de buckets no R2.
* `_ek_webhooks`: Configurações de webhooks HTTP e segredos HMAC.
* `_ek_audit_logs`: Registro de auditoria de ações administrativas.
* `_ek_settings`: Configurações de segurança e variáveis de runtime.

### 2.2. Tabelas da Aplicação (App Tables)
Tabelas criadas pelo desenvolvedor para o seu negócio (ex: `posts`, `pedidos`, `produtos`) e as tabelas nativas de usuários geradas pelo **Better Auth**:
* `users`: Usuários finais da aplicação.
* `sessions`, `accounts`, `verifications`: Gestão de sessões e credenciais Better Auth.
* `organizations`, `members`, `invitations`: Suporte opcional a times e organizações.

---

## 3. Motor de Políticas (Policy Engine PocketBase-style)

Como o Cloudflare D1 (SQLite) não possui Row Level Security (RLS) nativo do PostgreSQL, o Edgekit Platform implementa uma **Policy Engine declarativa compilada diretamente para SQL**.

### 3.1. Princípio Deny-by-Default
Qualquer tabela recém-criada nasce **fechada por padrão**. Nenhuma requisição com chave anônima ou token de usuário comum pode ler ou escrever dados até que uma regra explícita seja cadastrada.

### 3.2. Regras Disponíveis por Operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
* **`disabled` (Padrão):** Operação completamente bloqueada. Apenas administradores ou requisições autenticadas com `service_role_key` têm bypass.
* **`public`:** Acesso liberado para qualquer cliente (incluindo chave anônima).
* **`authenticated`:** Exige que a requisição possua um usuário logado (`auth.id IS NOT NULL`).
* **`owner`:** Permite a operação somente se a coluna definida em `ownerColumn` for idêntica ao ID do usuário autenticado:
  ```sql
  WHERE "user_id" = 'usr_123'
  ```
  No caso de `INSERT`, o motor injeta automaticamente o `auth.id` na coluna de dono se o payload não fornecer.
* **`org_member`:** Permite a operação se a coluna de dono bater com o ID da organização ativa da sessão (`auth.activeOrganizationId`).
* **`custom_sql`:** Expressões SQL dinâmicas com interpolação segura de variáveis:
  - `@auth.id`: Substituído pelo ID do usuário autenticado.
  - `@auth.role`: Substituído pelo papel do usuário.
  - `@auth.email`: Substituído pelo e-mail do usuário.

---

## 4. Data API Dinâmica & Filtros Avançados

O endpoint `/api/v1/db/:table` fornece uma interface REST fluente e segura para operações CRUD:

### 4.1. Operadores de Filtro Suportados na Query String

| Operador | Exemplo na URL | SQL Gerado |
| :--- | :--- | :--- |
| **`eq` (Padrão)** | `?status=active` | `WHERE status = 'active'` |
| **`neq`** | `?status=neq:draft` | `WHERE status != 'draft'` |
| **`in`** | `?status=in:active,pending` | `WHERE status IN ('active', 'pending')` |
| **`not_in`** | `?status=not_in:archived,draft` | `WHERE status NOT IN ('archived', 'draft')` |
| **`is:null`** | `?deleted_at=is:null` | `WHERE deleted_at IS NULL` |
| **`is:not_null`**| `?deleted_at=is:not_null` | `WHERE deleted_at IS NOT NULL` |
| **`gt` / `gte`** | `?price=gte:100` | `WHERE price >= 100` |
| **`lt` / `lte`** | `?price=lt:50` | `WHERE price < 50` |
| **`like`** | `?title=like:%tecnologia%` | `WHERE title LIKE '%tecnologia%'` |

### 4.2. Paginação e Ordenação
* `?limit=20&offset=40`: Paginação clássica com totalizadores.
* `?order=created_at.desc`: Ordenação por qualquer coluna indexada.
* `?select=id,title,price`: Projeção de colunas específicas.

---

## 5. Change Data Capture (CDC) Automático

Toda operação de mutação executada com sucesso via Data API (`INSERT`, `UPDATE`, `DELETE`) dispara automaticamente dois fluxos assíncronos:
1. **Broadcast Realtime:** Emite uma mensagem para o canal WebSocket `db:<nome_da_tabela>` no Hub Durable Object.
2. **Despacho de Webhooks:** Procura webhooks ativos configurados para escutar aquela tabela ou ação (`*`, `INSERT`, `pedidos.*`) e despacha em background com assinatura digital HMAC-SHA256.

---

## 6. Guardrails de Segurança no SQL Runner

No painel de controle (Database Studio), existe um executor direto de queries SQL. Para garantir integridade total do sistema:
* Comandos de mutação direta (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`) contra `_ek_admins`, `_ek_admin_sessions` e `_ek_api_keys` são **interceptados e rejeitados no backend com HTTP 403**.
* O gerenciamento dessas tabelas deve ser feito exclusivamente pelas rotas dedicadas da API administrativa.
