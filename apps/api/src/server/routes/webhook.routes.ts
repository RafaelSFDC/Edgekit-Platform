import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AppEnv } from '../types'
import { getDb } from '../db'
import { ekWebhooks } from '../db/schema'
import { requireAdmin } from '../auth/middleware'
import { computeWebhookSignature, type WebhookPayload } from '../realtime/webhooks'

export const webhookRoutes = new Hono<AppEnv>()

// Todos os endpoints de webhook exigem permissão administrativa / service role
webhookRoutes.use('*', requireAdmin())

// 1. Listar webhooks cadastrados
webhookRoutes.get('/', async (c) => {
  const db = await getDb()
  const webhooks = await db.select().from(ekWebhooks).all()
  return c.json({ success: true, data: webhooks })
})

// 2. Criar novo webhook
webhookRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { name, url, events, secret, enabled } = body

  if (!name || !url) {
    return c.json(
      { success: false, error: { message: 'Campos "name" e "url" são obrigatórios.' } },
      400,
    )
  }

  try {
    new URL(url)
  } catch {
    return c.json(
      { success: false, error: { message: 'URL fornecida é inválida.' } },
      400,
    )
  }

  const db = await getDb()
  const now = new Date()
  const id = nanoid()
  const generatedSecret = secret || `whsec_${nanoid(24)}`

  const newWebhook = {
    id,
    name: String(name).trim(),
    url: String(url).trim(),
    events: JSON.stringify(events && events.length > 0 ? events : ['*']),
    secret: generatedSecret,
    enabled: enabled !== undefined ? Boolean(enabled) : true,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(ekWebhooks).values(newWebhook)
  return c.json({ success: true, data: newWebhook }, 201)
})

// 3. Obter webhook por ID
webhookRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = await getDb()
  const webhook = await db.select().from(ekWebhooks).where(eq(ekWebhooks.id, id)).get()

  if (!webhook) {
    return c.json({ success: false, error: { message: 'Webhook não encontrado.' } }, 404)
  }

  return c.json({ success: true, data: webhook })
})

// 4. Atualizar webhook
webhookRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const db = await getDb()

  const existing = await db.select().from(ekWebhooks).where(eq(ekWebhooks.id, id)).get()
  if (!existing) {
    return c.json({ success: false, error: { message: 'Webhook não encontrado.' } }, 404)
  }

  if (body.url) {
    try {
      new URL(body.url)
    } catch {
      return c.json({ success: false, error: { message: 'URL fornecida é inválida.' } }, 400)
    }
  }

  const updated = {
    name: body.name ? String(body.name).trim() : existing.name,
    url: body.url ? String(body.url).trim() : existing.url,
    events: body.events ? JSON.stringify(body.events) : existing.events,
    secret: body.secret !== undefined ? body.secret : existing.secret,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : existing.enabled,
    updatedAt: new Date(),
  }

  await db.update(ekWebhooks).set(updated).where(eq(ekWebhooks.id, id))
  return c.json({ success: true, data: { ...existing, ...updated } })
})

// 5. Excluir webhook
webhookRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = await getDb()

  await db.delete(ekWebhooks).where(eq(ekWebhooks.id, id))
  return c.json({ success: true, message: 'Webhook excluído com sucesso.' })
})

// 6. Testar disparo do webhook (Ping Test)
webhookRoutes.post('/:id/test', async (c) => {
  const id = c.req.param('id')
  const db = await getDb()
  const webhook = await db.select().from(ekWebhooks).where(eq(ekWebhooks.id, id)).get()

  if (!webhook) {
    return c.json({ success: false, error: { message: 'Webhook não encontrado.' } }, 404)
  }

  const eventId = nanoid()
  const timestamp = Date.now()
  const testPayload: WebhookPayload = {
    id: eventId,
    event: 'test.ping',
    timestamp,
    data: {
      message: 'Ping de teste emitido pelo Edgekit Platform',
      webhookId: webhook.id,
      webhookName: webhook.name,
    },
  }

  const payloadString = JSON.stringify(testPayload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Edgekit-Platform-Webhooks/1.0',
    'X-Edgekit-Event': 'test.ping',
    'X-Edgekit-Delivery-Id': eventId,
    'X-Edgekit-Timestamp': String(timestamp),
  }

  if (webhook.secret) {
    const signature = await computeWebhookSignature(webhook.secret, payloadString)
    headers['X-Edgekit-Signature'] = `sha256=${signature}`
  }

  const startTime = Date.now()
  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: AbortSignal.timeout(8000),
    })

    const latencyMs = Date.now() - startTime
    const responseBody = await res.text().catch(() => '')

    return c.json({
      success: res.ok,
      data: {
        statusCode: res.status,
        statusText: res.statusText,
        latencyMs,
        responseSnippet: responseBody.slice(0, 300),
        signatureSent: headers['X-Edgekit-Signature'] || null,
      },
    })
  } catch (err: any) {
    const latencyMs = Date.now() - startTime
    return c.json(
      {
        success: false,
        error: {
          code: 'WEBHOOK_DELIVERY_FAILED',
          message: err.message || 'Falha ao conectar com o endpoint do webhook.',
          latencyMs,
        },
      },
      502,
    )
  }
})
