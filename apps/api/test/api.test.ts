import { describe, it, expect } from 'vitest'
import { app } from '../src/server/app'
import { getPlanCapabilities } from '../src/server/plan'
import { getBindings } from '../src/server/env'
import { createHonoBaseClient } from '../../../packages/client/src/index'

describe('HonoBase Core & Cloudflare Compatibility', () => {
  it('GET /health deve retornar status ok', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.status).toBe('ok')
    expect(json.service).toContain('HonoBase')
  })

  it('GET /openapi.json deve expor a especificação OpenAPI 3.1', async () => {
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.openapi).toBe('3.1.0')
    expect(json.info.title).toContain('HonoBase')
  })

  it('GET /api/v1/auth/public-config deve expor a chave anon e nome do app', async () => {
    const res = await app.request('/api/v1/auth/public-config')
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.appName).toBe('HonoBase')
    expect(json.data.anonKey).toBeDefined()
  })

  it('GET /api/v1/admin/setup-status deve retornar status do setup inicial', async () => {
    const res = await app.request('/api/v1/admin/setup-status')
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.success).toBe(true)
    expect(typeof json.data.isSetupComplete).toBe('boolean')
  })

  it('Detecção de plano no Free Tier deve ter D1, R2 e Durable Objects ativos', async () => {
    const capabilities = await getPlanCapabilities()
    expect(capabilities.plan).toBe('free')
    expect(capabilities.features.d1Database.enabled).toBe(true)
    expect(capabilities.features.r2Storage.enabled).toBe(true)
    expect(capabilities.features.realtimeDurableObjects.enabled).toBe(true)
    expect(capabilities.features.dynamicWorkers.enabled).toBe(false)
  })

  it('Tentativa de executar Dynamic Worker no Free Tier deve retornar HTTP 501 com aviso explicativo', async () => {
    const bindings = await getBindings()
    const validKey = bindings.HONOBASE_SERVICE_ROLE_KEY || 'hb_service_default'

    const res = await app.request('/api/v1/functions/dynamic/test-worker/exec', {
      method: 'POST',
      headers: {
        apikey: validKey,
      },
    })
    expect(res.status).toBe(501)
    const json: any = await res.json()
    expect(json.error.code).toBe('DYNAMIC_WORKERS_UNAVAILABLE')
    expect(json.error.message).toContain('Workers for Platforms')
  })

  it('SDK Cliente deve instanciar com métodos de banco, auth, storage e realtime', () => {
    const client = createHonoBaseClient({
      url: 'http://localhost:3000',
      anonKey: 'hb_anon_test',
    })

    expect(client.from).toBeDefined()
    expect(client.auth).toBeDefined()
    expect(client.storage).toBeDefined()
    expect(client.realtime).toBeDefined()
  })

  it('SDK Cliente pode executar requisições customizadas com o fetch do Hono app', async () => {
    const bindings = await getBindings()
    const anonKey = bindings.HONOBASE_ANON_KEY || 'hb_anon_test'

    const client = createHonoBaseClient({
      url: 'http://localhost',
      anonKey,
      fetch: async (input, init) => {
        const path = typeof input === 'string' ? new URL(input).pathname + new URL(input).search : input
        return Promise.resolve(app.request(path as string, init as any)) as unknown as Response
      },
    })

    const result = await client.from('users').select('id, name').limit(5).execute()
    expect(result.error).toBeNull()
    expect(Array.isArray(result.data)).toBe(true)
  })
})
