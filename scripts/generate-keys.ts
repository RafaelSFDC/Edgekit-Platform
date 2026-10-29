import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function generateKeys() {
  const betterAuthSecret = crypto.randomBytes(32).toString('hex')
  const anonKey = 'hb_anon_' + crypto.randomBytes(24).toString('base64url')
  const serviceRoleKey = 'hb_service_' + crypto.randomBytes(32).toString('base64url')

  return {
    betterAuthSecret,
    anonKey,
    serviceRoleKey,
  }
}

function main() {
  const keys = generateKeys()
  console.info('==================================================')
  console.info('🔑 HonoBase Security & API Keys Generated:')
  console.info('==================================================')
  console.info(`BETTER_AUTH_SECRET:        ${keys.betterAuthSecret}`)
  console.info(`HONOBASE_ANON_KEY:         ${keys.anonKey}`)
  console.info(`HONOBASE_SERVICE_ROLE_KEY: ${keys.serviceRoleKey}`)
  console.info('==================================================')

  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    const examplePath = path.resolve(process.cwd(), '.env.example')
    if (fs.existsSync(examplePath)) {
      let content = fs.readFileSync(examplePath, 'utf8')
      content = content.replace(
        /BETTER_AUTH_SECRET=.*/,
        `BETTER_AUTH_SECRET=${keys.betterAuthSecret}`,
      )
      content = content.replace(
        /HONOBASE_ANON_KEY=.*/,
        `HONOBASE_ANON_KEY=${keys.anonKey}`,
      )
      content = content.replace(
        /HONOBASE_SERVICE_ROLE_KEY=.*/,
        `HONOBASE_SERVICE_ROLE_KEY=${keys.serviceRoleKey}`,
      )
      fs.writeFileSync(envPath, content)
      console.info('✅ Generated and saved new .env file with fresh secure keys!')
    }
  }
}

if (process.argv[1]?.endsWith('generate-keys.ts')) {
  main()
}
