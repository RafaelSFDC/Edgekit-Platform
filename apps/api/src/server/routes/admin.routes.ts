import { Hono } from 'hono'
import { count, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AppEnv } from '../types'
import { getDb } from '../db'
import { apiKeys, storageFiles, users, tablePolicies, sessions, accounts, appSettings } from '../db/schema'
import { getBindings } from '../env'
import { getPlanCapabilities } from '../plan'
import { requireAdmin } from '../auth/middleware'
import { getAuth } from '../auth'
import { getSecurityConfig, invalidateSecurityConfigCache } from '../auth/security'

export const adminRoutes = new Hono<AppEnv>()

// Checagem de status inicial do setup (Acesso livre para permitir Setup Wizard)
adminRoutes.get('/setup-status', async (c) => {
  const db = await getDb()
  try {
    const adminCount = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.role, 'admin'))
      .get()

    const isComplete = (adminCount?.count ?? 0) > 0
    return c.json({
      success: true,
      data: {
        isSetupComplete: isComplete,
        adminCount: adminCount?.count ?? 0,
      },
    })
  } catch {
    return c.json({
      success: true,
      data: {
        isSetupComplete: false,
        adminCount: 0,
      },
    })
  }
})

// Assistente de 1º acesso (Setup Wizard)
adminRoutes.post('/setup', async (c) => {
  const db = await getDb()
  const body = await c.req.json()

  // Se já existir admin, bloqueia novo setup por segurança
  const existingAdmin = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.role, 'admin'))
    .get()

  if ((existingAdmin?.count ?? 0) > 0) {
    return c.json(
      { success: false, error: { message: 'O sistema já possui um administrador configurado.' } },
      400,
    )
  }

  const { name, email, password } = body
  if (!name || !email || !password) {
    return c.json(
      { success: false, error: { message: 'Nome, e-mail e senha são obrigatórios.' } },
      400,
    )
  }

  try {
    const auth = await getAuth()
    // Criação do usuário via Better-Auth
    const userRes = await auth.api.signUpEmail({
      body: {
        name,
        email,
        password,
      },
    })

    // Promove o primeiro usuário para 'admin'
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, email))

    const bindings = await getBindings()

    return c.json({
      success: true,
      message: 'Administrador configurado com sucesso!',
      data: {
        user: userRes.user,
        keys: {
          anonKey: bindings.HONOBASE_ANON_KEY,
          serviceRoleKey: bindings.HONOBASE_SERVICE_ROLE_KEY,
        },
      },
    })
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})

// Estatísticas para a tela Overview do Dashboard
adminRoutes.get('/stats', requireAdmin(), async (c) => {
  const db = await getDb()
  const planInfo = await getPlanCapabilities()

  const [usersCountRes, filesCountRes] = await Promise.all([
    db.select({ count: count() }).from(users).get(),
    db.select({ count: count() }).from(storageFiles).get(),
  ])

  // Obter tabelas existentes do banco SQLite
  const tablesRes = await db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
  )

  return c.json({
    success: true,
    data: {
      totalUsers: usersCountRes?.count ?? 0,
      totalFiles: filesCountRes?.count ?? 0,
      totalTables: tablesRes.length,
      plan: planInfo,
    },
  })
})

// Listar tabelas disponíveis no banco D1
adminRoutes.get('/tables', requireAdmin(), async (c) => {
  const db = await getDb()
  const rows: any = await db.all(
    sql`SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`,
  )

  const tablesWithCounts = await Promise.all(
    rows.map(async (r: any) => {
      try {
        const countRes: any = await db.all(sql.raw(`SELECT COUNT(*) as c FROM \`${r.name}\``))
        return {
          name: r.name,
          sql: r.sql,
          rowCount: countRes?.[0]?.c ?? 0,
        }
      } catch {
        return { name: r.name, sql: r.sql, rowCount: 0 }
      }
    }),
  )

  return c.json({ success: true, data: tablesWithCounts })
})

const SAFE_NAME = /^[a-zA-Z0-9_]+$/
const ALLOWED_SQL_TYPES = new Set(['TEXT', 'INTEGER', 'REAL', 'BLOB', 'JSON'])
const SYSTEM_TABLES_SET = new Set([
  'users',
  'sessions',
  'accounts',
  'verifications',
  'api_keys',
  'storage_files',
  'audit_logs',
  'webhooks',
  'app_settings',
  'table_policies',
  '__honobase_migrations',
  '__d1_migrations',
  'drizzle_migrations',
  'sqlite_master',
  'sqlite_sequence',
])

