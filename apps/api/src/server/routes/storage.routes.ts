import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AppEnv } from '../types'
import { getDb } from '../db'
import { ekStorageObjects, ekStorageBuckets } from '../db/schema'
import {
  deleteFile,
  getFile,
  uploadFile,
  createSignedStorageUrl,
  verifySignedStorageUrl,
  validateBucketPolicy,
} from '../storage/r2'
import { requireAuth, requireAdmin } from '../auth/middleware'

export const storageRoutes = new Hono<AppEnv>()

// =========================================================================
// 1. GESTÃO DE BUCKETS (Admin / Service Role)
// =========================================================================

// Listar buckets cadastrados
storageRoutes.get('/buckets', async (c) => {
  const db = await getDb()
  const buckets = await db.select().from(ekStorageBuckets).all()

  // Se nenhum bucket cadastrado, retorna lista padrão
  if (buckets.length === 0) {
    return c.json({
      success: true,
      data: [
        {
          id: 'default',
          name: 'default',
          isPublic: true,
          readRule: 'public',
          writeRule: 'authenticated',
          maxSizeBytes: 10485760, // 10MB
          allowedMimeTypes: '["*"]',
        },
      ],
    })
  }

  return c.json({ success: true, data: buckets })
})

// Criar novo bucket
storageRoutes.post('/buckets', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { name, isPublic, allowedMimeTypes, maxSizeBytes, readRule, writeRule } = body

  if (!name) {
    return c.json({ success: false, error: { message: 'Nome do bucket é obrigatório.' } }, 400)
  }

  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')
  const db = await getDb()

  const existing = await db
    .select()
    .from(ekStorageBuckets)
    .where(eq(ekStorageBuckets.name, cleanName))
    .get()

  if (existing) {
    return c.json({ success: false, error: { message: 'Já existe um bucket com este nome.' } }, 400)
  }

  const now = new Date()
  const newBucket = {
    id: nanoid(),
    name: cleanName,
    isPublic: Boolean(isPublic),
    allowedMimeTypes: JSON.stringify(allowedMimeTypes || ['*']),
    maxSizeBytes: Number(maxSizeBytes) || 10485760,
    readRule: readRule || (isPublic ? 'public' : 'authenticated'),
    writeRule: writeRule || 'authenticated',
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(ekStorageBuckets).values(newBucket)
  return c.json({ success: true, data: newBucket }, 201)
})

// Atualizar políticas do bucket
storageRoutes.put('/buckets/:name', requireAdmin(), async (c) => {
  const name = c.req.param('name').trim()
  const body = await c.req.json().catch(() => ({}))
  const db = await getDb()

  const existing = await db
    .select()
    .from(ekStorageBuckets)
    .where(eq(ekStorageBuckets.name, name))
    .get()

  if (!existing) {
    return c.json({ success: false, error: { message: 'Bucket não encontrado.' } }, 404)
  }

  const updated = {
    isPublic: body.isPublic !== undefined ? Boolean(body.isPublic) : existing.isPublic,
    readRule: body.readRule || existing.readRule,
    writeRule: body.writeRule || existing.writeRule,
    maxSizeBytes: body.maxSizeBytes !== undefined ? Number(body.maxSizeBytes) : existing.maxSizeBytes,
    allowedMimeTypes: body.allowedMimeTypes ? JSON.stringify(body.allowedMimeTypes) : existing.allowedMimeTypes,
    updatedAt: new Date(),
  }

  await db.update(ekStorageBuckets).set(updated).where(eq(ekStorageBuckets.name, name))
  return c.json({ success: true, data: { ...existing, ...updated } })
})

// =========================================================================
// 2. OPERAÇÕES DE ARQUIVOS (Upload, List, Download, Signed URLs)
// =========================================================================

// Listar arquivos de um bucket
storageRoutes.get('/:bucket/list', async (c) => {
  const bucket = c.req.param('bucket')
  const db = await getDb()

  const files = await db
    .select()
    .from(ekStorageObjects)
    .where(eq(ekStorageObjects.bucket, bucket))
    .all()

  return c.json({ success: true, data: files })
})

// Gerar URL pré-assinada segura para um arquivo
storageRoutes.post('/:bucket/signed-url', requireAuth(), async (c) => {
  const bucket = c.req.param('bucket')
  const body = await c.req.json().catch(() => ({}))
  const { key, action, expiresInSeconds } = body

  if (!key) {
    return c.json({ success: false, error: { message: 'Informe a chave (key) do arquivo.' } }, 400)
  }

  const signed = await createSignedStorageUrl({
    bucket,
    key,
    action: action || 'read',
    expiresInSeconds: Number(expiresInSeconds) || 3600,
  })

  return c.json({ success: true, data: signed })
})

