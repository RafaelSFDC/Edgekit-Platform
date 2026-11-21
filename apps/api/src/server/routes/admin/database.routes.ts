import { Hono } from 'hono'
import { count, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AppEnv } from '../../types'
import { getDb } from '../../db'
import { ekTablePolicies, ekStorageObjects, users } from '../../db/schema'
import { requireAdmin } from '../../auth/middleware'
import { invalidateTableColumnsCache } from '../db.routes'

export const databaseRoutes = new Hono<AppEnv>()

const SAFE_NAME = /^[a-zA-Z0-9_]+$/
const ALLOWED_SQL_TYPES = new Set(['TEXT', 'INTEGER', 'REAL', 'BLOB', 'JSON'])
const PROTECTED_SYSTEM_TABLES = new Set([
  '_ek_admins',
  '_ek_admin_sessions',
  '_ek_admin_invites',
  '_ek_api_keys',
  '_ek_table_policies',
  '_ek_storage_buckets',
  '_ek_storage_objects',
  '_ek_webhooks',
  '_ek_audit_logs',
  '_ek_settings',
  '_ek_migrations',
  'drizzle_migrations',
  'sqlite_master',
  'sqlite_sequence',
])

function mapSqliteTypeToTs(type: string): string {
  const t = (type || 'TEXT').toUpperCase()
  if (t.includes('INT')) return 'number'
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUB')) return 'number'
  if (t.includes('BOOL')) return 'boolean'
  if (t.includes('BLOB')) return 'Uint8Array'
  if (t.includes('JSON')) return 'any'
  return 'string'
}

// Estatísticas e Painel
databaseRoutes.get('/stats', requireAdmin(), async (c) => {
  const db = await getDb()

  let filesCount = 0
  try {
    const filesCountRes = await db.select({ count: count() }).from(ekStorageObjects).get()
    filesCount = filesCountRes?.count ?? 0
  } catch {}

  const usersCountRes = await db.select({ count: count() }).from(users).get()

  // Lista tabelas de usuário (ocultando tabelas internas da plataforma e do SQLite)
  const tablesRes: any[] = await db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_ek_%' AND name NOT LIKE 'drizzle_%'`,
  )

  return c.json({
    success: true,
    data: {
      totalUsers: usersCountRes?.count ?? 0,
      totalFiles: filesCount,
      totalTables: tablesRes.length,
    },
  })
})

// Listar tabelas disponíveis para o desenvolvedor
databaseRoutes.get('/tables', requireAdmin(), async (c) => {
  const db = await getDb()
  const rows: any = await db.all(
    sql`SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_ek_%' AND name NOT LIKE 'drizzle_%' ORDER BY name ASC`,
  )

  const tablesWithCounts = await Promise.all(
    rows.map(async (r: any) => {
      try {
        const countRes: any = await db.all(sql.raw(`SELECT COUNT(*) as c FROM \`${r.name}\``))
        return {
          name: r.name,
          sql: r.sql,
          rowCount: countRes?.[0]?.c ?? 0,
        }
      } catch {
        return { name: r.name, sql: r.sql, rowCount: 0 }
      }
    }),
  )

  return c.json({ success: true, data: tablesWithCounts })
})

// Gerador de tipos TypeScript a partir do schema (Seção 16.1)
databaseRoutes.get('/schema/types', requireAdmin(), async (c) => {
  const db = await getDb()
  const rows: any[] = await db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_ek_%' AND name NOT LIKE 'drizzle_%' ORDER BY name ASC`,
  )

  let output = `/**\n * Edgekit Platform — Tipagens TypeScript Geradas Automaticamente (Seção 16.1)\n * Gerado em: ${new Date().toISOString()}\n */\n\n`
  output += `export interface DatabaseSchema {\n`
  for (const { name } of rows) {
    output += `  ${name}: {\n`
    output += `    Row: ${name}Row\n`
    output += `    Insert: ${name}Insert\n`
    output += `    Update: ${name}Update\n`
    output += `  }\n`
  }
  output += `}\n\n`

  for (const { name } of rows) {
    const columns: any[] = await db.all(sql.raw(`PRAGMA table_info(\`${name}\`)`))
    output += `export interface ${name}Row {\n`
    for (const col of columns) {
      const tsType = mapSqliteTypeToTs(col.type)
      const nullable = col.notnull === 0 ? ' | null' : ''
      output += `  ${col.name}: ${tsType}${nullable}\n`
    }
    output += `}\n\n`

    output += `export interface ${name}Insert {\n`
    for (const col of columns) {
      const tsType = mapSqliteTypeToTs(col.type)
      const optional = col.pk === 1 || col.dflt_value !== null || col.notnull === 0 ? '?' : ''
      const nullable = col.notnull === 0 ? ' | null' : ''
      output += `  ${col.name}${optional}: ${tsType}${nullable}\n`
    }
    output += `}\n\n`

    output += `export interface ${name}Update {\n`
    for (const col of columns) {
      const tsType = mapSqliteTypeToTs(col.type)
      output += `  ${col.name}?: ${tsType} | null\n`
    }
    output += `}\n\n`
  }

  return c.json({ success: true, data: { typescript: output } })
})

