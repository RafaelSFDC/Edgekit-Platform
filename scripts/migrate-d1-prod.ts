import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

interface MigrateOptions {
  checkOnly: boolean
  database: string
  config: string
}

function parseArgs(): MigrateOptions {
  const args = process.argv.slice(2)
  const checkOnly =
    args.includes('--list') || args.includes('--check') || args.includes('--dry-run')

  let database = 'edgekit-platform-db'
  const dbIndex = args.indexOf('--database')
  if (dbIndex !== -1 && args[dbIndex + 1]) {
    database = args[dbIndex + 1]
  }

  let config = 'apps/api/wrangler.jsonc'
  const configIndex = args.indexOf('--config')
  if (configIndex !== -1 && args[configIndex + 1]) {
    config = args[configIndex + 1]
  }

  return { checkOnly, database, config }
}

function runWrangler(args: string[]): { status: number | null } {
  const isWindows = process.platform === 'win32'
  const cmd = isWindows ? 'pnpm.cmd' : 'pnpm'

  const result = spawnSync(cmd, ['exec', 'wrangler', ...args], {
    stdio: 'inherit',
    shell: isWindows,
    env: {
      ...process.env,
      CI: 'true',
    },
  })

  return { status: result.status }
}

function main() {
  const { checkOnly, database, config } = parseArgs()
  const configPath = path.resolve(process.cwd(), config)

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Wrangler config not found: ${configPath}`)
    process.exit(1)
  }

  console.info(`📦 Edgekit Platform Production D1 Migrations Manager`)
  console.info(`   Database: ${database}`)
  console.info(`   Config:   ${config}`)
  console.info(
    `   Mode:     ${checkOnly ? 'Check unapplied migrations' : 'Apply unapplied migrations'}\n`,
  )

  if (checkOnly) {
    const listResult = runWrangler([
      'd1',
      'migrations',
      'list',
      database,
      '--remote',
      '--config',
      config,
    ])
    process.exit(listResult.status ?? 0)
  }

  console.info(`🔍 Checking pending migrations...`)
  const checkResult = runWrangler([
    'd1',
    'migrations',
    'list',
    database,
    '--remote',
    '--config',
    config,
  ])

  if (checkResult.status !== 0) {
    console.error(`\n❌ Failed to check pending migrations.`)
    process.exit(checkResult.status ?? 1)
  }

  console.info(`\n🚀 Applying migrations to remote D1...`)
  const applyResult = runWrangler([
    'd1',
    'migrations',
    'apply',
    database,
    '--remote',
    '--config',
    config,
  ])

  if (applyResult.status !== 0) {
    console.error(`\n❌ Failed to apply migrations to Cloudflare D1.`)
    process.exit(applyResult.status ?? 1)
  }

  console.info(
    `\n✅ Remote D1 migrations successfully processed for database "${database}"!`,
  )
}

main()
