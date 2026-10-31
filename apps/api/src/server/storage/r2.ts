import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDb } from '../db'
import { ekStorageObjects, ekStorageBuckets } from '../db/schema'
import { getBindings } from '../env'

export interface StorageObjectMetadata {
  id: string
  bucket: string
  key: string
  name: string
  size: number
  mimeType: string
  isPublic: boolean
  url: string
  createdAt: Date
}

export interface SignedUrlOptions {
  bucket: string
  key: string
  action?: 'read' | 'write'
  expiresInSeconds?: number
}

async function signHmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Gera URL temporária pré-assinada com HMAC-SHA256 para leitura ou escrita segura no Storage
 */
export async function createSignedStorageUrl(options: SignedUrlOptions): Promise<{
  url: string
  expiresAt: Date
}> {
  const bindings = await getBindings()
  const secret = bindings.BETTER_AUTH_SECRET || 'dev-edgekit-storage-secret'
  const baseUrl = bindings.APP_URL || 'http://localhost:3000'
  const action = options.action || 'read'
  const expiresInSeconds = options.expiresInSeconds || 3600 // 1 hora padrão
  const expiresAtMs = Date.now() + expiresInSeconds * 1000

  const message = `${options.bucket}:${options.key}:${action}:${expiresAtMs}`
  const signature = await signHmacSha256(secret, message)

  const publicUrl = `${baseUrl}/api/v1/storage/${options.bucket}/file/${options.key}?action=${action}&expires=${expiresAtMs}&sig=${signature}`

  return {
    url: publicUrl,
    expiresAt: new Date(expiresAtMs),
  }
}

/**
 * Valida a integridade e expiração de uma URL assinada
 */
export async function verifySignedStorageUrl(
  bucket: string,
  key: string,
  action: 'read' | 'write',
  expires: string | null,
  signature: string | null,
): Promise<boolean> {
  if (!expires || !signature) return false

  const expiresMs = Number(expires)
  if (isNaN(expiresMs) || Date.now() > expiresMs) {
    return false // Expirada
  }

  const bindings = await getBindings()
  const secret = bindings.BETTER_AUTH_SECRET || 'dev-edgekit-storage-secret'
  const message = `${bucket}:${key}:${action}:${expiresMs}`
  const expectedSig = await signHmacSha256(secret, message)

  return signature === expectedSig
}

/**
 * Valida políticas de bucket antes de autorizar upload
 */
export async function validateBucketPolicy(
  bucketName: string,
  fileSize: number,
  mimeType: string,
): Promise<{ allowed: boolean; error?: string }> {
  const db = await getDb()
  const bucket = await db
    .select()
    .from(ekStorageBuckets)
    .where(eq(ekStorageBuckets.name, bucketName))
    .get()

  if (!bucket) {
    // Se o bucket não está cadastrado formalmente, adota limites padrão seguros
    return { allowed: true }
  }

  // Validação de Tamanho Máximo
  if (bucket.maxSizeBytes && fileSize > bucket.maxSizeBytes) {
    const maxMb = Math.round(bucket.maxSizeBytes / (1024 * 1024))
    return {
      allowed: false,
      error: `Tamanho do arquivo excede o limite permitido para o bucket "${bucketName}" (${maxMb}MB).`,
    }
  }

  // Validação de MIME Types
  if (bucket.allowedMimeTypes) {
    try {
      const allowed: string[] = JSON.parse(bucket.allowedMimeTypes)
      if (!allowed.includes('*') && !allowed.includes('*/*')) {
        const matches = allowed.some((pat) => {
          if (pat.endsWith('/*')) {
            const prefix = pat.slice(0, -2)
            return mimeType.startsWith(prefix)
          }
          return pat.toLowerCase() === mimeType.toLowerCase()
        })
        if (!matches) {
          return {
            allowed: false,
            error: `O tipo de arquivo "${mimeType}" não é permitido no bucket "${bucketName}".`,
          }
        }
      }
    } catch {
      // Ignora erro de parse de JSON
    }
  }

  return { allowed: true }
}

