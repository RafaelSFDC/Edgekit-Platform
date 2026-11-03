import { Hono } from 'hono'
import { count, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import type { AppEnv } from '../types'
import { getDb } from '../db'
import {
  ekAdmins,
  ekAdminSessions,
  ekApiKeys,
  ekStorageBuckets,
  ekStorageObjects,
  users,
  sessions,
  accounts,
  organizations,
  members,
  ekTablePolicies,
  ekSettings,
} from '../db/schema'
import { getBindings } from '../env'
import { getAuth } from '../auth'
import { requireAdmin } from '../auth/middleware'
import {
  hashPassword,
  verifyPassword,
  createAdminSession,
  revokeAdminSession,
  ADMIN_COOKIE_NAME,
  HOST_ADMIN_COOKIE_NAME,
} from '../auth/admin-auth'
import { createApiKey, ensureDefaultKeys, validateApiKey } from '../auth/keys'
import { getSecurityConfig, invalidateSecurityConfigCache, isLocalhostOrigin } from '../auth/security'
import { AdminSetupSchema, AdminLoginSchema, CreateApiKeySchema, TablePolicyUpdateSchema } from '../schemas'
import { invalidateTableColumnsCache } from './db.routes'

export const adminRoutes = new Hono<AppEnv>()

// =========================================================================
// 1. SETUP WIZARD & ADMIN AUTHENTICATION
// =========================================================================

// Checagem de status inicial do setup (Acesso livre)
adminRoutes.get('/setup-status', async (c) => {
  const db = await getDb()
  try {
    const adminCount = await db
      .select({ count: count() })
      .from(ekAdmins)
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

// Setup do 1º acesso (Criação do Proprietário/Owner)
adminRoutes.post('/setup', async (c) => {
  const db = await getDb()
  const bindings = await getBindings()

  // Se já existir qualquer admin registrado, bloqueia permanentemente (Previne C2 Setup Takeover)
  const existingAdmins = await db
    .select({ count: count() })
    .from(ekAdmins)
    .get()

  if ((existingAdmins?.count ?? 0) > 0) {
    return c.json(
      {
        success: false,
        error: {
          code: 'SETUP_ALREADY_COMPLETED',
          message: 'O setup inicial já foi concluído. Esta instância já possui um proprietário registrado.',
        },
      },
      403,
    )
  }

  const body = await c.req.json().catch(() => ({}))
  const parsed = AdminSetupSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.errors[0]?.message || 'Dados inválidos para o setup.',
        },
      },
      400,
    )
  }

  const { name, email, password, setupToken } = parsed.data
  const isProd = bindings.ENVIRONMENT === 'production'

  // Se SETUP_TOKEN estiver definido nas variáveis de ambiente, exige sua validação estrita
  if (bindings.SETUP_TOKEN && bindings.SETUP_TOKEN.trim()) {
    if (!setupToken || setupToken.trim() !== bindings.SETUP_TOKEN.trim()) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_SETUP_TOKEN',
            message: 'O SETUP_TOKEN informado é inválido. Consulte suas variáveis de ambiente na Cloudflare.',
          },
        },
        401,
      )
    }
  } else if (isProd) {
    return c.json(
      {
        success: false,
        error: {
          code: 'SETUP_TOKEN_REQUIRED',
          message: 'SETUP_TOKEN é obrigatório em ambiente de produção para provisionamento.',
        },
      },
      403,
    )
  }

  try {
    const passwordHash = await hashPassword(password)
    const adminId = nanoid()
    const now = new Date()

    // 1. Cadastra o Proprietário no banco interno _ek_admins
    await db.insert(ekAdmins).values({
      id: adminId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: passwordHash,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    })

    // 2. Cria a sessão inicial do Admin e define cookie HttpOnly seguro
    const sessionMeta = {
      ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || '127.0.0.1',
      userAgent: c.req.header('user-agent'),
    }
    const { token: sessionToken } = await createAdminSession(db, adminId, sessionMeta)

    const isLocalhost = isLocalhostOrigin(c.req.header('origin') || '') || c.req.url.includes('localhost') || c.req.url.includes('127.0.0.1')
    const isHttps = c.req.url.startsWith('https://')

    setCookie(c, ADMIN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: !isLocalhost && isHttps,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 dias
    })

    if (!isLocalhost && isHttps) {
      setCookie(c, HOST_ADMIN_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      })
    }

    // 3. Garante as chaves de API iniciais no banco
    await ensureDefaultKeys(db)

    return c.json(
      {
        success: true,
        message: 'Proprietário configurado com sucesso!',
        data: {
          admin: {
            id: adminId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role: 'owner',
          },
        },
      },
      201,
    )
  } catch (err: any) {
    return c.json(
      { success: false, error: { message: `Falha ao concluir setup: ${err.message}` } },
      500,
    )
  }
})

