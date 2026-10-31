import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { getDb } from '../db'
import { appSettings } from '../db/schema'

export interface SecurityConfig {
  allowedOrigins: string[]
  allowedIps: string[]
  blockExternalLocalhost: boolean
}

let cachedSecurityConfig: SecurityConfig | null = null
let cacheExpiresAt = 0

export function getClientIp(c: Context<AppEnv>): string {
  const cfIp = c.req.header('cf-connecting-ip')
  if (cfIp) return cfIp.trim()

  const realIp = c.req.header('x-real-ip')
  if (realIp) return realIp.trim()

  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',')
    return parts[0].trim()
  }

  return '127.0.0.1'
}

export function isLoopbackIp(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    ip.startsWith('127.') ||
    ip === '0.0.0.0'
  )
}

export async function getSecurityConfig(): Promise<SecurityConfig> {
  const now = Date.now()
  if (cachedSecurityConfig && cacheExpiresAt > now) {
    return cachedSecurityConfig
  }

  try {
    const db = await getDb()
    const settings = await db.select().from(appSettings).all()
    const settingsMap = new Map(settings.map((s) => [s.key, s.value]))

    const allowedOriginsRaw = settingsMap.get('security_allowed_origins') || '[]'
    const allowedIpsRaw = settingsMap.get('security_allowed_ips') || '[]'
    const blockExternalLocalhostRaw = settingsMap.get('security_block_external_localhost') || 'true'

    cachedSecurityConfig = {
      allowedOrigins: JSON.parse(allowedOriginsRaw),
      allowedIps: JSON.parse(allowedIpsRaw),
      blockExternalLocalhost: blockExternalLocalhostRaw === 'true',
    }
    cacheExpiresAt = now + 10000 // Cache por 10 segundos
    return cachedSecurityConfig
  } catch {
    return {
      allowedOrigins: [],
      allowedIps: [],
      blockExternalLocalhost: true,
    }
  }
}

export function invalidateSecurityConfigCache() {
  cachedSecurityConfig = null
  cacheExpiresAt = 0
}

export async function checkIpAccess(c: Context<AppEnv>): Promise<{ allowed: boolean; reason?: string }> {
  const config = await getSecurityConfig()
  const clientIp = getClientIp(c)

  // Se não há whitelist de IPs definida, acesso aberto
  if (!config.allowedIps || config.allowedIps.length === 0) {
    return { allowed: true }
  }

  // Verifica se o IP está na whitelist ou se é loopback local
  const isAllowed =
    isLoopbackIp(clientIp) ||
    config.allowedIps.includes(clientIp) ||
    config.allowedIps.some((allowed) => allowed === '*' || clientIp.startsWith(allowed))

  if (!isAllowed) {
    return {
      allowed: false,
      reason: `Acesso bloqueado: o IP ${clientIp} não está autorizado a acessar esta instância.`,
    }
  }

  return { allowed: true }
}

export async function resolveCorsOrigin(origin: string, c: Context<AppEnv>): Promise<string | null> {
  if (!origin) return '*'

  const config = await getSecurityConfig()
  const clientIp = getClientIp(c)

  // Proteção de localhost: se a origem declarada é localhost/127.0.0.1
  const isLocalOrigin =
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('0.0.0.0')

  if (isLocalOrigin && config.blockExternalLocalhost) {
    // Se a requisição chega de uma máquina remota (não loopback), bloqueia
    if (!isLoopbackIp(clientIp)) {
      return null
    }
  }

  // Origens confiáveis básicas
  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]

  if (defaultOrigins.includes(origin) || (isLocalOrigin && isLoopbackIp(clientIp))) {
    return origin
  }

  // Verifica na lista de origens configuradas pelo usuário
  if (config.allowedOrigins && config.allowedOrigins.length > 0) {
    if (
      config.allowedOrigins.includes('*') ||
      config.allowedOrigins.includes(origin) ||
      config.allowedOrigins.some((allowed) => origin.startsWith(allowed))
    ) {
      return origin
    }
    return null
  }

  // Se nenhuma restrição de origem personalizada foi cadastrada, reflete a origem para flexibilidade de desenvolvimento
  return origin
}
