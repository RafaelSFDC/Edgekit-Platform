import { describe, it, expect, beforeAll } from 'vitest'
import { app } from '../../../apps/api/src/server/app'
import { getDb } from '../../../apps/api/src/server/db'
import { getBindings } from '../../../apps/api/src/server/env'
import {
  ekAdmins,
  ekAdminSessions,
  ekApiKeys,
  ekTablePolicies,
  ekStorageBuckets,
  ekStorageObjects,
  users,
  sessions,
  accounts,
} from '../../../apps/api/src/server/db/schema'
import { sql } from 'drizzle-orm'
import { createClient } from '@edgekit/platform-client'

describe('@edgekit/demo-app — Suíte de Testes E2E do Consumidor Real via SDK', () => {
  const BASE_URL = 'http://localhost:8787'
  let anonKey = 'ek_anon_test_consumer_key'
  let serviceKey = 'ek_service_test_consumer_key'

  // Custom fetch que despacha para o Hono app diretamente com caminho relativo
  const testFetch: typeof fetch = async (input, init) => {
    const path = typeof input === 'string' && input.startsWith('http')
      ? new URL(input).pathname + new URL(input).search
      : (input as any)
    return app.request(path, init)
  }

  // Setup do banco de dados hermético
  beforeAll(async () => {
    const db = await getDb()
    const bindings = await getBindings()

    // 1. Limpa tabelas de teste
    try { await db.delete(ekAdminSessions) } catch {}
    try { await db.delete(ekAdmins) } catch {}
    try { await db.delete(ekApiKeys) } catch {}
    try { await db.delete(ekTablePolicies) } catch {}
    try { await db.delete(ekStorageBuckets) } catch {}
    try { await db.delete(ekStorageObjects) } catch {}
    try { await db.delete(sessions) } catch {}
    try { await db.delete(accounts) } catch {}
    try { await db.delete(users) } catch {}
    try { await db.run(sql`DROP TABLE IF EXISTS consumer_tasks`) } catch {}

    // 2. Executa setup inicial do Edgekit (Owner)
    const setupRes = await app.request('/api/v1/admin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@edgekit.local',
        password: 'Password123!',
        name: 'Platform Owner',
        setupToken: bindings.SETUP_TOKEN || undefined,
      }),
    })
    expect([200, 201]).toContain(setupRes.status)

    // 3. Captura cookie do admin para configurar chaves e políticas
    const adminCookie = setupRes.headers.get('set-cookie')?.split(';')[0] || ''

    // Cria chave anônima
    const anonKeyRes = await app.request('/api/v1/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ name: 'Consumer Anon Key', type: 'anon' }),
    })
    const anonKeyJson: any = await anonKeyRes.json()
    anonKey = anonKeyJson.data.key

    // Cria chave de serviço
    const serviceKeyRes = await app.request('/api/v1/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ name: 'Consumer Service Key', type: 'service_role' }),
    })
    const serviceKeyJson: any = await serviceKeyRes.json()
    serviceKey = serviceKeyJson.data.key

    // 4. Cria tabela consumer_tasks para o teste da aplicação consumidora
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS consumer_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        priority INTEGER DEFAULT 1,
        completed INTEGER DEFAULT 0,
        user_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 5. Configura políticas na tabela: SELECT, INSERT, UPDATE, DELETE exigem regra 'owner'
    const policyRes = await app.request('/api/v1/admin/tables/consumer_tasks/policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        rlsEnabled: true,
        selectRule: 'owner',
        insertRule: 'owner',
        updateRule: 'owner',
        deleteRule: 'owner',
        ownerColumn: 'user_id',
      }),
    })
    expect([200, 201]).toContain(policyRes.status)

    // 6. Cria bucket de storage privado para os testes
    const bucketRes = await app.request('/api/v1/storage/buckets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        id: 'consumer_files',
        name: 'Consumer Files',
        public: false,
        maxFileSize: 1048576, // 1MB
        allowedMimeTypes: ['image/png', 'image/jpeg', 'text/plain'],
      }),
    })
    expect([200, 201]).toContain(bucketRes.status)
  })

  // =========================================================================
  // CENÁRIO 1: Autenticação de Consumidores via Better Auth no SDK
  // =========================================================================
  describe('Cenário 1: Autenticação & Ciclo de Vida de Consumidores', () => {
    let aliceToken = ''
    let bobToken = ''
    let aliceUserId = ''
    let bobUserId = ''

    it('Alice se cadastra na aplicação consumidora através do SDK', async () => {
      const client = createClient({
        url: BASE_URL,
        key: anonKey,
        fetch: testFetch,
      })

      const { data, error } = await client.auth.signUp({
        name: 'Alice Consumer',
        email: 'alice@consumer.local',
        password: 'Password123!',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      aliceToken = (data as any)?.token || ''
      aliceUserId = (data as any)?.user?.id || ''
      expect(aliceUserId).toBeTruthy()
    })

    it('Bob se cadastra na aplicação consumidora através do SDK', async () => {
      const client = createClient({
        url: BASE_URL,
        key: anonKey,
        fetch: testFetch,
      })

      const { data, error } = await client.auth.signUp({
        name: 'Bob Consumer',
        email: 'bob@consumer.local',
        password: 'Password123!',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      bobToken = (data as any)?.token || ''
      bobUserId = (data as any)?.user?.id || ''
      expect(bobUserId).toBeTruthy()
      expect(bobUserId).not.toBe(aliceUserId)
    })

    it('Tentativa de login com senha incorreta é rejeitada', async () => {
      const client = createClient({
        url: BASE_URL,
        key: anonKey,
        fetch: testFetch,
      })

      const { data, error } = await client.auth.signInWithPassword({
        email: 'alice@consumer.local',
        password: 'senha_errada_123',
      })

      expect(error).not.toBeNull()
      expect(data?.token).toBeFalsy()
    })

    it('Login com credenciais corretas retorna sessão e token válidos', async () => {
      const client = createClient({
        url: BASE_URL,
        key: anonKey,
        fetch: testFetch,
      })

      const { data, error } = await client.auth.signInWithPassword({
        email: 'alice@consumer.local',
        password: 'Password123!',
      })

      expect(error).toBeNull()
      expect(data?.user?.email).toBe('alice@consumer.local')
    })
  })

  // =========================================================================
  // CENÁRIO 2: Políticas de Acesso, Isolamento Owner e Anti-Hijacking
  // =========================================================================
  describe('Cenário 2: Políticas de Isolamento & Anti-Hijacking', () => {
    let clientAlice: ReturnType<typeof createClient>
    let clientBob: ReturnType<typeof createClient>
    let aliceTaskId = ''

    beforeAll(async () => {
      // Login de Alice para obter token e cookie
      const loginAlice = await app.request('/api/v1/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@consumer.local', password: 'Password123!' }),
      })
      const aliceJson = await loginAlice.json()
      const aliceCookie = loginAlice.headers.get('set-cookie')?.split(';')[0] || ''

      // Login de Bob para obter token e cookie
      const loginBob = await app.request('/api/v1/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@consumer.local', password: 'Password123!' }),
      })
      const bobJson = await loginBob.json()
      const bobCookie = loginBob.headers.get('set-cookie')?.split(';')[0] || ''

      clientAlice = createClient({
        url: BASE_URL,
        key: anonKey,
        token: aliceJson.token,
        cookie: aliceCookie,
        fetch: testFetch,
      })

      clientBob = createClient({
        url: BASE_URL,
        key: anonKey,
        token: bobJson.token,
        cookie: bobCookie,
        fetch: testFetch,
      })
    })

    it('Deny-by-Default: Chave anônima sem autenticação é bloqueada na tabela com regra owner', async () => {
      const unauthClient = createClient({
        url: BASE_URL,
        key: anonKey,
        fetch: testFetch,
      })

      const { error } = await unauthClient.from('consumer_tasks').select('*')
      expect(error).not.toBeNull()
    })

    it('Alice cria tarefas pertencentes à sua conta com sucesso', async () => {
      const { data, error } = await clientAlice.from('consumer_tasks').insert({
        title: 'Tarefa confidencial da Alice',
        description: 'Dados privados de negócio',
        priority: 5,
        completed: 0,
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      aliceTaskId = (data as any)?.id || ''
      expect(aliceTaskId).toBeTruthy()
    })

    it('Isolamento de Leitura: Bob consulta tarefas e NÃO visualiza a tarefa de Alice', async () => {
      const { data, error } = await clientBob.from('consumer_tasks').select('*')
      expect(error).toBeNull()
      // Bob não criou tarefas ainda, sua lista deve estar vazia
      expect(data).toHaveLength(0)
    })

    it('Isolamento de Leitura Direta: Bob busca pelo ID da tarefa de Alice e não obtém acesso', async () => {
      const { data, error } = await clientBob
        .from('consumer_tasks')
        .select('*')
        .eq('id', aliceTaskId)

      expect(data).toHaveLength(0)
    })

    it('Isolamento de Escrita: Bob tenta atualizar a tarefa de Alice e é impedido', async () => {
      const { error } = await clientBob
        .from('consumer_tasks')
        .update({ title: 'Hacked by Bob' })
        .eq('id', aliceTaskId)

      // Deve falhar ou não afetar nenhuma linha
      // Consulta com Alice para verificar se o título continua o original
      const { data: aliceData } = await clientAlice
        .from('consumer_tasks')
        .select('*')
        .eq('id', aliceTaskId)
        .single()

      expect(aliceData?.title).toBe('Tarefa confidencial da Alice')
    })

    it('Isolamento de Exclusão: Bob tenta deletar a tarefa de Alice e é impedido', async () => {
      await clientBob.from('consumer_tasks').delete().eq('id', aliceTaskId)

      // Tarefa da Alice deve continuar existindo intacta
      const { data } = await clientAlice
        .from('consumer_tasks')
        .select('*')
        .eq('id', aliceTaskId)
        .single()

      expect(data).not.toBeNull()
      expect(data?.id).toBe(aliceTaskId)
    })

    it('Anti-Hijacking: Tentativa de transferir user_id forjando identidade em mutações é barrada', async () => {
      // Alice tenta atualizar o user_id da sua própria tarefa para o user_id do Bob
      const { error } = await clientAlice
        .from('consumer_tasks')
        .update({ user_id: 'forged_bob_user_id' })
        .eq('id', aliceTaskId)

      // A API rejeita a alteração da coluna user_id
      const { data } = await clientAlice
        .from('consumer_tasks')
        .select('*')
        .eq('id', aliceTaskId)
        .single()

      expect(data?.user_id).not.toBe('forged_bob_user_id')
    })
  })

  // =========================================================================
  // CENÁRIO 3: Queries Declarativas e Proteção contra SQL Injection
  // =========================================================================
  describe('Cenário 3: Queries do SDK & Blindagem contra SQL Injection (SQLi Shield)', () => {
    let clientAlice: ReturnType<typeof createClient>

    beforeAll(async () => {
      const loginAlice = await app.request('/api/v1/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@consumer.local', password: 'Password123!' }),
      })
      const aliceJson = await loginAlice.json()
      const aliceCookie = loginAlice.headers.get('set-cookie')?.split(';')[0] || ''

      clientAlice = createClient({
        url: BASE_URL,
        key: anonKey,
        token: aliceJson.token,
        cookie: aliceCookie,
        fetch: testFetch,
      })

      // Insere mais itens para testar filtros e paginação
      await clientAlice.from('consumer_tasks').insert({
        title: 'Revisar documentação técnica',
        priority: 3,
        completed: 1,
      })
      await clientAlice.from('consumer_tasks').insert({
        title: 'Preparar release para Cloudflare Workers',
        priority: 10,
        completed: 0,
      })
    })

    it('Operadores canônicos do SDK funcionam com Thenable/Await direto', async () => {
      // Teste com ilike e order
      const { data, error } = await clientAlice
        .from('consumer_tasks')
        .select('id, title, priority')
        .ilike('title', '%Cloudflare%')
        .order('priority', { ascending: false })

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data?.[0].title).toContain('Cloudflare')
    })

    it('Filtro com operador between e is', async () => {
      const { data, error } = await clientAlice
        .from('consumer_tasks')
        .select('id, title, priority, completed')
        .between('priority', 2, 8)

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.length).toBeGreaterThanOrEqual(1)
    })

    it('Paginação fluente com .range() e limite de registros', async () => {
      const { data, error } = await clientAlice
        .from('consumer_tasks')
        .select('*')
        .range(0, 1)

      expect(error).toBeNull()
      expect(data!.length).toBeLessThanOrEqual(2)
    })

    it('SQLi Attack Shield: Payload adversário clássico no filtro ilike é tratado com segurança', async () => {
      const maliciousPayload = "' OR 1=1 --"
      const { data, error } = await clientAlice
        .from('consumer_tasks')
        .select('*')
        .ilike('title', maliciousPayload)

      expect(error).toBeNull()
      // Não deve vazar todas as tarefas nem causar erro de sintaxe SQL
      expect(data).toHaveLength(0)
    })

    it('SQLi Attack Shield: Injeção de DDL (; DROP TABLE consumer_tasks; --) é barrada', async () => {
      const ddlPayload = "'; DROP TABLE consumer_tasks; --"
      const { data, error } = await clientAlice
        .from('consumer_tasks')
        .select('*')
        .ilike('title', ddlPayload)

      expect(error).toBeNull()
      expect(data).toHaveLength(0)

      // Garante que a tabela consumer_tasks continua existindo
      const checkRes = await clientAlice.from('consumer_tasks').select('id').limit(1)
      expect(checkRes.error).toBeNull()
    })
  })

  // =========================================================================
  // CENÁRIO 4: Storage R2, Signed URLs e Guardrails
  // =========================================================================
  describe('Cenário 4: Storage R2 & URLs Pré-assinadas HMAC', () => {
    let clientAlice: ReturnType<typeof createClient>
    let uploadedFileKey = ''

    beforeAll(async () => {
      const loginAlice = await app.request('/api/v1/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@consumer.local', password: 'Password123!' }),
      })
      const aliceJson = await loginAlice.json()
      const aliceCookie = loginAlice.headers.get('set-cookie')?.split(';')[0] || ''

      clientAlice = createClient({
        url: BASE_URL,
        key: anonKey,
        token: aliceJson.token,
        cookie: aliceCookie,
        fetch: testFetch,
      })

      // Faz upload do avatar privado inicial com formato multipart
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
      const fileContent = 'fake_png_binary_data'
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="isPublic"',
        '',
        'false',
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="avatar-alice.png"',
        'Content-Type: image/png',
        '',
        fileContent,
        `--${boundary}--`,
      ].join('\r\n')

      const uploadRes = await app.request('/api/v1/storage/consumer_files/upload', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          apikey: serviceKey,
        },
        body,
      })
      const uploadJson: any = await uploadRes.json()
      uploadedFileKey = uploadJson.data.key
    })

    it('Download de arquivo em bucket privado sem assinatura ou token retorna 403', async () => {
      const res = await app.request(`/api/v1/storage/consumer_files/file/${uploadedFileKey}`, {
        method: 'GET',
      })
      expect(res.status).toBe(403)
    })

    it('Geração de Signed URL com HMAC-SHA256 permite acesso temporário', async () => {
      // Gera signed URL
      const signedRes = await app.request('/api/v1/storage/consumer_files/signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
        },
        body: JSON.stringify({ key: uploadedFileKey, expiresInSeconds: 300 }),
      })
      expect(signedRes.status).toBe(200)
      const { data } = await signedRes.json()
      expect(data?.url).toBeDefined()

      // Acessa via signed URL
      const downloadPath = new URL(data.url).pathname + new URL(data.url).search
      const downloadRes = await app.request(downloadPath)
      expect(downloadRes.status).toBe(200)
    })

    it('Signed URL com assinatura adulterada é categoricamente rejeitada com HTTP 403', async () => {
      // Tenta acessar com assinatura falsa
      const forgedUrl = `/api/v1/storage/consumer_files/file/${uploadedFileKey}?action=read&expires=9999999999&sig=fake_tampered_signature_123`
      const res = await app.request(forgedUrl)
      expect(res.status).toBe(403)
    })
  })

  // =========================================================================
  // CENÁRIO 5: Zero-Trust Dupla Identidade & Proteção de Rotas Administrativas
  // =========================================================================
  describe('Cenário 5: Dupla Identidade Estrita (Zero-Trust Admin Lockout)', () => {
    let aliceToken = ''

    beforeAll(async () => {
      const loginAlice = await app.request('/api/v1/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@consumer.local', password: 'Password123!' }),
      })
      const aliceJson = await loginAlice.json()
      aliceToken = aliceJson.token
    })

    it('Consumidor final autenticado é categoricamente bloqueado em /api/v1/admin/me (HTTP 403)', async () => {
      const res = await app.request('/api/v1/admin/me', {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
        },
      })
      expect(res.status).toBe(403)
    })

    it('Consumidor final não consegue listar chaves de API administrativas (/api/v1/admin/keys)', async () => {
      const res = await app.request('/api/v1/admin/keys', {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
        },
      })
      expect(res.status).toBe(403)
    })

    it('Consumidor final não consegue alterar políticas (/api/v1/admin/tables/:table/policy)', async () => {
      const res = await app.request('/api/v1/admin/tables/consumer_tasks/policy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aliceToken}`,
        },
        body: JSON.stringify({
          tableName: 'consumer_tasks',
          selectRule: 'public',
        }),
      })
      expect(res.status).toBe(403)
    })

    it('Forjamento de headers administrativos não bypassa a segurança', async () => {
      const res = await app.request('/api/v1/admin/me', {
        headers: {
          'x-admin-role': 'owner',
          'x-user-id': 'admin',
        },
      })
      expect(res.status).toBe(403)
    })
  })
})