// Login Administrativo do Painel (Email + Senha dos membros de _ek_admins ou Chave de Serviço)
adminRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const db = await getDb()

  // 1. Caso A: Login com Chave Secreta (Service Role Key)
  const passkey =
    body.passkey ||
    body.secret ||
    body.key ||
    c.req.header('x-app-secret') ||
    c.req.header('x-api-key') ||
    c.req.header('apikey')

  if (passkey && typeof passkey === 'string' && passkey.trim()) {
    const cleanKey = passkey.trim()
    const validated = await validateApiKey(db, cleanKey)

    if (!validated || validated.type !== 'service_role') {
      return c.json(
        {
          success: false,
          authenticated: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Chave de acesso inválida ou sem privilégios de service_role.',
          },
        },
        401,
      )
    }

    invalidateTableColumnsCache()

    return c.json({
      success: true,
      authenticated: true,
      role: 'service_role',
      key: {
        name: validated.name,
        type: validated.type,
      },
    })
  }

  // 2. Caso B: Login com E-mail e Senha de Membro da Plataforma (_ek_admins)
  const parsed = AdminLoginSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.errors[0]?.message || 'Informe e-mail e senha de administrador válidos ou uma chave service_role.',
        },
      },
      400,
    )
  }

  const { email, password } = parsed.data
  const admin = await db.select().from(ekAdmins).where(eq(ekAdmins.email, email)).get()

  if (!admin) {
    return c.json(
      { success: false, error: { message: 'Credenciais de administrador inválidas.' } },
      401,
    )
  }

  const isValidPassword = await verifyPassword(password, admin.password)
  if (!isValidPassword) {
    return c.json(
      { success: false, error: { message: 'Credenciais de administrador inválidas.' } },
      401,
    )
  }

  // Cria nova sessão administrativa
  const sessionMeta = {
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || '127.0.0.1',
    userAgent: c.req.header('user-agent'),
  }
  const { token: sessionToken } = await createAdminSession(db, admin.id, sessionMeta)

  const isLocalhost = isLocalhostOrigin(c.req.header('origin') || '') || c.req.url.includes('localhost') || c.req.url.includes('127.0.0.1')
  const isHttps = c.req.url.startsWith('https://')

  setCookie(c, ADMIN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: !isLocalhost && isHttps,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  })

  if (!isLocalhost && isHttps) {
    setCookie(c, HOST_ADMIN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
  }

  return c.json({
    success: true,
    authenticated: true,
    data: {
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    },
  })
})

// Logout Administrativo
adminRoutes.post('/logout', async (c) => {
  const db = await getDb()
  const token = getCookie(c, HOST_ADMIN_COOKIE_NAME) || getCookie(c, ADMIN_COOKIE_NAME)
  if (token) {
    await revokeAdminSession(db, token)
  }
  deleteCookie(c, ADMIN_COOKIE_NAME, { path: '/' })
  deleteCookie(c, HOST_ADMIN_COOKIE_NAME, { path: '/' })
  return c.json({ success: true, message: 'Sessão administrativa encerrada com sucesso.' })
})

// Perfil do Administrador Conectado
adminRoutes.get('/me', requireAdmin(), (c) => {
  const admin = c.get('admin')
  const apiKey = c.get('apiKey')
  return c.json({
    success: true,
    data: {
      admin: admin || null,
      apiKey: apiKey ? { name: apiKey.name, type: apiKey.type } : null,
      role: c.get('role'),
    },
  })
})

// =========================================================================
// 2. GESTÃO DE MEMBROS DA EQUIPE (_ek_admins)
// =========================================================================

// Listar membros da equipe
adminRoutes.get('/members', requireAdmin(), async (c) => {
  const db = await getDb()
  const members = await db
    .select({
      id: ekAdmins.id,
      name: ekAdmins.name,
      email: ekAdmins.email,
      role: ekAdmins.role,
      createdAt: ekAdmins.createdAt,
      updatedAt: ekAdmins.updatedAt,
    })
    .from(ekAdmins)
    .all()

  return c.json({ success: true, data: members })
})

// Cadastrar novo membro da equipe
adminRoutes.post('/members', requireAdmin(), async (c) => {
  const caller = c.get('admin')
  // Apenas 'owner' ou 'admin' podem convidar novos membros
  if (caller && caller.role !== 'owner' && caller.role !== 'admin') {
    return c.json(
      { success: false, error: { message: 'Apenas proprietários ou administradores podem adicionar membros.' } },
      403,
    )
  }

  const body = await c.req.json().catch(() => ({}))
  const { name, email, password, role } = body

  if (!name || !email || !password) {
    return c.json(
      { success: false, error: { message: 'Nome, e-mail e senha inicial são obrigatórios.' } },
      400,
    )
  }

  const db = await getDb()
  const existing = await db.select().from(ekAdmins).where(eq(ekAdmins.email, email.trim().toLowerCase())).get()
  if (existing) {
    return c.json(
      { success: false, error: { message: 'Já existe um membro cadastrado com este e-mail.' } },
      400,
    )
  }

  const allowedRoles = ['admin', 'developer', 'viewer']
  const assignedRole = allowedRoles.includes(role) ? role : 'developer'

  const passwordHash = await hashPassword(password)
  const id = nanoid()
  const now = new Date()

  await db.insert(ekAdmins).values({
    id,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: passwordHash,
    role: assignedRole,
    createdAt: now,
    updatedAt: now,
  })

  return c.json(
    {
      success: true,
      message: 'Membro adicionado com sucesso!',
      data: { id, name: name.trim(), email: email.trim().toLowerCase(), role: assignedRole },
    },
    201,
  )
})

