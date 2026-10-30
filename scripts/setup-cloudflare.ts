import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function runCommand(command: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const isWindows = process.platform === 'win32'
  const cmd = isWindows ? `${command}.cmd` : command

  const result = spawnSync(cmd, args, {
    shell: isWindows,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: 'true',
    },
  })

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  }
}

async function setupCloudflare() {
  console.info('=================================================================')
  console.info('⚡ Edgekit Platform - Assistente de Provisionamento Cloudflare')
  console.info('=================================================================\n')

  const cwd = process.cwd()
  const wranglerConfigPath = path.join(cwd, 'apps', 'api', 'wrangler.jsonc')

  if (!fs.existsSync(wranglerConfigPath)) {
    console.error(`❌ Arquivo de configuração não encontrado: ${wranglerConfigPath}`)
    process.exit(1)
  }

  // 1. Verificar autenticação na Cloudflare
  console.info('🔍 1/5: Verificando login no Cloudflare Wrangler...')
  const whoami = runCommand('pnpm', ['exec', 'wrangler', 'whoami'])
  if (whoami.status !== 0 || whoami.stdout.includes('You are not logged in')) {
    console.warn('⚠️  Você ainda não está autenticado na Cloudflare.')
    console.info('👉 Por favor, execute primeiro: pnpm exec wrangler login')
    console.info('Após o login, execute este script novamente.\n')
    process.exit(1)
  }
  console.info('✅ Conectado com sucesso à Cloudflare!\n')

  // 2. Provisionar Cloudflare D1
  console.info('📦 2/5: Provisionando banco de dados Cloudflare D1 ("edgekit-platform-db")...')
  let wranglerContent = fs.readFileSync(wranglerConfigPath, 'utf8')
  let databaseId = ''

  // Tenta criar o D1
  const createD1 = runCommand('pnpm', [
    'exec',
    'wrangler',
    'd1',
    'create',
    'edgekit-platform-db',
    '--config',
    'apps/api/wrangler.jsonc',
  ])

  const output = createD1.stdout + createD1.stderr
  const idMatch = output.match(/database_id\s*=\s*["']([a-f0-9-]+)["']/i) || output.match(/["']([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})["']/i)

  if (idMatch && idMatch[1]) {
    databaseId = idMatch[1]
    console.info(`✅ Banco D1 criado com sucesso! ID: ${databaseId}`)
  } else if (output.includes('already exists') || output.includes('already')) {
    console.info('ℹ️  Banco D1 "edgekit-platform-db" já existe na sua conta. Buscando ID...')
    const listD1 = runCommand('pnpm', ['exec', 'wrangler', 'd1', 'list', '--json'])
    try {
      const list = JSON.parse(listD1.stdout)
      const found = list.find((db: any) => db.name === 'edgekit-platform-db')
      if (found?.uuid) {
        databaseId = found.uuid
        console.info(`✅ ID do banco D1 existente encontrado: ${databaseId}`)
      }
    } catch {}
  }

  if (databaseId) {
    wranglerContent = wranglerContent.replace(
      /"database_id":\s*".*"/,
      `"database_id": "${databaseId}"`,
    )
    fs.writeFileSync(wranglerConfigPath, wranglerContent)
    console.info('📝 apps/api/wrangler.jsonc atualizado com o database_id oficial!\n')
  } else {
    console.warn('⚠️  Não foi possível extrair o database_id automaticamente.')
    console.warn('   Verifique o ID no painel Cloudflare e insira manualmente em apps/api/wrangler.jsonc.\n')
  }

  // 3. Provisionar Bucket Cloudflare R2
  console.info('🪣 3/5: Provisionando bucket de Storage Cloudflare R2 ("edgekit-platform-storage")...')
  const createR2 = runCommand('pnpm', [
    'exec',
    'wrangler',
    'r2',
    'bucket',
    'create',
    'edgekit-platform-storage',
  ])

  if (createR2.status === 0 || createR2.stdout.includes('Created') || createR2.stderr.includes('already exists')) {
    console.info('✅ Bucket R2 "edgekit-platform-storage" configurado com sucesso!\n')
  } else {
    console.info('ℹ️  Nota R2: ' + (createR2.stdout || createR2.stderr).trim() + '\n')
  }

  // 4. Executar Migrações D1 em Produção
  console.info('🚀 4/5: Aplicando migrações de schema no D1 remoto...')
  const migrateResult = runCommand('pnpm', [
    'exec',
    'tsx',
    'scripts/migrate-d1-prod.ts',
  ])

  if (migrateResult.status === 0) {
    console.info('✅ Todas as tabelas e schemas foram criados no Cloudflare D1!\n')
  } else {
    console.warn('⚠️  Aviso de migração: ' + migrateResult.stderr)
  }

  // 5. Conclusão e Instruções de Deploy
  console.info('=================================================================')
  console.info('🎉 Provisionamento dos Recursos Serverless Concluído!')
  console.info('=================================================================')
  console.info('Para publicar sua plataforma completa na Cloudflare:')
  console.info('  👉 pnpm deploy')
  console.info('\nApós o deploy, acesse o link gerado pelo Wrangler e faça login')
  console.info('usando sua Chave de Administração (EDGEKIT_SERVICE_ROLE_KEY).\n')
}

setupCloudflare().catch((err) => {
  console.error('Erro durante o setup Cloudflare:', err)
  process.exit(1)
})
