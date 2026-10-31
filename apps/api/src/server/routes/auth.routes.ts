import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getAuth } from '../auth'
import { getBindings } from '../env'

export const authRoutes = new Hono<AppEnv>()

/**
 * Informações sobre o usuário final autenticado na aplicação (Better Auth)
 */
authRoutes.get('/me', (c) => {
  const user = c.get('user')
  const session = c.get('session')
  const apiKey = c.get('apiKey')
  const role = c.get('role')

  const isAuthenticated =
    Boolean(user) ||
    role === 'service_role' ||
    (Boolean(apiKey) && apiKey?.type !== 'anon')

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

/**
 * Configurações públicas da instância da aplicação (chave anon, nome, provedores OAuth)
 */
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

/**
 * Roteamento canônico de 100% dos fluxos de autenticação de usuários finais para o Better Auth.
 * Proibido criar handlers manuais para login/cadastro de usuários finais.
 */
authRoutes.all('/*', async (c) => {
  const auth = await getAuth()
  return auth.handler(c.req.raw)
})
