import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AppDatabase } from '../db'
import { ekAdmins, ekAdminSessions, type ekAdmins as ekAdminsTable } from '../db/schema'
import type { AdminUser } from '../types'

export type AdminRow = typeof ekAdminsTable.$inferSelect

const ITERATIONS = 100_000
const KEY_LENGTH = 256 // bits

/**
 * Converte Uint8Array em string hexadecimal
 */
function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Converte string hexadecimal em Uint8Array
 */
function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

/**
 * Gera hash seguro de senha utilizando PBKDF2 com SHA-256 nativo de WebCrypto
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const enc = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    KEY_LENGTH,
  )

  const saltHex = bufferToHex(salt)
  const hashHex = bufferToHex(derivedBits)
  return `pbkdf2:${ITERATIONS}:${saltHex}:${hashHex}`
}

/**
 * Verifica se a senha informada corresponde ao hash PBKDF2 gravado
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split(':')
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
      return false
    }

    const iterations = parseInt(parts[1], 10)
    const salt = hexToBuffer(parts[2])
    const expectedHashHex = parts[3]

    const enc = new TextEncoder()
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    )

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256',
      },
      passwordKey,
      KEY_LENGTH,
    )

    const derivedHashHex = bufferToHex(derivedBits)
    return derivedHashHex === expectedHashHex
  } catch {
    return false
  }
}

/**
 * Gera um SHA-256 de uma string para busca e comparação segura
 */
export async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token))
  return bufferToHex(digest)
}

export const ADMIN_COOKIE_NAME = 'edgekit_admin_session'

/**
 * Cria uma nova sessão administrativa para o membro da equipe
 */
export async function createAdminSession(
  db: AppDatabase,
  adminId: string,
  meta?: { ipAddress?: string; userAgent?: string; maxAgeDays?: number },
): Promise<{ token: string; expiresAt: Date }> {
  const rawToken = `ek_sess_${nanoid(32)}`
  const tokenHash = await hashToken(rawToken)
  const maxAgeDays = meta?.maxAgeDays ?? 7
  const expiresAt = new Date(Date.now() + maxAgeDays * 24 * 60 * 60 * 1000)

  await db.insert(ekAdminSessions).values({
    id: nanoid(),
    token: tokenHash,
    adminId,
    expiresAt,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    createdAt: new Date(),
  })

  return { token: rawToken, expiresAt }
}

/**
 * Valida o token de sessão do cookie contra _ek_admin_sessions e retorna os dados do Admin
 */
export async function validateAdminSession(
  db: AppDatabase,
  rawToken: string,
): Promise<AdminUser | null> {
  if (!rawToken || !rawToken.trim()) return null

  try {
    const tokenHash = await hashToken(rawToken.trim())
    const session = await db
      .select({
        sessionId: ekAdminSessions.id,
        expiresAt: ekAdminSessions.expiresAt,
        adminId: ekAdminSessions.adminId,
        adminName: ekAdmins.name,
        adminEmail: ekAdmins.email,
        adminRole: ekAdmins.role,
      })
      .from(ekAdminSessions)
      .innerJoin(ekAdmins, eq(ekAdminSessions.adminId, ekAdmins.id))
      .where(eq(ekAdminSessions.token, tokenHash))
      .get()

    if (!session) return null

    if (session.expiresAt.getTime() < Date.now()) {
      // Sessão expirada, remove do banco
      await db.delete(ekAdminSessions).where(eq(ekAdminSessions.id, session.sessionId)).catch(() => {})
      return null
    }

    return {
      id: session.adminId,
      name: session.adminName,
      email: session.adminEmail,
      role: session.adminRole as AdminUser['role'],
    }
  } catch {
    return null
  }
}

/**
 * Encerra uma sessão administrativa
 */
export async function revokeAdminSession(db: AppDatabase, rawToken: string): Promise<void> {
  if (!rawToken) return
  try {
    const tokenHash = await hashToken(rawToken.trim())
    await db.delete(ekAdminSessions).where(eq(ekAdminSessions.token, tokenHash))
  } catch {}
}
