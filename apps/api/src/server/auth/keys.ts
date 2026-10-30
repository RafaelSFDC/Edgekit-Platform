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
  const anonKey =
    bindings.EDGEKIT_ANON_KEY ||
    bindings.HONOBASE_ANON_KEY ||
    'hb_anon_default'
  const serviceRoleKey =
    bindings.EDGEKIT_SERVICE_ROLE_KEY ||
    bindings.EDGEKIT_APP_SECRET ||
    bindings.DEFAULT_APP_SECRET ||
    bindings.HONOBASE_SERVICE_ROLE_KEY ||
    'hb_service_default'
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
  const masterServiceKey =
    bindings.EDGEKIT_SERVICE_ROLE_KEY ||
    bindings.EDGEKIT_APP_SECRET ||
    bindings.DEFAULT_APP_SECRET ||
    bindings.HONOBASE_SERVICE_ROLE_KEY

  if (masterServiceKey && keyString === masterServiceKey) {
    return {
      id: 'env_service_role',
      name: 'Environment Service Role Key',
      type: 'service_role',
      role: 'admin',
    }
  }

  const defaultAnonKey =
    bindings.EDGEKIT_ANON_KEY || bindings.HONOBASE_ANON_KEY

  if (defaultAnonKey && keyString === defaultAnonKey) {
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
