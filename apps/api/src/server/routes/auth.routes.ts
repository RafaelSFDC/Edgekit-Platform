import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { getAuth } from '../auth'
import { getBindings } from '../env'
import { getDatabaseRuntime, getDb } from '../db'
import { validateApiKey } from '../auth/keys'
import {
  ADMIN_COOKIE_NAME,
  createAdminSession,
  verifyPassword,
} from '../auth/admin-auth'
import { ekAdmins } from '../db/schema'

export const authRoutes = new Hono<AppEnv>()

// Informações sobre a sessão atual (seja Admin, Usuário do App ou Service Role)
authRoutes.get('/me', (c) => {
  const admin = c.get('admin')
  const user = c.get('user')
  const session = c.get('session')
  const apiKey = c.get('apiKey')
  const role = c.get('role')

  const isAuthenticated =
    Boolean(admin) ||
    Boolean(user) ||
    role === 'service_role' ||
    (Boolean(apiKey) && apiKey?.type !== 'anon')

  return c.json({
    success: true,
    authenticated: isAuthenticated,
    data: {
      admin: admin || null,
      user: user || null,
      session: session || null,
      role: role || 'anon',
      apiKey: apiKey ? { name: apiKey.name, type: apiKey.type } : null,
    },
  })
})

// Endpoint unificado de Login para o Dashboard
// Aceita tanto credenciais de Administrador (email + senha) quanto Chave de Acesso (Service Key)
authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const isLocalhost = c.req.url.includes('localhost') || c.req.url.includes('127.0.0.1')
  const db = await getDb()

  // 1. Caso A: Login com Email e Senha de Membro da Plataforma (_ek_admins)
  if (body.email && body.password) {
    const email = body.email.trim().toLowerCase()
    const password = body.password

    const admin = await db.select().from(ekAdmins).where(eq(ekAdmins.email, email)).get()
    if (!admin) {
      return c.json({ success: false, authenticated: false, error: { message: 'Credenciais de administrador inválidas.' } }, 401)
    }

    const isValid = await verifyPassword(password, admin.password)
    if (!isValid) {
      return c.json({ success: false, authenticated: false, error: { message: 'Credenciais de administrador inválidas.' } }, 401)
    }

    const sessionMeta = {
      ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || '127.0.0.1',
      userAgent: c.req.header('user-agent'),
    }
    const { token: sessionToken } = await createAdminSession(db, admin.id, sessionMeta)

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
      role: admin.role,
      data: {
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      },
    })
  }

  // 2. Caso B: Login com Chave Secreta (Service Role Key)
  const passkey =
    body.passkey ||
    body.secret ||
    body.key ||
    c.req.header('x-app-secret') ||
    c.req.header('x-api-key') ||
    c.req.header('apikey')

  if (passkey && passkey.trim()) {
    const cleanKey = passkey.trim()
    const runtime = await getDatabaseRuntime()
    const validated = await validateApiKey(runtime.db, cleanKey)

    if (!validated || validated.type !== 'service_role') {
      return c.json(
        {
          success: false,
          authenticated: false,
          error: { message: 'Chave de acesso inválida ou não possui privilégios de service_role.' },
        },
        401,
      )
    }

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

  return c.json(
    {
      success: false,
      authenticated: false,
      error: { message: 'Informe e-mail e senha de administrador ou uma chave de acesso válida.' },
    },
    400,
  )
})

// Logout: Encerra sessão administrativa e remove cookie HttpOnly
authRoutes.post('/logout', (c) => {
  deleteCookie(c, ADMIN_COOKIE_NAME, { path: '/' })
  return c.json({
    success: true,
    authenticated: false,
    message: 'Sessão encerrada com sucesso.',
  })
})

// Configurações públicas da instância (chave anon, nome, provedores)
authRoutes.get('/public-config', async (c) => {
  const bindings = await getBindings()

  return c.json({
    success: true,
    data: {
      appName: bindings.APP_NAME || 'Edgekit Platform',
      appVersion: bindings.APP_VERSION || '1.0.0',
      anonKey: bindings.EDGEKIT_ANON_KEY || null,
      oauthProviders: {
        google: Boolean(bindings.GOOGLE_CLIENT_ID),
        github: Boolean(bindings.GITHUB_CLIENT_ID),
      },
    },
  })
})

// Todos os demais endpoints de auth são roteados para o Better Auth da aplicação
authRoutes.all('/*', async (c) => {
  const auth = await getAuth()
  return auth.handler(c.req.raw)
})
