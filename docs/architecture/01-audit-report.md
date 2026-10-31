# 01. Diagnóstico e Auditoria do Código Legado

> Auditoria técnica executada sobre a base anterior do Edgekit Platform (commit `9fe2f11`), analisando rotas de API, modelos de banco de dados, frontend, SDK e automações.

---

## 1. Resumo do Diagnóstico

A base legada implementava um protótipo inicial de BaaS em Cloudflare Worker único. Embora contasse com uma interface moderna em React 19 e boas dependências básicas (Hono, Drizzle, Better Auth), apresentava **falhas de segurança graves**, acoplamento entre perfis de usuário incompatíveis e código legado que impedia o uso profissional seguro.

---

## 2. Falhas Críticas de Segurança Identificadas

| ID | Classificação | Descrição e Impacto |
|---|---|---|
| **C1** | **Chaves Padrão Hardcoded com Poder de Admin** | Em `keys.ts`, se a variável de ambiente `EDGEKIT_SERVICE_ROLE_KEY` ou `HONOBASE_SERVICE_ROLE_KEY` não estivesse presente, a aplicação gerava e inseria automaticamente no banco D1 a chave `hb_service_default` com privilégios totais de `admin`. Mesmo trocando a variável posteriormente, a chave gravada persistia ativa indefinidamente no D1. |
| **C2** | **Tomada de Controle de Instância (Setup Takeover)** | O endpoint `POST /api/v1/admin/setup` operava sem proteção ou token de autorização. Qualquer ator que enviasse uma requisição logo após o deploy assumia a conta de administrador da plataforma. |
| **C3** | **Realtime sem Autorização e Vazamento de CDC** | O canal WebSocket e os eventos de banco transmitiam o registro completo (incluindo senhas ou dados confidenciais) para qualquer assinante anônimo em canais como `db:users`. Qualquer cliente podia forjar mensagens em tempo real fazendo `POST /realtime/:channel/broadcast`. |
| **C4** | **Storage sem Controle de Acesso (ACL Bypass)** | A rota `/storage/:bucket/list` era pública e listava metadados de arquivos privados. Downloads ignoravam o status `isPublic`, e qualquer chave com permissão de escrita podia excluir arquivos de terceiros. |
| **C5** | **Autorização Aberta por Padrão (Open by Default)** | Tabelas sem regras de acesso explícitas ou com `rlsEnabled=false` eram expostas publicamente para leitura. A regra `authenticated` permitia que qualquer usuário logado alterasse e excluísse dados pertencentes a outros usuários. |
| **C6** | **Login Administrativo com Service Key em Cookie** | O login no painel administrativo era realizado colando a `service_role_key` diretamente em um input, gravando-a crua em um cookie HTTP. Não havia autenticação de membros, auditoria nem revogação individual. |
| **C7** | **Confusão de Identidades (Admin vs. App Users)** | Administradores da plataforma e usuários finais da aplicação eram armazenados na mesma tabela `users`. Um usuário final promovido a `role='admin'` ganhava acesso irrestrito ao SQL Runner e às configurações da infraestrutura. |

---

## 3. Problemas Estruturais e Arquiteturais

1. **Dual Runtime Desnecessário:** A presença de rotas e stubs para Node.js (`better-sqlite3`, fallback para disco local) gerava código morto e complexidade de manutenção, contradizendo o foco nativo em Cloudflare.
2. **Migrations em Tempo de Requisição:** O auto-bootstrap aplicava migrações D1 em chamadas HTTP interceptadas, engolindo erros de sintaxe e podendo corromper o banco.
3. **Persistência Volátil no Realtime:** O `RealtimeDurableObject` mantinha sessões ativas apenas em um `Map` em memória RAM, perdendo a presença de usuários conectados assim que o Durable Object entrava em hibernação.
4. **Acoplamento no Dashboard:** A página `DatabasePage.tsx` possuía mais de 56 KB em um único arquivo monolítico, dificultando manutenções e testes.

---

## 4. Classificação das Funcionalidades

| Funcionalidade | Status Legado | Ação na Nova Arquitetura |
|---|---|---|
| Health Check & Docs Scalar | ✅ Funcional | Manter e padronizar rotas |
| Shell do Dashboard & UI base | ✅ Funcional | Manter (React 19, Tailwind v4, i18n, tema) |
| REST Data API | 🟡 Parcial | Reconstruir com filtros completos e validação |
| Motor de Regras (RLS) | 🔴 Incorreto | Reconstruir (Deny-by-default compilado para SQL) |
| Visual DDL & SQL Runner | 🟡 Parcial | Reconstruir com suporte a FKs e proteção de tabelas `_ek_*` |
| Auth de Usuários Finais | 🟡 Parcial | Reconstruir usando Better Auth com plugins completos |
| Login do Painel | 🔴 Incorreto | Substituir por Auth real de Membros (`_ek_admins`) |
| Storage | 🔴 Incorreto | Reconstruir com buckets lógicos reais e Signed URLs |
| Realtime | 🔴 Incorreto | Reconstruir com Hibernation API (`serializeAttachment`) |
| Edge Functions | ⚪ Inexistente | Implementar como flag opcional (`ENABLE_FUNCTIONS=false`) |
| Stubs Node / `better-sqlite3` | 🟡 Parcial | Preservar e isolar para ambiente local/Node (Drizzle Kit, scripts e testes locais) |

---

## 5. Diretriz de Ação

A partir dessas constatações, o código legado do backend, o schema único e o SDK serão completamente **descartados e reconstruídos do zero**, preservando o ecossistema de UI do frontend para ser conectado à nova API limpa e segura.
