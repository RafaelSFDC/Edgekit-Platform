import fs from 'node:fs'
import path from 'node:path'
import { generateKeys } from './generate-keys'

function ensureDirectory(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

async function setup() {
  console.info('====================================================')
  console.info('⚡ Bem-vindo ao Edgekit Platform - Cloudflare Self-Hosted BaaS')
  console.info('====================================================\n')

  const cwd = process.cwd()
  const envPath = path.join(cwd, '.env')
  const envExamplePath = path.join(cwd, '.env.example')
  const localStorageDir = path.join(cwd, '.local', 'storage')
  const drizzleDir = path.join(cwd, 'drizzle')

  // 1. Criar pastas locais
  ensureDirectory(localStorageDir)
  ensureDirectory(drizzleDir)
  ensureDirectory(path.join(cwd, 'apps', 'api', 'src', 'server', 'db'))

  // 2. Garantir .env
  if (!fs.existsSync(envPath)) {
    console.info('📄 Criando arquivo .env a partir de .env.example...')
    let template = fs.readFileSync(envExamplePath, 'utf8')
    const keys = generateKeys()

    template = template.replace(
      /BETTER_AUTH_SECRET=.*/,
      `BETTER_AUTH_SECRET=${keys.betterAuthSecret}`,
    )
    template = template.replace(
      /EDGEKIT_ANON_KEY=.*/,
      `EDGEKIT_ANON_KEY=${keys.anonKey}`,
    )
    template = template.replace(
      /EDGEKIT_SERVICE_ROLE_KEY=.*/,
      `EDGEKIT_SERVICE_ROLE_KEY=${keys.serviceRoleKey}`,
    )
    template = template.replace(
      /HONOBASE_ANON_KEY=.*/,
      `HONOBASE_ANON_KEY=${keys.anonKey}`,
    )
    template = template.replace(
      /HONOBASE_SERVICE_ROLE_KEY=.*/,
      `HONOBASE_SERVICE_ROLE_KEY=${keys.serviceRoleKey}`,
    )

    fs.writeFileSync(envPath, template)
    console.info('✅ Arquivo .env gerado com chaves secretas únicas e seguras!')
  } else {
    console.info('ℹ️  Arquivo .env já existente detectado.')
  }

  // 3. Gerar fallback de migrações
  const generatedMigrations = path.join(
    cwd,
    'apps',
    'api',
    'src',
    'server',
    'db',
    'd1-dev-migrations.generated.ts',
  )
  if (!fs.existsSync(generatedMigrations)) {
    fs.writeFileSync(
      generatedMigrations,
      `// Auto-generated initial migrations placeholder\nexport interface BundledMigration { tag: string; sql: string }\nexport const bundledMigrations: Array<BundledMigration> = []\n`,
    )
  }

  console.info('\n====================================================')
  console.info('🎉 Setup concluído com sucesso!')
  console.info('====================================================')
  console.info('Para desenvolvimento local:')
  console.info('  👉 pnpm dev')
  console.info('  Acesse o Admin Dashboard em: http://localhost:5173')
  console.info('  API e Docs (Scalar): http://localhost:8787/docs\n')
  console.info('Para publicar na Cloudflare em 1 clique:')
  console.info('  👉 pnpm setup:cf')
  console.info('====================================================\n')
}

setup().catch((err) => {
  console.error('Erro durante o setup:', err)
  process.exit(1)
})
