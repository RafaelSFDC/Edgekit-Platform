import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { AppEnv } from '../types'
import { getDatabaseRuntime } from '../db'
import { getSessionFromHeaders } from './index'
import { validateApiKey } from './keys'
import { ADMIN_COOKIE_NAME, HOST_ADMIN_COOKIE_NAME, validateAdminSession } from './admin-auth'
import { getSecurityConfig, isLocalhostOrigin } from './security'

export function authContextMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const runtime = await getDatabaseRuntime()
    const db = runtime.db

    // 1. Checa Sessão Administrativa do Painel (Cookie HttpOnly edgekit_admin_session ou __Host-edgekit_admin_session)
    const adminSessionToken =
      getCookie(c, HOST_ADMIN_COOKIE_NAME) ||
      getCookie(c, ADMIN_COOKIE_NAME)
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
      (bearerToken && bearerToken.startsWith('ek_')
        ? bearerToken
        : undefined)

    if (candidateApiKey) {
      const validatedKey = await validateApiKey(db, candidateApiKey)
      if (validatedKey) {
        // Regra Canônica 4.3: Chave de Serviço (service_role) rejeita origens de navegadores não autorizados
        if (validatedKey.type === 'service_role') {
          const originHeader = c.req.header('origin')
          if (originHeader) {
            const isLocalOrigin = isLocalhostOrigin(originHeader)
            const config = await getSecurityConfig()
            const isExplicitlyAllowed =
              Boolean(config.allowedOrigins &&
              (config.allowedOrigins.includes(originHeader) ||
                config.allowedOrigins.some((allowed) => allowed !== '*' && originHeader.startsWith(allowed))))

            if (!isLocalOrigin && !isExplicitlyAllowed) {
              return c.json(
                {
                  success: false,
                  error: {
                    code: 'FORBIDDEN_SERVICE_ROLE_BROWSER',
                    message:
                      'Chave service_role é de uso exclusivo em scripts de backend e não é permitida a partir desta origem de navegador.',
                  },
                },
                403,
              )
            }
          }
          c.set('apiKey', validatedKey)
          c.set('role', 'service_role')
        } else {
          c.set('apiKey', validatedKey)
          if (!c.get('role')) {
            c.set('role', 'anon')
          }
        }
      }
    }

    // 3. Checa Sessão de Usuário Final da Aplicação (Better Auth)
    if (!c.get('admin') && c.get('role') !== 'service_role') {
      const sessionData = await getSessionFromHeaders(c.req.raw.headers)
      if (sessionData?.user) {
        c.set('user', sessionData.user as any)
        c.set('session', sessionData.session as any)
        // Usuário final autenticado no app prevalece sobre role 'anon' da chave pública
        c.set('role', 'user')
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
 * Exige que a requisição seja feita por um Administrador da Plataforma (membro em _ek_admins via cookie HttpOnly)
 * ou por um backend autorizado utilizando a chave secreta (service_role).
 *
 * CRÍTICO: Um usuário final cadastrado na tabela `users` do app NUNCA passa nesta checagem,
 * mesmo que seu atributo role no app seja 'admin'!
 */
export function requireAdmin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const admin = c.get('admin')
    const apiKey = c.get('apiKey')

    const isPlatformAdmin =
      Boolean(admin) ||
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

    const isAuthenticated =
      Boolean(admin) ||
      Boolean(user) ||
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
