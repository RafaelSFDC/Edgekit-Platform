import { Hono, type Context } from 'hono'
import { eq, sql, type SQL } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { getDatabaseRuntime, type AppDatabase } from '../db'
import { ekTablePolicies } from '../db/schema'
import { getBindings } from '../env'
import { evaluateTablePolicy, type PolicyEvaluationResult, type CrudAction } from '../policies/engine'
import { dispatchWebhooks } from '../realtime/webhooks'
import { BatchMutationsSchema, StructuredQuerySchema, SAFE_IDENTIFIER } from '../schemas'

export const dbRoutes = new Hono<AppEnv>()

const SYSTEM_TABLES = new Set([
  'users',
  'sessions',
  'accounts',
  'verifications',
  'organizations',
  'members',
  'invitations',
  'two_factors',
  'passkeys',
  'jwks',
  'sqlite_master',
  'sqlite_sequence',
  'drizzle_migrations',
  '_ek_migrations',
  '__d1_migrations',
])

const tableColumnsCache = new Map<string, { columns: Set<string>; cachedAt: number }>()
const CACHE_TTL_MS = 60000

export async function getTableColumns(db: AppDatabase, table: string): Promise<Set<string>> {
  const cached = tableColumnsCache.get(table)
  const now = Date.now()
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.columns
  }

  try {
    const rawInfo: any[] = await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))
    const columns = new Set<string>()
    if (Array.isArray(rawInfo)) {
      for (const col of rawInfo) {
        if (col && typeof col.name === 'string') {
          columns.add(col.name.toLowerCase())
        }
      }
    }
    tableColumnsCache.set(table, { columns, cachedAt: now })
    return columns
  } catch {
    return new Set<string>()
  }
}

export function invalidateTableColumnsCache(table?: string) {
  if (table) {
    tableColumnsCache.delete(table)
  } else {
    tableColumnsCache.clear()
  }
}

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
  const apiKey = c.get('apiKey')
  const isPlatformAdmin =
    Boolean(c.get('admin')) ||
    apiKey?.type === 'service_role' ||
    role === 'service_role'

  // Tabelas de infraestrutura interna (_ek_*) e Better Auth só podem ser lidas via service_role ou admin do painel
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

/**
 * Expande relacionamentos de forma declarativa e parametrizada (PocketBase / Supabase style)
 */
