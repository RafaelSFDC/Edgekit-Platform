import { Hono, type Context } from 'hono'
import { eq, sql, type SQL } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { getDatabaseRuntime, type AppDatabase } from '../db'
import { ekTablePolicies } from '../db/schema'
import { getBindings } from '../env'
import { evaluateTablePolicy, type PolicyEvaluationResult, type CrudAction } from '../policies/engine'
import { dispatchWebhooks } from '../realtime/webhooks'

export const dbRoutes = new Hono<AppEnv>()

const SAFE_IDENTIFIER = /^[a-zA-Z0-9_]+$/

const SYSTEM_TABLES = new Set([
  'users',
  'sessions',
  'accounts',
  'verifications',
  'organizations',
  'members',
  'invitations',
  'sqlite_master',
  'sqlite_sequence',
  'drizzle_migrations',
  '_ek_migrations',
  '__d1_migrations',
])

function sanitizeIdentifier(name: string): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Identificador inválido: "${name}"`)
  }
  return name
}

async function resolveTableAccessWithEngine(
  db: AppDatabase,
  table: string,
  c: Context<AppEnv>,
  action: CrudAction,
): Promise<PolicyEvaluationResult> {
  sanitizeIdentifier(table)

  const lowerTable = table.toLowerCase()
  const role = c.get('role')
  const isPlatformAdmin = role === 'service_role' || role === 'owner' || role === 'admin' || Boolean(c.get('admin'))

  // Tabelas de infraestrutura interna (_ek_*) só podem ser lidas via service_role ou admin do painel
  if (lowerTable.startsWith('_ek_') || SYSTEM_TABLES.has(lowerTable)) {
    if (!isPlatformAdmin) {
      throw new Error(
        `Acesso negado: a tabela "${table}" pertence à infraestrutura da plataforma e não pode ser acessada pela Data API pública.`,
      )
    }
    return { allowed: true, bypass: true }
  }

  if (isPlatformAdmin) {
    return { allowed: true, bypass: true }
  }

  let policy: any = null
  try {
    policy = await db
      .select()
      .from(ekTablePolicies)
      .where(eq(ekTablePolicies.tableName, table))
      .get()
  } catch {
    policy = null
  }

  const result = evaluateTablePolicy(table, action, policy, c.var)
  if (!result.allowed) {
    throw new Error(result.error || `Acesso negado na tabela "${table}".`)
  }

  return result
}

async function broadcastDatabaseEvent(
  c: Context<AppEnv>,
  table: string,
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  data: any,
) {
  try {
    const bindings = await getBindings()
    const message = {
      id: crypto.randomUUID(),
      channel: `db:${table}`,
      event,
      payload: {
        table,
        event,
        data,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    }

    // 1. Emissão para Durable Object WebSocket
    if (bindings.REALTIME) {
      const channel = `db:${table}`
      const stub = bindings.REALTIME.getByName(channel)
      const broadcastReq = new Request('http://internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      })

      if (c.executionCtx?.waitUntil) {
        c.executionCtx.waitUntil((stub as any).fetch(broadcastReq))
      } else {
        await (stub as any).fetch(broadcastReq).catch(() => {})
      }
    }

    // 2. Disparo de Webhooks HTTP com assinatura HMAC-SHA256
    await dispatchWebhooks(`db:${table}:${event.toLowerCase()}`, data, {
      executionCtx: c.executionCtx,
      table,
    })
  } catch (err) {
    console.warn('[Realtime CDC / Webhook Warning]:', err)
  }
}

// REST Data API: Consulta dinâmica com filtros avançados e Policy Engine
dbRoutes.get('/:table', async (c) => {
  const table = c.req.param('table')
  const runtime = await getDatabaseRuntime()
  const db = runtime.db

  let policyResult: PolicyEvaluationResult
  try {
    policyResult = await resolveTableAccessWithEngine(db, table, c, 'select')
  } catch (err: any) {
    const isForbidden = err.message?.includes('Acesso negado') || err.message?.includes('Acesso restrito')
    return c.json(
      {
        success: false,
        error: { message: err.message, code: isForbidden ? 'FORBIDDEN_TABLE' : 'UNAUTHORIZED' },
      },
      isForbidden ? 403 : 401,
    )
  }

  const query = c.req.query()
  const selectParam = query['select'] || '*'
  const limitParam = Math.min(Math.max(Number(query['limit']) || 50, 1), 500)
  const offsetParam = Math.max(Number(query['offset']) || 0, 0)
  const orderParam = query['order']

  let selectClause = '*'
  if (selectParam !== '*') {
    const cols = selectParam.split(',').map((s) => s.trim())
    for (const col of cols) {
      sanitizeIdentifier(col)
    }
    selectClause = cols.map((col) => `\`${col}\``).join(', ')
  }

  const whereConditions: SQL[] = []

  // Injeta condição compilada pela Policy Engine (ex: owner = userId, org = orgId)
  if (policyResult.whereCondition) {
    whereConditions.push(policyResult.whereCondition)
  }

  const reservedParams = new Set(['select', 'limit', 'offset', 'order', 'apikey'])

  for (const [key, value] of Object.entries(query)) {
    if (reservedParams.has(key) || !value) continue

    try {
      sanitizeIdentifier(key)
    } catch {
      continue
    }

    const colIdentifier = sql.raw(`\`${key}\``)

    if (value.startsWith('eq:')) {
      whereConditions.push(sql`${colIdentifier} = ${value.slice(3)}`)
    } else if (value.startsWith('neq:')) {
      whereConditions.push(sql`${colIdentifier} != ${value.slice(4)}`)
    } else if (value.startsWith('gt:')) {
      whereConditions.push(sql`${colIdentifier} > ${value.slice(3)}`)
    } else if (value.startsWith('gte:')) {
      whereConditions.push(sql`${colIdentifier} >= ${value.slice(4)}`)
    } else if (value.startsWith('lt:')) {
      whereConditions.push(sql`${colIdentifier} < ${value.slice(3)}`)
    } else if (value.startsWith('lte:')) {
      whereConditions.push(sql`${colIdentifier} <= ${value.slice(4)}`)
    } else if (value.startsWith('like:')) {
      whereConditions.push(sql`${colIdentifier} LIKE ${value.slice(5)}`)
    } else if (value.startsWith('in:')) {
      const items = value.slice(3).split(',').map((s) => s.trim())
      if (items.length > 0) {
        whereConditions.push(sql`${colIdentifier} IN (${sql.join(items.map((i) => sql`${i}`), sql.raw(', '))})`)
      }
    } else if (value.startsWith('not_in:')) {
      const items = value.slice(7).split(',').map((s) => s.trim())
      if (items.length > 0) {
        whereConditions.push(sql`${colIdentifier} NOT IN (${sql.join(items.map((i) => sql`${i}`), sql.raw(', '))})`)
      }
    } else if (value === 'is:null') {
      whereConditions.push(sql`${colIdentifier} IS NULL`)
    } else if (value === 'is:not_null') {
      whereConditions.push(sql`${colIdentifier} IS NOT NULL`)
    } else {
      whereConditions.push(sql`${colIdentifier} = ${value}`)
    }
  }

  const queryChunks = [sql.raw(`SELECT ${selectClause} FROM \`${table}\``)]
  const countChunks = [sql.raw(`SELECT COUNT(*) as total FROM \`${table}\``)]

  if (whereConditions.length > 0) {
    const whereJoined = sql.join(whereConditions, sql.raw(' AND '))
    queryChunks.push(sql.raw(' WHERE '), whereJoined)
    countChunks.push(sql.raw(' WHERE '), whereJoined)
  }

  if (orderParam) {
    const [orderCol, orderDir] = orderParam.split('.')
    sanitizeIdentifier(orderCol)
    const dir = (orderDir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
    queryChunks.push(sql.raw(` ORDER BY \`${orderCol}\` ${dir}`))
  }

  queryChunks.push(sql.raw(` LIMIT ${limitParam} OFFSET ${offsetParam}`))

  try {
    const finalSql = sql.join(queryChunks, sql.raw(''))
    const finalCountSql = sql.join(countChunks, sql.raw(''))

    const [rows, countResult]: [any[], any] = await Promise.all([
      db.all(finalSql),
      db.all(finalCountSql),
    ])

    const total = countResult?.[0]?.total ?? rows.length

    return c.json({
      success: true,
      data: rows,
      meta: {
        total: Number(total),
        limit: limitParam,
        offset: offsetParam,
        hasMore: offsetParam + rows.length < Number(total),
      },
    })
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: {
          code: 'DB_QUERY_ERROR',
          message: err.message,
        },
      },
      500,
    )
  }
})