// Criar nova tabela visualmente
databaseRoutes.post('/tables', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const tableName = (body.name || '').trim()

  if (!SAFE_NAME.test(tableName)) {
    return c.json({ success: false, error: { message: `Nome de tabela inválido: "${tableName}"` } }, 400)
  }

  if (tableName.startsWith('_ek_') || PROTECTED_SYSTEM_TABLES.has(tableName.toLowerCase())) {
    return c.json({ success: false, error: { message: `O nome "${tableName}" é reservado pela plataforma.` } }, 400)
  }

  const columns = Array.isArray(body.columns) ? body.columns : []
  if (columns.length === 0) {
    return c.json({ success: false, error: { message: 'A tabela deve conter ao menos uma coluna.' } }, 400)
  }

  const colDefinitions: string[] = []
  const fkConstraints: string[] = []
  let hasPrimaryKey = false

  for (const col of columns) {
    const colName = (col.name || '').trim()
    const colType = (col.type || 'TEXT').toUpperCase()

    if (!SAFE_NAME.test(colName)) {
      return c.json({ success: false, error: { message: `Nome de coluna inválido: "${colName}"` } }, 400)
    }

    if (!ALLOWED_SQL_TYPES.has(colType)) {
      return c.json({ success: false, error: { message: `Tipo de dado SQL não suportado: "${colType}"` } }, 400)
    }

    const typeKeyword = colType === 'JSON' ? 'TEXT' : colType
    let def = `\`${colName}\` ${typeKeyword}`

    if (col.primaryKey) {
      def += ' PRIMARY KEY'
      hasPrimaryKey = true
    }
    if (col.notNull) {
      def += ' NOT NULL'
    }
    if (col.unique) {
      def += ' UNIQUE'
    }
    if (col.defaultValue !== undefined && col.defaultValue !== '') {
      def += ` DEFAULT ${col.defaultValue}`
    }

    colDefinitions.push(def)

    const rel = col.relation || col.references
    if (rel && typeof rel === 'object') {
      const targetTable = (rel.targetTable || rel.table || '').trim()
      const targetCol = (rel.targetColumn || rel.column || 'id').trim()
      const onDelete = (rel.onDelete || 'CASCADE').toUpperCase()
      const validActions = new Set(['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION'])
      const safeAction = validActions.has(onDelete) ? onDelete : 'CASCADE'

      if (SAFE_NAME.test(targetTable) && SAFE_NAME.test(targetCol)) {
        fkConstraints.push(
          `FOREIGN KEY (\`${colName}\`) REFERENCES \`${targetTable}\`(\`${targetCol}\`) ON DELETE ${safeAction}`,
        )
      }
    }
  }

  if (!hasPrimaryKey) {
    colDefinitions.unshift('`id` TEXT PRIMARY KEY NOT NULL')
  }

  const allDefinitions = [...colDefinitions, ...fkConstraints]
  const createTableSql = `CREATE TABLE \`${tableName}\` (\n  ${allDefinitions.join(',\n  ')}\n);`
  const db = await getDb()

  try {
    await db.run(sql.raw(createTableSql))

    // Inicializa com política fechada por padrão (Deny-by-Default)
    const detectedOwner =
      columns.find((col: any) =>
        ['user_id', 'userid', 'author_id', 'owner_id', 'created_by'].includes((col.name || '').toLowerCase()),
      )?.name || 'user_id'

    const now = new Date()
    await db.insert(ekTablePolicies).values({
      id: nanoid(),
      tableName,
      rlsEnabled: true,
      selectRule: 'disabled',
      insertRule: 'disabled',
      updateRule: 'disabled',
      deleteRule: 'disabled',
      ownerColumn: detectedOwner,
      createdAt: now,
      updatedAt: now,
    })

    invalidateTableColumnsCache(tableName)

    return c.json(
      {
        success: true,
        message: `Tabela "${tableName}" criada com sucesso!`,
        sql: createTableSql,
      },
      201,
    )
  } catch (err: any) {
    return c.json({ success: false, error: { message: `Falha ao criar tabela: ${err.message}` } }, 500)
  }
})

