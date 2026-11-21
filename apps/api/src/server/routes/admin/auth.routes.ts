import { Hono } from 'hono'
import { count, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import type { AppEnv } from '../../types'
import { getDb } from '../../db'
import { ekAdmins, ekAdminSessions } from '../../db/schema'
import { getBindings } from '../../env'
import { requireAdmin } from '../../auth/middleware'
import {
  hashPassword,
  verifyPassword,
  createAdminSession,
  revokeAdminSession,
  ADMIN_COOKIE_NAME,
  HOST_ADMIN_COOKIE_NAME,
} from '../../auth/admin-auth'
import { ensureDefaultKeys, validateApiKey } from '../../auth/keys'
import { isLocalhostOrigin } from '../../auth/security'
import { AdminSetupSchema, AdminLoginSchema } from '../../schemas'
import { invalidateTableColumnsCache } from '../db.routes'

export const authRoutes = new Hono<AppEnv>()

// Checagem de status inicial do setup (Acesso livre)
authRoutes.get('/setup-status', async (c) => {
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
authRoutes.post('/setup', async (c) => {
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

    const isLocalhost =
      isLocalhostOrigin(c.req.header('origin') || '') ||
      c.req.url.includes('localhost') ||
      c.req.url.includes('127.0.0.1')
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
authRoutes.post('/login', async (c) => {
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

  const isLocalhost =
    isLocalhostOrigin(c.req.header('origin') || '') ||
    c.req.url.includes('localhost') ||
    c.req.url.includes('127.0.0.1')
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
authRoutes.post('/logout', async (c) => {
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
authRoutes.get('/me', requireAdmin(), (c) => {
  const admin = c.get('admin')
  const apiKey = c.get('apiKey')
  return c.json({
    success: true,
    data: {
      admin: admin || null,
      apiKey: apiKey ? { name: apiKey.name, type: apiKey.type } : null,
    },
  })
})

// Listar membros da equipe
authRoutes.get('/members', requireAdmin(), async (c) => {
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
authRoutes.post('/members', requireAdmin(), async (c) => {
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
authRoutes.patch('/members/:id', requireAdmin(), async (c) => {
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
authRoutes.delete('/members/:id', requireAdmin(), async (c) => {
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
