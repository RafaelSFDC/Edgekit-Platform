import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import type { AppEnv } from '../../types'
import { getDb } from '../../db'
import { ekApiKeys } from '../../db/schema'
import { requireAdmin } from '../../auth/middleware'
import { createApiKey } from '../../auth/keys'
import { CreateApiKeySchema } from '../../schemas'

export const keysRoutes = new Hono<AppEnv>()

// Listar chaves existentes (apenas metadados e prefixos, nunca texto puro)
keysRoutes.get('/keys', requireAdmin(), async (c) => {
  const db = await getDb()
  const keys = await db.select().from(ekApiKeys).all()

  const sanitized = keys.map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    type: k.type,
    role: k.role,
    expiresAt: k.expiresAt,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  }))

  return c.json({ success: true, data: sanitized })
})

// Gerar nova chave de API (Retorna a chave completa apenas na criação)
keysRoutes.post('/keys', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = CreateApiKeySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.errors[0]?.message || 'Dados inválidos para geração de chave.',
        },
      },
      400,
    )
  }

  const { name, type, expiresAt } = parsed.data
  const db = await getDb()

  const result = await createApiKey(db, {
    name,
    type,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  })

  return c.json(
    {
      success: true,
      message: 'Chave de API criada com sucesso! Guarde-a em um local seguro.',
      data: {
        id: result.keyId,
        name,
        type,
        key: result.rawKey, // Exibido apenas nesta resposta inicial
        keyPrefix: result.keyPrefix,
      },
    },
    201,
  )
})

// Revogar chave de API
keysRoutes.delete('/keys/:id', requireAdmin(), async (c) => {
  const id = c.req.param('id')
  const db = await getDb()
  await db.delete(ekApiKeys).where(eq(ekApiKeys.id, id))
  return c.json({ success: true, message: 'Chave de API revogada com sucesso.' })
})