// Alterar papel de um membro da equipe
adminRoutes.patch('/members/:id', requireAdmin(), async (c) => {
  const caller = c.get('admin')
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const newRole = body.role

  if (caller && caller.role !== 'owner') {
    return c.json(
      { success: false, error: { message: 'Apenas o proprietário pode alterar funções de membros.' } },
      403,
    )
  }

  const allowedRoles = ['admin', 'developer', 'viewer']
  if (!allowedRoles.includes(newRole)) {
    return c.json({ success: false, error: { message: 'Função de membro inválida.' } }, 400)
  }

  const db = await getDb()
  const target = await db.select().from(ekAdmins).where(eq(ekAdmins.id, id)).get()
  if (!target) {
    return c.json({ success: false, error: { message: 'Membro não encontrado.' } }, 404)
  }

  if (target.role === 'owner') {
    return c.json(
      { success: false, error: { message: 'A função do proprietário não pode ser rebaixada.' } },
      400,
    )
  }

  await db.update(ekAdmins).set({ role: newRole, updatedAt: new Date() }).where(eq(ekAdmins.id, id))
  return c.json({ success: true, message: `Função atualizada para ${newRole}.` })
})

// Remover membro da equipe
adminRoutes.delete('/members/:id', requireAdmin(), async (c) => {
  const caller = c.get('admin')
  const id = c.req.param('id')

  if (caller && caller.role !== 'owner') {
    return c.json(
      { success: false, error: { message: 'Apenas o proprietário pode remover membros da equipe.' } },
      403,
    )
  }

  const db = await getDb()
  const target = await db.select().from(ekAdmins).where(eq(ekAdmins.id, id)).get()
  if (!target) {
    return c.json({ success: false, error: { message: 'Membro não encontrado.' } }, 404)
  }

  if (target.role === 'owner') {
    return c.json(
      { success: false, error: { message: 'O proprietário da instalação não pode ser removido.' } },
      400,
    )
  }

  await db.delete(ekAdminSessions).where(eq(ekAdminSessions.adminId, id)).catch(() => {})
  await db.delete(ekAdmins).where(eq(ekAdmins.id, id))
  return c.json({ success: true, message: 'Membro removido da equipe com sucesso.' })
})

// =========================================================================
// 3. ESTATÍSTICAS E PAINEL
// =========================================================================

adminRoutes.get('/stats', requireAdmin(), async (c) => {
  const db = await getDb()

  let filesCount = 0
  try {
    const filesCountRes = await db.select({ count: count() }).from(ekStorageObjects).get()
    filesCount = filesCountRes?.count ?? 0
  } catch {}

  const usersCountRes = await db.select({ count: count() }).from(users).get()

  // Lista tabelas de usuário (ocultando tabelas internas da plataforma e do SQLite)
  const tablesRes: any[] = await db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_ek_%' AND name NOT LIKE 'drizzle_%'`,
  )

  return c.json({
    success: true,
    data: {
      totalUsers: usersCountRes?.count ?? 0,
      totalFiles: filesCount,
      totalTables: tablesRes.length,
    },
  })
})

// =========================================================================
// 4. GESTÃO DE CHAVES DE API (_ek_api_keys)
// =========================================================================

// Listar chaves existentes (apenas metadados e prefixos, nunca texto puro)
adminRoutes.get('/keys', requireAdmin(), async (c) => {
  const db = await getDb()
  const keys = await db.select().from(ekApiKeys).all()

  const sanitized = keys.map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    type: k.type,
    role: k.role,
    expiresAt: k.expiresAt,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  }))

  return c.json({ success: true, data: sanitized })
})

// Gerar nova chave de API (Retorna a chave completa apenas na criação)
adminRoutes.post('/keys', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = CreateApiKeySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.errors[0]?.message || 'Dados inválidos para geração de chave.',
        },
      },
      400,
    )
  }

  const { name, type, expiresAt } = parsed.data
  const db = await getDb()

  const result = await createApiKey(db, {
    name,
    type,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  })

  return c.json(
    {
      success: true,
      message: 'Chave de API criada com sucesso! Guarde-a em um local seguro.',
      data: {
        id: result.keyId,
        name,
        type,
        key: result.rawKey, // Exibido apenas nesta resposta inicial
        keyPrefix: result.keyPrefix,
      },
    },
    201,
  )
})

// Revogar chave de API
adminRoutes.delete('/keys/:id', requireAdmin(), async (c) => {
  const id = c.req.param('id')
  const db = await getDb()
  await db.delete(ekApiKeys).where(eq(ekApiKeys.id, id))
  return c.json({ success: true, message: 'Chave de API revogada com sucesso.' })
})

// =========================================================================
// 5. DATABASE STUDIO, DDL & SQL RUNNER
// =========================================================================

const SAFE_NAME = /^[a-zA-Z0-9_]+$/
const ALLOWED_SQL_TYPES = new Set(['TEXT', 'INTEGER', 'REAL', 'BLOB', 'JSON'])
const PROTECTED_SYSTEM_TABLES = new Set([
  '_ek_admins',
  '_ek_admin_sessions',
  '_ek_admin_invites',
  '_ek_api_keys',
  '_ek_table_policies',
  '_ek_storage_buckets',
  '_ek_storage_objects',
  '_ek_webhooks',
  '_ek_audit_logs',
  '_ek_settings',
  '_ek_migrations',
  'drizzle_migrations',
  'sqlite_master',
  'sqlite_sequence',
])

