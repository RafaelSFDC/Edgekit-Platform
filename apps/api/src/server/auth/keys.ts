import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AppDatabase } from '../db'
import { ekApiKeys } from '../db/schema'
import { getBindings } from '../env'
import { hashToken } from './admin-auth'

export interface ValidatedApiKey {
  id: string
  name: string
  type: 'anon' | 'service_role'
  role: 'anon' | 'service_role'
}

/**
 * Cria uma nova Chave de API, gravando apenas o hash SHA-256 no banco
 * e retornando a chave bruta exatamente uma vez para o desenvolvedor.
 */
export async function createApiKey(
  db: AppDatabase,
  options: {
    name: string
    type: 'anon' | 'service_role'
    expiresAt?: Date | null
  },
): Promise<{ rawKey: string; keyId: string; keyPrefix: string }> {
  const prefix = options.type === 'service_role' ? 'ek_sec_' : 'ek_anon_'
  const randomPart = crypto.randomUUID().replace(/-/g, '') + nanoid(16)
  const rawKey = `${prefix}${randomPart}`
  const keyPrefix = `${rawKey.slice(0, 14)}...`
  const keyHash = await hashToken(rawKey)
  const id = nanoid()
  const now = new Date()

  await db.insert(ekApiKeys).values({
    id,
    name: options.name,
    keyPrefix,
    keyHash,
    type: options.type,
    role: options.type === 'service_role' ? 'service_role' : 'anon',
    expiresAt: options.expiresAt,
    createdAt: now,
    updatedAt: now,
  })

  return { rawKey, keyId: id, keyPrefix }
}

/**
 * Garante a criação segura das chaves essenciais na primeira inicialização,
 * utilizando variáveis de ambiente ou gerando chaves seguras (sem defaults hardcoded).
 */
export async function ensureDefaultKeys(db: AppDatabase): Promise<void> {
  const bindings = await getBindings()
  const now = new Date()

  try {
    // 1. Chave Anon
    const envAnonKey = bindings.EDGEKIT_ANON_KEY
    if (envAnonKey && envAnonKey.trim()) {
      const anonHash = await hashToken(envAnonKey.trim())
      const existingAnon = await db
        .select()
        .from(ekApiKeys)
        .where(eq(ekApiKeys.keyHash, anonHash))
        .get()

      if (!existingAnon) {
        await db.insert(ekApiKeys).values({
          id: nanoid(),
          name: 'Environment Anon Key',
          keyPrefix: `${envAnonKey.slice(0, 14)}...`,
          keyHash: anonHash,
          type: 'anon',
          role: 'anon',
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    // 2. Chave Service Role
    const envServiceKey =
      bindings.EDGEKIT_SERVICE_ROLE_KEY || bindings.EDGEKIT_APP_SECRET
    if (envServiceKey && envServiceKey.trim()) {
      const serviceHash = await hashToken(envServiceKey.trim())
      const existingService = await db
        .select()
        .from(ekApiKeys)
        .where(eq(ekApiKeys.keyHash, serviceHash))
        .get()

      if (!existingService) {
        await db.insert(ekApiKeys).values({
          id: nanoid(),
          name: 'Environment Service Role Key',
          keyPrefix: `${envServiceKey.slice(0, 14)}...`,
          keyHash: serviceHash,
          type: 'service_role',
          role: 'service_role',
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    // Se nenhuma chave existir de nenhuma forma, cria o par inicial
    const allKeys = await db.select().from(ekApiKeys).all()
    if (allKeys.length === 0) {
      await createApiKey(db, { name: 'Default Anon Key', type: 'anon' })
      await createApiKey(db, { name: 'Default Service Role Key', type: 'service_role' })
    }
  } catch {
    // Banco pode estar na primeira inicialização
  }
}

/**
 * Valida a chave de API comparando o hash SHA-256 com os registros em _ek_api_keys
 */
export async function validateApiKey(
  db: AppDatabase,
  keyString: string,
): Promise<ValidatedApiKey | null> {
  if (!keyString || !keyString.trim()) return null

  const cleanKey = keyString.trim()
  const bindings = await getBindings()

  // Checagem rápida de env vars
  const envServiceKey =
    bindings.EDGEKIT_SERVICE_ROLE_KEY || bindings.EDGEKIT_APP_SECRET
  if (envServiceKey && cleanKey === envServiceKey) {
    return {
      id: 'env_service_role',
      name: 'Environment Service Role Key',
      type: 'service_role',
      role: 'service_role',
    }
  }

  const envAnonKey = bindings.EDGEKIT_ANON_KEY
  if (envAnonKey && cleanKey === envAnonKey) {
    return {
      id: 'env_anon',
      name: 'Environment Anon Key',
      type: 'anon',
      role: 'anon',
    }
  }

  try {
    const keyHash = await hashToken(cleanKey)
    const found = await db
      .select()
      .from(ekApiKeys)
      .where(eq(ekApiKeys.keyHash, keyHash))
      .get()

    if (!found) return null

    if (found.expiresAt && found.expiresAt.getTime() < Date.now()) {
      return null // Chave expirada
    }

    return {
      id: found.id,
      name: found.name,
      type: found.type as 'anon' | 'service_role',
      role: found.role as 'anon' | 'service_role',
    }
  } catch {
    return null
  }
}
