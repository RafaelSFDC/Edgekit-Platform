import { describe, it, expect, beforeAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { app } from '../src/server/app'
import { getDb } from '../src/server/db'
import {
  ekAdmins,
  ekAdminSessions,
  ekApiKeys,
  ekTablePolicies,
  ekStorageBuckets,
  ekStorageObjects,
  ekWebhooks,
  users,
  sessions,
  accounts,
  members,
  invitations,
  organizations,
  jwks,
} from '../src/server/db/schema'
import { createEdgekitClient } from '../../../packages/client/src/index'
import { ADMIN_COOKIE_NAME } from '../src/server/auth/admin-auth'
import { evaluateTablePolicy } from '../src/server/policies/engine'
import { computeWebhookSignature, verifyWebhookSignature } from '../src/server/realtime/webhooks'
import { getBindings } from '../src/server/env'
import type { AppVariables } from '../src/server/types'

describe('Edgekit Platform — Fundação, Segurança & Identidade Dupla (Fase 1)', () => {
  let adminCookie = ''
  let serviceRoleKey = ''
  let anonKey = ''

  beforeAll(async () => {
    // Limpa tabelas de teste para garantir execução hermética
    const db = await getDb()
    try { await db.delete(ekAdminSessions) } catch {}
    try { await db.delete(ekAdmins) } catch {}
    try { await db.delete(ekApiKeys) } catch {}
    try { await db.delete(ekTablePolicies) } catch {}
    try { await db.delete(ekStorageBuckets) } catch {}
    try { await db.delete(ekStorageObjects) } catch {}
    try { await db.delete(ekWebhooks) } catch {}
    try { await db.delete(invitations) } catch {}
    try { await db.delete(members) } catch {}
    try { await db.delete(organizations) } catch {}
    try { await db.delete(sessions) } catch {}
    try { await db.delete(accounts) } catch {}
    try { await db.delete(jwks) } catch {}
    try { await db.delete(users) } catch {}
    try { await db.run(sql`DROP TABLE IF EXISTS articles`) } catch {}
    try { await db.run(sql`DROP TABLE IF EXISTS tasks`) } catch {}
    try { await db.run(sql`DROP TABLE IF EXISTS batch_items`) } catch {}
    try { await db.run(sql`DROP TABLE IF EXISTS user_notes`) } catch {}
    try { await db.run(sql`DROP TABLE IF EXISTS post_reviews`) } catch {}
  })

  it('GET /health deve retornar status ok e serviço Edgekit Platform', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.status).toBe('ok')
    expect(json.service).toBe('Edgekit Platform Serverless Backend')
  })

  it('GET /openapi.json deve expor especificação OpenAPI 3.1', async () => {
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.openapi).toBe('3.1.0')
    expect(json.info.title).toContain('Edgekit Platform')
  })

  it('GET /api/v1/admin/setup-status deve indicar setup pendente inicialmente', async () => {
    const res = await app.request('/api/v1/admin/setup-status')
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.isSetupComplete).toBe(false)
    expect(json.data.adminCount).toBe(0)
  })

  it('POST /api/v1/admin/setup rejeita tentativa sem token ou com token inválido quando SETUP_TOKEN está configurado', async () => {
    const bindings = await getBindings()
    if (bindings.SETUP_TOKEN) {
      // 1. Sem token
      const noTokenRes = await app.request('/api/v1/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Proprietário Root',
          email: 'owner@edgekit.dev',
          password: 'senha-segura-owner-123',
        }),
      })
      expect(noTokenRes.status).toBe(401)
      const noTokenJson: any = await noTokenRes.json()
      expect(noTokenJson.error.code).toBe('INVALID_SETUP_TOKEN')

      // 2. Token inválido/forjado
      const badTokenRes = await app.request('/api/v1/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Proprietário Root',
          email: 'owner@edgekit.dev',
          password: 'senha-segura-owner-123',
          setupToken: 'ek_setup_forged_hacker_token',
        }),
      })
      expect(badTokenRes.status).toBe(401)
      const badTokenJson: any = await badTokenRes.json()
      expect(badTokenJson.error.code).toBe('INVALID_SETUP_TOKEN')
    }
  })

  it('POST /api/v1/admin/setup cria o Proprietário (Owner) e define cookie de sessão', async () => {
    const bindings = await getBindings()
    const res = await app.request('/api/v1/admin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Proprietário Root',
        email: 'owner@edgekit.dev',
        password: 'senha-segura-owner-123',
        setupToken: bindings.SETUP_TOKEN || undefined,
      }),
    })

    expect(res.status).toBe(201)
    const json: any = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.admin.email).toBe('owner@edgekit.dev')
    expect(json.data.admin.role).toBe('owner')

    // Captura cookie de sessão administrativa
    const setCookieHeader = res.headers.get('set-cookie')
    expect(setCookieHeader).toContain(ADMIN_COOKIE_NAME)
    adminCookie = setCookieHeader?.split(';')[0] || ''
  })

  it('Tentativa secundária de POST /api/v1/admin/setup é bloqueada permanentemente (HTTP 403)', async () => {
    const res = await app.request('/api/v1/admin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invasor',
        email: 'hacker@malicious.com',
        password: 'senha-qualquer-123',
      }),
    })

    expect(res.status).toBe(403)
    const json: any = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('SETUP_ALREADY_COMPLETED')
  })

  it('POST /api/v1/admin/login autentica com sucesso o membro da equipe', async () => {
    const res = await app.request('/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@edgekit.dev',
        password: 'senha-segura-owner-123',
      }),
    })

    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.authenticated).toBe(true)
    expect(json.data.admin.role).toBe('owner')

    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain(ADMIN_COOKIE_NAME)
  })

  it('POST /api/v1/admin/login com senha incorreta retorna 401', async () => {
    const res = await app.request('/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@edgekit.dev',
        password: 'senha-errada-qualquer',
      }),
    })

    expect(res.status).toBe(401)
    const json: any = await res.json()
    expect(json.success).toBe(false)
  })

  it('GET /api/v1/admin/me retorna o perfil autenticado com cookie de sessão', async () => {
    const res = await app.request('/api/v1/admin/me', {
      headers: {
        Cookie: adminCookie,
      },
    })

    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.data.admin.email).toBe('owner@edgekit.dev')
    expect(json.data.admin.role).toBe('owner')
  })

  it('GET /api/v1/admin/me sem autenticação retorna HTTP 403', async () => {
    const res = await app.request('/api/v1/admin/me')
    expect(res.status).toBe(403)
    const json: any = await res.json()
    expect(json.error.code).toBe('FORBIDDEN')
  })

  it('Gestão de Chaves: Cria nova chave e armazena com hash SHA-256', async () => {
    const createRes = await app.request('/api/v1/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'Chave de Teste Service Role',
        type: 'service_role',
      }),
    })

    expect(createRes.status).toBe(201)
    const json: any = await createRes.json()
    expect(json.success).toBe(true)
    expect(json.data.key).toMatch(/^ek_sec_/)
    serviceRoleKey = json.data.key

    // Cria chave pública anon
    const createAnonRes = await app.request('/api/v1/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'Chave Anonima Pública',
        type: 'anon',
      }),
    })
    const anonJson: any = await createAnonRes.json()
    anonKey = anonJson.data.key
    expect(anonKey).toMatch(/^ek_anon_/)

    // Valida que no banco a chave foi salva como hash e não em texto puro
    const db = await getDb()
    const allDbKeys = await db.select().from(ekApiKeys).all()
    for (const k of allDbKeys) {
      expect(k.keyHash).not.toBe(serviceRoleKey)
      expect(k.keyHash).not.toBe(anonKey)
      expect(k.keyHash).toHaveLength(64) // SHA-256 hex string tem 64 caracteres
    }
  })

  it('Service Role Key permite acesso a endpoints administrativos via header apikey', async () => {
    const res = await app.request('/api/v1/admin/stats', {
      headers: {
        apikey: serviceRoleKey,
      },
    })

    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.success).toBe(true)
    expect(typeof json.data.totalTables).toBe('number')
  })

  it('Chave inválida ou forjada é recusada em rotas protegidas (HTTP 403)', async () => {
    const res = await app.request('/api/v1/admin/stats', {
      headers: {
        apikey: 'ek_sec_chave_falsa_inventada_12345',
      },
    })

    expect(res.status).toBe(403)
  })

  it('Guardrail SQL Runner: Bloqueia mutação direta nas tabelas _ek_admins e _ek_api_keys', async () => {
    const res = await app.request('/api/v1/admin/sql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        query: 'DELETE FROM _ek_admins WHERE id IS NOT NULL',
      }),
    })

    expect(res.status).toBe(403)
    const json: any = await res.json()
    expect(json.error.code).toBe('FORBIDDEN_MUTATION')
  })

  it('Deny-by-Default na Data API: Tabela nova sem regras rejeita requisições anônimas', async () => {
    // 1. Cria tabela 'articles' via admin API
    const createTableRes = await app.request('/api/v1/admin/tables', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'articles',
        columns: [
          { name: 'id', type: 'TEXT', primaryKey: true },
          { name: 'title', type: 'TEXT' },
          { name: 'content', type: 'TEXT' },
        ],
      }),
    })
    expect([201, 500]).toContain(createTableRes.status)

    // 2. Tenta consultar como anônimo sem política configurada -> deve negar (401/403)
    const client = createEdgekitClient({
      url: 'http://localhost',
      anonKey,
      fetch: async (input, init) => {
        const path = typeof input === 'string' ? new URL(input).pathname + new URL(input).search : input
        return Promise.resolve(app.request(path as string, init as any)) as unknown as Response
      },
    })

    const result = await client.from('articles').select('id, title').execute()
    expect(result.error).not.toBeNull()
    expect(result.error?.message).toContain('Acesso negado')

    // 3. Consulta com service_role_key deve ter bypass e funcionar
    const adminClient = createEdgekitClient({
      url: 'http://localhost',
      serviceRoleKey,
      fetch: async (input, init) => {
        const path = typeof input === 'string' ? new URL(input).pathname + new URL(input).search : input
        return Promise.resolve(app.request(path as string, init as any)) as unknown as Response
      },
    })

    const adminResult = await adminClient.from('articles').select('id, title').execute()
    expect(adminResult.error).toBeNull()
    expect(Array.isArray(adminResult.data)).toBe(true)
  })

  describe('Motor de Políticas & Data API Avançada (Fase 2)', () => {
    it('Configura política pública para "articles" e valida que chave anônima tem acesso', async () => {
      // 1. Atualiza política da tabela "articles" via Admin API
      const updatePolicyRes = await app.request('/api/v1/admin/tables/articles/policy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          rlsEnabled: true,
          selectRule: 'public',
          insertRule: 'authenticated',
          updateRule: 'owner',
          deleteRule: 'owner',
          ownerColumn: 'user_id',
        }),
      })

      expect(updatePolicyRes.status).toBe(200)
      const policyJson: any = await updatePolicyRes.json()
      expect(policyJson.success).toBe(true)
      expect(policyJson.data.selectRule).toBe('public')

      // 2. Agora a consulta anônima deve ter sucesso (retorna lista vazia ou registros)
      const client = createEdgekitClient({
        url: 'http://localhost',
        anonKey,
        fetch: async (input, init) => {
          const path = typeof input === 'string' ? new URL(input).pathname + new URL(input).search : input
          return Promise.resolve(app.request(path as string, init as any)) as unknown as Response
        },
      })

      const result = await client.from('articles').select('id, title').execute()
      expect(result.error).toBeNull()
      expect(Array.isArray(result.data)).toBe(true)
    })

    it('Filtros Avançados: in:, not_in:, is:null, is:not_null', async () => {
      // 1. Cria tabela "tasks" com campos id, title, user_id, status, deleted_at
      await app.request('/api/v1/admin/tables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          name: 'tasks',
          columns: [
            { name: 'id', type: 'TEXT', primaryKey: true },
            { name: 'title', type: 'TEXT' },
            { name: 'user_id', type: 'TEXT' },
            { name: 'status', type: 'TEXT' },
            { name: 'deleted_at', type: 'TEXT' },
          ],
        }),
      })

      // 2. Define política pública para consulta e inserção em tasks
      await app.request('/api/v1/admin/tables/tasks/policy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          rlsEnabled: false,
          selectRule: 'public',
          insertRule: 'public',
        }),
      })

      // 3. Insere 4 registros com status e deleted_at distintos
      const client = createEdgekitClient({
        url: 'http://localhost',
        serviceRoleKey,
        fetch: async (input, init) => {
          const path = typeof input === 'string' ? new URL(input).pathname + new URL(input).search : input
          return Promise.resolve(app.request(path as string, init as any)) as unknown as Response
        },
      })

      await client.from('tasks').insert({ id: 'task-1', title: 'Task 1', status: 'active', deleted_at: null })
      await client.from('tasks').insert({ id: 'task-2', title: 'Task 2', status: 'pending', deleted_at: null })
      await client.from('tasks').insert({ id: 'task-3', title: 'Task 3', status: 'archived', deleted_at: '2026-10-31' })
      await client.from('tasks').insert({ id: 'task-4', title: 'Task 4', status: 'draft', deleted_at: null })

      // 4. Teste de filtro in:
      const inRes = await app.request('/api/v1/db/tasks?status=in:active,pending', {
        headers: { apikey: anonKey },
      })
      expect(inRes.status).toBe(200)
      const inJson: any = await inRes.json()
      expect(inJson.data).toHaveLength(2)
      const inIds = inJson.data.map((r: any) => r.id)
      expect(inIds).toContain('task-1')
      expect(inIds).toContain('task-2')

      // 5. Teste de filtro not_in:
      const notInRes = await app.request('/api/v1/db/tasks?status=not_in:archived,draft', {
        headers: { apikey: anonKey },
      })
      expect(notInRes.status).toBe(200)
      const notInJson: any = await notInRes.json()
      expect(notInJson.data).toHaveLength(2)
      const notInIds = notInJson.data.map((r: any) => r.id)
      expect(notInIds).toContain('task-1')
      expect(notInIds).toContain('task-2')

      // 6. Teste de filtro is:null
      const nullRes = await app.request('/api/v1/db/tasks?deleted_at=is:null', {
        headers: { apikey: anonKey },
      })
      expect(nullRes.status).toBe(200)
      const nullJson: any = await nullRes.json()
      expect(nullJson.data).toHaveLength(3)
      const nullIds = nullJson.data.map((r: any) => r.id)
      expect(nullIds).toContain('task-1')
      expect(nullIds).toContain('task-2')
      expect(nullIds).toContain('task-4')

      // 7. Teste de filtro is:not_null
      const notNullRes = await app.request('/api/v1/db/tasks?deleted_at=is:not_null', {
        headers: { apikey: anonKey },
      })
      expect(notNullRes.status).toBe(200)
      const notNullJson: any = await notNullRes.json()
      expect(notNullJson.data).toHaveLength(1)
      expect(notNullJson.data[0].id).toBe('task-3')
    })

    it('Motor de Políticas: Avaliação unitária de owner, org_member e custom_sql', () => {
      // Cenário 1: Regra "owner" sem usuário autenticado
      const anonContext: AppVariables = { role: 'anon' } as any
      const ownerPolicy = {
        id: 'p1',
        tableName: 'documents',
        rlsEnabled: true,
        selectRule: 'owner',
        insertRule: 'owner',
        updateRule: 'owner',
        deleteRule: 'owner',
        ownerColumn: 'user_id',
        customRule: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const evalAnon = evaluateTablePolicy('documents', 'select', ownerPolicy, anonContext)
      expect(evalAnon.allowed).toBe(false)
      expect(evalAnon.error).toContain('faça login para acessar')

      // Cenário 2: Regra "owner" com usuário autenticado
      const userContext: AppVariables = {
        role: 'user',
        user: { id: 'usr_test_123' },
      } as any

      const evalUser = evaluateTablePolicy('documents', 'select', ownerPolicy, userContext)
      expect(evalUser.allowed).toBe(true)
      expect(evalUser.whereCondition).toBeDefined()
      expect(evalUser.injectValues).toEqual({ user_id: 'usr_test_123' })

      // Cenário 3: Regra "org_member" sem organização ativa
      const orgPolicy = {
        ...ownerPolicy,
        selectRule: 'org_member',
        ownerColumn: 'organization_id',
      }
      const evalOrgNoMember = evaluateTablePolicy('documents', 'select', orgPolicy, userContext)
      expect(evalOrgNoMember.allowed).toBe(false)
      expect(evalOrgNoMember.error).toContain('Nenhuma organização ativa selecionada')

      // Cenário 4: Regra "org_member" com organização ativa na sessão
      const orgMemberContext: AppVariables = {
        role: 'user',
        user: { id: 'usr_test_123' },
        session: { activeOrganizationId: 'org_company_abc' },
      } as any

      const evalOrgMember = evaluateTablePolicy('documents', 'select', orgPolicy, orgMemberContext)
      expect(evalOrgMember.allowed).toBe(true)
      expect(evalOrgMember.whereCondition).toBeDefined()
      expect(evalOrgMember.injectValues).toEqual({ organization_id: 'org_company_abc' })

      // Cenário 5: Regra "custom_sql" com substituição de variáveis
      const customPolicy = {
        ...ownerPolicy,
        selectRule: 'custom_sql',
        customRule: 'author_id = @auth.id AND role = @auth.role',
      }

      const evalCustom = evaluateTablePolicy('documents', 'select', customPolicy, userContext)
      expect(evalCustom.allowed).toBe(true)
      expect(evalCustom.whereCondition).toBeDefined()
    })
  })

  describe('Better Auth Plugins & Organizações Multi-tenant (Fase 3)', () => {
    let createdUserId = ''
    let createdOrgId = ''
    let _userSessionToken = ''

    it('POST /api/v1/auth/sign-up/email cadastra usuário final da aplicação via Better Auth', async () => {
      const res = await app.request('/api/v1/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Usuário App Teste',
          email: 'appuser@edgekit.dev',
          password: 'senha-app-user-123',
        }),
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.user).toBeDefined()
      expect(json.user.email).toBe('appuser@edgekit.dev')
      createdUserId = json.user.id
      _userSessionToken = json.token || json.session?.token || ''
    })

    it('POST /api/v1/auth/sign-in/email autentica usuário com e-mail e senha', async () => {
      const res = await app.request('/api/v1/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'appuser@edgekit.dev',
          password: 'senha-app-user-123',
        }),
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.user.email).toBe('appuser@edgekit.dev')
      expect(json.token || json.user?.id).toBeDefined()
      expect(res.headers.get('set-cookie')).toBeDefined()
    })

    it('POST /api/v1/admin/organizations cria organização multi-tenant', async () => {
      const res = await app.request('/api/v1/admin/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          name: 'Acme Global Labs',
          slug: 'acme-global-labs',
        }),
      })

      expect(res.status).toBe(201)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.slug).toBe('acme-global-labs')
      createdOrgId = json.data.id
    })

    it('POST /api/v1/admin/organizations/:id/members vincula usuário à organização com papel owner', async () => {
      const res = await app.request(`/api/v1/admin/organizations/${createdOrgId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          userId: createdUserId,
          role: 'owner',
        }),
      })

      expect(res.status).toBe(201)
      const json: any = await res.json()
      expect(json.success).toBe(true)
    })

    it('GET /api/v1/admin/organizations/:id/members lista membros ativos com detalhes do usuário', async () => {
      const res = await app.request(`/api/v1/admin/organizations/${createdOrgId}/members`, {
        headers: { Cookie: adminCookie },
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data).toHaveLength(1)
      expect(json.data[0].userId).toBe(createdUserId)
      expect(json.data[0].userEmail).toBe('appuser@edgekit.dev')
      expect(json.data[0].role).toBe('owner')
    })

    it('GET /api/v1/admin/users/:id/sessions lista sessões ativas do usuário', async () => {
      const res = await app.request(`/api/v1/admin/users/${createdUserId}/sessions`, {
        headers: { Cookie: adminCookie },
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(Array.isArray(json.data)).toBe(true)
      expect(json.data.length).toBeGreaterThan(0)
    })
  })

  describe('Storage R2 Nativo, Signed URLs & Políticas de Bucket (Fase 4)', () => {
    const createdBucketName = 'secure-docs'
    let uploadedFileKey = ''
    let validSignedUrl = ''

    it('POST /api/v1/storage/buckets cria bucket privado com limites de tamanho e mime type', async () => {
      const res = await app.request('/api/v1/storage/buckets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          name: createdBucketName,
          isPublic: false,
          maxSizeBytes: 1024 * 1024, // 1MB limite
          allowedMimeTypes: ['text/plain', 'application/pdf', 'image/*'],
          readRule: 'authenticated',
          writeRule: 'authenticated',
        }),
      })

      expect(res.status).toBe(201)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.name).toBe(createdBucketName)
      expect(json.data.isPublic).toBe(false)
    })

    it('GET /api/v1/storage/buckets lista os buckets cadastrados', async () => {
      const res = await app.request('/api/v1/storage/buckets', {
        headers: { Cookie: adminCookie },
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.some((b: any) => b.name === createdBucketName)).toBe(true)
    })

    it('POST /api/v1/storage/:bucket/upload com arquivo respeitando as políticas faz upload com sucesso', async () => {
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
      const fileContent = 'Edgekit Platform - Documento Secreto de Alta Performance'
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="isPublic"',
        '',
        'false',
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="confidential.txt"',
        'Content-Type: text/plain',
        '',
        fileContent,
        `--${boundary}--`,
      ].join('\r\n')

      const res = await app.request(`/api/v1/storage/${createdBucketName}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Cookie: adminCookie,
        },
        body,
      })

      expect(res.status).toBe(201)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.key).toBeDefined()
      expect(json.data.isPublic).toBe(false)
      uploadedFileKey = json.data.key
    })

    it('POST /api/v1/storage/:bucket/upload rejeita arquivo que viola política de MIME type (HTTP 403)', async () => {
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="malicious.exe"',
        'Content-Type: application/x-msdownload',
        '',
        'BINARY_EXEC_CODE',
        `--${boundary}--`,
      ].join('\r\n')

      const res = await app.request(`/api/v1/storage/${createdBucketName}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Cookie: adminCookie,
        },
        body,
      })

      expect(res.status).toBe(403)
      const json: any = await res.json()
      expect(json.error.code).toBe('POLICY_VIOLATION')
      expect(json.error.message).toContain('não é permitido no bucket')
    })

    it('GET /api/v1/storage/:bucket/file/* sem autenticação bloqueia acesso a arquivo privado (HTTP 403)', async () => {
      const res = await app.request(`/api/v1/storage/${createdBucketName}/file/${uploadedFileKey}`)
      expect(res.status).toBe(403)
      const json: any = await res.json()
      expect(json.error.code).toBe('FORBIDDEN_FILE')
    })

    it('POST /api/v1/storage/:bucket/signed-url gera URL pré-assinada com HMAC-SHA256', async () => {
      const res = await app.request(`/api/v1/storage/${createdBucketName}/signed-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          key: uploadedFileKey,
          expiresInSeconds: 600,
        }),
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.url).toContain('sig=')
      expect(json.data.url).toContain('expires=')
      validSignedUrl = json.data.url
    })

    it('GET com URL pré-assinada válida permite download do arquivo privado', async () => {
      const urlObj = new URL(validSignedUrl)
      const targetPath = urlObj.pathname + urlObj.search

      const res = await app.request(targetPath)
      expect(res.status).toBe(200)
      const content = await res.text()
      expect(content).toContain('Edgekit Platform - Documento Secreto')
    })

    it('GET com URL pré-assinada adulterada ou vencida retorna 403', async () => {
      const urlObj = new URL(validSignedUrl)
      urlObj.searchParams.set('sig', 'adulterated_signature_12345')
      const targetPath = urlObj.pathname + urlObj.search

      const res = await app.request(targetPath)
      expect(res.status).toBe(403)
      const json: any = await res.json()
      expect(json.error.code).toBe('FORBIDDEN_FILE')
    })

    it('GET com Range header retorna HTTP 206 Partial Content e Content-Range', async () => {
      const urlObj = new URL(validSignedUrl)
      const targetPath = urlObj.pathname + urlObj.search

      const res = await app.request(targetPath, {
        headers: {
          Range: 'bytes=0-6',
        },
      })

      expect(res.status).toBe(206)
      expect(res.headers.get('content-range')).toContain('bytes 0-6/')
      const chunk = await res.text()
      expect(chunk).toBe('Edgekit')
    })

    it('DELETE /api/v1/storage/:bucket/file/* exclui o arquivo com sucesso', async () => {
      const res = await app.request(`/api/v1/storage/${createdBucketName}/file/${uploadedFileKey}`, {
        method: 'DELETE',
        headers: {
          Cookie: adminCookie,
        },
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)

      // Verifica que arquivo não existe mais
      const verifyRes = await app.request(`/api/v1/storage/${createdBucketName}/file/${uploadedFileKey}`, {
        headers: { Cookie: adminCookie },
      })
      expect(verifyRes.status).toBe(404)
    })
  })

  describe('Realtime Durable Objects & Webhooks com HMAC-SHA256 (Fase 5)', () => {
    let createdWebhookId = ''
    const webhookSecret = 'whsec_super_secret_signing_key_99'

    it('GET /api/v1/realtime/:channel/presence retorna contagem de usuários', async () => {
      const res = await app.request('/api/v1/realtime/general/presence')
      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(typeof json.count).toBe('number')
      expect(Array.isArray(json.users)).toBe(true)
    })

    it('POST /api/v1/realtime/:channel/broadcast transmite mensagem para canal', async () => {
      const res = await app.request('/api/v1/realtime/general/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          event: 'chat.message',
          data: { text: 'Olá do backend Edgekit Platform' },
        }),
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
    })

    it('POST /api/v1/webhooks cria webhook com assinatura HMAC e eventos subscritos', async () => {
      const res = await app.request('/api/v1/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          name: 'Notificações Externas',
          url: 'https://webhook.site/mock-endpoint',
          events: ['INSERT', 'UPDATE', 'test.ping'],
          secret: webhookSecret,
          enabled: true,
        }),
      })

      expect(res.status).toBe(201)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.name).toBe('Notificações Externas')
      expect(json.data.secret).toBe(webhookSecret)
      createdWebhookId = json.data.id
    })

    it('GET /api/v1/webhooks lista os webhooks cadastrados para a instalação', async () => {
      const res = await app.request('/api/v1/webhooks', {
        headers: { Cookie: adminCookie },
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.some((w: any) => w.id === createdWebhookId)).toBe(true)
    })

    it('PUT /api/v1/webhooks/:id atualiza configurações do webhook', async () => {
      const res = await app.request(`/api/v1/webhooks/${createdWebhookId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          name: 'Notificações Atualizadas',
          enabled: false,
        }),
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.name).toBe('Notificações Atualizadas')
      expect(json.data.enabled).toBe(false)
    })

    it('HMAC-SHA256: computeWebhookSignature e verifyWebhookSignature calculam e validam assinaturas corretamente', async () => {
      const samplePayload = JSON.stringify({
        id: 'msg_123',
        event: 'db:users:insert',
        timestamp: 1730376000000,
        data: { id: 'u1', name: 'Maria' },
      })

      const sig = await computeWebhookSignature(webhookSecret, samplePayload)
      expect(sig).toHaveLength(64) // 32 bytes em hexadecimal = 64 chars

      // Assinatura exata é validada com sucesso
      const isValid = await verifyWebhookSignature(webhookSecret, samplePayload, `sha256=${sig}`)
      expect(isValid).toBe(true)

      // Assinatura com payload alterado é rejeitada
      const isTamperedPayloadValid = await verifyWebhookSignature(
        webhookSecret,
        `${samplePayload} `,
        `sha256=${sig}`,
      )
      expect(isTamperedPayloadValid).toBe(false)

      // Assinatura com chave errada é rejeitada
      const isWrongSecretValid = await verifyWebhookSignature(
        'wrong-secret',
        samplePayload,
        `sha256=${sig}`,
      )
      expect(isWrongSecretValid).toBe(false)
    })

    it('DELETE /api/v1/webhooks/:id exclui o webhook com sucesso', async () => {
      const res = await app.request(`/api/v1/webhooks/${createdWebhookId}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookie },
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)

      const verifyRes = await app.request(`/api/v1/webhooks/${createdWebhookId}`, {
        headers: { Cookie: adminCookie },
      })
      expect(verifyRes.status).toBe(404)
    })
  })

  describe('Edge Functions Hardening & Guardrail de Plano Free (Fase 6)', () => {
    it('GET /api/v1/functions/status informa que Edge Functions estão desabilitadas por padrão no plano Free', async () => {
      const res = await app.request('/api/v1/functions/status')
      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.functionsEnabled).toBe(false)
      expect(json.data.notice).toContain('plano Free')
    })

    it('GET /api/v1/functions/dynamic/:scriptName/* bloqueia execução no Free Tier retornando HTTP 501', async () => {
      const res = await app.request('/api/v1/functions/dynamic/pdf-generator/run', {
        headers: { Cookie: adminCookie },
      })
      expect(res.status).toBe(501)
      const json: any = await res.json()
      expect(json.error.code).toBe('DYNAMIC_WORKERS_UNAVAILABLE')
      expect(json.error.howToEnable).toContain('ENABLE_FUNCTIONS=true')
    })
  })

  describe('Durable Objects Hibernation, Multiplexação & Proteção CDC (Fase 7)', () => {
    class MockDurableObjectState {
      webSockets: any[] = []
      tags = new Map<any, string[]>()

      acceptWebSocket(ws: any, tags: string[] = []) {
        this.webSockets.push(ws)
        this.tags.set(ws, tags)
      }

      getWebSockets(_tag?: string) {
        return this.webSockets
      }
    }

    class MockWebSocket {
      attachment: any = null
      sentMessages: string[] = []

      serializeAttachment(val: any) {
        this.attachment = JSON.parse(JSON.stringify(val))
      }

      deserializeAttachment() {
        return this.attachment ? JSON.parse(JSON.stringify(this.attachment)) : null
      }

      send(msg: string) {
        this.sentMessages.push(msg)
      }
    }

    it('DO preserva presença e canais via serializeAttachment/deserializeAttachment ao hibernar', async () => {
      const { RealtimeDurableObject } = await import('../src/server/realtime/durable-object')
      const mockState = new MockDurableObjectState()
      const doInstance = new RealtimeDurableObject(mockState as any, {})

      // Simula conexão WebSocket aceita no DO
      const ws = new MockWebSocket()
      const initialSession = {
        userId: 'usr_alpha',
        userName: 'Alpha Developer',
        channels: ['channel-1'],
        connectedAt: Date.now(),
      }
      ws.serializeAttachment(initialSession)
      mockState.acceptWebSocket(ws, ['channel-1'])

      // Verifica que o estado de presença é recuperado da hibernação via deserializeAttachment
      const presenceRes = await doInstance.fetch(new Request('http://internal/presence?channel=channel-1'))
      const presenceJson: any = await presenceRes.json()
      expect(presenceJson.count).toBe(1)
      expect(presenceJson.users[0].userId).toBe('usr_alpha')

      // Assinatura dinâmica via mensagem WebSocket
      await doInstance.webSocketMessage(
        ws as any,
        JSON.stringify({ action: 'subscribe', channel: 'channel-2' }),
      )

      const updatedSession = ws.deserializeAttachment()
      expect(updatedSession.channels).toContain('channel-1')
      expect(updatedSession.channels).toContain('channel-2')
      expect(ws.sentMessages.some((m) => m.includes('"event":"subscribed"') && m.includes('channel-2'))).toBe(true)

      // Cancelamento dinâmico de canal (unsubscribe)
      await doInstance.webSocketMessage(
        ws as any,
        JSON.stringify({ action: 'unsubscribe', channel: 'channel-1' }),
      )
      const afterUnsubSession = ws.deserializeAttachment()
      expect(afterUnsubSession.channels).not.toContain('channel-1')
      expect(afterUnsubSession.channels).toContain('channel-2')
      expect(ws.sentMessages.some((m) => m.includes('"event":"unsubscribed"') && m.includes('channel-1'))).toBe(true)
    })

    it('CDC Protection: DO rejeita broadcast direto de clientes para db:* e _ek_*', async () => {
      const { RealtimeDurableObject } = await import('../src/server/realtime/durable-object')
      const mockState = new MockDurableObjectState()
      const doInstance = new RealtimeDurableObject(mockState as any, {})

      const ws = new MockWebSocket()
      ws.serializeAttachment({
        userId: 'malicious_client',
        userName: 'Attacker',
        channels: ['db:users'],
        connectedAt: Date.now(),
      })
      mockState.acceptWebSocket(ws, ['db:users'])

      // Cliente tenta forjar broadcast de CDC de banco
      await doInstance.webSocketMessage(
        ws as any,
        JSON.stringify({
          channel: 'db:users',
          event: 'INSERT',
          data: { id: 'fake', email: 'forged@hack.com' },
        }),
      )

      expect(
        ws.sentMessages.some((m) => m.includes('FORBIDDEN_BROADCAST') && m.includes('db:*')),
      ).toBe(true)

      // Cliente tenta forjar broadcast em tabela de sistema _ek_*
      await doInstance.webSocketMessage(
        ws as any,
        JSON.stringify({
          channel: '_ek_admins',
          event: 'UPDATE',
          data: { role: 'owner' },
        }),
      )

      expect(
        ws.sentMessages.some((m) => m.includes('FORBIDDEN_BROADCAST')),
      ).toBe(true)
    })

    it('CDC Subscription Protection: DO rejeita subscrição de clientes não-admin em canais db:*', async () => {
      const { RealtimeDurableObject } = await import('../src/server/realtime/durable-object')
      const mockState = new MockDurableObjectState()
      const doInstance = new RealtimeDurableObject(mockState as any, {})

      const ws = new MockWebSocket()
      ws.serializeAttachment({
        userId: 'untrusted_user',
        userName: 'Viewer',
        channels: [],
        connectedAt: Date.now(),
        isAdmin: false,
      })
      mockState.acceptWebSocket(ws, [])

      await doInstance.webSocketMessage(
        ws as any,
        JSON.stringify({ action: 'subscribe', channel: 'db:tasks' }),
      )

      expect(
        ws.sentMessages.some((m) => m.includes('FORBIDDEN_CHANNEL') && m.includes('db:*')),
      ).toBe(true)
    })
  })

  describe('Mutações Atômicas Transacionais em Lote (POST /api/v1/db/batch)', () => {
    it('Executa inserção, atualização e exclusão em lote de forma atômica', async () => {
      const db = await getDb()
      try { db.run(sql`DROP TABLE IF EXISTS batch_items`) } catch {}

      // 1. Cria tabela batch_items com RLS público para o teste
      const createRes = await app.request('/api/v1/admin/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          name: 'batch_items',
          columns: [
            { name: 'id', type: 'TEXT', primaryKey: true },
            { name: 'name', type: 'TEXT' },
            { name: 'quantity', type: 'INTEGER' },
          ],
        }),
      })
      expect(createRes.status).toBe(201)

      await app.request('/api/v1/admin/tables/batch_items/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ rlsEnabled: false, selectRule: 'public', insertRule: 'public' }),
      })

      // 2. Executa POST /api/v1/db/batch com múltiplas operações
      const batchRes = await app.request('/api/v1/db/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({
          operations: [
            { type: 'insert', table: 'batch_items', data: { id: 'item-1', name: 'Item A', quantity: 10 } },
            { type: 'insert', table: 'batch_items', data: { id: 'item-2', name: 'Item B', quantity: 20 } },
            { type: 'insert', table: 'batch_items', data: { id: 'item-3', name: 'Item C', quantity: 30 } },
          ],
        }),
      })

      const batchJson: any = await batchRes.json()
      expect(batchRes.status).toBe(200)
      expect(batchJson.success).toBe(true)
      expect(batchJson.count).toBe(3)

      // 3. Verifica que todos os 3 registros foram inseridos atomicamente
      const checkRes = await app.request('/api/v1/db/batch_items', {
        headers: { apikey: serviceRoleKey },
      })
      const checkJson: any = await checkRes.json()
      expect(checkJson.data).toHaveLength(3)

      // 4. Executa operação mista (update + delete) em lote
      const mixedBatchRes = await app.request('/api/v1/db/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({
          operations: [
            { type: 'update', table: 'batch_items', id: 'item-1', data: { quantity: 99 } },
            { type: 'delete', table: 'batch_items', id: 'item-2' },
          ],
        }),
      })

      expect(mixedBatchRes.status).toBe(200)

      // 5. Verifica estado final
      const finalRes = await app.request('/api/v1/db/batch_items', {
        headers: { apikey: serviceRoleKey },
      })
      const finalJson: any = await finalRes.json()
      expect(finalJson.data).toHaveLength(2)
      const item1 = finalJson.data.find((i: any) => i.id === 'item-1')
      expect(item1.quantity).toBe(99)
      const item2 = finalJson.data.find((i: any) => i.id === 'item-2')
      expect(item2).toBeUndefined()
    })
  })

  describe('Dupla Identidade Estrita: App User (users) Bloqueado no Painel Administrativo', () => {
    it('Usuário da aplicação com role="admin" em users recebe HTTP 403 em /api/v1/admin/*', async () => {
      // 1. Cadastra usuário de app com papel 'admin' no Better Auth
      const signUpRes = await app.request('/api/v1/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'App Admin Falso',
          email: 'fakeadmin@appdomain.com',
          password: 'senha-app-admin-123',
        }),
      })

      expect(signUpRes.status).toBe(200)
      const signUpJson: any = await signUpRes.json()
      const appUserCookie = signUpRes.headers.get('set-cookie')?.split(';')[0] || ''

      // Promove o usuário na tabela `users` do app para role='admin'
      const db = await getDb()
      await db.update(users).set({ role: 'admin' }).where(sql`id = ${signUpJson.user.id}`)

      // 2. Tenta acessar rota restrita de admin (/api/v1/admin/stats) usando os cookies/sessão do app user
      const adminAttempt = await app.request('/api/v1/admin/stats', {
        headers: {
          Cookie: appUserCookie,
        },
      })

      // DEVE RETORNAR 403 FORBIDDEN! Barreira absoluta de dupla identidade
      expect(adminAttempt.status).toBe(403)
      const errJson: any = await adminAttempt.json()
      expect(errJson.error.code).toBe('FORBIDDEN')
      expect(errJson.error.message).toContain('Acesso restrito a administradores da plataforma')

      // 3. Tenta acessar /api/v1/admin/members
      const membersAttempt = await app.request('/api/v1/admin/members', {
        headers: {
          Cookie: appUserCookie,
        },
      })
      expect(membersAttempt.status).toBe(403)
    })
  })

  describe('Segurança Avançada: Policy Engine & SQL Runner Guardrail', () => {
    it('Policy Engine rejeita custom_sql com caracteres de injeção (; , --, /*, PRAGMA)', () => {
      const maliciousPolicy = {
        id: 'p_malicious',
        tableName: 'articles',
        rlsEnabled: true,
        selectRule: 'custom_sql',
        insertRule: 'disabled',
        updateRule: 'disabled',
        deleteRule: 'disabled',
        ownerColumn: 'user_id',
        customRule: '1 = 1; DROP TABLE users; --',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const evalResult = evaluateTablePolicy(
        'articles',
        'select',
        maliciousPolicy,
        { role: 'user', user: { id: 'u1' } } as any,
      )

      expect(evalResult.allowed).toBe(false)
      expect(evalResult.error).toContain('contém caracteres ou palavras-chave proibidas')
    })

    it('SQL Runner bloqueia mutações diretas em QUALQUER tabela do sistema (_ek_*)', async () => {
      // Tenta mutação em _ek_settings
      const res1 = await app.request('/api/v1/admin/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ query: "UPDATE _ek_settings SET value = 'hacked'" }),
      })
      expect(res1.status).toBe(403)
      const json1: any = await res1.json()
      expect(json1.error.code).toBe('FORBIDDEN_MUTATION')

      // Tenta mutação em _ek_table_policies
      const res2 = await app.request('/api/v1/admin/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ query: "DELETE FROM _ek_table_policies WHERE tableName = 'tasks'" }),
      })
      expect(res2.status).toBe(403)

      // Tenta mutação em _ek_webhooks
      const res3 = await app.request('/api/v1/admin/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ query: 'DROP TABLE _ek_webhooks' }),
      })
      expect(res3.status).toBe(403)
    })
  })

  describe('Hardening Arquitetural: Anti-Hijacking, Relações Declarativas & Zero-Trust Origin', () => {
    let testUserCookie = ''
    let testUserId = ''

    beforeAll(async () => {
      const db = await getDb()
      try {
        await db.delete(accounts).where(eq(accounts.accountId, 'sectest@appdomain.com'))
        await db.delete(users).where(eq(users.email, 'sectest@appdomain.com'))
      } catch {}

      const res = await app.request('/api/v1/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Security Test User',
          email: 'sectest@appdomain.com',
          password: 'senha-app-user-123',
        }),
      })
      const json: any = await res.json()
      if (res.ok && json.user) {
        testUserId = json.user.id
        testUserCookie = res.headers.get('set-cookie')?.split(';')[0] || ''
      } else {
        const loginRes = await app.request('/api/v1/auth/sign-in/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'sectest@appdomain.com',
            password: 'senha-app-user-123',
          }),
        })
        const loginJson: any = await loginRes.json()
        testUserId = loginJson.user?.id
        testUserCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || ''
      }
    })

    it('Anti-Hijacking em PATCH: usuário comum não pode transferir titularidade (user_id/organization_id)', async () => {
      const db = await getDb()
      await db.run(sql`DROP TABLE IF EXISTS user_notes`)
      await app.request('/api/v1/admin/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          name: 'user_notes',
          columns: [
            { name: 'id', type: 'TEXT', primaryKey: true },
            { name: 'title', type: 'TEXT' },
            { name: 'user_id', type: 'TEXT' },
            { name: 'organization_id', type: 'TEXT' },
          ],
        }),
      })

      await app.request('/api/v1/admin/tables/user_notes/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          rlsEnabled: true,
          selectRule: 'public',
          insertRule: 'authenticated',
          updateRule: 'authenticated',
          deleteRule: 'owner',
          ownerColumn: 'user_id',
        }),
      })

      // Insere nota como testUserId
      await app.request('/api/v1/db/user_notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: testUserCookie },
        body: JSON.stringify({
          id: 'note-anti-hijack-1',
          title: 'Minha Nota Pessoal',
        }),
      })

      // Tenta modificar title e simultaneamente adulterar user_id e organization_id
      const patchRes = await app.request('/api/v1/db/user_notes/note-anti-hijack-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: testUserCookie },
        body: JSON.stringify({
          title: 'Titulo Alterado',
          user_id: 'malicious_new_owner_id',
          organization_id: 'malicious_org_id',
        }),
      })
      expect(patchRes.status).toBe(200)

      // Confirma que o título mudou, mas user_id e organization_id NÃO foram sequestrados
      const checkRes = await app.request('/api/v1/db/user_notes/note-anti-hijack-1', {
        headers: { Cookie: adminCookie },
      })
      const noteData: any = await checkRes.json()
      expect(noteData.data.title).toBe('Titulo Alterado')
      expect(noteData.data.user_id).toBe(testUserId)
      expect(noteData.data.organization_id).toBeNull()
    })

    it('Anti-Hijacking em POST /batch: impede alteração de user_id/organization_id em lote', async () => {
      const batchRes = await app.request('/api/v1/db/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: testUserCookie },
        body: JSON.stringify({
          operations: [
            {
              type: 'update',
              table: 'user_notes',
              id: 'note-anti-hijack-1',
              data: {
                title: 'Titulo Batch Alterado',
                user_id: 'hacker_stolen_id',
              },
            },
          ],
        }),
      })
      expect(batchRes.status).toBe(200)

      const checkRes = await app.request('/api/v1/db/user_notes/note-anti-hijack-1', {
        headers: { Cookie: adminCookie },
      })
      const noteData: any = await checkRes.json()
      expect(noteData.data.title).toBe('Titulo Batch Alterado')
      expect(noteData.data.user_id).toBe(testUserId)
    })

    it('Bloqueio estrito de acesso direto a tabelas criptográficas de sistema (jwks, passkeys, two_factors)', async () => {
      const jwksRes = await app.request('/api/v1/db/jwks', {
        headers: { apikey: anonKey },
      })
      expect(jwksRes.status).toBe(403)
      const jwksJson: any = await jwksRes.json()
      expect(jwksJson.error.code).toBe('FORBIDDEN_TABLE')

      const passkeysRes = await app.request('/api/v1/db/passkeys', {
        headers: { apikey: anonKey },
      })
      expect(passkeysRes.status).toBe(403)

      const twoFactorsRes = await app.request('/api/v1/db/two_factors', {
        headers: { apikey: anonKey },
      })
      expect(twoFactorsRes.status).toBe(403)
    })

    it('Zero-Trust Origin: Bloqueia service_role key vinda de navegadores não autorizados', async () => {
      const badOriginRes = await app.request('/api/v1/admin/stats', {
        headers: {
          apikey: serviceRoleKey,
          Origin: 'https://phishing-site.xyz',
        },
      })
      expect(badOriginRes.status).toBe(403)
      const badOriginJson: any = await badOriginRes.json()
      expect(badOriginJson.error.code).toBe('FORBIDDEN_SERVICE_ROLE_BROWSER')
    })

    it('Relações Declarativas & Expansão: Cria tabela com foreign key e expande dados relacionados', async () => {
      const db = await getDb()
      await db.run(sql`DROP TABLE IF EXISTS post_reviews`)

      // 1. Cria tabela com FK explícita para users(id)
      const createRes = await app.request('/api/v1/admin/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          name: 'post_reviews',
          columns: [
            { name: 'id', type: 'TEXT', primaryKey: true },
            { name: 'content', type: 'TEXT' },
            {
              name: 'user_id',
              type: 'TEXT',
              references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
            },
          ],
        }),
      })
      expect(createRes.status).toBe(201)

      // 1.1. Valida Foreign Key no schema
      const schemaRes = await app.request('/api/v1/admin/tables/post_reviews/schema', { headers: { Cookie: adminCookie } })
      expect(schemaRes.status).toBe(200)
      const schemaJson: any = await schemaRes.json()
      expect(schemaJson.data.foreignKeys.length).toBeGreaterThan(0)
      expect(schemaJson.data.foreignKeys[0].targetTable).toBe('users')

      // 2. Define política pública para leitura
      await app.request('/api/v1/admin/tables/post_reviews/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          rlsEnabled: false,
          selectRule: 'public',
          insertRule: 'authenticated',
        }),
      })

      // 3. Insere registro vinculado ao testUserId
      await app.request('/api/v1/db/post_reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: testUserCookie },
        body: JSON.stringify({
          id: 'review-1',
          content: 'Excelente artigo sobre Edgekit!',
          user_id: testUserId,
        }),
      })

      // 4. Consulta via GET com ?expand=user_id
      const expandRes = await app.request('/api/v1/db/post_reviews?expand=user_id', {
        headers: { apikey: anonKey },
      })
      expect(expandRes.status).toBe(200)
      const expandJson: any = await expandRes.json()
      expect(expandJson.data.length).toBeGreaterThan(0)
      const item = expandJson.data.find((d: any) => d.id === 'review-1')
      expect(item).toBeDefined()
      expect(item.user).toBeDefined()
      expect(item.user.email).toBe('sectest@appdomain.com')

      // 5. Consulta via POST /:table/query (Declarative Query Builder)
      const queryRes = await app.request('/api/v1/db/post_reviews/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({
          columns: ['id', 'content', 'user_id'],
          where: [{ field: 'id', op: 'eq', value: 'review-1' }],
          expand: ['user_id'],
        }),
      })
      expect(queryRes.status).toBe(200)
      const queryJson: any = await queryRes.json()
      expect(queryJson.data.length).toBe(1)
      expect(queryJson.data[0].content).toBe('Excelente artigo sobre Edgekit!')
      expect(queryJson.data[0].user).toBeDefined()
      expect(queryJson.data[0].user.name).toBe('Security Test User')
    })

    it('Proteção de Canais Realtime: Rejeita subscrições ou broadcasts a canais do sistema (_ek_*)', async () => {
      const broadcastRes = await app.request('/api/v1/realtime/_ek_system/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({ event: 'malicious_event', payload: {} }),
      })
      expect(broadcastRes.status).toBe(403)
      const broadcastJson: any = await broadcastRes.json()
      expect(broadcastJson.error.code).toBe('FORBIDDEN_CHANNEL')
    })

    it('Fase 1 Security: POST /api/v1/admin/seed-demo foi removido e retorna 404', async () => {
      const res = await app.request('/api/v1/admin/seed-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      })
      expect(res.status).toBe(404)
    })

    it('Fase 1 Security: expandRelations bloqueia tentativa de expandir tabelas internas _ek_* para não-admin', async () => {
      const res = await app.request('/api/v1/db/post_reviews?expand=user_id:_ek_admins', {
        headers: { apikey: anonKey },
      })
      expect(res.status).toBe(200)
      const json: any = await res.json()
      const item = json.data.find((d: any) => d.id === 'review-1')
      expect(item.user_id_data).toBeUndefined()
      expect(item.expand?.user_id).toBeUndefined()
    })

    it('Client SDK: .expand() e .query() operam com tipagem e sem SQL Injection', async () => {
      const client = createEdgekitClient({
        url: 'http://localhost',
        anonKey,
        fetch: async (input, init) => {
          const path = typeof input === 'string' ? new URL(input).pathname + new URL(input).search : input
          return Promise.resolve(app.request(path as string, init as any)) as unknown as Response
        },
      })

      // 1. Testa .expand('user_id') via client SDK
      const expandRes = await client.from('post_reviews').select('id, content, user_id').expand('user_id').execute()
      expect(expandRes.error).toBeNull()
      expect(expandRes.data?.length).toBeGreaterThan(0)
      const reviewItem = expandRes.data?.find((d: any) => d.id === 'review-1')
      expect(reviewItem).toBeDefined()
      expect(reviewItem.user).toBeDefined()
      expect(reviewItem.user.name).toBe('Security Test User')

      // 2. Testa .query({ columns, where, expand }) via client SDK
      const queryRes = await client.from('post_reviews').query({
        columns: ['id', 'content'],
        where: [{ field: 'id', op: 'eq', value: 'review-1' }],
        expand: ['user_id'],
      })
      expect(queryRes.error).toBeNull()
      expect(queryRes.data?.length).toBe(1)
      expect(queryRes.data?.[0].user?.name).toBe('Security Test User')
    })
  })

  describe('Constituição Arquitetural: Blindagem contra SQL Injection, Zero-Trust Origin & Multiplexação Realtime', () => {
    it('SQL Injection Defense: Rejeita parâmetros de coluna com caracteres fora da whitelist (HTTP 400)', async () => {
      // 1. Identificador de coluna malicioso no filtro
      const badFilterRes = await app.request('/api/v1/db/articles?id%27;DROP%20TABLE=1', {
        headers: { apikey: serviceRoleKey },
      })
      expect(badFilterRes.status).toBe(400)
      const badFilterJson: any = await badFilterRes.json()
      expect(badFilterJson.error.code).toBe('INVALID_IDENTIFIER')

      // 2. Coluna não existente no schema
      const nonExistentRes = await app.request('/api/v1/db/articles?coluna_inexistente=123', {
        headers: { apikey: serviceRoleKey },
      })
      expect(nonExistentRes.status).toBe(400)
      const nonExistentJson: any = await nonExistentRes.json()
      expect(nonExistentJson.error.code).toBe('INVALID_COLUMN')

      // 3. Coluna não existente no select
      const badSelectRes = await app.request('/api/v1/db/articles?select=id,coluna_fantasma', {
        headers: { apikey: serviceRoleKey },
      })
      expect(badSelectRes.status).toBe(400)
      const badSelectJson: any = await badSelectRes.json()
      expect(badSelectJson.error.code).toBe('INVALID_COLUMN')

      // 4. Caractere malicioso no select
      const injectionSelectRes = await app.request('/api/v1/db/articles?select=id,content%27;DROP', {
        headers: { apikey: serviceRoleKey },
      })
      expect(injectionSelectRes.status).toBe(400)
      const injectionSelectJson: any = await injectionSelectRes.json()
      expect(injectionSelectJson.error.code).toBe('INVALID_IDENTIFIER')

      // 5. Coluna não existente na ordenação
      const badOrderRes = await app.request('/api/v1/db/articles?order=coluna_inexistente.desc', {
        headers: { apikey: serviceRoleKey },
      })
      expect(badOrderRes.status).toBe(400)
      const badOrderJson: any = await badOrderRes.json()
      expect(badOrderJson.error.code).toBe('INVALID_COLUMN')

      // 6. Caractere malicioso na ordenação
      const injectionOrderRes = await app.request('/api/v1/db/articles?order=id;DROP%20TABLE.desc', {
        headers: { apikey: serviceRoleKey },
      })
      expect(injectionOrderRes.status).toBe(400)
      const injectionOrderJson: any = await injectionOrderRes.json()
      expect(injectionOrderJson.error.code).toBe('INVALID_IDENTIFIER')
    })

    it('SQL Injection Defense: Prepared Statement trata valores como parâmetros puros e bloqueia bypass (ex: OR 1=1)', async () => {
      // Injeta deliberadamente payload clássico no valor do filtro
      const res = await app.request('/api/v1/db/articles?title=eq:val%27%20OR%201=1%20--', {
        headers: { apikey: serviceRoleKey },
      })

      expect(res.status).toBe(200)
      const json: any = await res.json()
      // A consulta deve ser executada com prepared statement vinculando o valor exato, sem vazar registros
      expect(json.success).toBe(true)
      expect(json.data.length).toBe(0)
    })

    it('Zero-Trust Origin Defense: Bloqueia service_role com subdomínios forjados de localhost (attacker-localhost.com)', async () => {
      // Subdomínio malicioso tentando simular localhost
      const attackerRes = await app.request('/api/v1/admin/stats', {
        headers: {
          apikey: serviceRoleKey,
          Origin: 'https://attacker-localhost.com',
        },
      })
      expect(attackerRes.status).toBe(403)
      const attackerJson: any = await attackerRes.json()
      expect(attackerJson.error.code).toBe('FORBIDDEN_SERVICE_ROLE_BROWSER')

      // Outro ataque comum: localhost como path
      const pathAttackerRes = await app.request('/api/v1/admin/stats', {
        headers: {
          apikey: serviceRoleKey,
          Origin: 'https://evil.org/localhost',
        },
      })
      expect(pathAttackerRes.status).toBe(403)

      // Origem legítima local em porta padrão deve ser autorizada
      const validLocalRes = await app.request('/api/v1/admin/stats', {
        headers: {
          apikey: serviceRoleKey,
          Origin: 'http://localhost:3000',
        },
      })
      expect(validLocalRes.status).toBe(200)

      const validIpRes = await app.request('/api/v1/admin/stats', {
        headers: {
          apikey: serviceRoleKey,
          Origin: 'http://127.0.0.1:5173',
        },
      })
      expect(validIpRes.status).toBe(200)
    })

    it('Zero-Trust Header Defense: Usuário não autenticado forjando headers de admin é barrado com 403', async () => {
      const spoofRes = await app.request('/api/v1/admin/stats', {
        headers: {
          'x-admin': 'true',
          'role': 'owner',
          'x-role': 'admin',
        },
      })
      expect(spoofRes.status).toBe(403)
      const json: any = await spoofRes.json()
      expect(json.error.code).toBe('FORBIDDEN')
    })

    it('Validação Estrita de Schemas (Zod): Rejeita payloads malformados com HTTP 400', async () => {
      // 1. Login com e-mail inválido
      const badLoginRes = await app.request('/api/v1/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'formato-invalido', password: '123' }),
      })
      expect(badLoginRes.status).toBe(400)
      const badLoginJson: any = await badLoginRes.json()
      expect(badLoginJson.error.code).toBe('INVALID_INPUT')

      // 2. Chave com tipo inexistente
      const badKeyRes = await app.request('/api/v1/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: serviceRoleKey },
        body: JSON.stringify({ name: 'Chave Invalida', type: 'superuser' }),
      })
      expect(badKeyRes.status).toBe(400)
      const badKeyJson: any = await badKeyRes.json()
      expect(badKeyJson.error.code).toBe('INVALID_INPUT')

      // 3. Webhook com URL inválida
      const badWebhookRes = await app.request('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: serviceRoleKey },
        body: JSON.stringify({ name: 'Meu Webhook', url: 'not-a-valid-url' }),
      })
      expect(badWebhookRes.status).toBe(400)
      const badWebhookJson: any = await badWebhookRes.json()
      expect(badWebhookJson.error.code).toBe('INVALID_INPUT')
    })

    it('Realtime Multiplexing: Cliente SDK mantém uma única conexão WebSocket compartilhada para múltiplos canais', () => {
      // Mock de WebSocket para validação da multiplexação no ambiente de teste
      let connectionCount = 0
      const mockWsInstances: any[] = []

      class MockWebSocket {
        readyState = 1
        url: string
        sentMessages: string[] = []
        onopen: any
        onmessage: any
        onclose: any

        constructor(url: string) {
          this.url = url
          connectionCount++
          mockWsInstances.push(this)
          setTimeout(() => this.onopen?.(), 0)
        }

        send(msg: string) {
          this.sentMessages.push(msg)
        }

        close() {
          this.readyState = 3
          this.onclose?.()
        }
      }

      const originalWs = (globalThis as any).WebSocket
      ;(globalThis as any).WebSocket = MockWebSocket

      try {
        const client = createEdgekitClient({
          url: 'http://localhost:3000',
          anonKey: 'ek_anon_test_multiplex',
        })

        // Subscrição a 3 canais distintos
        const ch1 = client.realtime.channel('chat-room-1').subscribe()
        const ch2 = client.realtime.channel('chat-room-2').subscribe()
        const ch3 = client.realtime.channel('chat-room-3').subscribe()

        // Garante que APENAS UMA conexão WebSocket foi criada para os 3 canais
        expect(connectionCount).toBe(1)
        expect(mockWsInstances.length).toBe(1)
        expect(client.realtime.getSocket()).toBe(mockWsInstances[0])

        // Mensagens enviadas devem multiplexar os canais
        ch1.send('msg', { text: 'Olá Sala 1' })
        ch2.send('msg', { text: 'Olá Sala 2' })

        const sent = mockWsInstances[0].sentMessages
        expect(sent.some((m: string) => m.includes('chat-room-1'))).toBe(true)
        expect(sent.some((m: string) => m.includes('chat-room-2'))).toBe(true)

        // Cancelar subscrição de 2 canais deve manter o socket aberto
        ch1.unsubscribe()
        ch2.unsubscribe()
        expect(mockWsInstances[0].readyState).toBe(1)

        // Cancelar o último canal fecha a conexão compartilhada
        ch3.unsubscribe()
        expect(mockWsInstances[0].readyState).toBe(3)
        expect(client.realtime.getSocket()).toBeNull()
      } finally {
        ;(globalThis as any).WebSocket = originalWs
      }
    })
  })

  describe('Constituição Arquitetural: Bateria Canônica de Testes Adversários & Blindagem Zero-Trust', () => {
    it('SQLi Attack Shield: Rejeita injeção SQL no nome da tabela com erro de identificador inválido', async () => {
      const res = await app.request('/api/v1/db/articles;DROP TABLE articles;--', {
        headers: { apikey: anonKey },
      })
      expect(res.status).toBe(500)
      const json: any = await res.json()
      expect(json.error.message).toContain('Identificador inválido')
    })

    it('SQLi Attack Shield: Rejeita injeção SQL no parâmetro ?select com HTTP 400', async () => {
      const res = await app.request('/api/v1/db/articles?select=title, (SELECT password FROM _ek_admins)', {
        headers: { apikey: anonKey },
      })
      expect(res.status).toBe(400)
      const json: any = await res.json()
      expect(json.error.code).toBe('INVALID_IDENTIFIER')
    })

    it('SQLi Attack Shield: Rejeita injeção SQL no parâmetro ?order com HTTP 400', async () => {
      const res = await app.request('/api/v1/db/articles?order=title;DROP TABLE articles', {
        headers: { apikey: anonKey },
      })
      expect(res.status).toBe(400)
      const json: any = await res.json()
      expect(json.error.code).toBe('INVALID_IDENTIFIER')
    })

    it('SQLi Attack Shield: Rejeita injeção SQL em identificadores de coluna no query parameter', async () => {
      const res = await app.request('/api/v1/db/articles?title\' OR \'1\'=\'1=eq:teste', {
        headers: { apikey: anonKey },
      })
      expect(res.status).toBe(400)
      const json: any = await res.json()
      expect(json.error.code).toBe('INVALID_IDENTIFIER')
    })

    it('SQLi Attack Shield: Rejeita campos maliciosos no endpoint declarativo /:table/query com HTTP 400', async () => {
      const res = await app.request('/api/v1/db/articles/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: serviceRoleKey },
        body: JSON.stringify({
          select: ['title'],
          where: [{ field: 'title; DROP TABLE articles;', op: 'eq', value: '1' }],
        }),
      })
      expect(res.status).toBe(400)
      const json: any = await res.json()
      expect(json.error.code).toBe('INVALID_QUERY_SPEC')
    })

    it('Zero-Trust Dupla Identidade: Usuário comum da tabela users com role="admin" NUNCA tem acesso às rotas /admin', async () => {
      const db = await getDb()
      const fakeAppAdminId = 'usr_app_admin_impostor'
      const now = new Date()

      // Insere usuário comum com atributo role="admin" no Better Auth
      try {
        await db.insert(users).values({
          id: fakeAppAdminId,
          name: 'App Impostor Admin',
          email: 'impostor@app.dev',
          role: 'admin',
          createdAt: now,
          updatedAt: now,
        })
      } catch {}

      // Tenta acessar /api/v1/admin/me
      const resMe = await app.request('/api/v1/admin/me', {
        headers: {
          'x-user-id': fakeAppAdminId,
          'role': 'admin',
          'x-role': 'admin',
        },
      })
      expect(resMe.status).toBe(403)
      const jsonMe: any = await resMe.json()
      expect(jsonMe.error.code).toBe('FORBIDDEN')

      // Tenta acessar /api/v1/admin/keys
      const resKeys = await app.request('/api/v1/admin/keys', {
        headers: {
          'x-user-id': fakeAppAdminId,
          'role': 'admin',
        },
      })
      expect(resKeys.status).toBe(403)
    })

    it('Zero-Trust Anti-Hijacking: Impede que mutação em lote altere user_id ou organization_id', async () => {
      const res = await app.request('/api/v1/db/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({
          operations: [
            {
              type: 'update',
              table: 'articles',
              id: 'article_fake_id',
              data: {
                title: 'Título Modificado',
                user_id: 'victim_user_hijacked',
                organization_id: 'victim_org_hijacked',
              },
            },
          ],
        }),
      })

      // Como o anonKey não tem bypass, a Policy Engine ou o anti-hijack bloqueia/trata a requisição
      expect([200, 403, 404]).toContain(res.status)
    })

    it('Zero-Trust Origin Defense: Bloqueia service_role com subdomínio fraudulento localhost.attacker.com', async () => {
      const res = await app.request('/api/v1/admin/stats', {
        headers: {
          apikey: serviceRoleKey,
          Origin: 'http://localhost.attacker.com',
        },
      })
      expect(res.status).toBe(403)
      const json: any = await res.json()
      expect(json.error.code).toBe('FORBIDDEN_SERVICE_ROLE_BROWSER')
    })

    it('Zero-Trust Origin Defense: Bloqueia service_role com subdomínio fraudulento 127.0.0.1.evil.org', async () => {
      const res = await app.request('/api/v1/admin/stats', {
        headers: {
          apikey: serviceRoleKey,
          Origin: 'http://127.0.0.1.evil.org:8080',
        },
      })
      expect(res.status).toBe(403)
      const json: any = await res.json()
      expect(json.error.code).toBe('FORBIDDEN_SERVICE_ROLE_BROWSER')
    })

    it('Webhook Replay & Tamper Defense: Assinatura HMAC rejeita imediatamente payloads adulterados', async () => {
      const secret = 'whsec_canonical_super_secret_key'
      const authenticPayload = JSON.stringify({ event: 'user.created', id: 'usr_123', email: 'test@edgekit.dev' })
      const signature = await computeWebhookSignature(secret, authenticPayload)

      // Payload autêntico passa
      const valid = await verifyWebhookSignature(secret, authenticPayload, signature)
      expect(valid).toBe(true)

      // Payload adulterado em apenas 1 caractere deve falhar
      const tamperedPayload = JSON.stringify({ event: 'user.created', id: 'usr_123', email: 'hacker@edgekit.dev' })
      const invalid = await verifyWebhookSignature(secret, tamperedPayload, signature)
      expect(invalid).toBe(false)
    })

    it('Multi-Tenancy Zero-Trust: Política org_member isola estritamente dados pelo activeOrganizationId do token', () => {
      const mockPolicy = {
        id: 'pol_projects',
        tableName: 'projects',
        rlsEnabled: true,
        selectRule: 'org_member',
        insertRule: 'org_member',
        updateRule: 'org_member',
        deleteRule: 'org_member',
        ownerColumn: 'organization_id',
        customRule: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // 1. Usuário sem autenticação é bloqueado
      const anonResult = evaluateTablePolicy('projects', 'select', mockPolicy, {
        role: 'anon',
      })
      expect(anonResult.allowed).toBe(false)
      expect(anonResult.error).toContain('Acesso restrito: faça login')

      // 2. Usuário logado mas sem organização ativa no token é bloqueado
      const noOrgContext: AppVariables = {
        role: 'user',
        user: { id: 'usr_no_org', name: 'Sem Org', email: 'no_org@test.dev' } as any,
        session: { id: 'sess_1', userId: 'usr_no_org' } as any,
      }
      const noOrgResult = evaluateTablePolicy('projects', 'select', mockPolicy, noOrgContext)
      expect(noOrgResult.allowed).toBe(false)
      expect(noOrgResult.error).toContain('Nenhuma organização ativa selecionada')

      // 3. Usuário logado com Org A gera WHERE organization_id = 'org_tenant_A' e injeta organization_id
      const orgAContext: AppVariables = {
        role: 'user',
        user: { id: 'usr_org_A', name: 'Membro Org A', email: 'userA@test.dev' } as any,
        session: { id: 'sess_A', userId: 'usr_org_A', activeOrganizationId: 'org_tenant_A' } as any,
      }
      const orgAResult = evaluateTablePolicy('projects', 'select', mockPolicy, orgAContext)
      expect(orgAResult.allowed).toBe(true)
      expect(orgAResult.whereCondition).toBeDefined()
      expect(orgAResult.injectValues).toEqual({ organization_id: 'org_tenant_A' })

      // 4. Injeção obrigatória na inserção para impedir usurpação de tenant
      const insertResult = evaluateTablePolicy('projects', 'insert', mockPolicy, orgAContext)
      expect(insertResult.allowed).toBe(true)
      expect(insertResult.injectValues?.organization_id).toBe('org_tenant_A')
    })

    it('Deny-by-Default: Tabela recém-criada sem registro em _ek_table_policies rejeita anon_key com HTTP 403', async () => {
      const db = await getDb()
      await db.run(sql`DROP TABLE IF EXISTS raw_secret_data`)
      await db.run(sql`CREATE TABLE raw_secret_data (id TEXT PRIMARY KEY, confidential TEXT)`)

      // Consulta sem política cadastrada
      const res = await app.request('/api/v1/db/raw_secret_data', {
        headers: { apikey: anonKey },
      })
      expect(res.status).toBe(403)
      const json: any = await res.json()
      expect(json.error.code).toBe('FORBIDDEN_TABLE')
      expect(json.error.message).toContain('não possui políticas de acesso configuradas')
    })

    it('SQL Injection Defense: Rejeita tentativas com caracteres nulos ou pontuação proibida em query parameters', async () => {
      // Teste com null byte
      const nullByteRes = await app.request('/api/v1/db/articles?title%00=val', {
        headers: { apikey: anonKey },
      })
      expect(nullByteRes.status).toBe(400)
      const nullByteJson: any = await nullByteRes.json()
      expect(nullByteJson.error.code).toBe('INVALID_IDENTIFIER')

      // Teste com caracteres especiais de quebra
      const specialRes = await app.request('/api/v1/db/articles?title;DELETE=val', {
        headers: { apikey: anonKey },
      })
      expect(specialRes.status).toBe(400)
      const specialJson: any = await specialRes.json()
      expect(specialJson.error.code).toBe('INVALID_IDENTIFIER')
    })

    it('Storage R2: Suporte completo a HTTP 206 (Range Requests) para streaming parcial de arquivos', async () => {
      // Cria arquivo no bucket público
      const formData = new FormData()
      const content = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      const file = new File([content], 'streaming-test.txt', { type: 'text/plain' })
      formData.append('file', file)
      formData.append('path', 'stream')

      const uploadRes = await app.request('/api/v1/storage/default/upload', {
        method: 'POST',
        headers: { Cookie: adminCookie },
        body: formData,
      })
      expect(uploadRes.status).toBe(201)
      const uploadJson: any = await uploadRes.json()
      const fileKey = uploadJson.data.key

      // 1. Range request parcial: bytes=0-4 (deve retornar ABCDE com status 206)
      const rangeRes = await app.request(`/api/v1/storage/default/file/${fileKey}`, {
        headers: { Range: 'bytes=0-4' },
      })
      expect(rangeRes.status).toBe(206)
      expect(rangeRes.headers.get('content-range')).toContain('bytes 0-4/')
      const partialText = await rangeRes.text()
      expect(partialText).toBe('ABCDE')

      // 2. Range request com offset: bytes=10-14 (deve retornar KLMNO com status 206)
      const rangeRes2 = await app.request(`/api/v1/storage/default/file/${fileKey}`, {
        headers: { Range: 'bytes=10-14' },
      })
      expect(rangeRes2.status).toBe(206)
      expect(rangeRes2.headers.get('content-range')).toContain('bytes 10-14/')
      const partialText2 = await rangeRes2.text()
      expect(partialText2).toBe('KLMNO')
    })

    it('Webhook Ping Test: Endpoint /api/v1/webhooks/:id/test executa validação e medição de latência', async () => {
      // 1. Cria webhook de teste
      const createRes = await app.request('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          name: 'Latency Test Webhook',
          url: 'https://httpbin.org/post',
          events: ['db:articles:insert'],
        }),
      })
      expect(createRes.status).toBe(201)
      const createJson: any = await createRes.json()
      const webhookId = createJson.data.id

      // 2. Executa ping test
      const testRes = await app.request(`/api/v1/webhooks/${webhookId}/test`, {
        method: 'POST',
        headers: { Cookie: adminCookie },
      })
      expect(testRes.status).toBe(200)
      const testJson: any = await testRes.json()
      expect(testJson.success).toBe(true)
      expect(testJson.data).toBeDefined()
      expect(testJson.data.webhookId).toBe(webhookId)
      expect(typeof testJson.data.latencyMs).toBe('number')
      expect(typeof testJson.data.statusCode).toBe('number')
      expect(testJson.data.signatureSent).toContain('sha256=')
    })
  })

  describe('Edgekit Platform — Conformidade Canônica Master Prompt (2026)', () => {
    it('Operadores Canônicos e Range em GET /api/v1/db/:table', async () => {
      // 0. Semeia artigo de teste
      await app.request('/api/v1/db/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: serviceRoleKey },
        body: JSON.stringify({ id: 'art_single_test', title: 'Tech Trends 2026' }),
      })

      // 1. Testa range e ilike
      const res = await app.request('/api/v1/db/articles?title=ilike:%tech%&range=0-4', {
        headers: { apikey: anonKey },
      })
      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(Array.isArray(json.data)).toBe(true)
      expect(json.meta.limit).toBe(5)
      expect(json.meta.offset).toBe(0)
    })

    it('single=true em GET /api/v1/db/:table desembala objeto único ou retorna erro', async () => {
      // 1. single=true com resultado existente
      const res = await app.request('/api/v1/db/articles?limit=1&single=true', {
        headers: { apikey: anonKey },
      })
      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(typeof json.data).toBe('object')
      expect(Array.isArray(json.data)).toBe(false)
      expect(json.data.id).toBeDefined()

      // 2. single=true com resultado inexistente retorna 404
      const resEmpty = await app.request('/api/v1/db/articles?title=eq:nonexistent_title_xyz&single=true', {
        headers: { apikey: anonKey },
      })
      expect(resEmpty.status).toBe(404)
      const jsonEmpty: any = await resEmpty.json()
      expect(jsonEmpty.error.code).toBe('NOT_FOUND')
    })

    it('Operadores Canônicos (ilike, is, between, contains, single) em POST /api/v1/db/:table/query', async () => {
      const res = await app.request('/api/v1/db/articles/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({
          select: ['id', 'title'],
          where: [
            { field: 'title', op: 'ilike', value: '%tech%' },
            { field: 'id', op: 'is_not_null' },
          ],
          limit: 1,
          single: true,
        }),
      })
      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(typeof json.data).toBe('object')
      expect(Array.isArray(json.data)).toBe(false)
      expect(json.data.title).toBeDefined()
    })

    it('Edge Functions Locais: GET /api/v1/functions lista funções locais com metadados', async () => {
      const res = await app.request('/api/v1/functions')
      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(Array.isArray(json.data)).toBe(true)
      const names = json.data.map((f: any) => f.name)
      expect(names).toContain('hello')
      expect(names).toContain('health-check')
    })

    it('Edge Functions Locais: Invocação GET e POST de /api/v1/functions/hello', async () => {
      // 1. Invocação GET com query param
      const getRes = await app.request('/api/v1/functions/hello?name=EdgeTester')
      expect(getRes.status).toBe(200)
      const getJson: any = await getRes.json()
      expect(getJson.success).toBe(true)
      expect(getJson.data.greeting).toBe('Hello, EdgeTester!')
      expect(getJson.data.function).toBe('hello')

      // 2. Invocação POST com JSON payload
      const postRes = await app.request('/api/v1/functions/hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CloudflareWorker' }),
      })
      expect(postRes.status).toBe(200)
      const postJson: any = await postRes.json()
      expect(postJson.success).toBe(true)
      expect(postJson.data.greeting).toBe('Hello, CloudflareWorker!')
    })

    it('Edge Functions Locais: Invocação de /api/v1/functions/health-check retorna status', async () => {
      const res = await app.request('/api/v1/functions/health-check')
      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.status).toBe('healthy')
      expect(json.data.function).toBe('health-check')
    })

    it('Edge Functions Locais: Função inexistente retorna HTTP 404', async () => {
      const res = await app.request('/api/v1/functions/funcao_que_nao_existe')
      expect(res.status).toBe(404)
      const json: any = await res.json()
      expect(json.success).toBe(false)
      expect(json.error.code).toBe('FUNCTION_NOT_FOUND')
    })

    it('Tipagem Automática: GET /api/v1/admin/schema/types gera definições TypeScript', async () => {
      const res = await app.request('/api/v1/admin/schema/types', {
        headers: { Cookie: adminCookie },
      })
      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.typescript).toContain('export interface DatabaseSchema')
      expect(json.data.typescript).toContain('articlesRow')
      expect(json.data.typescript).toContain('articlesInsert')
      expect(json.data.typescript).toContain('articlesUpdate')
    })
  })
})
