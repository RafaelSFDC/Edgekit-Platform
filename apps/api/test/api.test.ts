import { describe, it, expect, beforeAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { app } from '../src/server/app'
import { getDb } from '../src/server/db'
import { ekAdmins, ekApiKeys, ekTablePolicies, ekStorageBuckets, ekStorageObjects, ekWebhooks, users, organizations } from '../src/server/db/schema'
import { createEdgekitClient } from '../../../packages/client/src/index'
import { ADMIN_COOKIE_NAME } from '../src/server/auth/admin-auth'
import { evaluateTablePolicy } from '../src/server/policies/engine'
import { computeWebhookSignature, verifyWebhookSignature } from '../src/server/realtime/webhooks'
import type { AppVariables } from '../src/server/types'

describe('Edgekit Platform — Fundação, Segurança & Identidade Dupla (Fase 1)', () => {
  let adminCookie = ''
  let serviceRoleKey = ''
  let anonKey = ''

  beforeAll(async () => {
    // Limpa tabelas de teste para garantir execução hermética
    const db = await getDb()
    try { await db.delete(ekAdmins) } catch {}
    try { await db.delete(ekApiKeys) } catch {}
    try { await db.delete(ekTablePolicies) } catch {}
    try { await db.delete(ekStorageBuckets) } catch {}
    try { await db.delete(ekStorageObjects) } catch {}
    try { await db.delete(ekWebhooks) } catch {}
    try { await db.delete(organizations) } catch {}
    try { await db.delete(users) } catch {}
    try { db.run(sql`DROP TABLE IF EXISTS articles`) } catch {}
    try { db.run(sql`DROP TABLE IF EXISTS tasks`) } catch {}
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

  it('POST /api/v1/admin/setup cria o Proprietário (Owner) e define cookie de sessão', async () => {
    const res = await app.request('/api/v1/admin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Proprietário Root',
        email: 'owner@edgekit.dev',
        password: 'senha-segura-owner-123',
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
})
