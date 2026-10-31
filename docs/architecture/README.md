# Edgekit Platform — Documentação de Arquitetura & Redefinição Estratégica

> Esta documentação estabelece o propósito, a arquitetura técnica, as decisões de produto e o roadmap de implementação do **Edgekit Platform**.

---

## 🎯 Visão Geral do Produto

O **Edgekit Platform** é uma plataforma completa e independente de **Backend as a Service (BaaS)**, desenhada especificamente para a infraestrutura moderna e serverless da **Cloudflare** (Workers, D1, R2 e Durable Objects).

Seguindo o modelo consagrado de plataformas open-source como **PocketBase** e **Supabase Self-Hosted**, a plataforma adota o paradigma **1 Deploy = 1 Projeto (Single-Instance)**:
- Cada projeto do desenvolvedor é uma instância autônoma e completa na sua própria conta Cloudflare.
- O desenvolvedor não precisa instalar, configurar ou orquestrar múltiplos serviços independentes (Auth, Realtime, Storage, Database). O Platform entrega tudo de maneira nativa e integrada.
- **Independência Total:** O Edgekit Platform **não é** gerenciador dos outros Edgekits, não é um agregador de kits e **não depende de nenhum outro produto da família Edgekit**. Quem precisa de um serviço pontual usa um Kit específico; quem precisa de um backend completo usa o Platform.

---

## 🧭 Princípios Fundamentais

1. **Self-hosted & Autônomo:** O desenvolvedor implanta e controla 100% da plataforma na sua própria conta Cloudflare, sem qualquer dependência de serviços externos obrigatórios ou provisionamento centralizado.
2. **Cloudflare Nativo em Produção + SQLite Local em Dev:** Em produção, utiliza 100% os recursos nativos da Cloudflare (Workers com Static Assets, D1 SQLite, R2 Storage, Durable Objects com Hibernação). Em desenvolvimento local e tooling (Drizzle Kit, scripts `tsx`, Vitest), preserva `better-sqlite3` para permitir execução e migrações ágeis em Node.js sem atrito.
3. **Simplicidade Operacional:** A complexidade desnecessária de múltiplos projetos ou workspaces dentro do mesmo runtime foi eliminada. A criação de novos projetos ou ambientes (`staging`, `production`) é feita no nível da Cloudflare via Wrangler/CLI.
4. **Segurança por Padrão (Deny-by-default):** Tabelas e buckets novos são fechados por padrão. Sem permissão explícita, ninguém lê nem grava dados.
5. **Identidades Estritamente Separadas:** Administradores e membros da equipe que operam o painel (`_ek_admins`) vivem em isolamento absoluto dos usuários finais da aplicação (`users`).
6. **Integração Nativa:** Autenticação alimenta o motor de políticas do banco de dados, que por sua vez alimenta o controle de acesso a arquivos no Storage e os filtros de eventos no Realtime.

---

## 🚫 O que NÃO Faremos

- Não transformaremos o Platform em um SaaS comercial multi-tenant com cobranças de assinatura.
- Não criaremos dependência de infraestrutura proprietária nossa.
- Não usaremos os outros Edgekits como dependências de código.
- Não introduziremos microserviços, RPCs internos ou containers distribuídos.
- Não manteremos retrocompatibilidade com códigos legados defeituosos ou conceitos obsoletos (`HonoBase`, stubs Node em produção).
- Não adicionaremos recursos fictícios no Dashboard que não correspondam a implementações reais.

---

## 📚 Índice da Documentação

1. **[01. Diagnóstico e Auditoria do Código Legado](./01-audit-report.md)**  
   Análise detalhada das falhas críticas de segurança, arquitetura single-tenant anterior e classificação de funcionalidades.

2. **[02. Comparativo de Mercado](./02-market-comparison.md)**  
   Benchmarking com Supabase, PocketBase, Firebase, Appwrite e Convex, identificando lições arquiteturais aplicadas.

3. **[03. Arquitetura e Modelo de Instância](./03-architecture-and-instance-model.md)**  
   Detalhes do modelo Single-Instance (1 Deploy = 1 Projeto), bindings estáticos da Cloudflare, limites e ciclo de vida.

4. **[04. Identidade, Segurança e Autorização](./04-identity-and-authorization.md)**  
   Separação estrita entre `_ek_admins` e usuários do app, chaves SHA-256, Setup Wizard seguro e a Policy Engine (SQL WHERE).

5. **[05. Serviços Nativos](./05-native-services.md)**  
   Especificação técnica aprofundada de Database (D1), Authentication (Better Auth Plugins), Storage (R2), Realtime (Durable Objects), Webhooks e Functions (Opt-in).

6. **[06. Experiência do Desenvolvedor (DX), SDK e CLI](./06-developer-experience-sdk-cli.md)**  
   Design do SDK isomórfico TypeScript, gerador de tipos a partir do D1, automação de setup e fluxos de trabalho.

7. **[07. Roadmap de Implementação](./07-roadmap-and-execution.md)**  
   Cronograma em 6 fases de execução, com critérios claros de saída e testes automatizados.
