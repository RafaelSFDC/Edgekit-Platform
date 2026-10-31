import { DurableObject } from 'cloudflare:workers'

export interface RealtimeMessage {
  id: string
  channel: string
  event: string
  payload: any
  timestamp: number
  userId?: string
  userName?: string
}

export class RealtimeDurableObject extends DurableObject {
  private sessions = new Map<WebSocket, { userId: string; userName: string; channel: string }>()

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Handshake de WebSocket
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = [pair[0], pair[1]]

      const userId = url.searchParams.get('userId') || `anon_${Math.random().toString(36).slice(2, 8)}`
      const userName = url.searchParams.get('userName') || 'Anônimo'
      const channel = url.searchParams.get('channel') || 'global'

      // Usando hibernatable WebSockets da Cloudflare
      this.ctx.acceptWebSocket(server, [channel])

      this.sessions.set(server, { userId, userName, channel })

      // Notifica entrada do usuário no canal
      this.broadcast(channel, {
        id: crypto.randomUUID(),
        channel,
        event: 'presence.join',
        payload: { userId, userName },
        timestamp: Date.now(),
      })

      return new Response(null, { status: 101, webSocket: client })
    }

    // Endpoint HTTP interno para disparar broadcast no Durable Object
    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      const body = (await request.json()) as RealtimeMessage
      this.broadcast(body.channel, body)
      return Response.json({ success: true })
    }

    // Endpoint HTTP para ver usuários conectados na sala
    if (request.method === 'GET' && url.pathname.endsWith('/presence')) {
      const users: Array<{ userId: string; userName: string }> = []
      for (const s of this.sessions.values()) {
        users.push({ userId: s.userId, userName: s.userName })
      }
      return Response.json({ success: true, count: users.length, users })
    }

    return new Response('Not found', { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message)
      const parsed = JSON.parse(text)
      const session = this.sessions.get(ws)

      if (parsed.event && session) {
        this.broadcast(session.channel, {
          id: crypto.randomUUID(),
          channel: session.channel,
          event: parsed.event,
          payload: parsed.data || parsed.payload,
          timestamp: Date.now(),
          userId: session.userId,
          userName: session.userName,
        })
      }
    } catch {
      // Ignora mensagens mal formatadas
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string) {
    const session = this.sessions.get(ws)
    if (session) {
      this.sessions.delete(ws)
      this.broadcast(session.channel, {
        id: crypto.randomUUID(),
        channel: session.channel,
        event: 'presence.leave',
        payload: { userId: session.userId, userName: session.userName },
        timestamp: Date.now(),
      })
    }
  }

  private broadcast(channel: string, message: RealtimeMessage) {
    const payload = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets(channel)) {
      try {
        ws.send(payload)
      } catch {
        // Conexão perdida
      }
    }
  }
}
