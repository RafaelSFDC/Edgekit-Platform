import fs from 'node:fs'
import path from 'node:path'

const wranglerConfig = path.join(process.cwd(), 'apps', 'api', 'wrangler.jsonc')

if (fs.existsSync(wranglerConfig)) {
  const content = fs.readFileSync(wranglerConfig, 'utf8')
  if (content.includes('local-edgekit-platform-d1-id')) {
    console.warn('\n=================================================================')
    console.warn('⚠️  AVISO: O banco D1 remoto ainda não foi configurado!')
    console.warn('   Se você for fazer o deploy pela 1ª vez, execute primeiro:')
    console.warn('   👉 pnpm setup:cf')
    console.warn('   Isso cria o banco D1, o bucket R2 e aplica as migrações na Cloudflare.')
    console.warn('=================================================================\n')
  }
}
