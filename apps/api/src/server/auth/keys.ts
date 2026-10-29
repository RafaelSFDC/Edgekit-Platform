import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AppDatabase } from '../db'
import { apiKeys } from '../db/schema'
import { getBindings } from '../env'

export interface ValidatedApiKey {
  id: string
  name: string
  type: 'anon' | 'service_role' | 'custom'
  role: 'anon' | 'admin' | 'user'
  userId?: string | null
}

export async function ensureDefaultKeys(db: AppDatabase): Promise<void> {
  const bindings = await getBindings()
  const anonKey = bindings.HONOBASE_ANON_KEY || 'hb_anon_default'
  const serviceRoleKey = bindings.HONOBASE_SERVICE_ROLE_KEY || 'hb_service_default'
  const now = new Date()

  try {
    const existingAnon = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.key, anonKey))
      .get()

    if (!existingAnon) {
      await db.insert(apiKeys).values({
        id: nanoid(),
        name: 'Default Anon Key',
        key: anonKey,
        type: 'anon',
        role: 'anon',
        createdAt: now,
        updatedAt: now,
      })
    }

    const existingService = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.key, serviceRoleKey))
      .get()

    if (!existingService) {
      await db.insert(apiKeys).values({
        id: nanoid(),
        name: 'Default Service Role Key',
        key: serviceRoleKey,
        type: 'service_role',
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      })
    }
  } catch {
    // Tabela pode ainda estar sendo criada no primeiro bootstrap
  }
}

export async function validateApiKey(
  db: AppDatabase,
  keyString: string,
): Promise<ValidatedApiKey | null> {
  if (!keyString) return null

  const bindings = await getBindings()

  // Checagem rápida de memória contra as envs padrão
  if (bindings.HONOBASE_SERVICE_ROLE_KEY && keyString === bindings.HONOBASE_SERVICE_ROLE_KEY) {
    return {
      id: 'env_service_role',
      name: 'Environment Service Role Key',
      type: 'service_role',
      role: 'admin',
    }
  }

  if (bindings.HONOBASE_ANON_KEY && keyString === bindings.HONOBASE_ANON_KEY) {
    return {
      id: 'env_anon',
      name: 'Environment Anon Key',
      type: 'anon',
      role: 'anon',
    }
  }

  try {
    const found = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.key, keyString))
      .get()

    if (!found) return null

    if (found.expiresAt && found.expiresAt.getTime() < Date.now()) {
      return null // Chave expirada
    }

    return {
      id: found.id,
      name: found.name,
      type: found.type as 'anon' | 'service_role' | 'custom',
      role: found.role as 'anon' | 'admin' | 'user',
      userId: found.userId,
    }
  } catch {
    return null
  }
}
