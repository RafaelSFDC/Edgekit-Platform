import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { getDb } from '../db'
import { storageFiles } from '../db/schema'
import { deleteFile, getFile, uploadFile } from '../storage/r2'
import { requireAuth } from '../auth/middleware'

export const storageRoutes = new Hono<AppEnv>()

// Listar arquivos de um bucket
storageRoutes.get('/:bucket/list', async (c) => {
  const bucket = c.req.param('bucket')
  const db = await getDb()

  const files = await db
    .select()
    .from(storageFiles)
    .where(eq(storageFiles.bucket, bucket))
    .all()

  return c.json({ success: true, data: files })
})

// Upload de arquivo
storageRoutes.post('/:bucket/upload', requireAuth(), async (c) => {
  const bucket = c.req.param('bucket')
  const user: any = c.get('user')

  try {
    const formData = await c.req.parseBody()
    const file = formData['file']

    if (!file || !(file instanceof File)) {
      return c.json(
        { success: false, error: { message: 'Envie um arquivo válido no campo "file".' } },
        400,
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
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
      size: file.size,
      userId: user?.id || null,
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

// Download ou visualização de arquivo
storageRoutes.get('/:bucket/file/*', async (c) => {
  const bucket = c.req.param('bucket')
  // Extrai a key após /:bucket/file/
  const url = new URL(c.req.url)
  const marker = `/storage/${bucket}/file/`
  const key = url.pathname.slice(url.pathname.indexOf(marker) + marker.length)

  const result = await getFile(bucket, key)
  if (!result) {
    return c.text('Arquivo não encontrado', 404)
  }

  const headers: Record<string, string> = {
    'Content-Type': result.mimeType,
    'Cache-Control': 'public, max-age=31536000, immutable',
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
