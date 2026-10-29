import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getAuth } from '../auth'
import { getBindings } from '../env'

export const authRoutes = new Hono<AppEnv>()

authRoutes.get('/me', (c) => {
  const user = c.get('user')
  const session = c.get('session')
  const apiKey = c.get('apiKey')
  const role = c.get('role')

  return c.json({
    success: true,
    data: {
      user: user || null,
      session: session || null,
      role: role || 'anon',
      apiKey: apiKey ? { name: apiKey.name, type: apiKey.type } : null,
    },
  })
})

authRoutes.get('/public-config', async (c) => {
  const bindings = await getBindings()
  return c.json({
    success: true,
    data: {
      appName: bindings.APP_NAME || 'HonoBase',
      appVersion: bindings.APP_VERSION || '0.1.0',
      anonKey: bindings.HONOBASE_ANON_KEY || null,
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
