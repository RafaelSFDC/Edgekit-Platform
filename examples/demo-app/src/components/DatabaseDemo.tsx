import React, { useState, useEffect, useCallback } from 'react'
import { client } from '../lib/edgekit'
import { Database, Plus, RefreshCw, Trash2, CheckCircle, Clock, AlertTriangle, Radio } from 'lucide-react'

interface DatabaseDemoProps {
  user: any
}

interface TaskItem {
  id: string
  title: string
  content?: string
  status?: string
  completed?: number | boolean
  user_id?: string
  created_at?: string | number
}

export function DatabaseDemo({ user }: DatabaseDemoProps) {
  const [tableName, setTableName] = useState('tasks')
  const [items, setItems] = useState<TaskItem[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cdcEvents, setCdcEvents] = useState<string[]>([])
  const [realtimeActive, setRealtimeActive] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data, error } = await client
        .from(tableName)
        .select('*')
        .limit(20)
        .execute()

      if (error) {
        setErrorMsg(error.message)
        setItems([])
      } else {
        setItems((data as TaskItem[]) || [])
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao consultar banco de dados.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [tableName])

  useEffect(() => {
    fetchItems()

    // Realtime Change Data Capture (CDC) via WebSocket
    try {
      const channel = client.from(tableName).on('*', (payload) => {
        const time = new Date().toLocaleTimeString()
        setCdcEvents((prev) => [
          `[${time}] CDC Evento: ${payload.event || 'UPDATE'} na tabela ${tableName}`,
          ...prev.slice(0, 4),
        ])
        fetchItems()
      })
      setRealtimeActive(true)

      return () => {
        try {
          channel.unsubscribe()
        } catch {}
      }
    } catch {
      setRealtimeActive(false)
    }
  }, [tableName, user, fetchItems])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return

    setLoading(true)
    setErrorMsg(null)

    try {
      const { error } = await client.from(tableName).insert({
        title: newTitle.trim(),
        status: 'pending',
        completed: 0,
      })

      if (error) {
        setErrorMsg(error.message)
      } else {
        setNewTitle('')
        await fetchItems()
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao inserir registro.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await client.from(tableName).delete().eq('id', id)
      if (error) {
        setErrorMsg(error.message)
      } else {
        setItems((prev) => prev.filter((i) => i.id !== id))
      }
    } catch (err: any) {
      setErrorMsg(err.message)
    }
  }

  async function handleToggleStatus(item: TaskItem) {
    const isCompleted = item.completed === 1 || item.completed === true || item.status === 'completed'
    const newStatus = isCompleted ? 'pending' : 'completed'

    try {
      const { error } = await client
        .from(tableName)
        .update({
          status: newStatus,
          completed: isCompleted ? 0 : 1,
        })
        .eq('id', item.id)

      if (error) {
        setErrorMsg(error.message)
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: newStatus, completed: isCompleted ? 0 : 1 } : i,
          ),
        )
      }
    } catch (err: any) {
      setErrorMsg(err.message)
    }
  }

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Database & Policy Engine</h2>
            <p className="text-xs text-zinc-400">CRUD Tipado via `@edgekit/platform-client`</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {realtimeActive && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <Radio className="w-3 h-3 text-orange-400 animate-pulse" />
              CDC Ativo
            </span>
          )}
          <button
            onClick={fetchItems}
            disabled={loading}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="db-table-input" className="text-xs font-medium text-zinc-400 shrink-0">
          Tabela:
        </label>
        <input
          id="db-table-input"
          type="text"
          value={tableName}
          onChange={(e) => setTableName(e.target.value.trim().toLowerCase())}
          placeholder="ex: tasks, articles, notes"
          className="px-3 py-1.5 bg-zinc-950/60 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-orange-500 w-44"
        />
        <span className="text-[11px] text-zinc-500">
          (As regras da Policy Engine compilam direto em SQL)
        </span>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-200">Policy Engine / Banco de Dados:</p>
            <p className="mt-0.5">{errorMsg}</p>
            {errorMsg.includes('não possui políticas') && (
              <p className="mt-1.5 text-zinc-400">
                💡 <b>Deny-by-Default:</b> Para permitir leitura/escrita, acesse o painel Admin Studio
                (`http://localhost:5173`) e defina a regra (ex: `public`, `authenticated` ou `owner`).
              </p>
            )}
          </div>
        </div>
      )}

      {/* Formulário de Inserção */}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={`Adicionar novo item em "${tableName}"...`}
          className="flex-1 px-3 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500"
        />
        <button
          type="submit"
          disabled={loading || !newTitle.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-orange-600/20 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Criar
        </button>
      </form>

      {/* Lista de Itens */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {items.length === 0 && !loading && (
          <div className="py-8 text-center text-zinc-500 text-sm">
            Nenhum registro encontrado na tabela <code className="text-zinc-400">"{tableName}"</code>.
          </div>
        )}

        {items.map((item) => {
          const isDone = item.completed === 1 || item.completed === true || item.status === 'completed'
          return (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/50 border border-zinc-800/80 hover:border-zinc-700/80 transition-all group"
            >
              <button
                type="button"
                onClick={() => handleToggleStatus(item)}
                className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 text-left bg-transparent border-0 p-0 focus:outline-none"
              >
                {isDone ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-zinc-500 shrink-0 group-hover:text-zinc-300" />
                )}
                <div className="truncate">
                  <p
                    className={`text-sm font-medium truncate ${
                      isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="text-[10px] font-mono text-zinc-600 truncate">
                    ID: {item.id} {item.user_id ? `• Owner: ${item.user_id}` : ''}
                  </p>
                </div>
              </button>

              <button
                onClick={() => handleDelete(item.id)}
                className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-red-950/30 transition-colors ml-2"
                title="Excluir registro"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>

      {cdcEvents.length > 0 && (
        <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-[11px] font-mono text-zinc-400 space-y-1">
          <p className="text-zinc-500 font-semibold">Eventos CDC em Tempo Real:</p>
          {cdcEvents.map((ev, idx) => (
            <p key={idx} className="truncate text-orange-400/90">
              {ev}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