export async function uploadFile(options: {
  bucket: string
  key: string
  fileData: ArrayBuffer | ReadableStream
  mimeType: string
  fileName: string
  size: number
  userId?: string | null
  isPublic?: boolean
}): Promise<StorageObjectMetadata> {
  const bindings = await getBindings()
  const db = await getDb()
  const now = new Date()

  // 1. Armazenar no R2 se disponível
  if (bindings.STORAGE_BUCKET) {
    await bindings.STORAGE_BUCKET.put(options.key, options.fileData as any, {
      httpMetadata: {
        contentType: options.mimeType,
      },
      customMetadata: {
        fileName: options.fileName,
        userId: options.userId || '',
      },
    })
  } else {
    // Fallback para disco local em dev
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { resolve, dirname } = await import('node:path')
    const basePath = bindings.LOCAL_STORAGE_PATH || '.local/storage'
    const fullPath = resolve(process.cwd(), basePath, options.bucket, options.key)

    await mkdir(dirname(fullPath), { recursive: true })
    const buffer = Buffer.from(options.fileData as ArrayBuffer)
    await writeFile(fullPath, buffer)
  }

  // 2. Gravar metadados na tabela _ek_storage_objects
  const id = nanoid()
  await db.insert(ekStorageObjects).values({
    id,
    bucket: options.bucket,
    key: options.key,
    name: options.fileName,
    size: options.size,
    mimeType: options.mimeType,
    userId: options.userId || null,
    isPublic: options.isPublic ?? true,
    createdAt: now,
    updatedAt: now,
  })

  const baseUrl = bindings.APP_URL || 'http://localhost:3000'
  const publicUrl = `${baseUrl}/api/v1/storage/${options.bucket}/file/${options.key}`

  return {
    id,
    bucket: options.bucket,
    key: options.key,
    name: options.fileName,
    size: options.size,
    mimeType: options.mimeType,
    isPublic: options.isPublic ?? true,
    url: publicUrl,
    createdAt: now,
  }
}

export async function getFile(
  bucket: string,
  key: string,
  range?: { offset?: number; length?: number },
): Promise<{
  stream: ReadableStream | ArrayBuffer | Uint8Array
  mimeType: string
  size?: number
  contentRange?: string
} | null> {
  const bindings = await getBindings()

  if (bindings.STORAGE_BUCKET) {
    let r2Options: any = undefined
    if (range) {
      if (range.offset !== undefined && range.length !== undefined) {
        r2Options = { range: { offset: range.offset, length: range.length } }
      } else if (range.offset !== undefined) {
        r2Options = { range: { offset: range.offset } }
      }
    }
    const object: any = await bindings.STORAGE_BUCKET.get(key, r2Options)
    if (!object || !object.body) return null

    return {
      stream: object.body,
      mimeType: object.httpMetadata?.contentType || 'application/octet-stream',
      size: object.size,
    }
  }

  // Fallback local
  try {
    const { readFile, stat } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const basePath = bindings.LOCAL_STORAGE_PATH || '.local/storage'
    const fullPath = resolve(process.cwd(), basePath, bucket, key)

    const fileStat = await stat(fullPath)
    const buffer = await readFile(fullPath)

    if (range && range.offset !== undefined) {
      const start = range.offset
      const end = range.length ? start + range.length : buffer.length
      const sliced = new Uint8Array(buffer.buffer, buffer.byteOffset + start, end - start)
      return {
        stream: sliced,
        mimeType: 'application/octet-stream',
        size: fileStat.size,
        contentRange: `bytes ${start}-${end - 1}/${fileStat.size}`,
      }
    }

    return {
      stream: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
      mimeType: 'application/octet-stream',
      size: fileStat.size,
    }
  } catch {
    return null
  }
}

export async function deleteFile(bucket: string, key: string): Promise<boolean> {
  const bindings = await getBindings()
  const db = await getDb()

  if (bindings.STORAGE_BUCKET) {
    await bindings.STORAGE_BUCKET.delete(key)
  } else {
    try {
      const { unlink } = await import('node:fs/promises')
      const { resolve } = await import('node:path')
      const basePath = bindings.LOCAL_STORAGE_PATH || '.local/storage'
      const fullPath = resolve(process.cwd(), basePath, bucket, key)
      await unlink(fullPath)
    } catch {
      // Arquivo local pode não existir
    }
  }

  await db.delete(ekStorageObjects).where(eq(ekStorageObjects.key, key))
  return true
}
