# 🔐 Domínio: Autenticação, Identidade & Permissões

> Especificação técnica detalhada da separação de identidades (Dual Identity), segurança de credenciais, fluxo imutável de setup e integração com os plugins do Better Auth.

---

## 1. O Modelo Dual Identity (Separação Rígida de Identidades)

Uma das falhas mais comuns em sistemas BaaS amadores é misturar a equipe que opera o backend com os usuários finais cadastrados na aplicação. No Edgekit Platform, essas identidades são física e logicamente separadas:

```
┌───────────────────────────────────────┐       ┌───────────────────────────────────────┐
│        ADMINISTRADORES DA PLATAFORMA  │       │       USUÁRIOS FINAIS DA APLICAÇÃO    │
│            Tabela: `_ek_admins`       │       │             Tabela: `users`           │
├───────────────────────────────────────┤       ├───────────────────────────────────────┤
│ • Acesso: Painel / Dashboard Admin    │       │ • Acesso: Aplicação web, mobile, etc. │
│ • Autenticação: PBKDF2 WebCrypto      │       │ • Autenticação: Better Auth Engine    │
│ • Sessão: Cookie `edgekit_admin_...`  │       │ • Sessão: Cookie de app ou Bearer JWT │
│ • Privilégios: Totais sobre D1/R2/DO  │       │ • Privilégios: Restritos pelo Policy  │
└───────────────────────────────────────┘       └───────────────────────────────────────┘
```

**Benefício de Segurança:** Mesmo que ocorra uma vulnerabilidade grave de injeção de dados no fluxo de cadastro da aplicação, o invasor estará restrito à tabela `users` e jamais terá acesso aos privilégios de infraestrutura de `_ek_admins`.

---

## 2. Autenticação Administrativa (Platform Team)

### 2.1. Criptografia de Senhas com PBKDF2 WebCrypto
Não são utilizadas bibliotecas nativas C++ de Node (como `bcrypt` legado) que quebram nos Workers da Cloudflare. A segurança das senhas administrativas é garantida via **Web Crypto API pura**:
* **Algoritmo:** `PBKDF2` com hash `SHA-256`.
* **Iterações:** 100.000 iterações obrigatórias.
* **Salt:** 16 bytes gerados criptograficamente (`crypto.getRandomValues`).
* **Formato de armazenamento:** `pbkdf2:100000:<salt_hex>:<hash_hex>`.

### 2.2. Sessões HttpOnly Seguras
* O login administrativo em `POST /api/v1/admin/login` emite um cookie de sessão assinado:
  - Nome: `edgekit_admin_session`.
  - Flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` (7 dias).
* Essa abordagem impede que ataques de Cross-Site Scripting (XSS) no frontend consigam extrair o token de sessão da equipe.

### 2.3. Setup Wizard Imutável (`POST /api/v1/admin/setup`)
* No primeiro deploy da plataforma, o endpoint de setup permite criar o Proprietário (`owner`).
* Uma vez criado o primeiro admin, o endpoint é **permanentemente bloqueado (HTTP 403)**.
* Tentativas de recriar ou invocar o setup novamente são rejeitadas tanto no nível de rota quanto por validação de banco, blindando a plataforma contra sequestros de instância (*instance takeover*).

---

## 3. Chaves de API & Armazenamento Hashed (Zero Plaintext)

A plataforma opera com dois tipos de chaves de API:
1. **`EDGEKIT_ANON_KEY`:** Chave pública segura para clientes frontend (browsers, mobile). Acesso estritamente regulado pelas regras da Policy Engine.
2. **`EDGEKIT_SERVICE_ROLE_KEY`:** Chave secreta de super-administrador. Possui bypass total das regras de policy. **Nunca deve ser exposta no frontend**.

### 3.1. Armazenamento via Hash SHA-256
As chaves geradas nunca são salvas em texto puro no banco de dados:
```ts
// Ao criar a chave:
const keyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey))
await db.insert(ekApiKeys).values({ keyHash: toHex(keyHash), ... })
```
Quando uma requisição chega com o cabeçalho `apikey: <chave>`, o backend calcula o hash em tempo real e busca pelo hash. Se o banco for comprometido, as chaves reais continuam ilegíveis.

---

## 4. Autenticação de Usuários da Aplicação (Better Auth)

A camada de autenticação para as aplicações do desenvolvedor é alimentada pelo **Better Auth**, com execução nativa sobre o Cloudflare D1 e suporte a múltiplos plugins:

### 4.1. Plugins Ativados Nativamente
* **`bearer()`:** Permite que clientes mobile e SPAs autentiquem via cabeçalho HTTP padrão `Authorization: Bearer <session_token>`.
* **`twoFactor()`:** Suporte completo a 2FA (TOTP via Google Authenticator e códigos de backup).
* **`magicLink()` & `emailOTP()`:** Login moderno sem senha via links e códigos de verificação.
* **`admin()`:** Ferramentas de gestão de usuários (bloqueio, impersonação, atribuição de roles).
* **`organization()` (Opt-in B2B):** Suporte nativo a múltiplos times, papéis e convites de membros.

### 4.2. Gestão de Sessões Ativas & Revogação
O painel administrativo do Edgekit Platform permite inspecionar e derrubar sessões em tempo real:
* `GET /api/v1/admin/users/:id/sessions`: Lista todos os navegadores, IPs e dispositivos conectados do usuário.
* `DELETE /api/v1/admin/sessions/:id`: Revoga a sessão instantaneamente, forçando logout do cliente na próxima requisição.

---

## 5. Matriz de Papéis Administrativos (Roles)

| Papel | Permissões |
| :--- | :--- |
| **`owner`** | Controle irrestrito: criar novos admins, gerenciar chaves mestras, alterar buckets, schemas e deletar o projeto. |
| **`admin`** | Gestão de dados, políticas, usuários do app, webhooks e storage. Não pode deletar o Owner. |
| **`developer`** | Leitura e escrita de dados, visualização de schemas e políticas, execução de queries SQL e testes de webhooks. |
| **`viewer`** | Apenas leitura de tabelas, arquivos e métricas. Nenhuma mutação autorizada. |
