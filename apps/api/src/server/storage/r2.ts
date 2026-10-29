import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDb } from '../db'
import { storageFiles } from '../db/schema'
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

  // 2. Gravar metadados na tabela storage_files
  const id = nanoid()
  await db.insert(storageFiles).values({
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
): Promise<{
  stream: ReadableStream | ArrayBuffer
  mimeType: string
  size?: number
} | null> {
  const bindings = await getBindings()

  if (bindings.STORAGE_BUCKET) {
    const object = await bindings.STORAGE_BUCKET.get(key)
    if (!object) return null

    return {
      stream: object.body as any,
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

    return {
      stream: buffer.buffer as ArrayBuffer,
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

  await db.delete(storageFiles).where(eq(storageFiles.key, key))
  return true
}
