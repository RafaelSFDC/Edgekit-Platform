import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { getDatabaseRuntime } from '../db'
import { requireAuth } from '../auth/middleware'

export const dbRoutes = new Hono<AppEnv>()

const SAFE_IDENTIFIER = /^[a-zA-Z0-9_]+$/

function sanitizeIdentifier(name: string): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Identificador inválido: "${name}"`)
  }
  return name
}

// REST Data API: Consulta dinâmica com filtros estilo Supabase
dbRoutes.get('/:table', async (c) => {
  const table = c.req.param('table')
  try {
    sanitizeIdentifier(table)
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message, code: 'INVALID_TABLE' } }, 400)
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

  try {
    sanitizeIdentifier(table)
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
    return c.json({ success: false, error: { code: 'DB_ERROR', message: err.message } }, 500)
  }
})

// Inserir registro(s)
dbRoutes.post('/:table', requireAuth(), async (c) => {
  const table = c.req.param('table')
  try {
    sanitizeIdentifier(table)
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
      results.push(inserted[0] || record)
    }

    return c.json(
      {
        success: true,
        data: Array.isArray(body) ? results : results[0],
      },
      201,
    )
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'DB_INSERT_ERROR', message: err.message } }, 500)
  }
})

// Atualizar registro por ID
dbRoutes.patch('/:table/:id', requireAuth(), async (c) => {
  const table = c.req.param('table')
  const id = c.req.param('id')

  try {
    sanitizeIdentifier(table)
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

    return c.json({ success: true, data: updated[0] })
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'DB_UPDATE_ERROR', message: err.message } }, 500)
  }
})

// Deletar registro por ID
dbRoutes.delete('/:table/:id', requireAuth(), async (c) => {
  const table = c.req.param('table')
  const id = c.req.param('id')

  try {
    sanitizeIdentifier(table)
    const deleteQuery = sql`DELETE FROM ${sql.raw(`\`${table}\``)} WHERE \`id\` = ${id}`
    const runtime = await getDatabaseRuntime()
    await runtime.db.run(deleteQuery)

    return c.json({ success: true, message: `Registro removido com sucesso de ${table}` })
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'DB_DELETE_ERROR', message: err.message } }, 500)
  }
})
