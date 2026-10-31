import React, { useState, useEffect } from 'react'
import { client } from '../lib/edgekit'
import { Radio, Send, Sparkles } from 'lucide-react'

interface RealtimeDemoProps {
  user: any
}

interface ChatMessage {
  id: string
  text: string
  sender: string
  timestamp: number
}

export function RealtimeDemo({ user }: RealtimeDemoProps) {
  const [channelName, setChannelName] = useState('demo-room')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    // Inscreve no canal WebSocket
    const channel = client.realtime.channel(channelName)
    channel.subscribe()
    setConnected(true)

    channel.on('message', (payload: any) => {
      setMessages((prev) => [
        ...prev,
        {
          id: payload.id || crypto.randomUUID(),
          text: payload.text || '',
          sender: payload.sender || 'Anônimo',
          timestamp: payload.timestamp || Date.now(),
        },
      ])
    })

    channel.on('presence.join', (payload: any) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: `👋 ${payload.userName || 'Alguém'} entrou no canal`,
          sender: 'Sistema',
          timestamp: Date.now(),
        },
      ])
    })

    return () => {
      try {
        channel.unsubscribe()
      } catch {}
      setConnected(false)
    }
  }, [channelName])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!inputText.trim()) return

    const channel = client.realtime.channel(channelName)
    const newMsg = {
      id: crypto.randomUUID(),
      text: inputText.trim(),
      sender: user?.name || user?.email || 'Visitante',
      timestamp: Date.now(),
    }

    channel.send('message', newMsg)
    setInputText('')
  }

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Tempo Real (Durable Objects)</h2>
            <p className="text-xs text-zinc-400">WebSocket Hibernation API Multiplexada</p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            connected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
            }`}
          />
          {connected ? 'Conectado' : 'Conectando'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="realtime-channel-input" className="text-xs font-medium text-zinc-400">
          Canal:
        </label>
        <input
          id="realtime-channel-input"
          type="text"
          value={channelName}
          onChange={(e) => setChannelName(e.target.value.trim().toLowerCase())}
          placeholder="demo-room"
          className="px-2.5 py-1 bg-zinc-950/60 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-orange-500 w-36"
        />
        <span className="text-[11px] text-zinc-500">
          (Abra outra aba para ver as mensagens sincronizarem)
        </span>
      </div>

      {/* Caixa de Mensagens */}
      <div className="h-48 overflow-y-auto p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2 font-sans text-xs">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-center gap-1">
            <Sparkles className="w-5 h-5 text-zinc-600" />
            <p>Nenhuma mensagem ainda no canal "{channelName}".</p>
            <p className="text-[11px] text-zinc-600">Envie algo abaixo para testar o broadcast!</p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-2 rounded-lg ${
              m.sender === 'Sistema'
                ? 'bg-zinc-900/40 text-zinc-500 text-[11px] italic text-center'
                : 'bg-zinc-900/90 border border-zinc-800/80 text-zinc-200'
            }`}
          >
            {m.sender !== 'Sistema' && (
              <div className="flex justify-between items-center mb-0.5">
                <span className="font-semibold text-orange-400 text-[11px]">{m.sender}</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {new Date(m.timestamp).toLocaleTimeString()}
                </span>
              </div>
            )}
            <p>{m.text}</p>
          </div>
        ))}
      </div>

      {/* Formulário de Envio */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Digite uma mensagem em tempo real..."
          className="flex-1 px-3 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-orange-600/20 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          Enviar
        </button>
      </form>
    </div>
  )
}
