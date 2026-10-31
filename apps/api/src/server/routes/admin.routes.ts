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
import { requireAdmin } from '../auth/middleware'
import {
  hashPassword,
  verifyPassword,
  createAdminSession,
  revokeAdminSession,
  ADMIN_COOKIE_NAME,
} from '../auth/admin-auth'
import { createApiKey, ensureDefaultKeys } from '../auth/keys'
import { getSecurityConfig, invalidateSecurityConfigCache } from '../auth/security'

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
  const { name, email, password, setupToken } = body

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
  }

  if (!name || !email || !password) {
    return c.json(
      { success: false, error: { message: 'Nome, e-mail e senha são obrigatórios.' } },
      400,
    )
  }

  if (password.length < 8) {
    return c.json(
      { success: false, error: { message: 'A senha do proprietário deve conter no mínimo 8 caracteres.' } },
      400,
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

    const isLocalhost = c.req.url.includes('localhost') || c.req.url.includes('127.0.0.1')
    setCookie(c, ADMIN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: !isLocalhost,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 dias
    })

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

// Login Administrativo do Painel (Email + Senha dos membros de _ek_admins)
adminRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''

  if (!email || !password) {
    return c.json(
      { success: false, error: { message: 'Informe e-mail e senha de administrador.' } },
      400,
    )
  }

  const db = await getDb()
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

  const isLocalhost = c.req.url.includes('localhost') || c.req.url.includes('127.0.0.1')
  setCookie(c, ADMIN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  })

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
  const token = getCookie(c, ADMIN_COOKIE_NAME)
  if (token) {
    await revokeAdminSession(db, token)
  }
  deleteCookie(c, ADMIN_COOKIE_NAME, { path: '/' })
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
  const name = (body.name || 'Nova Chave').trim()
  const type = body.type === 'service_role' ? 'service_role' : 'anon'
  const db = await getDb()

  const result = await createApiKey(db, { name, type })

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
    if (col.defaultValue !== undefined && col.defaultValue !== '') {
      def += ` DEFAULT ${col.defaultValue}`
    }

    colDefinitions.push(def)
  }

  if (!hasPrimaryKey) {
    colDefinitions.unshift('`id` TEXT PRIMARY KEY NOT NULL')
  }

  const createTableSql = `CREATE TABLE \`${tableName}\` (\n  ${colDefinitions.join(',\n  ')}\n);`
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
      upper.includes('_EK_ADMINS') ||
      upper.includes('_EK_ADMIN_SESSIONS') ||
      upper.includes('_EK_API_KEYS')

    if (hitsCriticalTable) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_MUTATION',
            message: 'Mutações diretas em tabelas de administradores e chaves da plataforma são bloqueadas pelo guardrail de segurança.',
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
  const body = await c.req.json().catch(() => ({}))

  const validRules = ['disabled', 'public', 'authenticated', 'owner', 'org_member', 'custom_sql']
  const rlsEnabled = body.rlsEnabled !== undefined ? Boolean(body.rlsEnabled) : true
  const selectRule = validRules.includes(body.selectRule) ? body.selectRule : 'disabled'
  const insertRule = validRules.includes(body.insertRule) ? body.insertRule : 'disabled'
  const updateRule = validRules.includes(body.updateRule) ? body.updateRule : 'disabled'
  const deleteRule = validRules.includes(body.deleteRule) ? body.deleteRule : 'disabled'
  const ownerColumn = (body.ownerColumn || 'user_id').trim().replace(/[^a-zA-Z0-9_]/g, '')
  const customRule = body.customRule || null

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
