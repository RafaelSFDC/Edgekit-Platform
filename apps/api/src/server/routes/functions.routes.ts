import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AppEnv } from '../types'
import { getDb } from '../db'
import { webhooks } from '../db/schema'
import { getBindings } from '../env'
import { requireAdmin, requireAuth } from '../auth/middleware'
import { getPlanCapabilities } from '../plan'

export const functionsRoutes = new Hono<AppEnv>()

// Status e capacidades de funções (detecção Free vs Paid)
functionsRoutes.get('/status', async (c) => {
  const capabilities = await getPlanCapabilities()
  return c.json({
    success: true,
    data: capabilities,
  })
})

// Listar webhooks cadastrados
functionsRoutes.get('/webhooks', requireAdmin(), async (c) => {
  const db = await getDb()
  const list = await db.select().from(webhooks).all()
  return c.json({ success: true, data: list })
})

// Cadastrar novo webhook
functionsRoutes.post('/webhooks', requireAdmin(), async (c) => {
  const body = await c.req.json()
  const db = await getDb()

  if (!body.url || !body.name) {
    return c.json({ success: false, error: { message: 'Campos "name" e "url" são obrigatórios.' } }, 400)
  }

  const id = nanoid()
  const now = new Date()
  const newWebhook = {
    id,
    name: body.name,
    url: body.url,
    events: JSON.stringify(body.events || ['*']),
    secret: body.secret || nanoid(32),
    enabled: body.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(webhooks).values(newWebhook)
  return c.json({ success: true, data: newWebhook }, 201)
})

// Remover webhook
functionsRoutes.delete('/webhooks/:id', requireAdmin(), async (c) => {
  const id = c.req.param('id')
  const db = await getDb()
  await db.delete(webhooks).where(eq(webhooks.id, id))
  return c.json({ success: true, message: 'Webhook removido com sucesso.' })
})

// Execução de Dynamic Worker (Workers for Platforms)
functionsRoutes.all('/dynamic/:scriptName/*', requireAuth(), async (c) => {
  const scriptName = c.req.param('scriptName')
  const bindings = await getBindings()

  const isEnabled = bindings.ENABLE_DYNAMIC_WORKERS === 'true'
  const dispatcher = (bindings as any).DISPATCHER

  if (!isEnabled || !dispatcher) {
    return c.json(
      {
        success: false,
        error: {
          code: 'DYNAMIC_WORKERS_UNAVAILABLE',
          message:
            'Dynamic Workers requerem o plano Cloudflare Workers for Platforms (pago). No plano gratuito, utilize os Webhooks HTTP e Event Hooks nativos.',
          howToEnable:
            'Para habilitar no plano pago da Cloudflare, defina ENABLE_DYNAMIC_WORKERS=true no wrangler.jsonc e configure o dispatch namespace.',
        },
      },
      501,
    )
  }

  try {
    const worker = dispatcher.get(scriptName)
    const subResponse = await worker.fetch(c.req.raw)
    return subResponse
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: {
          code: 'DYNAMIC_WORKER_EXECUTION_ERROR',
          message: `Falha ao executar o Dynamic Worker "${scriptName}": ${err.message}`,
        },
      },
      500,
    )
  }
})
