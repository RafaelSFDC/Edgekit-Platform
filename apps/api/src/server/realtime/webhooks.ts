import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDb } from '../db'
import { ekWebhooks } from '../db/schema'

export interface WebhookPayload<T = any> {
  id: string
  event: string
  timestamp: number
  data: T
}

/**
 * Calcula assinatura HMAC-SHA256 para autenticação segura de webhooks
 */
export async function computeWebhookSignature(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Valida assinatura HMAC-SHA256 recebida no webhook
 */
export async function verifyWebhookSignature(
  secret: string,
  payload: string,
  expectedSignature: string,
): Promise<boolean> {
  const cleanSig = expectedSignature.startsWith('sha256=')
    ? expectedSignature.slice(7)
    : expectedSignature
  const computed = await computeWebhookSignature(secret, payload)
  return computed === cleanSig
}

/**
 * Despacha eventos para os webhooks ativos correspondentes
 */
export async function dispatchWebhooks(
  event: string,
  data: any,
  options?: { executionCtx?: { waitUntil: (p: Promise<any>) => void }; table?: string },
): Promise<Array<{ webhookId: string; success: boolean; statusCode?: number; error?: string }>> {
  try {
    const db = await getDb()
    const activeWebhooks = await db
      .select()
      .from(ekWebhooks)
      .where(eq(ekWebhooks.enabled, true))
      .all()

    if (activeWebhooks.length === 0) return []

    const eventId = nanoid()
    const timestamp = Date.now()
    const payloadObject: WebhookPayload = {
      id: eventId,
      event,
      timestamp,
      data,
    }
    const payloadString = JSON.stringify(payloadObject)

    const deliveryPromises = activeWebhooks.map(async (wh) => {
      try {
        let matched = false
        const parsedEvents: string[] = JSON.parse(wh.events || '["*"]')
        const table = options?.table

        if (
          parsedEvents.includes('*') ||
          parsedEvents.includes(event) ||
          (table && (parsedEvents.includes(`${table}.${event}`) || parsedEvents.includes(`${table}.*`)))
        ) {
          matched = true
        }

        if (!matched) {
          return { webhookId: wh.id, success: false, error: 'Event not matched' }
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'Edgekit-Platform-Webhooks/1.0',
          'X-Edgekit-Event': event,
          'X-Edgekit-Delivery-Id': eventId,
          'X-Edgekit-Timestamp': String(timestamp),
        }

        if (wh.secret) {
          const signature = await computeWebhookSignature(wh.secret, payloadString)
          headers['X-Edgekit-Signature'] = `sha256=${signature}`
        }

        const res = await fetch(wh.url, {
          method: 'POST',
          headers,
          body: payloadString,
          signal: AbortSignal.timeout(6000),
        })

        return {
          webhookId: wh.id,
          success: res.ok,
          statusCode: res.status,
          error: res.ok ? undefined : `HTTP ${res.status}: ${res.statusText}`,
        }
      } catch (err: any) {
        return {
          webhookId: wh.id,
          success: false,
          error: err.message || 'Falha de conexão com destino',
        }
      }
    })

    if (options?.executionCtx?.waitUntil) {
      options.executionCtx.waitUntil(Promise.allSettled(deliveryPromises))
      return []
    }

    return await Promise.all(deliveryPromises)
  } catch (err) {
    console.warn('[dispatchWebhooks Error]:', err)
    return []
  }
}
