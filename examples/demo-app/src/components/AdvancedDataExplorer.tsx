import React, { useState, useEffect, useCallback } from 'react'
import { client } from '../lib/edgekit'
import {
  Search,
  Filter,
  ArrowUpDown,
  Code2,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
} from 'lucide-react'

export const AdvancedDataExplorer: React.FC = () => {
  const [table, setTable] = useState<'tasks' | 'projects' | 'comments'>('tasks')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string[]>(['pending', 'in_progress', 'completed'])
  const [minPriority, setMinPriority] = useState<number>(1)
  const [sortBy, setSortBy] = useState<string>('priority')
  const [sortAsc, setSortAsc] = useState<boolean>(false)
  const [page, setPage] = useState<number>(0)
  const pageSize = 5

  const [data, setData] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const [latency, setLatency] = useState<number>(0)
  const [lastQueryUrl, setLastQueryUrl] = useState<string>('')
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)

  const executeQuery = useCallback(async () => {
    setLoading(true)
    const startTime = performance.now()

    try {
      let q = client.from(table).select('*')

      if (table === 'tasks') {
        q = q.expand(['project_id', 'user_id'])

        if (searchTerm.trim()) {
          q = q.ilike('title', `%${searchTerm.trim()}%`)
        }

        if (selectedStatus.length > 0 && selectedStatus.length < 3) {
          q = q.in('status', selectedStatus)
        }

        if (minPriority > 1) {
          q = q.gte('priority', minPriority)
        }

        q = q.order(sortBy, { ascending: sortAsc })
      } else if (table === 'projects') {
        if (searchTerm.trim()) {
          q = q.ilike('name', `%${searchTerm.trim()}%`)
        }
        q = q.order('created_at', { ascending: sortAsc })
      } else if (table === 'comments') {
        q = q.expand(['task_id', 'user_id'])
        if (searchTerm.trim()) {
          q = q.ilike('content', `%${searchTerm.trim()}%`)
        }
        q = q.order('created_at', { ascending: sortAsc })
      }

      // Paginação com range
      const offset = page * pageSize
      q = q.range(offset, offset + pageSize - 1)

      const res = await q
      const endTime = performance.now()
      setLatency(Math.round(endTime - startTime))

      if (res.data) {
        setData(Array.isArray(res.data) ? res.data : [res.data])
        // @ts-ignore
        setTotalCount(res.meta?.total ?? (Array.isArray(res.data) ? res.data.length : 1))
      } else {
        setData([])
        setTotalCount(0)
      }
    } catch (err) {
      console.error(err)
      setData([])
    } finally {
      setLoading(false)
    }
  }, [table, searchTerm, selectedStatus, minPriority, sortBy, sortAsc, page])

  useEffect(() => {
    executeQuery()
  }, [executeQuery])

  const toggleStatusFilter = (st: string) => {
    setSelectedStatus((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st],
    )
    setPage(0)
  }

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header do Data Explorer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />
            Advanced Data Explorer
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Filtros avançados do SDK (<code className="text-indigo-300">ilike</code>, <code className="text-indigo-300">in</code>, <code className="text-indigo-300">gte</code>, <code className="text-indigo-300">order</code>, <code className="text-indigo-300">range</code>) e inspeção de payloads.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs">
            <button
              onClick={() => { setTable('tasks'); setPage(0) }}
              className={`px-3 py-1.5 rounded-lg transition font-medium ${
                table === 'tasks' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              tasks
            </button>
            <button
              onClick={() => { setTable('projects'); setPage(0) }}
              className={`px-3 py-1.5 rounded-lg transition font-medium ${
                table === 'projects' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              projects
            </button>
            <button
              onClick={() => { setTable('comments'); setPage(0) }}
              className={`px-3 py-1.5 rounded-lg transition font-medium ${
                table === 'comments' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              comments
            </button>
          </div>

          <button
            onClick={() => setIsInspectorOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition"
          >
            <Code2 className="w-4 h-4 text-indigo-400" />
            Inspecionar JSON
          </button>
        </div>
      </div>

      {/* Painel de Filtros e Busca */}
      <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Busca Textual ilike */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={`Filtrar ${table} por texto (SDK .ilike)...`}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(0)
              }}
              className="w-full pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Filtros específicos de Tasks */}
          {table === 'tasks' && (
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Chips de Status (in) */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-zinc-500 mr-1 font-mono">status in:</span>
                {['pending', 'in_progress', 'completed'].map((st) => {
                  const active = selectedStatus.includes(st)
                  return (
                    <button
                      key={st}
                      onClick={() => toggleStatusFilter(st)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition font-mono ${
                        active
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-semibold'
                          : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                      }`}
                    >
                      {st}
                    </button>
                  )
                })}
              </div>

              {/* Seletor de Prioridade (gte) */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className="text-[11px] text-zinc-500 font-mono">p &gt;=:</span>
                <select
                  value={minPriority}
                  onChange={(e) => {
                    setMinPriority(Number(e.target.value))
                    setPage(0)
                  }}
                  className="px-2 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 text-xs focus:outline-none"
                >
                  <option value={1}>1 (Todas)</option>
                  <option value={2}>2 (Média+)</option>
                  <option value={3}>3 (Alta+)</option>
                  <option value={4}>4 (Urgente+)</option>
                  <option value={5}>5 (Crítica)</option>
                </select>
              </div>

              {/* Ordenação */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className="text-[11px] text-zinc-500 font-mono">ordem:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-2 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 text-xs focus:outline-none"
                >
                  <option value="priority">priority</option>
                  <option value="created_at">created_at</option>
                  <option value="title">title</option>
                </select>
                <button
                  onClick={() => setSortAsc(!sortAsc)}
                  className="p-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-100"
                  title="Inverter direção de ordenação"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Resumo de Latência e Metadados */}
        <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-800/60 font-mono">
          <div className="flex items-center gap-4">
            <span>
              Registros retornados: <strong className="text-zinc-200">{data.length}</strong> de{' '}
              <strong className="text-zinc-200">{totalCount}</strong>
            </span>
            <span>
              Latência de execução: <strong className="text-emerald-400">{latency} ms</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => executeQuery()}
              className="flex items-center gap-1 hover:text-zinc-300 transition"
              title="Recarregar query"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Tabela de Resultados */}
      <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/70 text-zinc-400 border-b border-zinc-800 uppercase text-[10px] tracking-wider font-mono">
              {table === 'tasks' ? (
                <tr>
                  <th className="p-3">ID / Título</th>
                  <th className="p-3">Projeto Expandido</th>
                  <th className="p-3">Criador</th>
                  <th className="p-3">Prioridade</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Criado em</th>
                </tr>
              ) : table === 'projects' ? (
                <tr>
                  <th className="p-3">ID / Nome</th>
                  <th className="p-3">Descrição</th>
                  <th className="p-3">Cor</th>
                  <th className="p-3">User ID</th>
                  <th className="p-3">Criado em</th>
                </tr>
              ) : (
                <tr>
                  <th className="p-3">ID / Conteúdo</th>
                  <th className="p-3">Task Vinculada</th>
                  <th className="p-3">Autor</th>
                  <th className="p-3">Data</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-sans">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    Executando query no Edgekit D1...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500">
                    Nenhum registro encontrado para estes parâmetros de busca.
                  </td>
                </tr>
              ) : table === 'tasks' ? (
                data.map((task) => {
                  const proj = task.expand?.project_id || task.project
                  const usr = task.expand?.user_id || task.user
                  return (
                    <tr key={task.id} className="hover:bg-zinc-800/40 transition">
                      <td className="p-3">
                        <div className="font-semibold text-zinc-200">{task.title}</div>
                        <div className="text-[10px] font-mono text-zinc-500">{task.id}</div>
                      </td>
                      <td className="p-3">
                        {proj ? (
                          <span
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-full border inline-block"
                            style={{
                              color: proj.color,
                              borderColor: `${proj.color}40`,
                              backgroundColor: `${proj.color}15`,
                            }}
                          >
                            📁 {proj.name}
                          </span>
                        ) : (
                          <span className="text-zinc-600 italic">null</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-zinc-300">
                          <span>{usr?.name?.startsWith('Alice') ? '👩' : usr?.name?.startsWith('Bob') ? '👨' : '👤'}</span>
                          <span>{usr?.name || task.user_id}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="font-mono font-bold text-zinc-300">P{task.priority}</span>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                          {task.status}
                        </span>
                      </td>
                      <td className="p-3 text-zinc-500 font-mono text-[11px]">
                        {new Date(task.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })
              ) : table === 'projects' ? (
                data.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-800/40 transition">
                    <td className="p-3">
                      <div className="font-semibold text-zinc-200">{p.name}</div>
                      <div className="text-[10px] font-mono text-zinc-500">{p.id}</div>
                    </td>
                    <td className="p-3 text-zinc-400">{p.description || '-'}</td>
                    <td className="p-3">
                      <span className="inline-block w-4 h-4 rounded-full border border-zinc-700" style={{ backgroundColor: p.color }} />
                    </td>
                    <td className="p-3 font-mono text-[11px] text-zinc-400">{p.user_id}</td>
                    <td className="p-3 text-zinc-500 font-mono text-[11px]">{new Date(p.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              ) : (
                data.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-800/40 transition">
                    <td className="p-3">
                      <div className="text-zinc-200">{c.content}</div>
                      <div className="text-[10px] font-mono text-zinc-500">{c.id}</div>
                    </td>
                    <td className="p-3 font-mono text-zinc-400 text-[11px]">{c.task_id}</td>
                    <td className="p-3 text-zinc-300">{c.expand?.user_id?.name || c.user_id}</td>
                    <td className="p-3 text-zinc-500 font-mono text-[11px]">{new Date(c.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé de Paginação */}
        <div className="p-3 bg-zinc-950/70 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
          <div>
            Página <strong className="text-zinc-200">{page + 1}</strong> de{' '}
            <strong className="text-zinc-200">{Math.max(1, Math.ceil(totalCount / pageSize))}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * pageSize >= totalCount}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Inspecionar JSON e Query */}
      {isInspectorOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Code2 className="w-5 h-5 text-indigo-400" />
                Inspeção de Payload & Estrutura
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyJson}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiado!' : 'Copiar JSON'}
                </button>
                <button
                  onClick={() => setIsInspectorOpen(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              <pre className="text-xs font-mono text-zinc-300 bg-zinc-950 p-4 rounded-xl border border-zinc-800 overflow-x-auto">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500 font-mono">
              <span>Status: 200 OK</span>
              <span>Tempo de resposta: {latency}ms</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
