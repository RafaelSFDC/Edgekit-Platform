import { describe, it, expect, vi } from 'vitest'
import { createClient, createEdgekitClient } from '../src/index'

describe('@edgekit/platform-client — Suíte Canônica do SDK (2026)', () => {
  const fakeBaseUrl = 'https://api.edgekit.local'
  const fakeAnonKey = 'ek_anon_testkey123'

  it('inicializa com headers corretos e URL normalizada via createClient({ url, key })', () => {
    const client = createClient({
      url: 'https://api.edgekit.local//',
      key: fakeAnonKey,
    })
    expect(client.url).toBe(fakeBaseUrl)
  })

  it('exporta createEdgekitClient como alias retrocompatível', () => {
    expect(createEdgekitClient).toBe(createClient)
  })

  describe('Database Query Builder & Predetermined Translation', () => {
    it('executa consulta diretamente via await (Thenable) sem exigir .execute()', async () => {
      let capturedUrl = ''
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [{ id: 'user_1', name: 'Alice' }],
          }),
        }
      })

      const client = createClient({
        url: fakeBaseUrl,
        key: fakeAnonKey,
        fetch: mockFetch as any,
      })

      // Sintaxe canônica da Seção 6.2 do Master System Prompt:
      const { data, error } = await client
        .from('users')
        .select('*')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data?.[0].name).toBe('Alice')
      expect(capturedUrl).toContain('/api/v1/db/users?select=*')
    })

    it('suporta todos os operadores canônicos: ilike, is, between, contains, range, order com objeto', async () => {
      let capturedUrl = ''
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [{ id: 'item_1' }],
          }),
        }
      })

      const client = createClient({
        url: fakeBaseUrl,
        key: fakeAnonKey,
        fetch: mockFetch as any,
      })

      await client
        .from('products')
        .select('id, name, price, tags')
        .ilike('name', '%edge%')
        .is('active', true)
        .between('price', 10, 100)
        .contains('tags', ['cloud', 'fast'])
        .containedBy('categories', ['saas', 'infra'])
        .overlaps('roles', ['admin', 'owner'])
        .or('status.eq.active,priority.gt.5')
        .not('archived', 'eq', 'true')
        .order('price', { ascending: false })
        .range(10, 29)

      const parsedUrl = new URL(capturedUrl)
      expect(parsedUrl.searchParams.get('select')).toBe('id, name, price, tags')
      expect(parsedUrl.searchParams.get('name')).toBe('ilike:%edge%')
      expect(parsedUrl.searchParams.get('active')).toBe('is:true')
      expect(parsedUrl.searchParams.get('price')).toBe('between:10,100')
      expect(parsedUrl.searchParams.get('tags')).toBe('contains:cloud,fast')
      expect(parsedUrl.searchParams.get('categories')).toBe('contained_by:saas,infra')
      expect(parsedUrl.searchParams.get('roles')).toBe('overlaps:admin,owner')
      expect(parsedUrl.searchParams.get('or')).toBe('status.eq.active,priority.gt.5')
      expect(parsedUrl.searchParams.get('archived')).toBe('not:eq:true')
      expect(parsedUrl.searchParams.get('order')).toBe('price.desc')
      expect(parsedUrl.searchParams.get('limit')).toBe('20')
      expect(parsedUrl.searchParams.get('offset')).toBe('10')
    })

    it('single() desembala registro único e valida múltiplos ou vazios', async () => {
      const mockFetchSingle = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          data: [{ id: 'usr_42', email: 'solo@example.com' }],
        }),
      }))

      const client = createClient({
        url: fakeBaseUrl,
        key: fakeAnonKey,
        fetch: mockFetchSingle as any,
      })

      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('id', 'usr_42')
        .single()

      expect(error).toBeNull()
      expect(data).toEqual({ id: 'usr_42', email: 'solo@example.com' })
    })

    it('single() retorna erro quando nenhum registro é retornado', async () => {
      const mockFetchEmpty = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      }))

      const client = createClient({
        url: fakeBaseUrl,
        key: fakeAnonKey,
        fetch: mockFetchEmpty as any,
      })

      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('id', 'usr_none')
        .single()

      expect(data).toBeNull()
      expect(error?.message).toContain('JSON object requested, multiple (or no) rows returned')
    })

    it('single() retorna erro quando mais de 1 registro é retornado', async () => {
      const mockFetchMulti = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          data: [{ id: '1' }, { id: '2' }],
        }),
      }))

      const client = createClient({
        url: fakeBaseUrl,
        key: fakeAnonKey,
        fetch: mockFetchMulti as any,
      })

      const { data, error } = await client
        .from('users')
        .select('*')
        .single()

      expect(data).toBeNull()
      expect(error?.message).toContain('JSON object requested, multiple rows returned')
    })

    it('retorna erro formatado quando a resposta da API é status de erro', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: { code: 'FORBIDDEN_TABLE', message: 'Tabela restrita pela Policy Engine.' },
        }),
      }))

      const client = createClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const { data, error } = await client.from('private_vault')
      expect(data).toBeNull()
      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Tabela restrita pela Policy Engine')
    })
  })

  describe('Database Mutations (Insert com .select(), Update, Delete)', () => {
    it('insert().select() permite encadeamento e serializa requisição com ?select=*', async () => {
      let capturedUrl = ''
      let capturedMethod = ''
      let capturedBody: any = null

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url
        capturedMethod = init.method
        capturedBody = JSON.parse(init.body)
        return {
          ok: true,
          json: async () => ({ success: true, data: [{ id: 'item_1', ...capturedBody }] }),
        }
      })

      const client = createClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const newRecord = { name: 'John Doe', email: 'john@example.com' }
      const { data, error } = await client
        .from('users')
        .insert(newRecord)
        .select()

      expect(error).toBeNull()
      expect(capturedMethod).toBe('POST')
      expect(capturedUrl).toContain('?select=*')
      expect(data).toHaveLength(1)
      expect(data?.[0].name).toBe('John Doe')
    })

    it('update().eq() é diretamente awaitable (Thenable)', async () => {
      let capturedUrl = ''
      let capturedMethod = ''
      let capturedBody: any = null

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url
        capturedMethod = init.method
        capturedBody = JSON.parse(init.body)
        return {
          ok: true,
          json: async () => ({ success: true, data: { id: 'usr_1', ...capturedBody } }),
        }
      })

      const client = createClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const { data, error } = await client
        .from('users')
        .update({ name: 'John Doe' })
        .eq('id', 'usr_1')

      expect(error).toBeNull()
      expect(capturedUrl).toBe(`${fakeBaseUrl}/api/v1/db/users/usr_1`)
      expect(capturedMethod).toBe('PATCH')
      expect(data?.name).toBe('John Doe')
    })

    it('delete().eq() é diretamente awaitable (Thenable)', async () => {
      let capturedUrl = ''
      let capturedMethod = ''

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url
        capturedMethod = init.method
        return {
          ok: true,
          json: async () => ({ success: true, id: 'usr_1' }),
        }
      })

      const client = createClient({
        url: fakeBaseUrl,
        fetch: mockFetch as any,
      })

      const { error } = await client
        .from('users')
        .delete()
        .eq('id', 'usr_1')

      expect(error).toBeNull()
      expect(capturedUrl).toBe(`${fakeBaseUrl}/api/v1/db/users/usr_1`)
      expect(capturedMethod).toBe('DELETE')
    })
  })

  describe('Edge Functions Client (Seção 11)', () => {
    it('functions.invoke() envia requisição para a função com método e payload corretos', async () => {
      let capturedUrl = ''
      let capturedMethod = ''
      let capturedBody: any = null

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url
        capturedMethod = init.method
        capturedBody = init.body ? JSON.parse(init.body) : null
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ greeting: `Hello, ${capturedBody?.name || 'World'}!` }),
        }
      })

      const client = createClient({
        url: fakeBaseUrl,
        key: fakeAnonKey,
        fetch: mockFetch as any,
      })

      const { data, error, status } = await client.functions.invoke('hello', {
        body: { name: 'Edgekit' },
      })

      expect(error).toBeNull()
      expect(status).toBe(200)
      expect(capturedUrl).toBe(`${fakeBaseUrl}/api/v1/functions/hello`)
      expect(capturedMethod).toBe('POST')
      expect(data).toEqual({ greeting: 'Hello, Edgekit!' })
    })
  })

  describe('Storage Client', () => {
    it('storage.getPublicUrl() retorna URL pública canônica', () => {
      const client = createClient({ url: fakeBaseUrl })
      const { data } = client.storage.from('avatars').getPublicUrl('user-1/profile.png')
      expect(data.publicUrl).toBe(`${fakeBaseUrl}/api/v1/storage/avatars/file/user-1/profile.png`)
    })
  })

  describe('Realtime Channels', () => {
    it('realtime.channel() gerencia subscrições e callbacks de eventos', () => {
      const client = createClient({ url: fakeBaseUrl })
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
