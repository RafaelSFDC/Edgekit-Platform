import { sql } from 'drizzle-orm'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type Database from 'better-sqlite3'

import { getBindings } from '../env'
import { bundledMigrations } from './d1-dev-migrations.generated'
import * as schema from './schema'

export type AppDatabase = BaseSQLiteDatabase<
  'sync' | 'async',
  unknown,
  typeof schema
>

let sqliteDb: AppDatabase | undefined
let sqliteDatabasePath: string | undefined
let sqliteConnection: Database.Database | undefined

let d1DbInstance: AppDatabase | undefined
let d1DatabaseBinding: unknown | undefined

export type DatabaseRuntime =
  | {
      kind: 'd1'
      provider: 'sqlite'
      db: AppDatabase
    }
  | {
      kind: 'sqlite'
      provider: 'sqlite'
      db: AppDatabase
      path: string
    }

async function applyD1Migrations(db: AppDatabase) {
  try {
    await db.run(
      sql`CREATE TABLE IF NOT EXISTS __honobase_migrations (tag text PRIMARY KEY)`,
    )

    const appliedRows = await db.values(sql`SELECT tag FROM __honobase_migrations`)
    const applied = new Set(appliedRows.map((row) => String(row[0])))

    for (const migration of bundledMigrations) {
      if (!migration.sql || applied.has(migration.tag)) {
        continue
      }

      console.info(`[D1 Bootstrap] Executando migração: ${migration.tag}`)

      for (const statement of migration.sql.split('--> statement-breakpoint')) {
        const trimmed = statement.trim()
        if (trimmed) {
          if (trimmed.toUpperCase().startsWith('PRAGMA')) {
            continue
          }
          try {
            await db.run(sql.raw(trimmed))
          } catch (stmtError: unknown) {
            const msg = stmtError instanceof Error ? stmtError.message : String(stmtError)
            if (msg.includes('already exists') || msg.includes('duplicate column')) {
              continue
            }
            console.error(`[D1 Bootstrap] Erro na migração ${migration.tag}:`, msg)
            throw stmtError
          }
        }
      }

      await db.run(
        sql`INSERT INTO __honobase_migrations (tag) VALUES (${migration.tag})`,
      )
      console.info(`[D1 Bootstrap] Migração aplicada com sucesso: ${migration.tag}`)
    }
  } catch (err) {
    console.warn('[D1 Bootstrap] Aviso durante verificação de migrações:', err)
  }
}

let d1ReadyState: 'idle' | 'bootstrapping' | 'ready' = 'idle'
let bootstrapPromise: Promise<void> | null = null

function ensureD1Ready(db: AppDatabase): Promise<void> {
  if (d1ReadyState === 'ready') {
    return Promise.resolve()
  }

  if (d1ReadyState === 'bootstrapping' && bootstrapPromise) {
    return bootstrapPromise
  }

  d1ReadyState = 'bootstrapping'

  bootstrapPromise = applyD1Migrations(db)
    .then(() => {
      d1ReadyState = 'ready'
    })
    .catch((error) => {
      console.error('[D1 Bootstrap] Falha crítica no bootstrap:', error)
      d1ReadyState = 'idle'
      bootstrapPromise = null
    })

  return bootstrapPromise
}

export async function getDatabaseRuntime(): Promise<DatabaseRuntime> {
  const bindings = await getBindings()

  if (bindings.DB) {
    if (!d1DbInstance || d1DatabaseBinding !== bindings.DB) {
      d1DbInstance = drizzleD1(bindings.DB, { schema })
      d1DatabaseBinding = bindings.DB
    }

    const db = d1DbInstance

    // Auto-bootstrap universal: garante que tanto em Dev quanto em Produção (D1)
    // as tabelas do sistema existam mesmo em novos deploys.
    await ensureD1Ready(db)

    return {
      kind: 'd1',
      provider: 'sqlite',
      db,
    }
  }

  const rawPath = bindings.DATABASE_URL || 'dev.db'
  let currentPath = rawPath
  if (typeof process !== 'undefined') {
    const { existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    if (!existsSync(currentPath) && existsSync(resolve(process.cwd(), '../../', rawPath))) {
      currentPath = resolve(process.cwd(), '../../', rawPath)
    }
  }

  if (!sqliteDb || sqliteDatabasePath !== currentPath) {
    sqliteConnection?.close()
    const [{ default: Database }, { drizzle: drizzleSqlite }, { migrate }] = await Promise.all([
      import('better-sqlite3'),
      import('drizzle-orm/better-sqlite3'),
      import('drizzle-orm/better-sqlite3/migrator'),
    ])

    sqliteDatabasePath = currentPath
    sqliteConnection = new Database(sqliteDatabasePath)
    sqliteConnection.pragma('journal_mode = WAL')
    sqliteDb = drizzleSqlite(sqliteConnection, { schema })

    const { existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const migrationsFolder = existsSync('./drizzle')
      ? './drizzle'
      : resolve(process.cwd(), '../../drizzle')

    try {
      if (existsSync(migrationsFolder)) {
        migrate(sqliteDb as any, {
          migrationsFolder,
        })
      }
    } catch {
      // Já migrado
    }
  }

  return {
    kind: 'sqlite',
    provider: 'sqlite',
    db: sqliteDb,
    path: sqliteDatabasePath || currentPath,
  }
}

export async function getDb(): Promise<AppDatabase> {
  const runtime = await getDatabaseRuntime()
  return runtime.db
}

export { schema }
