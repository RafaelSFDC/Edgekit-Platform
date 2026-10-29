import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import { getDatabaseRuntime } from '../db'
import { getSessionFromHeaders } from './index'
import { validateApiKey } from './keys'

export function authContextMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const rawApiKey =
      c.req.header('apikey') ||
      c.req.header('x-api-key') ||
      c.req.query('apikey')

    const authHeader = c.req.header('authorization')
    let bearerToken: string | undefined
    if (authHeader?.startsWith('Bearer ')) {
      bearerToken = authHeader.slice(7).trim()
    }

    const keyToValidate = rawApiKey || (bearerToken?.startsWith('hb_') ? bearerToken : undefined)

    if (keyToValidate) {
      const runtime = await getDatabaseRuntime()
      const validated = await validateApiKey(runtime.db, keyToValidate)
      if (validated) {
        c.set('apiKey', validated)
        c.set('role', validated.role)
      }
    }

    const sessionData = await getSessionFromHeaders(c.req.raw.headers)
    if (sessionData?.user) {
      c.set('user', sessionData.user)
      c.set('session', sessionData.session)
      c.set('role', (sessionData.user as any).role || 'user')
    }

    if (!c.get('role')) {
      c.set('role', 'anon')
    }

    await next()
  }
}

export function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const role = c.get('role')
    const user = c.get('user')
    const apiKey = c.get('apiKey')

    if (!user && (!apiKey || apiKey.type === 'anon')) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticação necessária. Forneça uma chave de API ou efetue login.',
          },
        },
        401,
      )
    }

    await next()
  }
}

export function requireAdmin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const role = c.get('role')
    const user = c.get('user')
    const apiKey = c.get('apiKey')

    const isAdmin =
      role === 'admin' ||
      user?.role === 'admin' ||
      apiKey?.type === 'service_role'

    if (!isAdmin) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Acesso restrito a administradores ou service_role_key.',
          },
        },
        403,
      )
    }

    await next()
  }
}