// Upload de arquivo com validação de políticas do bucket
storageRoutes.post('/:bucket/upload', requireAuth(), async (c) => {
  const bucket = c.req.param('bucket')
  const user: any = c.get('user')
  const admin = c.get('admin')

  try {
    const formData = await c.req.parseBody()
    const file = formData['file']

    if (!file || !(file instanceof File)) {
      return c.json(
        { success: false, error: { message: 'Envie um arquivo válido no campo "file".' } },
        400,
      )
    }

    const mimeType = file.type || 'application/octet-stream'

    // Validação de Política do Bucket (tamanho máximo e MIME types permitidos)
    const policyCheck = await validateBucketPolicy(bucket, file.size, mimeType)
    if (!policyCheck.allowed) {
      return c.json(
        { success: false, error: { code: 'POLICY_VIOLATION', message: policyCheck.error } },
        403,
      )
    }

    const pathPrefix = (formData['path'] as string) || ''
    const cleanPrefix = pathPrefix.replace(/^\/+|\/+$/g, '')
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = cleanPrefix ? `${cleanPrefix}/${Date.now()}-${safeName}` : `${Date.now()}-${safeName}`

    const arrayBuffer = await file.arrayBuffer()
    const metadata = await uploadFile({
      bucket,
      key,
      fileData: arrayBuffer,
      mimeType,
      fileName: file.name,
      size: file.size,
      userId: user?.id || admin?.id || null,
      isPublic: formData['isPublic'] !== 'false',
    })

    return c.json({ success: true, data: metadata }, 201)
  } catch (err: any) {
    return c.json(
      { success: false, error: { code: 'UPLOAD_FAILED', message: err.message } },
      500,
    )
  }
})

// Download ou streaming de arquivo com Range header e suporte a Signed URL
storageRoutes.get('/:bucket/file/*', async (c) => {
  const bucket = c.req.param('bucket')
  const url = new URL(c.req.url)
  const marker = `/storage/${bucket}/file/`
  const key = url.pathname.slice(url.pathname.indexOf(marker) + marker.length)

  const db = await getDb()
  const objectMeta = await db
    .select()
    .from(ekStorageObjects)
    .where(sql`${ekStorageObjects.bucket} = ${bucket} AND ${ekStorageObjects.key} = ${key}`)
    .get()

  // Se o objeto ou bucket é privado, exige token de autenticação ou Signed URL válida
  if (objectMeta && !objectMeta.isPublic) {
    const isAuthed = Boolean(c.get('user') || c.get('admin') || c.get('role') === 'service_role')
    const sig = url.searchParams.get('sig')
    const expires = url.searchParams.get('expires')
    const isSignedValid = await verifySignedStorageUrl(bucket, key, 'read', expires, sig)

    if (!isAuthed && !isSignedValid) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_FILE',
            message: 'Acesso restrito: este arquivo é privado e requer autenticação ou URL assinada válida.',
          },
        },
        403,
      )
    }
  }

  // Suporte a HTTP Range requests (Streaming de vídeo e áudio)
  const rangeHeader = c.req.header('range')
  let rangeParam: { offset?: number; length?: number } | undefined

  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    const parts = rangeHeader.slice(6).split('-')
    const start = parts[0] ? parseInt(parts[0], 10) : 0
    const end = parts[1] ? parseInt(parts[1], 10) : undefined
    rangeParam = {
      offset: start,
      length: end !== undefined ? end - start + 1 : undefined,
    }
  }

  const result = await getFile(bucket, key, rangeParam)
  if (!result) {
    return c.text('Arquivo não encontrado', 404)
  }

  const headers: Record<string, string> = {
    'Content-Type': result.mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': objectMeta?.isPublic ? 'public, max-age=31536000, immutable' : 'private, no-cache',
  }

  if (result.contentRange) {
    headers['Content-Range'] = result.contentRange
    if (rangeParam?.length) {
      headers['Content-Length'] = String(rangeParam.length)
    }
    return new Response(result.stream as any, {
      status: 206, // Partial Content
      headers,
    })
  }

  if (result.size) {
    headers['Content-Length'] = String(result.size)
  }

  return new Response(result.stream as any, {
    status: 200,
    headers,
  })
})

// Excluir arquivo
storageRoutes.delete('/:bucket/file/*', requireAuth(), async (c) => {
  const bucket = c.req.param('bucket')
  const url = new URL(c.req.url)
  const marker = `/storage/${bucket}/file/`
  const key = url.pathname.slice(url.pathname.indexOf(marker) + marker.length)

  await deleteFile(bucket, key)
  return c.json({ success: true, message: 'Arquivo excluído com sucesso.' })
})
