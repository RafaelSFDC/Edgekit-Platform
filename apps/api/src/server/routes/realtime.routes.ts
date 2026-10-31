import { Hono, type Context } from 'hono'
import type { AppEnv } from '../types'
import { getBindings } from '../env'

export const realtimeRoutes = new Hono<AppEnv>()

const REALTIME_HUB_NAME = 'realtime_hub'

async function handleWebSocketUpgrade(c: Context<AppEnv>, defaultChannel?: string) {
  const bindings = await getBindings()
  const upgradeHeader = c.req.header('Upgrade')

  if (upgradeHeader !== 'websocket') {
    return c.text('Esperado cabeçalho Upgrade: websocket', 426)
  }

  const user = c.get('user')
  const target = new URL(c.req.url)

  if (defaultChannel) {
    if (defaultChannel.startsWith('_ek_') || defaultChannel.startsWith('db:')) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_CHANNEL',
            message: 'Acesso a canais internos do sistema (_ek_*, db:*) é restrito.',
          },
        },
        403,
      )
    }
    target.searchParams.set('channel', defaultChannel)
  }

  // Zero-Trust: Identidade de presença é derivada exclusivamente do token autenticado
  if (user) {
    target.searchParams.set('userId', user.id)
    target.searchParams.set('userName', user.name)
  } else {
    target.searchParams.set('userId', `anon_${crypto.randomUUID().slice(0, 8)}`)
    target.searchParams.set('userName', 'Anônimo')
  }

  // 1. Conecta ao Hub Realtime Durable Object multiplexado
  if (bindings.REALTIME) {
    const stub = bindings.REALTIME.getByName(REALTIME_HUB_NAME)
    return (stub as any).fetch(new Request(target.toString(), c.req.raw as any)) as any
  }

  // 2. Fallback de WebSocket direto no Worker (se rodando sem DO localmente)
  const pair = new WebSocketPair()
  const [client, server] = [pair[0], pair[1]]

  ;(server as any).accept?.()
  server.addEventListener('message', (event) => {
    try {
      server.send(event.data) // Echo fallback
    } catch {}
  })

  return new Response(null, { status: 101, webSocket: client } as any)
}

// Conexão WebSocket para o Hub Realtime (multiplexada para múltiplos canais)
realtimeRoutes.get('/ws', async (c) => {
  const channel = c.req.query('channel')
  return handleWebSocketUpgrade(c, channel)
})

// Conexão WebSocket com canal inicial na URL
realtimeRoutes.get('/:channel/ws', async (c) => {
  const channel = c.req.param('channel')
  return handleWebSocketUpgrade(c, channel)
})

// Disparar broadcast em um canal via HTTP
realtimeRoutes.post('/:channel/broadcast', async (c) => {
  const channel = c.req.param('channel')

  if (channel.startsWith('_ek_') || channel.startsWith('db:')) {
    return c.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_CHANNEL',
          message: 'Transmissão direta em canais de sistema (_ek_*) ou CDC (db:*) é proibida.',
        },
      },
      403,
    )
  }

  const bindings = await getBindings()
  const body = await c.req.json().catch(() => ({}))

  const message = {
    id: crypto.randomUUID(),
    channel,
    event: body.event || 'broadcast',
    payload: body.data || body.payload || {},
    timestamp: Date.now(),
  }

  if (bindings.REALTIME) {
    const stub = bindings.REALTIME.getByName(REALTIME_HUB_NAME)
    const res = await (stub as any).fetch(
      new Request(`http://internal/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      }),
    )
    return res as any
  }

  return c.json({ success: true, message: 'Broadcast simulado (sem Durable Object)' })
})

// Obter usuários na sala / canal
realtimeRoutes.get('/:channel/presence', async (c) => {
  const channel = c.req.param('channel')
  const bindings = await getBindings()

  if (bindings.REALTIME) {
    const stub = bindings.REALTIME.getByName(REALTIME_HUB_NAME)
    const res = await (stub as any).fetch(
      new Request(`http://internal/presence?channel=${encodeURIComponent(channel)}`),
    )
    return res as any
  }

  return c.json({
    success: true,
    channel,
    count: 0,
    users: [],
  })
})