// Listar tabelas disponíveis para o desenvolvedor
adminRoutes.get('/tables', requireAdmin(), async (c) => {
  const db = await getDb()
  const rows: any = await db.all(
    sql`SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_ek_%' AND name NOT LIKE 'drizzle_%' ORDER BY name ASC`,
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

function mapSqliteTypeToTs(type: string): string {
  const t = (type || 'TEXT').toUpperCase()
  if (t.includes('INT')) return 'number'
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUB')) return 'number'
  if (t.includes('BOOL')) return 'boolean'
  if (t.includes('BLOB')) return 'Uint8Array'
  if (t.includes('JSON')) return 'any'
  return 'string'
}

// Gerador de tipos TypeScript a partir do schema (Seção 16.1)
adminRoutes.get('/schema/types', requireAdmin(), async (c) => {
  const db = await getDb()
  const rows: any[] = await db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_ek_%' AND name NOT LIKE 'drizzle_%' ORDER BY name ASC`,
  )

  let output = `/**\n * Edgekit Platform — Tipagens TypeScript Geradas Automaticamente (Seção 16.1)\n * Gerado em: ${new Date().toISOString()}\n */\n\n`
  output += `export interface DatabaseSchema {\n`
  for (const { name } of rows) {
    output += `  ${name}: {\n`
    output += `    Row: ${name}Row\n`
    output += `    Insert: ${name}Insert\n`
    output += `    Update: ${name}Update\n`
    output += `  }\n`
  }
  output += `}\n\n`

  for (const { name } of rows) {
    const columns: any[] = await db.all(sql.raw(`PRAGMA table_info(\`${name}\`)`))
    output += `export interface ${name}Row {\n`
    for (const col of columns) {
      const tsType = mapSqliteTypeToTs(col.type)
      const nullable = col.notnull === 0 ? ' | null' : ''
      output += `  ${col.name}: ${tsType}${nullable}\n`
    }
    output += `}\n\n`

    output += `export interface ${name}Insert {\n`
    for (const col of columns) {
      const tsType = mapSqliteTypeToTs(col.type)
      const optional = col.pk === 1 || col.dflt_value !== null || col.notnull === 0 ? '?' : ''
      const nullable = col.notnull === 0 ? ' | null' : ''
      output += `  ${col.name}${optional}: ${tsType}${nullable}\n`
    }
    output += `}\n\n`

    output += `export interface ${name}Update {\n`
    for (const col of columns) {
      const tsType = mapSqliteTypeToTs(col.type)
      output += `  ${col.name}?: ${tsType} | null\n`
    }
    output += `}\n\n`
  }

  return c.json({ success: true, data: { typescript: output } })
})

// Criar nova tabela visualmente
adminRoutes.post('/tables', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const tableName = (body.name || '').trim()

  if (!SAFE_NAME.test(tableName)) {
    return c.json({ success: false, error: { message: `Nome de tabela inválido: "${tableName}"` } }, 400)
  }

  if (tableName.startsWith('_ek_') || PROTECTED_SYSTEM_TABLES.has(tableName.toLowerCase())) {
    return c.json({ success: false, error: { message: `O nome "${tableName}" é reservado pela plataforma.` } }, 400)
  }

  const columns = Array.isArray(body.columns) ? body.columns : []
  if (columns.length === 0) {
    return c.json({ success: false, error: { message: 'A tabela deve conter ao menos uma coluna.' } }, 400)
  }

  const colDefinitions: string[] = []
  const fkConstraints: string[] = []
  let hasPrimaryKey = false

  for (const col of columns) {
    const colName = (col.name || '').trim()
    const colType = (col.type || 'TEXT').toUpperCase()

    if (!SAFE_NAME.test(colName)) {
      return c.json({ success: false, error: { message: `Nome de coluna inválido: "${colName}"` } }, 400)
    }

    if (!ALLOWED_SQL_TYPES.has(colType)) {
      return c.json({ success: false, error: { message: `Tipo de dado SQL não suportado: "${colType}"` } }, 400)
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
    if (col.unique) {
      def += ' UNIQUE'
    }
    if (col.defaultValue !== undefined && col.defaultValue !== '') {
      def += ` DEFAULT ${col.defaultValue}`
    }

    colDefinitions.push(def)

    const rel = col.relation || col.references
    if (rel && typeof rel === 'object') {
      const targetTable = (rel.targetTable || rel.table || '').trim()
      const targetCol = (rel.targetColumn || rel.column || 'id').trim()
      const onDelete = (rel.onDelete || 'CASCADE').toUpperCase()
      const validActions = new Set(['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION'])
      const safeAction = validActions.has(onDelete) ? onDelete : 'CASCADE'

      if (SAFE_NAME.test(targetTable) && SAFE_NAME.test(targetCol)) {
        fkConstraints.push(
          `FOREIGN KEY (\`${colName}\`) REFERENCES \`${targetTable}\`(\`${targetCol}\`) ON DELETE ${safeAction}`,
        )
      }
    }
  }

  if (!hasPrimaryKey) {
    colDefinitions.unshift('`id` TEXT PRIMARY KEY NOT NULL')
  }

  const allDefinitions = [...colDefinitions, ...fkConstraints]
  const createTableSql = `CREATE TABLE \`${tableName}\` (\n  ${allDefinitions.join(',\n  ')}\n);`
  const db = await getDb()

  try {
    await db.run(sql.raw(createTableSql))

    // Inicializa com política fechada por padrão (Deny-by-Default)
    const detectedOwner =
      columns.find((col: any) =>
        ['user_id', 'userid', 'author_id', 'owner_id', 'created_by'].includes((col.name || '').toLowerCase()),
      )?.name || 'user_id'

    const now = new Date()
    await db.insert(ekTablePolicies).values({
      id: nanoid(),
      tableName,
      rlsEnabled: true,
      selectRule: 'disabled',
      insertRule: 'disabled',
      updateRule: 'disabled',
      deleteRule: 'disabled',
      ownerColumn: detectedOwner,
      createdAt: now,
      updatedAt: now,
    })

    invalidateTableColumnsCache(tableName)

    return c.json(
      {
        success: true,
        message: `Tabela "${tableName}" criada com sucesso!`,
        sql: createTableSql,
      },
      201,
    )
  } catch (err: any) {
    return c.json({ success: false, error: { message: `Falha ao criar tabela: ${err.message}` } }, 500)
  }
})

// Obter esquema e relacionamentos de uma tabela (Declarativo)
adminRoutes.get('/tables/:name/schema', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()
  if (!SAFE_NAME.test(tableName)) {
    return c.json({ success: false, error: { message: 'Nome de tabela inválido.' } }, 400)
  }

  const db = await getDb()
  try {
    const columns: any[] = await db.all(sql.raw(`PRAGMA table_info(\`${tableName}\`)`))
    const foreignKeys: any[] = await db.all(sql.raw(`PRAGMA foreign_key_list(\`${tableName}\`)`))

    return c.json({
      success: true,
      data: {
        tableName,
        columns: columns.map((col) => ({
          cid: col.cid,
          name: col.name,
          type: col.type,
          notNull: Boolean(col.notnull),
          defaultValue: col.dflt_value,
          primaryKey: Boolean(col.pk),
        })),
        foreignKeys: foreignKeys.map((fk) => ({
          id: fk.id,
          targetTable: fk.table,
          fromColumn: fk.from,
          toColumn: fk.to,
          onUpdate: fk.on_update,
          onDelete: fk.on_delete,
        })),
      },
    })
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})

// Excluir tabela
adminRoutes.delete('/tables/:name', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()

  if (!SAFE_NAME.test(tableName)) {
    return c.json({ success: false, error: { message: 'Nome de tabela inválido.' } }, 400)
  }

  if (tableName.startsWith('_ek_') || PROTECTED_SYSTEM_TABLES.has(tableName.toLowerCase())) {
    return c.json({ success: false, error: { message: 'Tabelas do sistema não podem ser excluídas.' } }, 403)
  }

  const db = await getDb()
  try {
    await db.run(sql.raw(`DROP TABLE \`${tableName}\``))
    await db.delete(ekTablePolicies).where(eq(ekTablePolicies.tableName, tableName)).catch(() => {})
    invalidateTableColumnsCache(tableName)
    return c.json({ success: true, message: `Tabela "${tableName}" excluída com sucesso.` })
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})

// Adicionar coluna a tabela existente
adminRoutes.post('/tables/:name/columns', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()
  const body = await c.req.json().catch(() => ({}))
  const colName = (body.name || '').trim()
  const colType = (body.type || 'TEXT').toUpperCase()

  if (!SAFE_NAME.test(tableName) || !SAFE_NAME.test(colName)) {
    return c.json({ success: false, error: { message: 'Identificadores inválidos.' } }, 400)
  }

  if (tableName.startsWith('_ek_') || PROTECTED_SYSTEM_TABLES.has(tableName.toLowerCase())) {
    return c.json({ success: false, error: { message: 'Tabelas do sistema não podem ser alteradas.' } }, 403)
  }

  if (!ALLOWED_SQL_TYPES.has(colType)) {
    return c.json({ success: false, error: { message: `Tipo de dado SQL inválido: "${colType}"` } }, 400)
  }

  const typeKeyword = colType === 'JSON' ? 'TEXT' : colType
  let alterSql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${typeKeyword}`
  if (body.defaultValue !== undefined && body.defaultValue !== '') {
    alterSql += ` DEFAULT ${body.defaultValue}`
  }

  const db = await getDb()
  try {
    await db.run(sql.raw(alterSql))
    invalidateTableColumnsCache(tableName)
    return c.json({ success: true, message: `Coluna "${colName}" adicionada à tabela "${tableName}".` })
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})

// SQL Runner Seguro (com Guardrail contra mutação em tabelas de autenticação/chaves)
adminRoutes.post('/sql', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const rawQuery = (body.query || '').trim()

  if (!rawQuery) {
    return c.json({ success: false, error: { message: 'Query SQL vazia.' } }, 400)
  }

  // Guardrail de Segurança: Bloqueia mutações arbitrárias em _ek_admins e _ek_api_keys
  const upper = rawQuery.toUpperCase()
  const isMutation =
    upper.includes('UPDATE') ||
    upper.includes('DELETE') ||
    upper.includes('DROP') ||
    upper.includes('ALTER') ||
    upper.includes('INSERT')

  if (isMutation) {
    const hitsCriticalTable =
      upper.includes('_EK_') ||
      /\b_ek_[a-z0-9_]*\b/i.test(rawQuery)

    if (hitsCriticalTable) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_MUTATION',
            message: 'Mutações diretas em tabelas do sistema (_ek_*) são bloqueadas pelo guardrail de segurança.',
          },
        },
        403,
      )
    }
  }

  const db = await getDb()
  try {
    const isSelect = upper.startsWith('SELECT') || upper.startsWith('PRAGMA')
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

// Obter Política de Acesso da Tabela
adminRoutes.get('/tables/:name/policy', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()
  const db = await getDb()
  const policy = await db.select().from(ekTablePolicies).where(eq(ekTablePolicies.tableName, tableName)).get()

  if (policy) {
    return c.json({
      success: true,
      data: {
        tableName,
        rlsEnabled: Boolean(policy.rlsEnabled),
        selectRule: policy.selectRule,
        insertRule: policy.insertRule,
        updateRule: policy.updateRule,
        deleteRule: policy.deleteRule,
        ownerColumn: policy.ownerColumn,
        customRule: policy.customRule,
      },
    })
  }

  return c.json({
    success: true,
    data: {
      tableName,
      rlsEnabled: true,
      selectRule: 'disabled',
      insertRule: 'disabled',
      updateRule: 'disabled',
      deleteRule: 'disabled',
      ownerColumn: 'user_id',
    },
  })
})

// Atualizar Política de Acesso da Tabela
adminRoutes.put('/tables/:name/policy', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()
  if (!SAFE_NAME.test(tableName)) {
    return c.json({ success: false, error: { message: 'Nome de tabela inválido.' } }, 400)
  }

  const body = await c.req.json().catch(() => ({}))
  const parsed = TablePolicyUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.errors[0]?.message || 'Parâmetros de política inválidos.',
        },
      },
      400,
    )
  }

  const data = parsed.data
  const rlsEnabled = data.rlsEnabled !== undefined ? data.rlsEnabled : true
  const selectRule = data.selectRule || 'disabled'
  const insertRule = data.insertRule || 'disabled'
  const updateRule = data.updateRule || 'disabled'
  const deleteRule = data.deleteRule || 'disabled'
  const ownerColumn = (data.ownerColumn || 'user_id').trim()
  const customRule = data.customRule || null

  const now = new Date()
  const db = await getDb()

  const existing = await db.select().from(ekTablePolicies).where(eq(ekTablePolicies.tableName, tableName)).get()

  if (existing) {
    await db
      .update(ekTablePolicies)
      .set({
        rlsEnabled,
        selectRule,
        insertRule,
        updateRule,
        deleteRule,
        ownerColumn,
        customRule,
        updatedAt: now,
      })
      .where(eq(ekTablePolicies.tableName, tableName))
  } else {
    await db.insert(ekTablePolicies).values({
      id: nanoid(),
      tableName,
      rlsEnabled,
      selectRule,
      insertRule,
      updateRule,
      deleteRule,
      ownerColumn,
      customRule,
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
      customRule,
    },
  })
})

// =========================================================================
// 6. CONFIGURAÇÕES DE SEGURANÇA (CORS & IP RESTRICTION)
// =========================================================================

adminRoutes.get('/settings/security', requireAdmin(), async (c) => {
  const config = await getSecurityConfig()
  return c.json({ success: true, data: config })
})

adminRoutes.put('/settings/security', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
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
    const existing = await db.select().from(ekSettings).where(eq(ekSettings.key, key)).get()
    if (existing) {
      await db.update(ekSettings).set({ value, updatedAt: now }).where(eq(ekSettings.key, key))
    } else {
      await db.insert(ekSettings).values({ key, value, createdAt: now, updatedAt: now })
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
    data: { allowedOrigins, allowedIps, blockExternalLocalhost },
  })
})

// =========================================================================
// 7. GESTÃO DE USUÁRIOS FINAIS DO APP (Tabela `users`)
// =========================================================================

adminRoutes.post('/users', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { name, email, password, role } = body

  if (!name || !email || !password) {
    return c.json({ success: false, error: { message: 'Nome, e-mail e senha são obrigatórios.' } }, 400)
  }

  const db = await getDb()
  const existing = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get()
  if (existing) {
    return c.json({ success: false, error: { message: 'Já existe um usuário cadastrado com este e-mail.' } }, 400)
  }

  try {
    const { getAuth } = await import('../auth')
    const auth = await getAuth()
    const userRes = await auth.api.signUpEmail({
      body: { name, email, password },
    })

    const assignedRole = role || 'user'
    if (assignedRole !== 'user') {
      await db.update(users).set({ role: assignedRole }).where(eq(users.email, email))
    }

    return c.json(
      {
        success: true,
        message: 'Usuário final da aplicação criado com sucesso!',
        data: { ...userRes.user, role: assignedRole },
      },
      201,
    )
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message || 'Falha ao criar usuário.' } }, 500)
  }
})

adminRoutes.patch('/users/:id/role', requireAdmin(), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const role = body.role || 'user'
  const db = await getDb()

  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id))
  return c.json({ success: true, message: `Função do usuário atualizada para ${role}.` })
})

adminRoutes.delete('/users/:id', requireAdmin(), async (c) => {
  const id = c.req.param('id')
  const db = await getDb()

  await db.delete(sessions).where(eq(sessions.userId, id)).catch(() => {})
  await db.delete(accounts).where(eq(accounts.userId, id)).catch(() => {})
  await db.delete(users).where(eq(users.id, id))

  return c.json({ success: true, message: 'Usuário removido com sucesso.' })
})

// =========================================================================
// 8. SESSÕES E ORGANIZAÇÕES DA APLICAÇÃO (BETTER AUTH EXTENSIONS)
// =========================================================================

// Listar sessões ativas de um usuário
adminRoutes.get('/users/:id/sessions', requireAdmin(), async (c) => {
  const userId = c.req.param('id')
  const db = await getDb()
  const userSessions = await db.select().from(sessions).where(eq(sessions.userId, userId)).all()

  return c.json({
    success: true,
    data: userSessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      activeOrganizationId: s.activeOrganizationId,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
    })),
  })
})

// Revogar sessão de usuário
adminRoutes.delete('/sessions/:id', requireAdmin(), async (c) => {
  const sessionId = c.req.param('id')
  const db = await getDb()
  await db.delete(sessions).where(eq(sessions.id, sessionId))

  return c.json({ success: true, message: 'Sessão revogada com sucesso.' })
})

// Listar organizações
adminRoutes.get('/organizations', requireAdmin(), async (c) => {
  const db = await getDb()
  const orgs = await db.select().from(organizations).all()

  const orgsWithCount = await Promise.all(
    orgs.map(async (org) => {
      const memberCount = await db
        .select({ count: count() })
        .from(members)
        .where(eq(members.organizationId, org.id))
        .get()

      return {
        ...org,
        memberCount: memberCount?.count ?? 0,
      }
    }),
  )

  return c.json({ success: true, data: orgsWithCount })
})

// Criar organização diretamente como admin
adminRoutes.post('/organizations', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { name, slug } = body

  if (!name || !slug) {
    return c.json({ success: false, error: { message: 'Nome e slug são obrigatórios.' } }, 400)
  }

  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  const db = await getDb()

  const existing = await db.select().from(organizations).where(eq(organizations.slug, cleanSlug)).get()
  if (existing) {
    return c.json({ success: false, error: { message: 'Já existe uma organização com este slug.' } }, 400)
  }

  const now = new Date()
  const newOrg = {
    id: nanoid(),
    name: name.trim(),
    slug: cleanSlug,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(organizations).values(newOrg)
  return c.json({ success: true, data: newOrg }, 201)
})

// Listar membros de uma organização
adminRoutes.get('/organizations/:id/members', requireAdmin(), async (c) => {
  const orgId = c.req.param('id')
  const db = await getDb()

  const memberRows = await db
    .select({
      memberId: members.id,
      role: members.role,
      joinedAt: members.createdAt,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
    })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(eq(members.organizationId, orgId))
    .all()

  return c.json({ success: true, data: memberRows })
})

// Adicionar membro a uma organização
adminRoutes.post('/organizations/:id/members', requireAdmin(), async (c) => {
  const orgId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const { userId, role } = body

  if (!userId) {
    return c.json({ success: false, error: { message: 'ID do usuário é obrigatório.' } }, 400)
  }

  const db = await getDb()
  const existing = await db
    .select()
    .from(members)
    .where(sql`${members.organizationId} = ${orgId} AND ${members.userId} = ${userId}`)
    .get()

  if (existing) {
    return c.json({ success: false, error: { message: 'Usuário já é membro desta organização.' } }, 400)
  }

  const now = new Date()
  await db.insert(members).values({
    id: nanoid(),
    organizationId: orgId,
    userId,
    role: role || 'member',
    createdAt: now,
  })

  return c.json({ success: true, message: 'Membro adicionado com sucesso.' }, 201)
})

// Remover membro de uma organização
adminRoutes.delete('/organizations/:id/members/:userId', requireAdmin(), async (c) => {
  const orgId = c.req.param('id')
  const userId = c.req.param('userId')
  const db = await getDb()

  await db
    .delete(members)
    .where(sql`${members.organizationId} = ${orgId} AND ${members.userId} = ${userId}`)

  return c.json({ success: true, message: 'Membro removido da organização.' })
})

// Seed Demo / Dev: Provisiona schema relacional e dados de exemplo para o TaskFlow Pro
adminRoutes.post('/seed-demo', async (c) => {
  const db = await getDb()
  const body = await c.req.json().catch(() => ({}))
  const reset = Boolean(body.reset)

  try {
    let cols: any[] = []
    try {
      cols = await db.all(sql`PRAGMA table_info(tasks)`)
    } catch {}
    const hasPriority = cols.some((col: any) => col.name === 'priority')
    if (reset || (cols.length > 0 && !hasPriority)) {
      await db.run(sql`DROP TABLE IF EXISTS comments`)
      await db.run(sql`DROP TABLE IF EXISTS tasks`)
      await db.run(sql`DROP TABLE IF EXISTS projects`)
    }

    // 1. Cria tabela projects
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#f97316',
        user_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 2. Cria tabela tasks com FK para projects
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        priority INTEGER DEFAULT 1,
        status TEXT DEFAULT 'pending',
        due_date TEXT,
        completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      )
    `)

    // 3. Cria tabela comments com FK para tasks
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `)

    // 4. Configura políticas em _ek_table_policies
    const now = new Date()
    const tablesToProtect = ['projects', 'tasks', 'comments']
    for (const t of tablesToProtect) {
      const existing = await db.select().from(ekTablePolicies).where(eq(ekTablePolicies.tableName, t)).get()
      if (!existing) {
        await db.insert(ekTablePolicies).values({
          id: nanoid(),
          tableName: t,
          rlsEnabled: true,
          selectRule: 'public',
          insertRule: 'authenticated',
          updateRule: 'owner',
          deleteRule: 'owner',
          ownerColumn: 'user_id',
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    // 5. Configura buckets em _ek_storage_buckets
    const existingAvatarBucket = await db.select().from(ekStorageBuckets).where(eq(ekStorageBuckets.name, 'avatars')).get()
    if (!existingAvatarBucket) {
      await db.insert(ekStorageBuckets).values({
        id: 'avatars',
        name: 'avatars',
        isPublic: true,
        maxSizeBytes: 2097152, // 2MB
        allowedMimeTypes: JSON.stringify(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
        readRule: 'public',
        writeRule: 'authenticated',
        createdAt: now,
        updatedAt: now,
      })
    }

    const existingDocsBucket = await db.select().from(ekStorageBuckets).where(eq(ekStorageBuckets.name, 'project_docs')).get()
    if (!existingDocsBucket) {
      await db.insert(ekStorageBuckets).values({
        id: 'project_docs',
        name: 'project_docs',
        isPublic: false,
        maxSizeBytes: 5242880, // 5MB
        allowedMimeTypes: JSON.stringify(['application/pdf', 'text/plain', 'image/png', 'image/jpeg']),
        readRule: 'owner',
        writeRule: 'authenticated',
        createdAt: now,
        updatedAt: now,
      })
    }

    // 6. Garante usuários Alice e Bob cadastrados no Better Auth (com senha válida)
    const auth = await getAuth()
    let alice = await db.select().from(users).where(eq(users.email, 'alice@taskflow.local')).get()
    if (alice) {
      const aliceAcc = await db.select().from(accounts).where(eq(accounts.userId, alice.id)).get()
      if (!aliceAcc) {
        await db.delete(users).where(eq(users.id, alice.id))
        alice = undefined
      }
    }
    if (!alice) {
      try {
        const res = await auth.api.signUpEmail({
          body: {
            name: 'Alice (Product Manager)',
            email: 'alice@taskflow.local',
            password: 'Password123!',
          },
        })
        alice = res?.user || (await db.select().from(users).where(eq(users.email, 'alice@taskflow.local')).get())
      } catch {
        alice = await db.select().from(users).where(eq(users.email, 'alice@taskflow.local')).get()
      }
    }

    let bob = await db.select().from(users).where(eq(users.email, 'bob@taskflow.local')).get()
    if (bob) {
      const bobAcc = await db.select().from(accounts).where(eq(accounts.userId, bob.id)).get()
      if (!bobAcc) {
        await db.delete(users).where(eq(users.id, bob.id))
        bob = undefined
      }
    }
    if (!bob) {
      try {
        const res = await auth.api.signUpEmail({
          body: {
            name: 'Bob (Tech Lead)',
            email: 'bob@taskflow.local',
            password: 'Password123!',
          },
        })
        bob = res?.user || (await db.select().from(users).where(eq(users.email, 'bob@taskflow.local')).get())
      } catch {
        bob = await db.select().from(users).where(eq(users.email, 'bob@taskflow.local')).get()
      }
    }

    const aliceId = alice?.id || 'user_alice_taskflow'
    const bobId = bob?.id || 'user_bob_taskflow'

    // 7. Seed de Projetos (se tabela estiver vazia)
    const existingProjects: any[] = await db.all(sql`SELECT count(*) as count FROM projects`)
    if (!existingProjects?.[0]?.count || existingProjects[0].count === 0) {
      await db.run(sql`
        INSERT INTO projects (id, name, description, color, user_id) VALUES
        ('proj_platform', 'Platform v2', 'Migração de BaaS para Cloudflare Workers, D1 e R2', '#f97316', ${aliceId}),
        ('proj_mobile', 'Mobile App', 'Aplicativo React Native & SDK Isomórfico Edgekit', '#3b82f6', ${bobId})
      `)
    }

    // 8. Seed de Tarefas (se tabela estiver vazia)
    const existingTasks: any[] = await db.all(sql`SELECT count(*) as count FROM tasks`)
    if (!existingTasks?.[0]?.count || existingTasks[0].count === 0) {
      await db.run(sql`
        INSERT INTO tasks (id, project_id, user_id, title, description, priority, status, completed) VALUES
        ('task_1', 'proj_platform', ${aliceId}, 'Implementar WebSocket Hibernation no DO', 'Configurar serializeAttachment para persistência de presença com custo zero', 5, 'in_progress', 0),
        ('task_2', 'proj_platform', ${aliceId}, 'Auditoria Zero-Trust de Origens', 'Garantir bloqueio de service_role vindo de domínios maliciosos ou navegadores externos', 4, 'completed', 1),
        ('task_3', 'proj_mobile', ${bobId}, 'Testar SDK com React Native', 'Validar thenable/await e queries relacionais no cliente mobile', 3, 'pending', 0),
        ('task_4', 'proj_mobile', ${bobId}, 'Configurar Range Requests HTTP 206', 'Streaming de mídia parcial no Storage R2', 2, 'pending', 0)
      `)
    }

    // 9. Seed de Comentários (se tabela estiver vazia)
    const existingComments: any[] = await db.all(sql`SELECT count(*) as count FROM comments`)
    if (!existingComments?.[0]?.count || existingComments[0].count === 0) {
      await db.run(sql`
        INSERT INTO comments (id, task_id, user_id, content) VALUES
        ('comm_1', 'task_1', ${bobId}, 'Já testei a hibernação no Miniflare local, reduziu o consumo de CPU a zero!'),
        ('comm_2', 'task_1', ${aliceId}, 'Excelente! Vamos validar no Vitest e no browser agora.'),
        ('comm_3', 'task_3', ${aliceId}, 'Lembre-se de verificar o autocomplete dos tipos gerados via db:typegen.')
      `)
    }

    invalidateTableColumnsCache()

    return c.json({
      success: true,
      message: 'Schema relacional e dados de demonstração provisionados com sucesso!',
      data: {
        projects: 2,
        tasks: 4,
        comments: 3,
        users: ['alice@taskflow.local', 'bob@taskflow.local'],
        buckets: ['avatars', 'project_docs'],
      },
    })
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})
