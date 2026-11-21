import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AppEnv } from '../../types'
import { getDb } from '../../db'
import { ekTablePolicies } from '../../db/schema'
import { requireAdmin } from '../../auth/middleware'
import { TablePolicyUpdateSchema } from '../../schemas'

export const policiesRoutes = new Hono<AppEnv>()

const SAFE_NAME = /^[a-zA-Z0-9_]+$/

// Obter Política de Acesso da Tabela
policiesRoutes.get('/tables/:name/policy', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()
  const db = await getDb()
  const policy = await db.select().from(ekTablePolicies).where(eq(ekTablePolicies.tableName, tableName)).get()

  if (policy) {
    return c.json({
      success: true,
      data: {
        tableName,
        rlsEnabled: Boolean(policy.rlsEnabled),
        selectRule: policy.selectRule,
        insertRule: policy.insertRule,
        updateRule: policy.updateRule,
        deleteRule: policy.deleteRule,
        ownerColumn: policy.ownerColumn,
        customRule: policy.customRule,
      },
    })
  }

  return c.json({
    success: true,
    data: {
      tableName,
      rlsEnabled: true,
      selectRule: 'disabled',
      insertRule: 'disabled',
      updateRule: 'disabled',
      deleteRule: 'disabled',
      ownerColumn: 'user_id',
    },
  })
})

// Atualizar Política de Acesso da Tabela
policiesRoutes.put('/tables/:name/policy', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()
  if (!SAFE_NAME.test(tableName)) {
    return c.json({ success: false, error: { message: 'Nome de tabela inválido.' } }, 400)
  }

  const body = await c.req.json().catch(() => ({}))
  const parsed = TablePolicyUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.errors[0]?.message || 'Parâmetros de política inválidos.',
        },
      },
      400,
    )
  }

  const data = parsed.data
  const rlsEnabled = data.rlsEnabled !== undefined ? data.rlsEnabled : true
  const selectRule = data.selectRule || 'disabled'
  const insertRule = data.insertRule || 'disabled'
  const updateRule = data.updateRule || 'disabled'
  const deleteRule = data.deleteRule || 'disabled'
  const ownerColumn = (data.ownerColumn || 'user_id').trim()
  const customRule = data.customRule || null

  const now = new Date()
  const db = await getDb()

  const existing = await db.select().from(ekTablePolicies).where(eq(ekTablePolicies.tableName, tableName)).get()

  if (existing) {
    await db
      .update(ekTablePolicies)
      .set({
        rlsEnabled,
        selectRule,
        insertRule,
        updateRule,
        deleteRule,
        ownerColumn,
        customRule,
        updatedAt: now,
      })
      .where(eq(ekTablePolicies.tableName, tableName))
  } else {
    await db.insert(ekTablePolicies).values({
      id: nanoid(),
      tableName,
      rlsEnabled,
      selectRule,
      insertRule,
      updateRule,
      deleteRule,
      ownerColumn,
      customRule,
      createdAt: now,
      updatedAt: now,
    })
  }

  return c.json({
    success: true,
    data: {
      tableName,
      rlsEnabled,
      selectRule,
      insertRule,
      updateRule,
      deleteRule,
      ownerColumn,
      customRule,
    },
  })
})
