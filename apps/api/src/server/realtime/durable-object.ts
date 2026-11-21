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

export interface WebSocketAttachment {
  userId: string
  userName: string
  channels: string[]
  connectedAt: number
  isAdmin?: boolean
}

/**
 * Hub Realtime Durable Object multiplexado com WebSocket Hibernation API.
 * Mantém presença e estado de canais através de ws.serializeAttachment() e ws.deserializeAttachment(),
 * garantindo custo zero de CPU/RAM ocioso na Cloudflare sem perda de estado ao acordar da hibernação.
 */
export class RealtimeDurableObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // 1. Handshake de WebSocket
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = [pair[0], pair[1]]

      const userId = url.searchParams.get('userId') || `anon_${crypto.randomUUID().slice(0, 8)}`
      const userName = url.searchParams.get('userName') || 'Anônimo'
      const isAdmin = url.searchParams.get('isAdmin') === 'true'
      const initialChannel = url.searchParams.get('channel')

      const initialChannels: string[] = []
      if (initialChannel && initialChannel.trim()) {
        const clean = initialChannel.trim()
        const isRestricted = clean.startsWith('_ek_') || clean.startsWith('db:')
        if (!isRestricted || isAdmin) {
          initialChannels.push(clean)
        }
      }

      // Preservação de presença em hibernação: uso obrigatório de serializeAttachment
      const attachment: WebSocketAttachment = {
        userId,
        userName,
        channels: initialChannels,
        connectedAt: Date.now(),
        isAdmin,
      }

      // Aceita WebSocket no contexto de hibernação da Cloudflare com tags
      this.ctx.acceptWebSocket(server, initialChannels)
      ;(server as any).serializeAttachment(attachment)

      // Notifica entrada do usuário no canal inicial, se houver
      if (initialChannel) {
        this.broadcast(initialChannel, {
          id: crypto.randomUUID(),
          channel: initialChannel,
          event: 'presence.join',
          payload: { userId, userName },
          timestamp: Date.now(),
        })
      }

      return new Response(null, { status: 101, webSocket: client })
    }

    // 2. Endpoint HTTP interno para broadcast disparado pelo backend (ex: CDC e Webhooks)
    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      const body = (await request.json()) as RealtimeMessage
      const delivered = this.broadcast(body.channel, body)
      return Response.json({ success: true, delivered })
    }

    // 3. Endpoint HTTP para consultar presença em um canal ou geral
    if (request.method === 'GET' && url.pathname.endsWith('/presence')) {
      const filterChannel = url.searchParams.get('channel')
      const users: Array<{ userId: string; userName: string; connectedAt: number }> = []

      // Recupera conexões hibernadas sem depender de Map em memória RAM
      for (const ws of this.ctx.getWebSockets()) {
        try {
          const session = (ws as any).deserializeAttachment() as WebSocketAttachment | null
          if (session) {
            if (!filterChannel || session.channels.includes(filterChannel)) {
              users.push({
                userId: session.userId,
                userName: session.userName,
                connectedAt: session.connectedAt,
              })
            }
          }
        } catch {
          // Ignora conexão inválida
        }
      }

      return Response.json({
        success: true,
        channel: filterChannel || 'all',
        count: users.length,
        users,
      })
    }

    return new Response('Not found', { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message)
      const parsed = JSON.parse(text)

      // Recupera o estado hibernado da conexão
      const session: WebSocketAttachment = (ws as any).deserializeAttachment() || {
        userId: 'anon',
        userName: 'Anônimo',
        channels: [],
        connectedAt: Date.now(),
      }

      const action = parsed.action || parsed.type

      // A) Assinatura dinâmica de canal
      if (action === 'subscribe') {
        const channelToSub = parsed.channel
        if (channelToSub && typeof channelToSub === 'string') {
          const cleanChannel = channelToSub.trim()
          const isRestricted = cleanChannel.startsWith('_ek_') || cleanChannel.startsWith('db:')
          if (isRestricted && !session.isAdmin) {
            ws.send(
              JSON.stringify({
                error: 'FORBIDDEN_CHANNEL',
                message: 'Assinatura em canais do sistema (_ek_*) ou CDC (db:*) é restrita a administradores e service_role.',
                channel: cleanChannel,
              }),
            )
            return
          }

          if (!session.channels.includes(cleanChannel)) {
            session.channels.push(cleanChannel)
            ;(ws as any).serializeAttachment(session)

            try {
              if (typeof (this.ctx as any).setWebSocketTags === 'function') {
                (this.ctx as any).setWebSocketTags(ws, session.channels)
              }
            } catch {}

            // Emite notificação de presença
            this.broadcast(cleanChannel, {
              id: crypto.randomUUID(),
              channel: cleanChannel,
              event: 'presence.join',
              payload: { userId: session.userId, userName: session.userName },
              timestamp: Date.now(),
            })
          }

          ws.send(
            JSON.stringify({
              event: 'subscribed',
              channel: cleanChannel,
              timestamp: Date.now(),
            }),
          )
        }
        return
      }

      // B) Cancelamento de assinatura dinâmica de canal
      if (action === 'unsubscribe') {
        const channelToUnsub = parsed.channel
        if (channelToUnsub && typeof channelToUnsub === 'string') {
          const cleanChannel = channelToUnsub.trim()
          session.channels = session.channels.filter((c) => c !== cleanChannel)
          ;(ws as any).serializeAttachment(session)

          try {
            if (typeof (this.ctx as any).setWebSocketTags === 'function') {
              (this.ctx as any).setWebSocketTags(ws, session.channels)
            }
          } catch {}

          this.broadcast(cleanChannel, {
            id: crypto.randomUUID(),
            channel: cleanChannel,
            event: 'presence.leave',
            payload: { userId: session.userId, userName: session.userName },
            timestamp: Date.now(),
          })

          ws.send(
            JSON.stringify({
              event: 'unsubscribed',
              channel: cleanChannel,
              timestamp: Date.now(),
            }),
          )
        }
        return
      }

      // C) Broadcast de mensagem pelo cliente
      const targetChannel = parsed.channel || session.channels[0]
      if (!targetChannel) {
        return
      }

      // PROTEÇÃO DE CDC: Clientes são bloqueados de injetar eventos em canais db:* e _ek_*
      if (targetChannel.startsWith('db:') || targetChannel.startsWith('_ek_')) {
        ws.send(
          JSON.stringify({
            error: 'FORBIDDEN_BROADCAST',
            message:
              'Broadcast direto em canais CDC de banco de dados (db:*) é proibido para clientes.',
            channel: targetChannel,
          }),
        )
        return
      }

      if (parsed.event) {
        this.broadcast(targetChannel, {
          id: crypto.randomUUID(),
          channel: targetChannel,
          event: parsed.event,
          payload: parsed.data ?? parsed.payload ?? {},
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
    try {
      const session = (ws as any).deserializeAttachment() as WebSocketAttachment | null
      if (session && session.channels && session.channels.length > 0) {
        for (const channel of session.channels) {
          this.broadcast(channel, {
            id: crypto.randomUUID(),
            channel,
            event: 'presence.leave',
            payload: { userId: session.userId, userName: session.userName },
            timestamp: Date.now(),
          })
        }
      }
    } catch {
      // Ignora erro no fechamento
    }
  }

  async webSocketError(ws: WebSocket, _error: any) {
    try {
      const session = (ws as any).deserializeAttachment() as WebSocketAttachment | null
      if (session && session.channels && session.channels.length > 0) {
        for (const channel of session.channels) {
          this.broadcast(channel, {
            id: crypto.randomUUID(),
            channel,
            event: 'presence.leave',
            payload: { userId: session.userId, userName: session.userName },
            timestamp: Date.now(),
          })
        }
      }
    } catch {
      // Ignora erro em falha de conexão
    }
  }

  private broadcast(channel: string, message: RealtimeMessage): number {
    const payload = JSON.stringify(message)
    let delivered = 0

    // 1. Otimização por tags se suportado nativamente pelo Hibernation API
    try {
      const taggedSockets =
        typeof (this.ctx as any).getWebSockets === 'function'
          ? (this.ctx as any).getWebSockets(channel)
          : null

      if (taggedSockets && taggedSockets.length > 0) {
        for (const ws of taggedSockets) {
          try {
            ws.send(payload)
            delivered++
          } catch {}
        }
        return delivered
      }
    } catch {}

    // 2. Fallback resiliente: itera todas as conexões hibernadas inspecionando attachment
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const session = (ws as any).deserializeAttachment() as WebSocketAttachment | null
        if (session && session.channels && session.channels.includes(channel)) {
          ws.send(payload)
          delivered++
        }
      } catch {
        // Conexão perdida
      }
    }

    return delivered
  }
}
