import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getBindings } from '../env'

export const realtimeRoutes = new Hono<AppEnv>()

// Conexão WebSocket para um canal Realtime
realtimeRoutes.get('/:channel/ws', async (c) => {
  const channel = c.req.param('channel')
  const bindings = await getBindings()
  const upgradeHeader = c.req.header('Upgrade')

  if (upgradeHeader !== 'websocket') {
    return c.text('Esperado cabeçalho Upgrade: websocket', 426)
  }

  const user = c.get('user')
  const incomingUrl = new URL(c.req.url)
  const target = new URL(c.req.url)

  target.searchParams.set('channel', channel)
  if (user) {
    target.searchParams.set('userId', user.id)
    target.searchParams.set('userName', user.name)
  } else if (!target.searchParams.has('userId')) {
    target.searchParams.set(
      'userId',
      incomingUrl.searchParams.get('userId') || `anon_${Math.random().toString(36).slice(2, 7)}`,
    )
    target.searchParams.set(
      'userName',
      incomingUrl.searchParams.get('userName') || 'Anônimo',
    )
  }

  // 1. Usar Durable Object se disponível
  if (bindings.REALTIME) {
    const stub = bindings.REALTIME.getByName(channel)
    return (stub as any).fetch(new Request(target.toString(), c.req.raw as any)) as any
  }

  // 2. Fallback de WebSocket direto no Worker (se rodando sem DO)
  const pair = new WebSocketPair()
  const [client, server] = [pair[0], pair[1]]

  ;(server as any).accept?.()
  server.addEventListener('message', (event) => {
    try {
      server.send(event.data) // Echo fallback
    } catch {}
  })

  return new Response(null, { status: 101, webSocket: client } as any)
})

// Disparar broadcast em um canal via HTTP
realtimeRoutes.post('/:channel/broadcast', async (c) => {
  const channel = c.req.param('channel')
  const bindings = await getBindings()
  const body = await c.req.json()

  const message = {
    id: crypto.randomUUID(),
    channel,
    event: body.event || 'broadcast',
    payload: body.data || body.payload || {},
    timestamp: Date.now(),
  }

  if (bindings.REALTIME) {
    const stub = bindings.REALTIME.getByName(channel)
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

// Obter usuários na sala
realtimeRoutes.get('/:channel/presence', async (c) => {
  const channel = c.req.param('channel')
  const bindings = await getBindings()

  if (bindings.REALTIME) {
    const stub = bindings.REALTIME.getByName(channel)
    const res = await (stub as any).fetch(new Request(`http://internal/presence`))
    return res as any
  }

  return c.json({ success: true, count: 0, users: [] })
})