// Criador visual de tabelas (Visual DDL)
adminRoutes.post('/tables', requireAdmin(), async (c) => {
  const body = await c.req.json()
  const tableName = (body.name || '').trim()

  if (!SAFE_NAME.test(tableName)) {
    return c.json(
      { success: false, error: { message: `Nome de tabela inválido: "${tableName}"` } },
      400,
    )
  }

  if (SYSTEM_TABLES_SET.has(tableName.toLowerCase())) {
    return c.json(
      { success: false, error: { message: `O nome "${tableName}" é reservado pelo sistema.` } },
      400,
    )
  }

  const columns = Array.isArray(body.columns) ? body.columns : []
  if (columns.length === 0) {
    return c.json(
      { success: false, error: { message: 'A tabela deve conter ao menos uma coluna.' } },
      400,
    )
  }

  const colDefinitions: string[] = []
  let hasPrimaryKey = false

  for (const col of columns) {
    const colName = (col.name || '').trim()
    const colType = (col.type || 'TEXT').toUpperCase()

    if (!SAFE_NAME.test(colName)) {
      return c.json(
        { success: false, error: { message: `Nome de coluna inválido: "${colName}"` } },
        400,
      )
    }

    if (!ALLOWED_SQL_TYPES.has(colType)) {
      return c.json(
        { success: false, error: { message: `Tipo de dado SQL não suportado: "${colType}"` } },
        400,
      )
    }

    const typeKeyword = colType === 'JSON' ? 'TEXT' : colType
    let def = `\`${colName}\` ${typeKeyword}`

    if (col.primaryKey) {
      def += ' PRIMARY KEY'
      hasPrimaryKey = true
    }

    if (col.notNull) {
      def += ' NOT NULL'
    }

    if (col.defaultValue !== undefined && col.defaultValue !== '') {
      def += ` DEFAULT ${col.defaultValue}`
    }

    colDefinitions.push(def)
  }

  // Se não foi definida primary key explícita, adiciona um id text primário padrão
  if (!hasPrimaryKey) {
    colDefinitions.unshift('`id` TEXT PRIMARY KEY NOT NULL')
  }

  const createTableSql = `CREATE TABLE \`${tableName}\` (\n  ${colDefinitions.join(',\n  ')}\n);`

  const db = await getDb()
  try {
    await db.run(sql.raw(createTableSql))

    // Inicializa a política recomendada de RLS (Leitura Pública, Escrita e Deleção por Dono)
    try {
      const detectedOwner =
        columns.find((c: any) =>
          ['user_id', 'userid', 'author_id', 'owner_id', 'created_by'].includes(
            (c.name || '').toLowerCase(),
          ),
        )?.name || 'user_id'

      const now = new Date()
      await db.insert(tablePolicies).values({
        id: nanoid(),
        tableName,
        rlsEnabled: true,
        selectRule: 'public',
        insertRule: 'authenticated',
        updateRule: 'owner',
        deleteRule: 'owner',
        ownerColumn: detectedOwner,
        readLevel: 'public',
        writeLevel: 'authenticated',
        createdAt: now,
        updatedAt: now,
      })
    } catch {
      // Política pode já existir
    }

    return c.json(
      {
        success: true,
        message: `Tabela "${tableName}" criada com sucesso!`,
        sql: createTableSql,
      },
      201,
    )
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: { message: `Falha ao criar tabela: ${err.message}` },
      },
      500,
    )
  }
})

// Deletar tabela (Drop Table)
adminRoutes.delete('/tables/:name', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()

  if (!SAFE_NAME.test(tableName)) {
    return c.json({ success: false, error: { message: 'Nome de tabela inválido.' } }, 400)
  }

  if (SYSTEM_TABLES_SET.has(tableName.toLowerCase())) {
    return c.json(
      {
        success: false,
        error: { message: 'Tabelas do sistema não podem ser excluídas.' },
      },
      403,
    )
  }

  const db = await getDb()
  try {
    await db.run(sql.raw(`DROP TABLE \`${tableName}\``))
    return c.json({
      success: true,
      message: `Tabela "${tableName}" excluída com sucesso.`,
    })
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})