async function expandRelations(
  db: AppDatabase,
  table: string,
  rows: any[],
  expandParam?: string | string[],
): Promise<any[]> {
  if (!rows || rows.length === 0 || !expandParam) return rows

  const requested = Array.isArray(expandParam)
    ? expandParam
    : String(expandParam).split(',').map((s) => s.trim()).filter(Boolean)

  if (requested.length === 0) return rows

  let fkList: Array<{ table: string; from: string; to: string }> = []
  try {
    const rawFks: any = await db.all(sql.raw(`PRAGMA foreign_key_list(\`${table}\`)`))
    if (Array.isArray(rawFks)) {
      fkList = rawFks.map((fk: any) => ({
        table: fk.table,
        from: fk.from,
        to: fk.to || 'id',
      }))
    }
  } catch {}

  for (const exp of requested) {
    const [fromCol, explicitTarget] = exp.split(':')
    if (!SAFE_IDENTIFIER.test(fromCol)) continue

    const knownFk = fkList.find((f) => f.from.toLowerCase() === fromCol.toLowerCase())
    let targetTable = explicitTarget || knownFk?.table
    const targetCol = knownFk?.to || 'id'

    if (!targetTable) {
      if (fromCol.toLowerCase().endsWith('_id')) {
        const base = fromCol.slice(0, -3)
        targetTable = base.endsWith('s') ? base : `${base}s`
      } else {
        targetTable = fromCol
      }
    }

    if (!SAFE_IDENTIFIER.test(targetTable)) continue

    const ids = Array.from(new Set(rows.map((r) => r[fromCol]).filter(Boolean)))
    if (ids.length === 0) continue

    try {
      const relQuery = sql`SELECT * FROM ${sql.raw(`\`${targetTable}\``)} WHERE ${sql.raw(`\`${targetCol}\``)} IN (${sql.join(ids.map((id) => sql`${id}`), sql.raw(', '))})`
      const relRows: any[] = await db.all(relQuery)
      const lookup = new Map<any, any>()
      for (const r of relRows) {
        lookup.set(String(r[targetCol]), r)
      }

      const propName = fromCol.endsWith('_id') ? fromCol.slice(0, -3) : `${fromCol}_data`
      for (const row of rows) {
        const foreignVal = row[fromCol]
        const matched = foreignVal ? lookup.get(String(foreignVal)) || null : null
        row.expand = row.expand || {}
        row.expand[fromCol] = matched
        row[propName] = matched
      }
    } catch {
      // Ignora erro caso tabela alvo não esteja disponível
    }
  }

  return rows
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
      const stub = bindings.REALTIME.getByName('realtime_hub')
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

// REST Data API: Consulta dinâmica com filtros avançados, Policy Engine e Expansão de Relações
dbRoutes.get('/:table', async (c) => {
  const table = c.req.param('table')
  sanitizeIdentifier(table)
  const runtime = await getDatabaseRuntime()
  const db = runtime.db

  const validColumns = await getTableColumns(db, table)

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
  const body: any = {}
  const selectParam = query['select'] || '*'
  const expandParam = query['expand']
  let limitParam = Math.min(Math.max(Number(query['limit']) || 50, 1), 500)
  let offsetParam = Math.max(Number(query['offset']) || 0, 0)
  const orderParam = query['order']

  if (query['range']) {
    const [rFrom, rTo] = query['range'].split('-').map(Number)
    if (!isNaN(rFrom) && !isNaN(rTo)) {
      limitParam = Math.min(Math.max(rTo - rFrom + 1, 1), 500)
      offsetParam = Math.max(rFrom, 0)
    }
  }

  let selectClause = '*'
  if (selectParam !== '*') {
    const cols = selectParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (cols.length === 0) {
      return c.json({ success: false, error: { code: 'INVALID_SELECT', message: 'Parâmetro select vazio.' } }, 400)
    }
    if (expandParam) {
      const expandList = Array.isArray(expandParam)
        ? expandParam
        : String(expandParam).split(',').map((s) => s.trim()).filter(Boolean)
      for (const exp of expandList) {
        const fromCol = exp.split(':')[0]
        if (SAFE_IDENTIFIER.test(fromCol) && !cols.includes(fromCol)) {
          cols.push(fromCol)
        }
      }
    }
    for (const col of cols) {
      if (!SAFE_IDENTIFIER.test(col)) {
        return c.json({ success: false, error: { code: 'INVALID_IDENTIFIER', message: `Coluna inválida: "${col}".` } }, 400)
      }
      if (validColumns.size > 0 && !validColumns.has(col.toLowerCase())) {
        return c.json({ success: false, error: { code: 'INVALID_COLUMN', message: `A coluna "${col}" não existe na tabela "${table}".` } }, 400)
      }
    }
    selectClause = cols.map((col) => `\`${col}\``).join(', ')
  }

  const whereConditions: SQL[] = []

  // Injeta condição compilada pela Policy Engine (ex: owner = userId, org = orgId)
  if (policyResult.whereCondition) {
    whereConditions.push(policyResult.whereCondition)
  }

  const reservedParams = new Set(['select', 'limit', 'offset', 'order', 'apikey', 'expand', 'single', 'range', 'or'])

  for (const [key, value] of Object.entries(query)) {
    if (reservedParams.has(key) || value === undefined || value === '') continue

    if (!SAFE_IDENTIFIER.test(key)) {
      return c.json({ success: false, error: { code: 'INVALID_IDENTIFIER', message: `Identificador de coluna inválido: "${key}".` } }, 400)
    }

    if (validColumns.size > 0 && !validColumns.has(key.toLowerCase())) {
      return c.json({ success: false, error: { code: 'INVALID_COLUMN', message: `A coluna "${key}" não existe na tabela "${table}".` } }, 400)
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
    } else if (value.startsWith('ilike:')) {
      whereConditions.push(sql`LOWER(${colIdentifier}) LIKE LOWER(${value.slice(6)})`)
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
    } else if (value.startsWith('is:')) {
      const isVal = value.slice(3).toLowerCase()
      if (isVal === 'null') {
        whereConditions.push(sql`${colIdentifier} IS NULL`)
      } else if (isVal === 'not_null' || isVal === 'not.null') {
        whereConditions.push(sql`${colIdentifier} IS NOT NULL`)
      } else if (isVal === 'true') {
        whereConditions.push(sql`${colIdentifier} = 1`)
      } else if (isVal === 'false') {
        whereConditions.push(sql`${colIdentifier} = 0`)
      } else {
        whereConditions.push(sql`${colIdentifier} = ${value.slice(3)}`)
      }
    } else if (value.startsWith('between:')) {
      const [bMin, bMax] = value.slice(8).split(',')
      whereConditions.push(sql`${colIdentifier} BETWEEN ${bMin} AND ${bMax}`)
    } else if (value.startsWith('contains:')) {
      const cVal = value.slice(9)
      whereConditions.push(sql`${colIdentifier} LIKE ${`%${cVal}%`}`)
    } else if (value.startsWith('contained_by:') || value.startsWith('containedBy:')) {
      const cVal = value.startsWith('contained_by:') ? value.slice(13) : value.slice(12)
      whereConditions.push(sql`${colIdentifier} LIKE ${`%${cVal}%`}`)
    } else if (value.startsWith('overlaps:')) {
      const oItems = value.slice(9).split(',').map((s) => s.trim()).filter(Boolean)
      if (oItems.length > 0) {
        const oConds = oItems.map((item) => sql`${colIdentifier} LIKE ${`%${item}%`}`)
        whereConditions.push(sql`(${sql.join(oConds, sql.raw(' OR '))})`)
      }
    } else if (value.startsWith('not:')) {
      const notRest = value.slice(4)
      const colonIdx = notRest.indexOf(':')
      if (colonIdx > 0) {
        const subOp = notRest.slice(0, colonIdx)
        const subVal = notRest.slice(colonIdx + 1)
        if (subOp === 'eq') whereConditions.push(sql`${colIdentifier} != ${subVal}`)
        else if (subOp === 'like') whereConditions.push(sql`${colIdentifier} NOT LIKE ${subVal}`)
        else if (subOp === 'ilike') whereConditions.push(sql`LOWER(${colIdentifier}) NOT LIKE LOWER(${subVal})`)
        else whereConditions.push(sql`NOT (${colIdentifier} = ${subVal})`)
      }
    } else {
      whereConditions.push(sql`${colIdentifier} = ${value}`)
    }
  }

  if (query['or']) {
    const parts = query['or'].split(',').map((s) => s.trim()).filter(Boolean)
    const orConditions: SQL[] = []
    for (const p of parts) {
      const dotParts = p.split('.')
      if (dotParts.length >= 3) {
        const [f, o, ...vParts] = dotParts
        const v = vParts.join('.')
        if (SAFE_IDENTIFIER.test(f) && (validColumns.size === 0 || validColumns.has(f.toLowerCase()))) {
          const fCol = sql.raw(`\`${f}\``)
          if (o === 'eq') orConditions.push(sql`${fCol} = ${v}`)
          else if (o === 'neq') orConditions.push(sql`${fCol} != ${v}`)
          else if (o === 'gt') orConditions.push(sql`${fCol} > ${v}`)
          else if (o === 'gte') orConditions.push(sql`${fCol} >= ${v}`)
          else if (o === 'lt') orConditions.push(sql`${fCol} < ${v}`)
          else if (o === 'lte') orConditions.push(sql`${fCol} <= ${v}`)
          else if (o === 'like') orConditions.push(sql`${fCol} LIKE ${v}`)
          else if (o === 'ilike') orConditions.push(sql`LOWER(${fCol}) LIKE LOWER(${v})`)
        }
      }
    }
    if (orConditions.length > 0) {
      whereConditions.push(sql`(${sql.join(orConditions, sql.raw(' OR '))})`)
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
    if (!SAFE_IDENTIFIER.test(orderCol)) {
      return c.json({ success: false, error: { code: 'INVALID_IDENTIFIER', message: `Identificador de coluna inválido na ordenação: "${orderCol}".` } }, 400)
    }
    if (validColumns.size > 0 && !validColumns.has(orderCol.toLowerCase())) {
      return c.json({ success: false, error: { code: 'INVALID_COLUMN', message: `A coluna de ordenação "${orderCol}" não existe na tabela "${table}".` } }, 400)
    }
    const dir = (orderDir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
    queryChunks.push(sql.raw(` ORDER BY \`${orderCol}\` ${dir}`))
  }

  queryChunks.push(sql` LIMIT ${limitParam} OFFSET ${offsetParam}`)

  try {
    const finalSql = sql.join(queryChunks, sql.raw(''))
    const finalCountSql = sql.join(countChunks, sql.raw(''))

    const [rawRows, countResult]: [any[], any] = await Promise.all([
      db.all(finalSql),
      db.all(finalCountSql),
    ])

    const total = countResult?.[0]?.total ?? rawRows.length
    const rows = await expandRelations(db, table, rawRows, expandParam)

    if (body.single === true || c.req.query('single') === 'true') {
      if (rows.length === 0) {
        return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'JSON object requested, multiple (or no) rows returned' } }, 404)
      }
      if (rows.length > 1) {
        return c.json({ success: false, error: { code: 'MULTIPLE_ROWS', message: 'JSON object requested, multiple rows returned' } }, 406)
      }
      return c.json({ success: true, data: rows[0] })
    }

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

