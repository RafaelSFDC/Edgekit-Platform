import { describe, it, expect, vi } from 'vitest'
import { createEdgekitClient } from '../src/index'

describe('@edgekit/platform-client — Suíte Canônica do SDK', () => {
  const fakeBaseUrl = 'https://api.edgekit.local'
  const fakeAnonKey = 'ek_anon_testkey123'

  it('inicializa com headers corretos e URL normalizada', () => {
    const client = createEdgekitClient({
      url: 'https://api.edgekit.local//',
      anonKey: fakeAnonKey,
    })
    expect(client.url).toBe(fakeBaseUrl)
  })

  describe('Database Query Builder & Predetermined Translation', () => {
    it('constrói corretamente consulta fluente com select, filtros, ordenação e paginação', async () => {
      let capturedUrl = ''
      let capturedHeaders: any = null

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url
        capturedHeaders = init?.headers
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [{ id: 'doc_1', title: 'Doc 1' }],
            meta: { total: 1, limit: 10, offset: 0, hasMore: false },
          }),
        }
      })

      const client = createEdgekitClient({
        url: fakeBaseUrl,
        anonKey: fakeAnonKey,
        fetch: mockFetch as any,
      })

      const { data, error, meta } = await client
        .from('documents')
        .select('id, title, status')
        .expand('author_id:users')
        .eq('status', 'published')
        .neq('archived', 'true')
        .gt('views', 100)
        .gte('likes', 10)
        .lt('rating', 5)
        .lte('flags', 0)
        .like('title', '%Edgekit%')
        .in('category', ['tech', 'cloud'])
        .notIn('tags', ['draft', 'temp'])
        .isNull('deleted_at')
        .isNotNull('published_at')
        .order('created_at', 'desc')
        .limit(10)
        .offset(20)
        .execute()

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(meta?.total).toBe(1)

      const parsedUrl = new URL(capturedUrl)
      expect(parsedUrl.pathname).toBe('/api/v1/db/documents')
      expect(parsedUrl.searchParams.get('select')).toBe('id, title, status')
      expect(parsedUrl.searchParams.get('expand')).toBe('author_id:users')
      expect(parsedUrl.searchParams.get('status')).toBe('eq:published')
      expect(parsedUrl.searchParams.get('archived')).toBe('neq:true')
      expect(parsedUrl.searchParams.get('views')).toBe('gt:100')
      expect(parsedUrl.searchParams.get('likes')).toBe('gte:10')
      expect(parsedUrl.searchParams.get('rating')).toBe('lt:5')
      expect(parsedUrl.searchParams.get('flags')).toBe('lte:0')
      expect(parsedUrl.searchParams.get('title')).toBe('like:%Edgekit%')
      expect(parsedUrl.searchParams.get('category')).toBe('in:tech,cloud')
      expect(parsedUrl.searchParams.get('tags')).toBe('not_in:draft,temp')
      expect(parsedUrl.searchParams.get('deleted_at')).toBe('is:null')
      expect(parsedUrl.searchParams.get('published_at')).toBe('is:not_null')
      expect(parsedUrl.searchParams.get('order')).toBe('created_at.desc')
      expect(parsedUrl.searchParams.get('limit')).toBe('10')
      expect(parsedUrl.searchParams.get('offset')).toBe('20')

      expect(capturedHeaders['apikey']).toBe(fakeAnonKey)
      expect(capturedHeaders['Authorization']).toBe(`Bearer ${fakeAnonKey}`)
    })

    it('suporta construtor de filtro genérico .filter()', async () => {
      let capturedUrl = ''
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url
        return {
          ok: true,
          json: async () => ({ success: true, data: [] }),
        }
      })

      const client = createEdgekitClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      await client
        .from('products')
        .filter('price', 'gt', 50)
        .filter('stock', 'in', [1, 2, 3])
        .filter('legacy_id', 'is', null)
        .filter('active_flag', 'is_not', null)
        .execute()

      const parsedUrl = new URL(capturedUrl)
      expect(parsedUrl.searchParams.get('price')).toBe('gt:50')
      expect(parsedUrl.searchParams.get('stock')).toBe('in:1,2,3')
      expect(parsedUrl.searchParams.get('legacy_id')).toBe('is:null')
      expect(parsedUrl.searchParams.get('active_flag')).toBe('is:not_null')
    })

    it('retorna erro formatado quando a resposta da API é status de erro', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 403,
          json: async () => ({
            success: false,
            error: { code: 'FORBIDDEN_TABLE', message: 'Tabela restrita pela Policy Engine.' },
          }),
        }
      })

      const client = createEdgekitClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const { data, error } = await client.from('private_vault').execute()
      expect(data).toBeNull()
      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Tabela restrita pela Policy Engine')
    })
  })

  describe('Database Mutations (Insert, Update, Delete, Query)', () => {
    it('insert() serializa payload JSON via POST', async () => {
      let capturedMethod = ''
      let capturedBody: any = null

      const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        capturedMethod = init.method
        capturedBody = JSON.parse(init.body)
        return {
          ok: true,
          json: async () => ({ success: true, data: { id: 'item_1', ...capturedBody } }),
        }
      })

      const client = createEdgekitClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const newRecord = { name: 'Novo Item', price: 99.9 }
      const { data, error } = await client.from('items').insert(newRecord)

      expect(error).toBeNull()
      expect(capturedMethod).toBe('POST')
      expect(capturedBody.name).toBe('Novo Item')
      expect(data?.name).toBe('Novo Item')
    })

    it('update().eq() serializa PATCH com identificador de recurso', async () => {
      let capturedUrl = ''
      let capturedMethod = ''
      let capturedBody: any = null

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url
        capturedMethod = init.method
        capturedBody = JSON.parse(init.body)
        return {
          ok: true,
          json: async () => ({ success: true, data: { id: 'item_42', ...capturedBody } }),
        }
      })

      const client = createEdgekitClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const { data, error } = await client
        .from('items')
        .update({ price: 149.9 })
        .eq('id', 'item_42')

      expect(error).toBeNull()
      expect(capturedUrl).toBe(`${fakeBaseUrl}/api/v1/db/items/item_42`)
      expect(capturedMethod).toBe('PATCH')
      expect(capturedBody.price).toBe(149.9)
      expect(data?.price).toBe(149.9)
    })

    it('delete().eq() serializa DELETE com identificador', async () => {
      let capturedUrl = ''
      let capturedMethod = ''

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url
        capturedMethod = init.method
        return {
          ok: true,
          json: async () => ({ success: true, id: 'item_99' }),
        }
      })

      const client = createEdgekitClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const { error } = await client.from('items').delete().eq('id', 'item_99')

      expect(error).toBeNull()
      expect(capturedUrl).toBe(`${fakeBaseUrl}/api/v1/db/items/item_99`)
      expect(capturedMethod).toBe('DELETE')
    })

    it('query() envia especificação declarativa estruturada', async () => {
      let capturedBody: any = null

      const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body)
        return {
          ok: true,
          json: async () => ({ success: true, data: [{ count: 42 }], meta: { total: 42 } }),
        }
      })

      const client = createEdgekitClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const spec = {
        select: ['id', 'title'],
        where: [{ field: 'status', op: 'eq', value: 'active' }],
        limit: 5,
      }

      const { data, error } = await client.from('items').query(spec)
      expect(error).toBeNull()
      expect(capturedBody.select).toEqual(['id', 'title'])
      expect(capturedBody.where[0].field).toBe('status')
      expect(data).toHaveLength(1)
    })
  })

  describe('Storage Client', () => {
    it('storage.getPublicUrl() retorna URL pública canônica', () => {
      const client = createEdgekitClient({ url: fakeBaseUrl })
      const { data } = client.storage.from('avatars').getPublicUrl('user-1/profile.png')
      expect(data.publicUrl).toBe(`${fakeBaseUrl}/api/v1/storage/avatars/file/user-1/profile.png`)
    })

    it('storage.list() busca arquivos do bucket', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({ success: true, data: [{ name: 'file1.pdf', size: 1024 }] }),
      }))

      const client = createEdgekitClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const { data, error } = await client.storage.from('documents').list()
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data[0].name).toBe('file1.pdf')
    })

    it('storage.delete() remove arquivo do bucket', async () => {
      let capturedUrl = ''
      let capturedMethod = ''

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url
        capturedMethod = init.method
        return {
          ok: true,
          json: async () => ({ success: true }),
        }
      })

      const client = createEdgekitClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const { error } = await client.storage.from('photos').delete('2026/summer.jpg')
      expect(error).toBeNull()
      expect(capturedUrl).toBe(`${fakeBaseUrl}/api/v1/storage/photos/file/2026/summer.jpg`)
      expect(capturedMethod).toBe('DELETE')
    })
  })

  describe('Auth Client', () => {
    it('auth.getUser() consulta /api/v1/auth/me do Better Auth', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        expect(url).toBe(`${fakeBaseUrl}/api/v1/auth/me`)
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              user: { id: 'usr_123', email: 'user@example.com' },
              session: { id: 'sess_123' },
            },
          }),
        }
      })

      const client = createEdgekitClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const { data, error } = await client.auth.getUser()
      expect(error).toBeNull()
      expect(data.user.email).toBe('user@example.com')
    })
  })

  describe('Realtime Channels', () => {
    it('realtime.channel() gerencia subscrições e callbacks de eventos', () => {
      const client = createEdgekitClient({ url: fakeBaseUrl })
      const channel = client.realtime.channel('chat:room_1')

      let receivedPayload: any = null
      channel.on('new_message', (payload) => {
        receivedPayload = payload
      })

      expect(receivedPayload).toBeNull()
      expect(typeof channel.subscribe).toBe('function')
      expect(typeof channel.send).toBe('function')
      expect(typeof channel.unsubscribe).toBe('function')
    })
  })
})
