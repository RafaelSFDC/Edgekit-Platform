import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import type { AppEnv } from '../types'
import { getAuth } from '../auth'
import { getBindings } from '../env'
import { getDatabaseRuntime } from '../db'
import { validateApiKey } from '../auth/keys'
import { AUTH_COOKIE_NAME } from '../auth/middleware'

export const authRoutes = new Hono<AppEnv>()

authRoutes.get('/me', (c) => {
  const user = c.get('user')
  const session = c.get('session')
  const apiKey = c.get('apiKey')
  const role = c.get('role')

  const isAuthenticated =
    role === 'admin' || Boolean(user) || (Boolean(apiKey) && apiKey?.type !== 'anon')

  return c.json({
    success: true,
    authenticated: isAuthenticated,
    data: {
      user: user || null,
      session: session || null,
      role: role || 'anon',
      apiKey: apiKey ? { name: apiKey.name, type: apiKey.type } : null,
    },
  })
})

// Login via App Key / Master Secret (Padrão Edgekit Events)
authRoutes.post('/login', async (c) => {
  let passkey: string | undefined

  try {
    const body = (await c.req.json()) as {
      passkey?: string
      secret?: string
      key?: string
    }
    passkey = body.passkey || body.secret || body.key
  } catch {}

  if (!passkey) {
    passkey =
      c.req.header('x-app-secret') ||
      c.req.header('x-api-key') ||
      c.req.header('apikey')
  }

  if (!passkey || !passkey.trim()) {
    return c.json(
      {
        success: false,
        authenticated: false,
        error: { message: 'Informe a Chave de Acesso (App Key / Passkey).' },
      },
      400,
    )
  }

  const cleanKey = passkey.trim()
  const runtime = await getDatabaseRuntime()
  const validated = await validateApiKey(runtime.db, cleanKey)

  if (!validated || validated.role !== 'admin') {
    return c.json(
      {
        success: false,
        authenticated: false,
        error: { message: 'Chave de acesso inválida ou não possui privilégios de administração.' },
      },
      401,
    )
  }

  const isLocalhost =
    c.req.url.includes('localhost') || c.req.url.includes('127.0.0.1')

  setCookie(c, AUTH_COOKIE_NAME, cleanKey, {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  })

  return c.json({
    success: true,
    authenticated: true,
    role: validated.role,
    key: {
      name: validated.name,
      type: validated.type,
    },
  })
})

// Logout: Encerra sessão e remove cookie HttpOnly
authRoutes.post('/logout', (c) => {
  deleteCookie(c, AUTH_COOKIE_NAME, { path: '/' })
  return c.json({
    success: true,
    authenticated: false,
    message: 'Sessão encerrada com sucesso.',
  })
})

authRoutes.get('/public-config', async (c) => {
  const bindings = await getBindings()
  const anonKey =
    bindings.EDGEKIT_ANON_KEY || bindings.HONOBASE_ANON_KEY || null

  return c.json({
    success: true,
    data: {
      appName: bindings.APP_NAME || 'Edgekit Platform',
      appVersion: bindings.APP_VERSION || '1.0.0',
      anonKey,
      oauthProviders: {
        google: Boolean(bindings.GOOGLE_CLIENT_ID),
        github: Boolean(bindings.GITHUB_CLIENT_ID),
      },
    },
  })
})

authRoutes.all('/*', async (c) => {
  const auth = await getAuth()
  return auth.handler(c.req.raw)
})