// Endpoint Declarativo Estruturado de Consulta (Zero-Raw SQL no Frontend)
dbRoutes.post('/:table/query', async (c) => {
  const table = c.req.param('table')
  sanitizeIdentifier(table)
  const runtime = await getDatabaseRuntime()
  const db = runtime.db

  const validColumns = await getTableColumns(db, table)

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

  const rawBody = await c.req.json().catch(() => ({}))
  const parsed = StructuredQuerySchema.safeParse(rawBody)
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_QUERY_SPEC',
          message: parsed.error.errors[0]?.message || 'Estrutura de consulta declarativa inválida.',
        },
      },
      400,
    )
  }

  const body = parsed.data
  const rawSelect = body.select || body.columns
  const selectArr: string[] = Array.isArray(rawSelect)
    ? rawSelect
    : (typeof rawSelect === 'string' && rawSelect !== '*'
      ? rawSelect.split(',').map((s) => s.trim()).filter(Boolean)
      : [])
  const whereArr = body.where || []
  const expandParam = body.expand
  const limitParam = Math.min(Math.max(Number(body.limit) || 50, 1), 500)
  const offsetParam = Math.max(Number(body.offset) || 0, 0)
  const orderByArr = body.orderBy || []

  let selectClause = '*'
  if (selectArr.length > 0) {
    if (expandParam) {
      const expandList = Array.isArray(expandParam)
        ? expandParam
        : (typeof expandParam === 'string' ? expandParam.split(',').map((s) => s.trim()).filter(Boolean) : [])
      for (const exp of expandList) {
        const fromCol = exp.split(':')[0]
        if (SAFE_IDENTIFIER.test(fromCol) && !selectArr.includes(fromCol)) {
          selectArr.push(fromCol)
        }
      }
    }
    for (const col of selectArr) {
      if (!SAFE_IDENTIFIER.test(col)) {
        return c.json({ success: false, error: { code: 'INVALID_IDENTIFIER', message: `Coluna inválida: "${col}".` } }, 400)
      }
      if (validColumns.size > 0 && !validColumns.has(col.toLowerCase())) {
        return c.json({ success: false, error: { code: 'INVALID_COLUMN', message: `A coluna "${col}" não existe na tabela "${table}".` } }, 400)
      }
    }
    selectClause = selectArr.map((col) => `\`${col}\``).join(', ')
  }

  const whereConditions: SQL[] = []
  if (policyResult.whereCondition) {
    whereConditions.push(policyResult.whereCondition)
  }

  for (const item of whereArr) {
    if (!item.field || !SAFE_IDENTIFIER.test(item.field)) {
      return c.json({ success: false, error: { code: 'INVALID_IDENTIFIER', message: `Campo de filtro inválido: "${item.field}".` } }, 400)
    }
    if (validColumns.size > 0 && !validColumns.has(item.field.toLowerCase())) {
      return c.json({ success: false, error: { code: 'INVALID_COLUMN', message: `A coluna de filtro "${item.field}" não existe na tabela "${table}".` } }, 400)
    }

    const colIdentifier = sql.raw(`\`${item.field}\``)
    const op = (item.op || 'eq').toLowerCase()
    const val = item.value

    switch (op) {
      case 'eq':
        whereConditions.push(sql`${colIdentifier} = ${val}`)
        break
      case 'neq':
        whereConditions.push(sql`${colIdentifier} != ${val}`)
        break
      case 'gt':
        whereConditions.push(sql`${colIdentifier} > ${val}`)
        break
      case 'gte':
        whereConditions.push(sql`${colIdentifier} >= ${val}`)
        break
      case 'lt':
        whereConditions.push(sql`${colIdentifier} < ${val}`)
        break
      case 'lte':
        whereConditions.push(sql`${colIdentifier} <= ${val}`)
        break
      case 'like':
        whereConditions.push(sql`${colIdentifier} LIKE ${val}`)
        break
      case 'ilike':
        whereConditions.push(sql`LOWER(${colIdentifier}) LIKE LOWER(${val})`)
        break
      case 'in': {
        const items = Array.isArray(val) ? val : [val]
        if (items.length > 0) {
          whereConditions.push(sql`${colIdentifier} IN (${sql.join(items.map((i) => sql`${i}`), sql.raw(', '))})`)
        }
        break
      }
      case 'not_in': {
        const items = Array.isArray(val) ? val : [val]
        if (items.length > 0) {
          whereConditions.push(sql`${colIdentifier} NOT IN (${sql.join(items.map((i) => sql`${i}`), sql.raw(', '))})`)
        }
        break
      }
      case 'is':
        if (val === null || val === 'null') {
          whereConditions.push(sql`${colIdentifier} IS NULL`)
        } else if (val === true || val === 'true') {
          whereConditions.push(sql`${colIdentifier} = 1`)
        } else if (val === false || val === 'false') {
          whereConditions.push(sql`${colIdentifier} = 0`)
        } else {
          whereConditions.push(sql`${colIdentifier} = ${val}`)
        }
        break
      case 'is_null':
        whereConditions.push(sql`${colIdentifier} IS NULL`)
        break
      case 'is_not_null':
        whereConditions.push(sql`${colIdentifier} IS NOT NULL`)
        break
      case 'between': {
        const [bMin, bMax] = Array.isArray(val) ? val : String(val).split(',')
        whereConditions.push(sql`${colIdentifier} BETWEEN ${bMin} AND ${bMax}`)
        break
      }
      case 'contains':
        whereConditions.push(sql`${colIdentifier} LIKE ${`%${val}%`}`)
        break
      case 'containedby':
      case 'contained_by':
        whereConditions.push(sql`${colIdentifier} LIKE ${`%${val}%`}`)
        break
      case 'overlaps': {
        const oItems = Array.isArray(val) ? val : String(val).split(',').map((s) => s.trim()).filter(Boolean)
        if (oItems.length > 0) {
          const oConds = oItems.map((item) => sql`${colIdentifier} LIKE ${`%${item}%`}`)
          whereConditions.push(sql`(${sql.join(oConds, sql.raw(' OR '))})`)
        }
        break
      }
      case 'not':
        whereConditions.push(sql`NOT (${colIdentifier} = ${val})`)
        break
      default:
        whereConditions.push(sql`${colIdentifier} = ${val}`)
        break
    }
  }

  const queryChunks = [sql.raw(`SELECT ${selectClause} FROM \`${table}\``)]
  const countChunks = [sql.raw(`SELECT COUNT(*) as total FROM \`${table}\``)]

  if (whereConditions.length > 0) {
    const whereJoined = sql.join(whereConditions, sql.raw(' AND '))
    queryChunks.push(sql.raw(' WHERE '), whereJoined)
    countChunks.push(sql.raw(' WHERE '), whereJoined)
  }

  if (orderByArr.length > 0) {
    for (const o of orderByArr) {
      if (!SAFE_IDENTIFIER.test(o.field)) {
        return c.json({ success: false, error: { code: 'INVALID_IDENTIFIER', message: `Campo de ordenação inválido: "${o.field}".` } }, 400)
      }
      if (validColumns.size > 0 && !validColumns.has(o.field.toLowerCase())) {
        return c.json({ success: false, error: { code: 'INVALID_COLUMN', message: `A coluna de ordenação "${o.field}" não existe na tabela "${table}".` } }, 400)
      }
    }
    const orderSqlParts = orderByArr.map((o) => {
      const dir = (o.direction || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
      return sql.raw(`\`${o.field}\` ${dir}`)
    })
    queryChunks.push(sql.raw(' ORDER BY '), sql.join(orderSqlParts, sql.raw(', ')))
  }

  queryChunks.push(sql` LIMIT ${limitParam} OFFSET ${offsetParam}`)

  try {
    const finalSql = sql.join(queryChunks, sql.raw(''))
    const finalCountSql = sql.join(countChunks, sql.raw(''))

    const [rawRows, countResult]: [any[], any] = await Promise.all([
      db.all(finalSql),
      db.all(finalCountSql),
    ])

    const total = countResult?.[0]?.total ?? rawRows.length
    const rows = await expandRelations(db, table, rawRows, expandParam)

    if (body.single === true || c.req.query('single') === 'true') {
      if (rows.length === 0) {
        return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'JSON object requested, multiple (or no) rows returned' } }, 404)
      }
      if (rows.length > 1) {
        return c.json({ success: false, error: { code: 'MULTIPLE_ROWS', message: 'JSON object requested, multiple rows returned' } }, 406)
      }
      return c.json({ success: true, data: rows[0] })
    }

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
        error: { code: 'DB_QUERY_ERROR', message: err.message },
      },
      500,
    )
  }
})