// Obter registro único por ID com Policy Engine
dbRoutes.get('/:table/:id', async (c) => {
  const table = c.req.param('table')
  const id = c.req.param('id')
  const runtime = await getDatabaseRuntime()
  const db = runtime.db

  try {
    const access = await resolveTableAccessWithEngine(db, table, c, 'select')

    const whereConditions: SQL[] = [sql`\`id\` = ${id}`]
    if (access.whereCondition) {
      whereConditions.push(access.whereCondition)
    }

    const whereClause = sql.join(whereConditions, sql.raw(' AND '))
    const query = sql`SELECT * FROM ${sql.raw(`\`${table}\``)} WHERE ${whereClause} LIMIT 1`

    const rows: any[] = await db.all(query)
    if (!rows || rows.length === 0) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Registro não encontrado na tabela ${table}` },
        },
        404,
      )
    }

    return c.json({ success: true, data: rows[0] })
  } catch (err: any) {
    const isForbidden = err.message?.includes('Acesso negado') || err.message?.includes('Acesso restrito')
    return c.json(
      { success: false, error: { code: isForbidden ? 'FORBIDDEN' : 'DB_ERROR', message: err.message } },
      isForbidden ? 403 : 500,
    )
  }
})

// Inserir registro(s) com Policy Engine e CDC Broadcast
dbRoutes.post('/:table', async (c) => {
  const table = c.req.param('table')
  const runtime = await getDatabaseRuntime()
  const db = runtime.db

  try {
    const access = await resolveTableAccessWithEngine(db, table, c, 'insert')

    const body = await c.req.json().catch(() => ({}))
    const records = Array.isArray(body) ? body : [body]

    if (records.length === 0) {
      return c.json({ success: false, error: { message: 'Nenhum registro para inserir.' } }, 400)
    }

    const results = []

    for (const record of records) {
      // Injeta valores forçados pela Policy Engine (ex: user_id do autor)
      if (access.injectValues) {
        Object.assign(record, access.injectValues)
      }

      // Se não possui ID explícito, gera nanoid padrão
      if (!record.id) {
        record.id = crypto.randomUUID()
      }

      const keys = Object.keys(record)
      for (const k of keys) {
        sanitizeIdentifier(k)
      }

      const columnsSql = sql.raw(keys.map((k) => `\`${k}\``).join(', '))
      const valuesSql = sql.join(
        keys.map((k) => sql`${record[k]}`),
        sql.raw(', '),
      )

      const insertQuery = sql`INSERT INTO ${sql.raw(`\`${table}\``)} (${columnsSql}) VALUES (${valuesSql}) RETURNING *`
      const inserted: any[] = await db.all(insertQuery)
      const newRecord = inserted[0] || record
      results.push(newRecord)

      // Emissão CDC para cada registro inserido
      await broadcastDatabaseEvent(c, table, 'INSERT', newRecord)
    }

    return c.json(
      {
        success: true,
        data: Array.isArray(body) ? results : results[0],
      },
      201,
    )
  } catch (err: any) {
    const isForbidden = err.message?.includes('Acesso negado') || err.message?.includes('Acesso restrito')
    return c.json(
      { success: false, error: { code: isForbidden ? 'FORBIDDEN' : 'DB_INSERT_ERROR', message: err.message } },
      isForbidden ? 403 : 500,
    )
  }
})

// Atualizar registro por ID com Policy Engine e CDC Broadcast
dbRoutes.patch('/:table/:id', async (c) => {
  const table = c.req.param('table')
  const id = c.req.param('id')
  const runtime = await getDatabaseRuntime()
  const db = runtime.db

  try {
    const access = await resolveTableAccessWithEngine(db, table, c, 'update')

    const body = await c.req.json().catch(() => ({}))
    const keys = Object.keys(body).filter((k) => k !== 'id')

    if (keys.length === 0) {
      return c.json({ success: false, error: { message: 'Campos vazios para atualização.' } }, 400)
    }

    for (const k of keys) {
      sanitizeIdentifier(k)
    }

    const setClauses = sql.join(
      keys.map((k) => sql`${sql.raw(`\`${k}\``)} = ${body[k]}`),
      sql.raw(', '),
    )

    const whereConditions: SQL[] = [sql`\`id\` = ${id}`]
    if (access.whereCondition) {
      whereConditions.push(access.whereCondition)
    }

    const whereClause = sql.join(whereConditions, sql.raw(' AND '))
    const updateQuery = sql`UPDATE ${sql.raw(`\`${table}\``)} SET ${setClauses} WHERE ${whereClause} RETURNING *`

    const updated: any[] = await db.all(updateQuery)
    if (!updated || updated.length === 0) {
      return c.json(
        {
          success: false,
          error: {
            message: 'Registro não encontrado ou você não possui permissão para atualizá-lo.',
            code: 'NOT_FOUND_OR_FORBIDDEN',
          },
        },
        404,
      )
    }

    const updatedRecord = updated[0]
    await broadcastDatabaseEvent(c, table, 'UPDATE', updatedRecord)

    return c.json({ success: true, data: updatedRecord })
  } catch (err: any) {
    const isForbidden = err.message?.includes('Acesso negado') || err.message?.includes('Acesso restrito')
    return c.json(
      { success: false, error: { code: isForbidden ? 'FORBIDDEN' : 'DB_UPDATE_ERROR', message: err.message } },
      isForbidden ? 403 : 500,
    )
  }
})

// Deletar registro por ID com Policy Engine e CDC Broadcast
dbRoutes.delete('/:table/:id', async (c) => {
  const table = c.req.param('table')
  const id = c.req.param('id')
  const runtime = await getDatabaseRuntime()
  const db = runtime.db

  try {
    const access = await resolveTableAccessWithEngine(db, table, c, 'delete')

    const whereConditions: SQL[] = [sql`\`id\` = ${id}`]
    if (access.whereCondition) {
      whereConditions.push(access.whereCondition)
    }

    const whereClause = sql.join(whereConditions, sql.raw(' AND '))
    const deleteQuery = sql`DELETE FROM ${sql.raw(`\`${table}\``)} WHERE ${whereClause}`

    await db.run(deleteQuery)
    await broadcastDatabaseEvent(c, table, 'DELETE', { id })

    return c.json({ success: true, message: `Registro removido com sucesso de ${table}`, id })
  } catch (err: any) {
    const isForbidden = err.message?.includes('Acesso negado') || err.message?.includes('Acesso restrito')
    return c.json(
      { success: false, error: { code: isForbidden ? 'FORBIDDEN' : 'DB_DELETE_ERROR', message: err.message } },
      isForbidden ? 403 : 500,
    )
  }
})
