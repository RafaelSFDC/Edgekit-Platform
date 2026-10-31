import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { AppEnv } from '../types'
import { getDatabaseRuntime } from '../db'
import { getSessionFromHeaders } from './index'
import { validateApiKey } from './keys'
import { ADMIN_COOKIE_NAME, validateAdminSession } from './admin-auth'

export function authContextMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const runtime = await getDatabaseRuntime()
    const db = runtime.db

    // 1. Checa Sessão Administrativa do Painel (Cookie HttpOnly)
    const adminSessionToken = getCookie(c, ADMIN_COOKIE_NAME)
    if (adminSessionToken) {
      const admin = await validateAdminSession(db, adminSessionToken)
      if (admin) {
        c.set('admin', admin)
        c.set('role', admin.role)
      }
    }

    // 2. Checa Chave de API (Headers ou Query)
    const rawApiKey =
      c.req.header('apikey') ||
      c.req.header('x-api-key') ||
      c.req.query('apikey')

    const authHeader = c.req.header('authorization')
    let bearerToken: string | undefined
    if (authHeader?.startsWith('Bearer ')) {
      bearerToken = authHeader.slice(7).trim()
    }

    // Se o Bearer token for uma API key (ex: ek_sec_ ou ek_anon_)
    const candidateApiKey =
      rawApiKey ||
      (bearerToken && (bearerToken.startsWith('ek_') || bearerToken.startsWith('hb_'))
        ? bearerToken
        : undefined)

    if (candidateApiKey) {
      const validatedKey = await validateApiKey(db, candidateApiKey)
      if (validatedKey) {
        c.set('apiKey', validatedKey)
        if (validatedKey.type === 'service_role') {
          c.set('role', 'service_role')
        } else if (!c.get('role')) {
          c.set('role', 'anon')
        }
      }
    }

    // 3. Checa Sessão de Usuário Final da Aplicação (Better Auth)
    if (!c.get('admin') && c.get('role') !== 'service_role') {
      const sessionData = await getSessionFromHeaders(c.req.raw.headers)
      if (sessionData?.user) {
        c.set('user', sessionData.user)
        c.set('session', sessionData.session)
        if (!c.get('role')) {
          c.set('role', 'user')
        }
      }
    }

    // 4. Fallback padrão: anônimo
    if (!c.get('role')) {
      c.set('role', 'anon')
    }

    await next()
  }
}

/**
 * Exige que a requisição seja feita por um Administrador da Plataforma (membro em _ek_admins)
 * ou por um backend autorizado utilizando a chave secreta (service_role).
 *
 * CRÍTICO: Um usuário final cadastrado na tabela `users` do app NUNCA passa nesta checagem!
 */
export function requireAdmin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const admin = c.get('admin')
    const apiKey = c.get('apiKey')
    const role = c.get('role')

    const isPlatformAdmin =
      Boolean(admin) ||
      role === 'service_role' ||
      apiKey?.type === 'service_role'

    if (!isPlatformAdmin) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Acesso restrito a administradores da plataforma ou service_role_key.',
          },
        },
        403,
      )
    }

    await next()
  }
}

/**
 * Exige que a requisição seja autenticada (seja por admin da plataforma, usuário final ou service role).
 */
export function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const admin = c.get('admin')
    const user = c.get('user')
    const apiKey = c.get('apiKey')
    const role = c.get('role')

    const isAuthenticated =
      Boolean(admin) ||
      Boolean(user) ||
      role === 'service_role' ||
      apiKey?.type === 'service_role'

    if (!isAuthenticated) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticação necessária para acessar este recurso.',
          },
        },
        401,
      )
    }

    await next()
  }
}
