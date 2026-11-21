import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import type { AppEnv } from '../../types'
import { getDb } from '../../db'
import { ekSettings } from '../../db/schema'
import { requireAdmin } from '../../auth/middleware'
import { getSecurityConfig, invalidateSecurityConfigCache } from '../../auth/security'

export const settingsRoutes = new Hono<AppEnv>()

settingsRoutes.get('/settings/security', requireAdmin(), async (c) => {
  const config = await getSecurityConfig()
  return c.json({ success: true, data: config })
})

settingsRoutes.put('/settings/security', requireAdmin(), async (c) => {
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