// Obter registro único por ID com Policy Engine e Expansão de Relações
dbRoutes.get('/:table/:id', async (c) => {
  const table = c.req.param('table')
  const id = c.req.param('id')
  const expandParam = c.req.query('expand')
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

    const rawRows: any[] = await db.all(query)
    if (!rawRows || rawRows.length === 0) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Registro não encontrado na tabela ${table}` },
        },
        404,
      )
    }

    const rows = await expandRelations(db, table, rawRows, expandParam)
    return c.json({ success: true, data: rows[0] })
  } catch (err: any) {
    const isForbidden = err.message?.includes('Acesso negado') || err.message?.includes('Acesso restrito')
    return c.json(
      { success: false, error: { code: isForbidden ? 'FORBIDDEN' : 'DB_ERROR', message: err.message } },
      isForbidden ? 403 : 500,
    )
  }
})

async function executeBatchQueries(db: AppDatabase, queries: SQL[]): Promise<any[]> {
  if (queries.length === 0) return []
  if (typeof (db as any).batch === 'function') {
    return await (db as any).batch(queries)
  }
  if (typeof (db as any).transaction === 'function') {
    return (db as any).transaction((tx: any) => {
      const results: any[] = []
      for (const q of queries) {
        try {
          results.push(tx.all(q))
        } catch {
          results.push(tx.run(q))
        }
      }
      return results
    })
  }

  // Fallback atômico SQLite via BEGIN TRANSACTION / COMMIT / ROLLBACK
  await db.run(sql.raw('BEGIN TRANSACTION'))
  try {
    const results: any[] = []
    for (const q of queries) {
      try {
        results.push(await db.all(q))
      } catch {
        results.push(await db.run(q))
      }
    }
    await db.run(sql.raw('COMMIT'))
    return results
  } catch (err) {
    try {
      await db.run(sql.raw('ROLLBACK'))
    } catch {}
    throw err
  }
}

// Mutações Atômicas Transacionais em Lote (Batch API com db.batch e Anti-Hijack Guardrail)
dbRoutes.post('/batch', async (c) => {
  const runtime = await getDatabaseRuntime()
  const db = runtime.db

  const rawBody = await c.req.json().catch(() => ({}))
  const parsed = BatchMutationsSchema.safeParse(
    rawBody.operations || rawBody.mutations ? { operations: rawBody.operations || rawBody.mutations } : rawBody,
  )

  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_BATCH_INPUT',
          message: parsed.error.errors[0]?.message || 'Informe a lista de operações no campo "operations".',
        },
      },
      400,
    )
  }

  const operations = parsed.data.operations

  try {
    const queries: SQL[] = []
    const opsMeta: Array<{ type: 'insert' | 'update' | 'delete'; table: string; record: any }> = []

    for (const op of operations) {
      const table = sanitizeIdentifier(op.table)
      const action = op.type.toLowerCase() as CrudAction
      const access = await resolveTableAccessWithEngine(db, table, c, action)
      const isPlatformAdmin = Boolean(access.bypass)
      const validCols = await getTableColumns(db, table)

      if (action === 'insert') {
        const record = { ...op.data }
        if (access.injectValues) {
          Object.assign(record, access.injectValues)
        }
        if (!record.id) {
          record.id = crypto.randomUUID()
        }
        const keys = Object.keys(record)
        for (const k of keys) {
          sanitizeIdentifier(k)
          if (validCols.size > 0 && !validCols.has(k.toLowerCase())) {
            return c.json({ success: false, error: { code: 'INVALID_COLUMN', message: `Coluna "${k}" não existe na tabela "${table}".` } }, 400)
          }
        }
        const columnsSql = sql.raw(keys.map((k) => `\`${k}\``).join(', '))
        const valuesSql = sql.join(
          keys.map((k) => sql`${record[k]}`),
          sql.raw(', '),
        )
        queries.push(
          sql`INSERT INTO ${sql.raw(`\`${table}\``)} (${columnsSql}) VALUES (${valuesSql}) RETURNING *`,
        )
        opsMeta.push({ type: 'insert', table, record })
      } else if (action === 'update') {
        const id = op.id || op.data?.id
        if (!id) {
          throw new Error('ID é obrigatório para operações de update em lote.')
        }
        const data = { ...op.data }
        delete data.id

        // Anti-Hijacking Guardrail: Não permite que usuários comuns alterem o autor/organização
        if (!isPlatformAdmin) {
          delete data['user_id']
          delete data['organization_id']
          if (access.injectValues) {
            for (const k of Object.keys(access.injectValues)) {
              delete data[k]
            }
          }
        }

        const keys = Object.keys(data)
        for (const k of keys) {
          sanitizeIdentifier(k)
          if (validCols.size > 0 && !validCols.has(k.toLowerCase())) {
            return c.json({ success: false, error: { code: 'INVALID_COLUMN', message: `Coluna "${k}" não existe na tabela "${table}".` } }, 400)
          }
        }
        const setClauses = sql.join(
          keys.map((k) => sql`${sql.raw(`\`${k}\``)} = ${data[k]}`),
          sql.raw(', '),
        )
        const whereConditions = [sql`\`id\` = ${id}`]
        if (access.whereCondition) {
          whereConditions.push(access.whereCondition)
        }
        const whereClause = sql.join(whereConditions, sql.raw(' AND '))
        queries.push(
          sql`UPDATE ${sql.raw(`\`${table}\``)} SET ${setClauses} WHERE ${whereClause} RETURNING *`,
        )
        opsMeta.push({ type: 'update', table, record: { id, ...data } })
      } else if (action === 'delete') {
        const id = op.id
        if (!id) {
          throw new Error('ID é obrigatório para operações de delete em lote.')
        }
        const whereConditions = [sql`\`id\` = ${id}`]
        if (access.whereCondition) {
          whereConditions.push(access.whereCondition)
        }
        const whereClause = sql.join(whereConditions, sql.raw(' AND '))
        queries.push(sql`DELETE FROM ${sql.raw(`\`${table}\``)} WHERE ${whereClause} RETURNING *`)
        opsMeta.push({ type: 'delete', table, record: { id } })
      }
    }

    const rawResults = await executeBatchQueries(db, queries)

    // Emissão CDC para cada registro modificado
    for (let i = 0; i < opsMeta.length; i++) {
      const meta = opsMeta[i]
      const resRow = rawResults[i]?.[0] || meta.record
      await broadcastDatabaseEvent(c, meta.table, meta.type.toUpperCase() as any, resRow)
    }

    return c.json(
      {
        success: true,
        data: rawResults.map((r) => (Array.isArray(r) ? r[0] : r)),
        count: operations.length,
      },
      200,
    )
  } catch (err: any) {
    const isForbidden = err.message?.includes('Acesso negado') || err.message?.includes('Acesso restrito')
    return c.json(
      { success: false, error: { code: isForbidden ? 'FORBIDDEN' : 'BATCH_ERROR', message: err.message } },
      isForbidden ? 403 : 500,
    )
  }
})

// Inserir registro(s) com Policy Engine, mutação atômica em lote e CDC Broadcast
dbRoutes.post('/:table', async (c) => {
  const table = c.req.param('table')
  sanitizeIdentifier(table)
  const runtime = await getDatabaseRuntime()
  const db = runtime.db
  const validCols = await getTableColumns(db, table)

  try {
    const access = await resolveTableAccessWithEngine(db, table, c, 'insert')

    const body = await c.req.json().catch(() => ({}))
    const records = Array.isArray(body) ? body : [body]

    if (records.length === 0 || !records[0] || typeof records[0] !== 'object') {
      return c.json({ success: false, error: { message: 'Nenhum registro para inserir.' } }, 400)
    }

    const queries: SQL[] = []
    const preparedRecords: any[] = []

    for (const record of records) {
      const row = { ...record }
      if (access.injectValues) {
        Object.assign(row, access.injectValues)
      }
      if (!row.id) {
        row.id = crypto.randomUUID()
      }

      const keys = Object.keys(row)
      for (const k of keys) {
        sanitizeIdentifier(k)
        if (validCols.size > 0 && !validCols.has(k.toLowerCase())) {
          return c.json({ success: false, error: { code: 'INVALID_COLUMN', message: `Coluna "${k}" não existe na tabela "${table}".` } }, 400)
        }
      }

      const columnsSql = sql.raw(keys.map((k) => `\`${k}\``).join(', '))
      const valuesSql = sql.join(
        keys.map((k) => sql`${row[k]}`),
        sql.raw(', '),
      )

      queries.push(
        sql`INSERT INTO ${sql.raw(`\`${table}\``)} (${columnsSql}) VALUES (${valuesSql}) RETURNING *`,
      )
      preparedRecords.push(row)
    }

    const rawBatch = await executeBatchQueries(db, queries)
    const results = rawBatch.map((resArr, idx) => (Array.isArray(resArr) ? resArr[0] : resArr) || preparedRecords[idx])

    for (const item of results) {
      await broadcastDatabaseEvent(c, table, 'INSERT', item)
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

// Atualizar registro por ID com Anti-Hijack Guardrail, Policy Engine e CDC Broadcast
dbRoutes.patch('/:table/:id', async (c) => {
  const table = c.req.param('table')
  sanitizeIdentifier(table)
  const id = c.req.param('id')
  const runtime = await getDatabaseRuntime()
  const db = runtime.db
  const validCols = await getTableColumns(db, table)

  try {
    const access = await resolveTableAccessWithEngine(db, table, c, 'update')
    const isPlatformAdmin = Boolean(access.bypass)

    const body = await c.req.json().catch(() => ({}))
    const data = { ...body }
    delete data.id

    // Anti-Hijacking Guardrail: Não permite que usuários comuns alterem o autor/organização
    if (!isPlatformAdmin) {
      delete data['user_id']
      delete data['organization_id']
      if (access.injectValues) {
        for (const k of Object.keys(access.injectValues)) {
          delete data[k]
        }
      }
    }

    const keys = Object.keys(data)
    if (keys.length === 0) {
      return c.json({ success: false, error: { message: 'Campos vazios para atualização.' } }, 400)
    }

    for (const k of keys) {
      sanitizeIdentifier(k)
      if (validCols.size > 0 && !validCols.has(k.toLowerCase())) {
        return c.json({ success: false, error: { code: 'INVALID_COLUMN', message: `Coluna "${k}" não existe na tabela "${table}".` } }, 400)
      }
    }

    const setClauses = sql.join(
      keys.map((k) => sql`${sql.raw(`\`${k}\``)} = ${data[k]}`),
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
