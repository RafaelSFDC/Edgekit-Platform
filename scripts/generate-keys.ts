import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function generateKeys() {
  const betterAuthSecret = crypto.randomBytes(32).toString('hex')
  const setupToken = `ek_setup_${crypto.randomBytes(24).toString('base64url')}`
  const anonKey = `ek_anon_${crypto.randomBytes(24).toString('base64url')}`
  const serviceRoleKey = `ek_sec_${crypto.randomBytes(32).toString('base64url')}`

  return {
    betterAuthSecret,
    setupToken,
    anonKey,
    serviceRoleKey,
  }
}

function main() {
  const keys = generateKeys()
  console.info('==================================================')
  console.info('🔑 Edgekit Platform Security & API Keys Generated:')
  console.info('==================================================')
  console.info(`BETTER_AUTH_SECRET:       ${keys.betterAuthSecret}`)
  console.info(`SETUP_TOKEN:              ${keys.setupToken}`)
  console.info(`EDGEKIT_ANON_KEY:         ${keys.anonKey}`)
  console.info(`EDGEKIT_SERVICE_ROLE_KEY: ${keys.serviceRoleKey}`)
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
        /SETUP_TOKEN=.*/,
        `SETUP_TOKEN=${keys.setupToken}`,
      )
      content = content.replace(
        /EDGEKIT_ANON_KEY=.*/,
        `EDGEKIT_ANON_KEY=${keys.anonKey}`,
      )
      content = content.replace(
        /EDGEKIT_SERVICE_ROLE_KEY=.*/,
        `EDGEKIT_SERVICE_ROLE_KEY=${keys.serviceRoleKey}`,
      )
      fs.writeFileSync(envPath, content)
      console.info('✅ Generated and saved new .env file with fresh secure keys!')
    }
  }
}

if (process.argv[1]?.endsWith('generate-keys.ts')) {
  main()
}
