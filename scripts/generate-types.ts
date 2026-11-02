import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const require = createRequire(path.resolve(rootDir, 'apps/api/package.json'))
const Database = require('better-sqlite3')

const dbPath = path.resolve(rootDir, 'dev.db')

function mapSqliteTypeToTs(type: string): string {
  const t = (type || 'TEXT').toUpperCase()
  if (t.includes('INT')) return 'number'
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUB')) return 'number'
  if (t.includes('BOOL')) return 'boolean'
  if (t.includes('BLOB')) return 'Uint8Array'
  if (t.includes('JSON')) return 'any'
  return 'string'
}

export function generateTypesFromSqlite(db: any): string {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_ek_%' AND name NOT LIKE 'drizzle_%' ORDER BY name ASC`,
    )
    .all() as Array<{ name: string }>

  let output = `/**\n * Edgekit Platform — Tipagens TypeScript Geradas Automaticamente (Seção 16.1)\n * Gerado em: ${new Date().toISOString()}\n */\n\n`
  output += `export interface DatabaseSchema {\n`

  for (const { name } of tables) {
    output += `  ${name}: {\n`
    output += `    Row: ${name}Row\n`
    output += `    Insert: ${name}Insert\n`
    output += `    Update: ${name}Update\n`
    output += `  }\n`
  }
  output += `}\n\n`

  for (const { name } of tables) {
    const columns = db.prepare(`PRAGMA table_info(\`${name}\`)`).all() as Array<{
      cid: number
      name: string
      type: string
      notnull: number
      dflt_value: any
      pk: number
    }>

    // 1. Row Interface
    output += `export interface ${name}Row {\n`
    for (const col of columns) {
      const tsType = mapSqliteTypeToTs(col.type)
      const nullable = col.notnull === 0 ? ' | null' : ''
      output += `  ${col.name}: ${tsType}${nullable}\n`
    }
    output += `}\n\n`

    // 2. Insert Interface
    output += `export interface ${name}Insert {\n`
    for (const col of columns) {
      const tsType = mapSqliteTypeToTs(col.type)
      const optional = col.pk === 1 || col.dflt_value !== null || col.notnull === 0 ? '?' : ''
      const nullable = col.notnull === 0 ? ' | null' : ''
      output += `  ${col.name}${optional}: ${tsType}${nullable}\n`
    }
    output += `}\n\n`

    // 3. Update Interface
    output += `export interface ${name}Update {\n`
    for (const col of columns) {
      const tsType = mapSqliteTypeToTs(col.type)
      output += `  ${col.name}?: ${tsType} | null\n`
    }
    output += `}\n\n`
  }

  return output
}

function run() {
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Banco de dados SQLite não encontrado em: ${dbPath}`)
    process.exit(1)
  }

  const db = new Database(dbPath)
  const code = generateTypesFromSqlite(db)
  const outputPath = path.resolve(rootDir, 'edgekit.types.ts')

  fs.writeFileSync(outputPath, code, 'utf-8')
  console.log(`✅ Tipagens geradas com sucesso em: ${outputPath}`)
  db.close()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
}