// Adicionar coluna a tabela existente
adminRoutes.post('/tables/:name/columns', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()
  const body = await c.req.json()
  const colName = (body.name || '').trim()
  const colType = (body.type || 'TEXT').toUpperCase()

  if (!SAFE_NAME.test(tableName) || !SAFE_NAME.test(colName)) {
    return c.json({ success: false, error: { message: 'Identificadores inválidos.' } }, 400)
  }

  if (SYSTEM_TABLES_SET.has(tableName.toLowerCase())) {
    return c.json(
      { success: false, error: { message: 'Tabelas de sistema não podem ser alteradas.' } },
      403,
    )
  }

  if (!ALLOWED_SQL_TYPES.has(colType)) {
    return c.json(
      { success: false, error: { message: `Tipo de dado SQL inválido: "${colType}"` } },
      400,
    )
  }

  const typeKeyword = colType === 'JSON' ? 'TEXT' : colType
  let alterSql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${typeKeyword}`

  if (body.defaultValue !== undefined && body.defaultValue !== '') {
    alterSql += ` DEFAULT ${body.defaultValue}`
  }

  const db = await getDb()
  try {
    await db.run(sql.raw(alterSql))
    return c.json({
      success: true,
      message: `Coluna "${colName}" adicionada à tabela "${tableName}".`,
      sql: alterSql,
    })
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})

// SQL Runner para o Database Studio do Admin
adminRoutes.post('/sql', requireAdmin(), async (c) => {
  const body = await c.req.json()
  const rawQuery = (body.query || '').trim()

  if (!rawQuery) {
    return c.json({ success: false, error: { message: 'Query SQL vazia.' } }, 400)
  }

  const db = await getDb()
  try {
    const isSelect = rawQuery.toUpperCase().startsWith('SELECT') || rawQuery.toUpperCase().startsWith('PRAGMA')
    if (isSelect) {
      const results = await db.all(sql.raw(rawQuery))
      return c.json({ success: true, isSelect: true, rows: results, rowCount: results.length })
    } else {
      const result = await db.run(sql.raw(rawQuery))
      return c.json({ success: true, isSelect: false, result })
    }
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})

// Listar chaves de API
adminRoutes.get('/keys', requireAdmin(), async (c) => {
  const db = await getDb()
  const keys = await db.select().from(apiKeys).all()

  // Mascara chaves de serviço para segurança visual
  const sanitized = keys.map((k) => ({
    ...k,
    keyMasked: k.type === 'service_role' ? k.key.slice(0, 12) + '...' + k.key.slice(-4) : k.key,
  }))

  return c.json({ success: true, data: sanitized })
})

// Gerar nova chave de API
adminRoutes.post('/keys', requireAdmin(), async (c) => {
  const body = await c.req.json()
  const db = await getDb()
  const now = new Date()

  const type = body.type || 'custom'
  const prefix = type === 'service_role' ? 'hb_service_' : 'hb_key_'
  const generatedKey = prefix + crypto.randomUUID().replace(/-/g, '')

  const record = {
    id: nanoid(),
    name: body.name || 'Nova Chave',
    key: generatedKey,
    type,
    role: body.role || 'user',
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(apiKeys).values(record)
  return c.json({ success: true, data: record }, 201)
})

// Obter política de acesso da tabela (Supabase-Style RLS)
adminRoutes.get('/tables/:name/policy', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()
  const db = await getDb()
  const policy = await db
    .select()
    .from(tablePolicies)
    .where(eq(tablePolicies.tableName, tableName))
    .get()

  if (policy) {
    return c.json({
      success: true,
      data: {
        tableName,
        rlsEnabled: Boolean(policy.rlsEnabled),
        selectRule: policy.selectRule || policy.readLevel || 'public',
        insertRule: policy.insertRule || policy.writeLevel || 'authenticated',
        updateRule: policy.updateRule || policy.writeLevel || 'owner',
        deleteRule: policy.deleteRule || policy.writeLevel || 'owner',
        ownerColumn: policy.ownerColumn || 'user_id',
        readLevel: policy.readLevel || 'public',
        writeLevel: policy.writeLevel || 'authenticated',
      },
    })
  }

  return c.json({
    success: true,
    data: {
      tableName,
      rlsEnabled: true,
      selectRule: 'public',
      insertRule: 'authenticated',
      updateRule: 'owner',
      deleteRule: 'owner',
      ownerColumn: 'user_id',
      readLevel: 'public',
      writeLevel: 'authenticated',
    },
  })
})

// Atualizar política de acesso da tabela (Supabase-Style RLS)
adminRoutes.put('/tables/:name/policy', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()
  const body = await c.req.json()

  const validRules = ['public', 'authenticated', 'owner', 'admin', 'disabled']
  const rlsEnabled = body.rlsEnabled !== undefined ? Boolean(body.rlsEnabled) : true
  const selectRule = validRules.includes(body.selectRule) ? body.selectRule : 'public'
  const insertRule = validRules.includes(body.insertRule) ? body.insertRule : 'authenticated'
  const updateRule = validRules.includes(body.updateRule) ? body.updateRule : 'owner'
  const deleteRule = validRules.includes(body.deleteRule) ? body.deleteRule : 'owner'
  const ownerColumn = (body.ownerColumn || 'user_id').trim().replace(/[^a-zA-Z0-9_]/g, '')

  const readLevel = ['public', 'authenticated', 'admin'].includes(body.readLevel)
    ? body.readLevel
    : selectRule === 'owner'
      ? 'authenticated'
      : selectRule
  const writeLevel = ['public', 'authenticated', 'admin'].includes(body.writeLevel)
    ? body.writeLevel
    : updateRule === 'owner'
      ? 'authenticated'
      : updateRule

  const now = new Date()
  const db = await getDb()

  const existing = await db
    .select()
    .from(tablePolicies)
    .where(eq(tablePolicies.tableName, tableName))
    .get()

  if (existing) {
    await db
      .update(tablePolicies)
      .set({
        rlsEnabled,
        selectRule,
        insertRule,
        updateRule,
        deleteRule,
        ownerColumn,
        readLevel,
        writeLevel,
        updatedAt: now,
      })
      .where(eq(tablePolicies.tableName, tableName))
  } else {
    await db.insert(tablePolicies).values({
      id: nanoid(),
      tableName,
      rlsEnabled,
      selectRule,
      insertRule,
      updateRule,
      deleteRule,
      ownerColumn,
      readLevel,
      writeLevel,
      createdAt: now,
      updatedAt: now,
    })
  }

  return c.json({
    success: true,
    data: {
      tableName,
      rlsEnabled,
      selectRule,
      insertRule,
      updateRule,
      deleteRule,
      ownerColumn,
      readLevel,
      writeLevel,
    },
  })
})

// Obter configurações de segurança (CORS e Whitelist de IPs)
adminRoutes.get('/settings/security', requireAdmin(), async (c) => {
  const config = await getSecurityConfig()
  return c.json({
    success: true,
    data: config,
  })
})

// Salvar configurações de segurança (CORS e Whitelist de IPs)
adminRoutes.put('/settings/security', requireAdmin(), async (c) => {
  const body = await c.req.json()
  const db = await getDb()
  const now = new Date()

  const allowedOrigins = Array.isArray(body.allowedOrigins)
    ? body.allowedOrigins.map((o: string) => o.trim()).filter(Boolean)
    : []
  const allowedIps = Array.isArray(body.allowedIps)
    ? body.allowedIps.map((ip: string) => ip.trim()).filter(Boolean)
    : []
  const blockExternalLocalhost = body.blockExternalLocalhost !== false

  async function upsertSetting(key: string, value: string) {
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).get()
    if (existing) {
      await db.update(appSettings).set({ value, updatedAt: now }).where(eq(appSettings.key, key))
    } else {
      await db.insert(appSettings).values({ key, value, createdAt: now, updatedAt: now })
    }
  }

  await Promise.all([
    upsertSetting('security_allowed_origins', JSON.stringify(allowedOrigins)),
    upsertSetting('security_allowed_ips', JSON.stringify(allowedIps)),
    upsertSetting('security_block_external_localhost', String(blockExternalLocalhost)),
  ])

  invalidateSecurityConfigCache()

  return c.json({
    success: true,
    message: 'Configurações de segurança atualizadas com sucesso.',
    data: {
      allowedOrigins,
      allowedIps,
      blockExternalLocalhost,
    },
  })
})

// Criar usuário pelo painel administrativo
adminRoutes.post('/users', requireAdmin(), async (c) => {
  const body = await c.req.json()
  const { name, email, password, role } = body

  if (!name || !email || !password) {
    return c.json(
      { success: false, error: { message: 'Nome, e-mail e senha são obrigatórios.' } },
      400,
    )
  }

  const db = await getDb()
  const existing = await db.select().from(users).where(eq(users.email, email)).get()
  if (existing) {
    return c.json(
      { success: false, error: { message: 'Já existe um usuário cadastrado com este e-mail.' } },
      400,
    )
  }

  try {
    const auth = await getAuth()
    const userRes = await auth.api.signUpEmail({
      body: { name, email, password },
    })

    const assignedRole = role === 'admin' ? 'admin' : 'user'
    if (assignedRole === 'admin') {
      await db.update(users).set({ role: 'admin' }).where(eq(users.email, email))
    }

    return c.json(
      {
        success: true,
        message: 'Usuário criado com sucesso!',
        data: { ...userRes.user, role: assignedRole },
      },
      201,
    )
  } catch (err: any) {
    return c.json(
      { success: false, error: { message: err.message || 'Falha ao criar usuário.' } },
      500,
    )
  }
})

// Atualizar função (role) de um usuário
adminRoutes.patch('/users/:id/role', requireAdmin(), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const role = body.role === 'admin' ? 'admin' : 'user'
  const db = await getDb()

  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id))
  return c.json({ success: true, message: `Função do usuário atualizada para ${role}.` })
})

// Excluir usuário pelo painel administrativo
adminRoutes.delete('/users/:id', requireAdmin(), async (c) => {
  const id = c.req.param('id')
  const db = await getDb()

  await db.delete(sessions).where(eq(sessions.userId, id)).catch(() => {})
  await db.delete(accounts).where(eq(accounts.userId, id)).catch(() => {})
  await db.delete(users).where(eq(users.id, id))

  return c.json({ success: true, message: 'Usuário removido com sucesso.' })
})

