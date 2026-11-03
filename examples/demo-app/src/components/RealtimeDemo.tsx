import React, { useState, useEffect, useRef } from 'react'
import { client } from '../lib/edgekit'
import { usePersona } from '../context/PersonaContext'
import {
  Radio,
  Send,
  Users,
  Activity,
  Sparkles,
  Wifi,
  WifiOff,
  Database,
  MessageCircle,
  Eye,
} from 'lucide-react'

interface ChatMessage {
  id: string
  text: string
  sender: string
  personaId?: string
  timestamp: number
}

interface CdcEventLog {
  id: string
  table: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  recordId?: string
  timestamp: number
  data?: any
}

export const RealtimeDemo: React.FC = () => {
  const { activePersona, currentUser } = usePersona()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [connected, setConnected] = useState(false)
  const [activeUsers, setActiveUsers] = useState<Array<{ name: string; avatar: string; color: string }>>([
    { name: 'Alice (PM)', avatar: '👩', color: '#f97316' },
    { name: 'Bob (Tech Lead)', avatar: '👨', color: '#3b82f6' },
  ])
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const [cdcLogs, setCdcLogs] = useState<CdcEventLog[]>([])
  const typingTimeoutRef = useRef<any>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 1. Canal de Chat & Presença
    const collabChannel = client.realtime.channel('taskflow-collab')
    collabChannel.subscribe()
    setConnected(true)

    // Escuta mensagens de chat
    collabChannel.on('chat.message', (payload: any) => {
      setMessages((prev) => [
        ...prev,
        {
          id: payload.id || crypto.randomUUID(),
          text: payload.text || '',
          sender: payload.sender || 'Anônimo',
          personaId: payload.personaId,
          timestamp: payload.timestamp || Date.now(),
        },
      ])
    })

    // Escuta indicador de digitação
    collabChannel.on('chat.typing', (payload: any) => {
      if (payload.sender && payload.sender !== (currentUser?.name || activePersona.name)) {
        setTypingUser(payload.sender)
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = setTimeout(() => {
          setTypingUser(null)
        }, 2500)
      }
    })

    // 2. Canal de CDC do Banco de Dados
    const tasksCdc = client.from('tasks').on('*', (payload: any) => {
      setCdcLogs((prev) => [
        {
          id: crypto.randomUUID(),
          table: 'tasks',
          action: payload.action || 'UPDATE',
          recordId: payload.data?.id || payload.id,
          timestamp: Date.now(),
          data: payload.data || payload,
        },
        ...prev.slice(0, 19), // Mantém últimos 20 eventos
      ])
    })
    tasksCdc.subscribe()

    const commentsCdc = client.from('comments').on('*', (payload: any) => {
      setCdcLogs((prev) => [
        {
          id: crypto.randomUUID(),
          table: 'comments',
          action: payload.action || 'INSERT',
          recordId: payload.data?.id || payload.id,
          timestamp: Date.now(),
          data: payload.data || payload,
        },
        ...prev.slice(0, 19),
      ])
    })
    commentsCdc.subscribe()

    return () => {
      try {
        collabChannel.unsubscribe()
        tasksCdc.unsubscribe()
        commentsCdc.unsubscribe()
      } catch {}
      setConnected(false)
    }
  }, [currentUser, activePersona])

  // Scroll automático para a última mensagem
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value)
    // Emite evento de digitação efêmero
    try {
      client.realtime.channel('taskflow-collab').send('chat.typing', {
        sender: currentUser?.name || activePersona.name,
      })
    } catch {}
  }

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim()) return

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      text: inputText.trim(),
      sender: currentUser?.name || activePersona.name,
      personaId: activePersona.id,
      timestamp: Date.now(),
    }

    client.realtime.channel('taskflow-collab').send('chat.message', msg)
    // Adiciona localmente para feedback instantâneo
    setMessages((prev) => [...prev, msg])
    setInputText('')
  }

  return (
    <div className="space-y-6">
      {/* Header do Realtime */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-orange-400" />
            Realtime Colaborativo & CDC Stream
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            WebSockets multiplexados pelo Cloudflare Durable Objects com WebSocket Hibernation API.
          </p>
        </div>

        {/* Status de Conexão WebSocket */}
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
              connected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
          >
            {connected ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5" />}
            {connected ? 'DO WebSocket Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* Grid Principal: Chat Colaborativo + Live CDC Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel Esquerdo (7 colunas): Chat em Tempo Real com Presença */}
        <div className="lg:col-span-7 flex flex-col rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-5 space-y-4 h-[580px]">
          {/* Header da Sala com Avatares de Presença */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-orange-400" />
              <span className="font-semibold text-sm text-zinc-200">Sala #taskflow-collab</span>
            </div>

            {/* Presença Ativa */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-500 mr-1 flex items-center gap-1">
                <Users className="w-3 h-3" /> Online:
              </span>
              <div className="flex -space-x-1.5">
                {activeUsers.map((u, i) => (
                  <div
                    key={i}
                    title={u.name}
                    className="w-6 h-6 rounded-full border border-zinc-800 bg-zinc-900 flex items-center justify-center text-xs shadow"
                  >
                    {u.avatar}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-zinc-600 text-xs space-y-2">
                <Sparkles className="w-6 h-6 text-orange-400/40" />
                <p>Nenhuma mensagem ainda neste canal.</p>
                <p className="text-[11px] text-zinc-500">
                  Abra uma aba anônima ou alterne de Persona no topo para ver o chat sincronizar em tempo real!
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.sender === (currentUser?.name || activePersona.name)
                const isAlice = m.sender?.includes('Alice') || m.personaId === 'alice'

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <span>{isAlice ? '👩' : '👨'}</span>
                      <span className="font-medium text-zinc-400">{m.sender}</span>
                      <span>•</span>
                      <span>
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div
                      className={`px-3 py-2 rounded-2xl text-xs max-w-sm ${
                        isMe
                          ? 'bg-orange-500 text-zinc-950 font-medium rounded-tr-none'
                          : 'bg-zinc-800 text-zinc-200 rounded-tl-none border border-zinc-700/60'
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Indicador de Digitação */}
          {typingUser && (
            <div className="text-[11px] text-orange-400 italic flex items-center gap-1.5 animate-pulse">
              <span>✍️</span> {typingUser} está digitando...
            </div>
          )}

          {/* Formulário de Envio */}
          <form onSubmit={handleSendMessage} className="pt-2 border-t border-zinc-800 flex items-center gap-2">
            <input
              type="text"
              placeholder={`Enviar mensagem como ${activePersona.name}...`}
              value={inputText}
              onChange={handleInputChange}
              className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-zinc-950 font-bold transition disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Painel Direito (5 colunas): CDC Stream do Banco de Dados */}
        <div className="lg:col-span-5 flex flex-col rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-5 space-y-4 h-[580px]">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-sm text-zinc-200">CDC Database Stream</span>
            </div>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Live
            </span>
          </div>

          <p className="text-xs text-zinc-400">
            Eventos emitidos automaticamente via WebSockets quando mutações ocorrem em <code className="text-emerald-300">tasks</code> ou <code className="text-emerald-300">comments</code>.
          </p>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[11px]">
            {cdcLogs.length === 0 ? (
              <div className="text-center py-20 text-zinc-600 text-xs">
                <Database className="w-6 h-6 mx-auto mb-2 text-zinc-700" />
                Aguardando mutações no banco de dados...
              </div>
            ) : (
              cdcLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-1 animate-in fade-in"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        log.action === 'INSERT'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : log.action === 'UPDATE'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {log.action}
                    </span>
                    <span className="text-zinc-500 text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-zinc-300 truncate">
                    <span className="text-zinc-500">tabela:</span> {log.table} •{' '}
                    <span className="text-zinc-500">id:</span> {log.recordId}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
