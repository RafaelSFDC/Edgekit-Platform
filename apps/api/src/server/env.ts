import type {
  D1Database,
  DurableObjectNamespace,
  Fetcher,
  R2Bucket,
} from '@cloudflare/workers-types'

export interface AppBindings {
  ENVIRONMENT?: string
  DB?: D1Database
  STORAGE_BUCKET?: R2Bucket
  REALTIME?: DurableObjectNamespace
  ASSETS?: Fetcher
  BETTER_AUTH_SECRET?: string
  SETUP_TOKEN?: string
  EDGEKIT_ANON_KEY?: string
  EDGEKIT_SERVICE_ROLE_KEY?: string
  EDGEKIT_APP_SECRET?: string
  APP_NAME?: string
  APP_VERSION?: string
  APP_URL?: string
  CLOUDFLARE_PLAN?: 'free' | 'paid' | string
  ENABLE_FUNCTIONS?: 'true' | 'false' | string
  DATABASE_URL?: string
  LOCAL_STORAGE_PATH?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  [key: string]: unknown
}

let cachedBindingsPromise: Promise<AppBindings> | undefined
let didLoadLocalEnv = false

async function ensureLocalEnvLoaded() {
  if (didLoadLocalEnv || typeof process === 'undefined') {
    return
  }

  try {
    const { existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { config: loadDotEnv } = await import('dotenv')

    const candidatePaths = [
      resolve(process.cwd(), '.env'),
      resolve(process.cwd(), '../../.env'),
      resolve(process.cwd(), '../.env'),
    ]

    for (const envPath of candidatePaths) {
      if (existsSync(envPath)) {
        loadDotEnv({ path: envPath })
        break
      }
    }
  } catch {
    // Non-node runtime
  }

  didLoadLocalEnv = true
}

const CLOUDFLARE_WORKERS_MODULE = 'cloudflare:workers'

async function loadCloudflareBindings(): Promise<AppBindings | null> {
  try {
    const mod = await import(/* @vite-ignore */ CLOUDFLARE_WORKERS_MODULE)
    return (mod.env as unknown as AppBindings) ?? null
  } catch {
    return null
  }
}

async function loadProcessBindings(): Promise<AppBindings> {
  await ensureLocalEnvLoaded()

  if (typeof process === 'undefined') {
    return {}
  }

  const anonKey = process.env.EDGEKIT_ANON_KEY
  const serviceRoleKey = process.env.EDGEKIT_SERVICE_ROLE_KEY || process.env.EDGEKIT_APP_SECRET

  return {
    ENVIRONMENT: process.env.ENVIRONMENT || 'development',
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    SETUP_TOKEN: process.env.SETUP_TOKEN,
    EDGEKIT_ANON_KEY: anonKey,
    EDGEKIT_SERVICE_ROLE_KEY: serviceRoleKey,
    APP_NAME: process.env.APP_NAME || 'Edgekit Platform',
    APP_VERSION: process.env.APP_VERSION || '1.0.0',
    APP_URL: process.env.APP_URL || 'http://localhost:3000',
    CLOUDFLARE_PLAN: process.env.CLOUDFLARE_PLAN || 'free',
    ENABLE_FUNCTIONS: process.env.ENABLE_FUNCTIONS || 'false',
    DATABASE_URL: process.env.DATABASE_URL || 'dev.db',
    LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH || '.local/storage',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  }
}

export async function getBindings(): Promise<AppBindings> {
  if (!cachedBindingsPromise) {
    cachedBindingsPromise = loadCloudflareBindings().then(
      (bindings) => bindings ?? loadProcessBindings(),
    )
  }

  return cachedBindingsPromise
}

export async function getEnvVar(key: keyof AppBindings): Promise<string | undefined> {
  const bindings = await getBindings()
  return (bindings[key] as string) ?? (typeof process !== 'undefined' ? process.env[key] : undefined)
}