// Obter esquema e relacionamentos de uma tabela (Declarativo)
databaseRoutes.get('/tables/:name/schema', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()
  if (!SAFE_NAME.test(tableName)) {
    return c.json({ success: false, error: { message: 'Nome de tabela inválido.' } }, 400)
  }

  const db = await getDb()
  try {
    const columns: any[] = await db.all(sql.raw(`PRAGMA table_info(\`${tableName}\`)`))
    const foreignKeys: any[] = await db.all(sql.raw(`PRAGMA foreign_key_list(\`${tableName}\`)`))

    return c.json({
      success: true,
      data: {
        tableName,
        columns: columns.map((col) => ({
          cid: col.cid,
          name: col.name,
          type: col.type,
          notNull: Boolean(col.notnull),
          defaultValue: col.dflt_value,
          primaryKey: Boolean(col.pk),
        })),
        foreignKeys: foreignKeys.map((fk) => ({
          id: fk.id,
          targetTable: fk.table,
          fromColumn: fk.from,
          toColumn: fk.to,
          onUpdate: fk.on_update,
          onDelete: fk.on_delete,
        })),
      },
    })
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})

// Excluir tabela
databaseRoutes.delete('/tables/:name', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()

  if (!SAFE_NAME.test(tableName)) {
    return c.json({ success: false, error: { message: 'Nome de tabela inválido.' } }, 400)
  }

  if (tableName.startsWith('_ek_') || PROTECTED_SYSTEM_TABLES.has(tableName.toLowerCase())) {
    return c.json({ success: false, error: { message: 'Tabelas do sistema não podem ser excluídas.' } }, 403)
  }

  const db = await getDb()
  try {
    await db.run(sql.raw(`DROP TABLE \`${tableName}\``))
    await db.delete(ekTablePolicies).where(eq(ekTablePolicies.tableName, tableName)).catch(() => {})
    invalidateTableColumnsCache(tableName)
    return c.json({ success: true, message: `Tabela "${tableName}" excluída com sucesso.` })
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})

// Adicionar coluna a tabela existente
databaseRoutes.post('/tables/:name/columns', requireAdmin(), async (c) => {
  const tableName = c.req.param('name').trim()
  const body = await c.req.json().catch(() => ({}))
  const colName = (body.name || '').trim()
  const colType = (body.type || 'TEXT').toUpperCase()

  if (!SAFE_NAME.test(tableName) || !SAFE_NAME.test(colName)) {
    return c.json({ success: false, error: { message: 'Identificadores inválidos.' } }, 400)
  }

  if (tableName.startsWith('_ek_') || PROTECTED_SYSTEM_TABLES.has(tableName.toLowerCase())) {
    return c.json({ success: false, error: { message: 'Tabelas do sistema não podem ser alteradas.' } }, 403)
  }

  if (!ALLOWED_SQL_TYPES.has(colType)) {
    return c.json({ success: false, error: { message: `Tipo de dado SQL inválido: "${colType}"` } }, 400)
  }

  const typeKeyword = colType === 'JSON' ? 'TEXT' : colType
  let alterSql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${typeKeyword}`
  if (body.defaultValue !== undefined && body.defaultValue !== '') {
    alterSql += ` DEFAULT ${body.defaultValue}`
  }

  const db = await getDb()
  try {
    await db.run(sql.raw(alterSql))
    invalidateTableColumnsCache(tableName)
    return c.json({ success: true, message: `Coluna "${colName}" adicionada à tabela "${tableName}".` })
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})

// SQL Runner Seguro (com Guardrail contra mutação em tabelas de autenticação/chaves)
databaseRoutes.post('/sql', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const rawQuery = (body.query || '').trim()

  if (!rawQuery) {
    return c.json({ success: false, error: { message: 'Query SQL vazia.' } }, 400)
  }

  // Guardrail de Segurança: Bloqueia mutações arbitrárias em _ek_admins e _ek_api_keys
  const upper = rawQuery.toUpperCase()
  const isMutation =
    upper.includes('UPDATE') ||
    upper.includes('DELETE') ||
    upper.includes('DROP') ||
    upper.includes('ALTER') ||
    upper.includes('INSERT')

  if (isMutation) {
    const hitsCriticalTable =
      upper.includes('_EK_') ||
      /\b_ek_[a-z0-9_]*\b/i.test(rawQuery)

    if (hitsCriticalTable) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_MUTATION',
            message: 'Mutações diretas em tabelas do sistema (_ek_*) são bloqueadas pelo guardrail de segurança.',
          },
        },
        403,
      )
    }
  }

  const db = await getDb()
  try {
    const isSelect = upper.startsWith('SELECT') || upper.startsWith('PRAGMA')
    if (isSelect) {
      const results = await db.all(sql.raw(rawQuery))
      return c.json({ success: true, isSelect: true, rows: results, rowCount: results.length })
    } else {
      const result = await db.run(sql.raw(rawQuery))
      return c.json({ success: true, isSelect: false, result })
    }
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500)
  }
})
