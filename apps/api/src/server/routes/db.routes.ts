import { Hono, type Context } from 'hono'
import { sql } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { getDatabaseRuntime } from '../db'
import { requireAuth } from '../auth/middleware'
import { getBindings } from '../env'

export const dbRoutes = new Hono<AppEnv>()

const SAFE_IDENTIFIER = /^[a-zA-Z0-9_]+$/

const SYSTEM_TABLES = new Set([
  'users',
  'sessions',
  'accounts',
  'verifications',
  'api_keys',
  'storage_files',
  'audit_logs',
  'webhooks',
  'app_settings',
  '__honobase_migrations',
  '__d1_migrations',
  'drizzle_migrations',
  'sqlite_master',
  'sqlite_sequence',
])

function sanitizeIdentifier(name: string): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Identificador inválido: "${name}"`)
  }
  return name
}

function checkTableAccess(table: string, role?: string): void {
  sanitizeIdentifier(table)
  if (SYSTEM_TABLES.has(table.toLowerCase()) && role !== 'admin') {
    throw new Error(
      `Acesso negado: a tabela "${table}" pertence à infraestrutura da plataforma e só pode ser acessada por administradores.`,
    )
  }
}

async function broadcastDatabaseEvent(
  c: Context<AppEnv>,
  table: string,
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  data: any,
) {
  try {
    const bindings = await getBindings()
    if (bindings.REALTIME) {
      const channel = `db:${table}`
      const stub = bindings.REALTIME.getByName(channel)
      const message = {
        id: crypto.randomUUID(),
        channel,
        event,
        payload: {
          table,
          event,
          data,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      }

      const broadcastReq = new Request('http://internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      })

      if (c.executionCtx?.waitUntil) {
        c.executionCtx.waitUntil((stub as any).fetch(broadcastReq))
      } else {
        await (stub as any).fetch(broadcastReq)
      }
    }
  } catch (err) {
    console.warn('[Realtime CDC Broadcast Warning]:', err)
  }
}

// REST Data API: Consulta dinâmica com filtros estilo Supabase
dbRoutes.get('/:table', async (c) => {
  const table = c.req.param('table')
  const role = c.get('role')

  try {
    checkTableAccess(table, role)
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: { message: err.message, code: 'FORBIDDEN_TABLE' },
      },
      403,
    )
  }

  const runtime = await getDatabaseRuntime()
  const db = runtime.db

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

  const whereConditions: any[] = []
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

// Obter registro único por ID
dbRoutes.get('/:table/:id', async (c) => {
  const table = c.req.param('table')
  const id = c.req.param('id')
  const role = c.get('role')

  try {
    checkTableAccess(table, role)
    const runtime = await getDatabaseRuntime()
    const query = sql`SELECT * FROM ${sql.raw(`\`${table}\``)} WHERE \`id\` = ${id} LIMIT 1`
    const rows: any[] = await runtime.db.all(query)

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
    const isForbidden = err.message?.includes('Acesso negado')
    return c.json(
      { success: false, error: { code: isForbidden ? 'FORBIDDEN' : 'DB_ERROR', message: err.message } },
      isForbidden ? 403 : 500,
    )
  }
})

// Inserir registro(s) com CDC Broadcast
dbRoutes.post('/:table', requireAuth(), async (c) => {
  const table = c.req.param('table')
  const role = c.get('role')

  try {
    checkTableAccess(table, role)
    const body = await c.req.json()
    const records = Array.isArray(body) ? body : [body]

    if (records.length === 0) {
      return c.json({ success: false, error: { message: 'Nenhum registro para inserir.' } }, 400)
    }

    const runtime = await getDatabaseRuntime()
    const results = []

    for (const record of records) {
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
      const inserted: any[] = await runtime.db.all(insertQuery)
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
    const isForbidden = err.message?.includes('Acesso negado')
    return c.json(
      { success: false, error: { code: isForbidden ? 'FORBIDDEN' : 'DB_INSERT_ERROR', message: err.message } },
      isForbidden ? 403 : 500,
    )
  }
})

// Atualizar registro por ID com CDC Broadcast
dbRoutes.patch('/:table/:id', requireAuth(), async (c) => {
  const table = c.req.param('table')
  const id = c.req.param('id')
  const role = c.get('role')

  try {
    checkTableAccess(table, role)
    const body = await c.req.json()
    const keys = Object.keys(body)

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

    const updateQuery = sql`UPDATE ${sql.raw(`\`${table}\``)} SET ${setClauses} WHERE \`id\` = ${id} RETURNING *`
    const runtime = await getDatabaseRuntime()
    const updated: any[] = await runtime.db.all(updateQuery)

    if (!updated || updated.length === 0) {
      return c.json({ success: false, error: { message: 'Registro não encontrado.' } }, 404)
    }

    const updatedRecord = updated[0]

    // Emissão CDC para o registro atualizado
    await broadcastDatabaseEvent(c, table, 'UPDATE', updatedRecord)

    return c.json({ success: true, data: updatedRecord })
  } catch (err: any) {
    const isForbidden = err.message?.includes('Acesso negado')
    return c.json(
      { success: false, error: { code: isForbidden ? 'FORBIDDEN' : 'DB_UPDATE_ERROR', message: err.message } },
      isForbidden ? 403 : 500,
    )
  }
})

// Deletar registro por ID com CDC Broadcast
dbRoutes.delete('/:table/:id', requireAuth(), async (c) => {
  const table = c.req.param('table')
  const id = c.req.param('id')
  const role = c.get('role')

  try {
    checkTableAccess(table, role)
    const deleteQuery = sql`DELETE FROM ${sql.raw(`\`${table}\``)} WHERE \`id\` = ${id}`
    const runtime = await getDatabaseRuntime()
    await runtime.db.run(deleteQuery)

    // Emissão CDC para o registro deletado
    await broadcastDatabaseEvent(c, table, 'DELETE', { id })

    return c.json({ success: true, message: `Registro removido com sucesso de ${table}`, id })
  } catch (err: any) {
    const isForbidden = err.message?.includes('Acesso negado')
    return c.json(
      { success: false, error: { code: isForbidden ? 'FORBIDDEN' : 'DB_DELETE_ERROR', message: err.message } },
      isForbidden ? 403 : 500,
    )
  }
})
