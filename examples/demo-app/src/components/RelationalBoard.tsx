import React, { useState, useEffect, useCallback } from 'react'
import { client } from '../lib/edgekit'
import { usePersona } from '../context/PersonaContext'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  MessageSquare,
  Trash2,
  FolderKanban,
  User,
  Radio,
  Send,
  X,
  Sparkles,
  ShieldAlert,
} from 'lucide-react'

interface Project {
  id: string
  name: string
  description?: string
  color: string
  user_id: string
}

interface Task {
  id: string
  project_id: string | null
  user_id: string
  title: string
  description: string | null
  priority: number
  status: 'pending' | 'in_progress' | 'completed'
  due_date: string | null
  completed: number
  created_at: string
  expand?: {
    project_id?: Project | null
    user_id?: { id: string; name: string; email: string } | null
  }
  project?: Project | null
  user?: { id: string; name: string; email: string } | null
}

interface Comment {
  id: string
  task_id: string
  user_id: string
  content: string
  created_at: string
  user?: { id: string; name: string; email: string } | null
}

const COLUMNS: Array<{ id: 'pending' | 'in_progress' | 'completed'; label: string; icon: any; color: string }> = [
  { id: 'pending', label: 'A Fazer', icon: Clock, color: 'text-amber-400 border-amber-500/30 bg-amber-500/5' },
  { id: 'in_progress', label: 'Em Progresso', icon: Radio, color: 'text-blue-400 border-blue-500/30 bg-blue-500/5' },
  { id: 'completed', label: 'Concluído', icon: CheckCircle2, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' },
]

export const RelationalBoard: React.FC = () => {
  const { activePersona, currentUser } = usePersona()
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [commentsMap, setCommentsMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState<boolean>(true)
  const [rlsError, setRlsError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Modals state
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false)
  const [activeTaskForComments, setActiveTaskForComments] = useState<Task | null>(null)
  const [taskComments, setTaskComments] = useState<Comment[]>([])
  const [newCommentContent, setNewCommentContent] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskProjectId, setNewTaskProjectId] = useState<string>('')
  const [newTaskPriority, setNewTaskPriority] = useState<number>(3)
  const [newTaskStatus, setNewTaskStatus] = useState<'pending' | 'in_progress' | 'completed'>('pending')
  const [isSubmittingTask, setIsSubmittingTask] = useState(false)

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setRlsError(msg)
      setTimeout(() => setRlsError(null), 5000)
    } else {
      setSuccessMsg(msg)
      setTimeout(() => setSuccessMsg(null), 3500)
    }
  }

  // Busca dados relacionais com foreign keys expandidas
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)

      // 1. Busca projetos
      const projRes = await client.from<Project[]>('projects').select('*').order('name')
      if (projRes.data) {
        const pList = Array.isArray(projRes.data) ? projRes.data : [projRes.data]
        setProjects(pList)
        if (!newTaskProjectId && pList.length > 0) {
          setNewTaskProjectId(pList[0].id)
        }
      }

      // 2. Busca tarefas com .expand(['project_id', 'user_id'])
      const tasksRes = await client
        .from<Task[]>('tasks')
        .select('*')
        .expand(['project_id', 'user_id'])
        .order('priority', { ascending: false })

      if (tasksRes.data) {
        setTasks(Array.isArray(tasksRes.data) ? tasksRes.data : [tasksRes.data])
      }

      // 3. Busca contagem de comentários por tarefa
      const commRes = await client.from<Comment[]>('comments').select('id, task_id')
      if (commRes.data) {
        const cList = Array.isArray(commRes.data) ? commRes.data : [commRes.data]
        const counts: Record<string, number> = {}
        for (const c of cList) {
          counts[c.task_id] = (counts[c.task_id] || 0) + 1
        }
        setCommentsMap(counts)
      }
    } catch (err: any) {
      showNotification(`Erro ao carregar dados: ${err.message}`, true)
    } finally {
      setLoading(false)
    }
  }, [newTaskProjectId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Subscrição CDC em tempo real via WebSockets
  useEffect(() => {
    const tasksChannel = client.from('tasks').on('*', () => {
      fetchData()
    })
    tasksChannel.subscribe()

    const commentsChannel = client.from('comments').on('*', () => {
      fetchData()
      if (activeTaskForComments) {
        fetchCommentsForTask(activeTaskForComments.id)
      }
    })
    commentsChannel.subscribe()

    return () => {
      tasksChannel.unsubscribe()
      commentsChannel.unsubscribe()
    }
  }, [fetchData, activeTaskForComments])

  // Busca comentários de uma tarefa específica
  const fetchCommentsForTask = async (taskId: string) => {
    try {
      const res = await client
        .from<Comment[]>('comments')
        .select('*')
        .eq('task_id', taskId)
        .expand(['user_id'])
        .order('created_at', { ascending: true })

      if (res.data) {
        setTaskComments(Array.isArray(res.data) ? res.data : [res.data])
      }
    } catch (err: any) {
      showNotification(`Erro ao carregar comentários: ${err.message}`, true)
    }
  }

  const handleOpenComments = (task: Task) => {
    setActiveTaskForComments(task)
    fetchCommentsForTask(task.id)
  }

  // Criação de nova tarefa
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return

    if (!currentUser?.id && activePersona.id === 'anon') {
      showNotification('Operação bloqueada por RLS: Apenas usuários autenticados podem criar tarefas.', true)
      return
    }

    setIsSubmittingTask(true)
    try {
      const userId = currentUser?.id || (activePersona.id === 'alice' ? 'user_alice_taskflow' : 'user_bob_taskflow')
      const taskId = `task_${Date.now()}`

      const res = await client.from('tasks').insert({
        id: taskId,
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim() || null,
        project_id: newTaskProjectId || null,
        user_id: userId,
        priority: Number(newTaskPriority),
        status: newTaskStatus,
        completed: newTaskStatus === 'completed' ? 1 : 0,
      })

      if (res.error) {
        showNotification(`Violação de RLS/Validação: ${res.error.message}`, true)
      } else {
        showNotification('Tarefa criada com sucesso!')
        setIsNewTaskOpen(false)
        setNewTaskTitle('')
        setNewTaskDesc('')
        await fetchData()
      }
    } catch (err: any) {
      showNotification(`Erro ao criar tarefa: ${err.message}`, true)
    } finally {
      setIsSubmittingTask(false)
    }
  }

  // Atualização de status da tarefa (Testa RLS de UPDATE)
  const handleUpdateStatus = async (task: Task, nextStatus: 'pending' | 'in_progress' | 'completed') => {
    try {
      const res = await client
        .from('tasks')
        .update({
          status: nextStatus,
          completed: nextStatus === 'completed' ? 1 : 0,
        })
        .eq('id', task.id)

      if (res.error) {
        showNotification(
          `403 RLS Bloqueado: Apenas o proprietário (${task.user?.name || task.user_id}) pode modificar esta tarefa!`,
          true,
        )
      } else {
        showNotification(`Status alterado para "${nextStatus}"`)
        await fetchData()
      }
    } catch (err: any) {
      showNotification(`Erro de RLS: ${err.message}`, true)
    }
  }

  // Exclusão de tarefa (Testa RLS de DELETE)
  const handleDeleteTask = async (task: Task) => {
    if (!confirm(`Deseja excluir a tarefa "${task.title}"?`)) return
    try {
      const res = await client.from('tasks').delete().eq('id', task.id)

      if (res.error) {
        showNotification(
          `403 RLS Bloqueado: Você não é o proprietário desta tarefa para excluí-la.`,
          true,
        )
      } else {
        showNotification('Tarefa excluída!')
        await fetchData()
      }
    } catch (err: any) {
      showNotification(`Erro de RLS: ${err.message}`, true)
    }
  }

  // Inserção de comentário
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCommentContent.trim() || !activeTaskForComments) return

    if (!currentUser?.id && activePersona.id === 'anon') {
      showNotification('Bloqueado por RLS: Visitantes anônimos não podem enviar comentários.', true)
      return
    }

    setSubmittingComment(true)
    try {
      const userId = currentUser?.id || (activePersona.id === 'alice' ? 'user_alice_taskflow' : 'user_bob_taskflow')
      const res = await client.from('comments').insert({
        id: `comm_${Date.now()}`,
        task_id: activeTaskForComments.id,
        user_id: userId,
        content: newCommentContent.trim(),
      })

      if (res.error) {
        showNotification(`Erro de RLS: ${res.error.message}`, true)
      } else {
        setNewCommentContent('')
        await fetchCommentsForTask(activeTaskForComments.id)
        await fetchData()
      }
    } catch (err: any) {
      showNotification(`Falha ao adicionar comentário: ${err.message}`, true)
    } finally {
      setSubmittingComment(false)
    }
  }

  const getPriorityBadge = (p: number) => {
    switch (p) {
      case 5:
        return <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">P5 Crítica</span>
      case 4:
        return <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">P4 Alta</span>
      case 3:
        return <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">P3 Média</span>
      default:
        return <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-zinc-700/50 text-zinc-400">P{p} Baixa</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* Alertas Dinâmicos de RLS / Notificações */}
      {rlsError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm animate-in fade-in slide-in-from-top-2">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          <div className="flex-1 font-medium">{rlsError}</div>
          <button onClick={() => setRlsError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="flex-1">{successMsg}</div>
        </div>
      )}

      {/* Header do Quadro com Botões de Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-orange-400" />
            TaskFlow Pro: Quadro Relacional
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Consumo de foreign keys via <code className="text-orange-300 bg-orange-950/40 px-1 py-0.5 rounded">.expand(['project_id', 'user_id'])</code> e controle granular por RLS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsNewTaskOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-zinc-950 font-semibold rounded-xl text-xs transition shadow-lg shadow-orange-500/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Nova Tarefa
          </button>
        </div>
      </div>

      {/* Grid de Colunas Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id)
          const ColIcon = col.icon

          return (
            <div key={col.id} className="flex flex-col rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-4 min-h-[500px]">
              {/* Cabeçalho da Coluna */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg border ${col.color}`}>
                    <ColIcon className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-sm text-zinc-200">{col.label}</span>
                </div>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                  {colTasks.length}
                </span>
              </div>

              {/* Lista de Tarefas */}
              <div className="flex-1 space-y-3">
                {colTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-600 text-xs">
                    <p>Nenhuma tarefa nesta etapa</p>
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const project = task.expand?.project_id || task.project
                    const user = task.expand?.user_id || task.user
                    const isOwner = currentUser?.id ? task.user_id === currentUser.id : false
                    const commentsCount = commentsMap[task.id] || 0

                    return (
                      <div
                        key={task.id}
                        className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 transition shadow-sm group space-y-3"
                      >
                        {/* Top: Projeto expandido & Prioridade */}
                        <div className="flex items-center justify-between gap-2">
                          {project ? (
                            <span
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-full border truncate max-w-[140px]"
                              style={{
                                color: project.color,
                                borderColor: `${project.color}40`,
                                backgroundColor: `${project.color}15`,
                              }}
                            >
                              📁 {project.name}
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 italic">Sem projeto</span>
                          )}

                          {getPriorityBadge(task.priority)}
                        </div>

                        {/* Título & Descrição */}
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-100 group-hover:text-orange-300 transition">
                            {task.title}
                          </h4>
                          {task.description && (
                            <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                        </div>

                        {/* Rodapé do Card: Usuário Criador, Comentários e Ações */}
                        <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
                          <div className="flex items-center gap-1.5" title={`Criador: ${user?.name || task.user_id}`}>
                            <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px]">
                              {user?.name?.startsWith('Alice') ? '👩' : user?.name?.startsWith('Bob') ? '👨' : '👤'}
                            </div>
                            <span className="text-[11px] text-zinc-400 truncate max-w-[80px]">
                              {user?.name ? user.name.split(' ')[0] : 'User'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Botão de Comentários */}
                            <button
                              onClick={() => handleOpenComments(task)}
                              className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition text-[11px]"
                              title="Ver e adicionar comentários"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>{commentsCount}</span>
                            </button>

                            {/* Dropdown / Botão de Mover Status */}
                            {col.id !== 'completed' && (
                              <button
                                onClick={() => handleUpdateStatus(task, col.id === 'pending' ? 'in_progress' : 'completed')}
                                className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] font-medium text-zinc-300 transition"
                                title="Avançar status (Testa RLS de UPDATE)"
                              >
                                Avançar →
                              </button>
                            )}

                            {col.id === 'completed' && (
                              <button
                                onClick={() => handleUpdateStatus(task, 'pending')}
                                className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] font-medium text-zinc-300 transition"
                                title="Reabrir tarefa"
                              >
                                ← Reabrir
                              </button>
                            )}

                            {/* Excluir Tarefa */}
                            <button
                              onClick={() => handleDeleteTask(task)}
                              className="p-1 rounded hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition"
                              title="Excluir tarefa (Testa RLS de DELETE)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal: Nova Tarefa */}
      {isNewTaskOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-400" />
                Criar Nova Tarefa
              </h3>
              <button onClick={() => setIsNewTaskOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-300 mb-1 font-medium">Título da Tarefa</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Refatorar adapter do D1..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-zinc-300 mb-1 font-medium">Descrição</label>
                <textarea
                  rows={2}
                  placeholder="Detalhes ou critérios de aceite..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 mb-1 font-medium">Projeto Relacionado</label>
                  <select
                    value={newTaskProjectId}
                    onChange={(e) => setNewTaskProjectId(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 focus:outline-none focus:border-orange-500"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-300 mb-1 font-medium">Prioridade</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 focus:outline-none focus:border-orange-500"
                  >
                    <option value={1}>P1 - Baixa</option>
                    <option value={2}>P2 - Normal</option>
                    <option value={3}>P3 - Média</option>
                    <option value={4}>P4 - Alta</option>
                    <option value={5}>P5 - Crítica</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-zinc-400 flex items-center justify-between">
                <span>Criador vinculado:</span>
                <span className="font-semibold text-zinc-200">
                  {currentUser?.name || activePersona.name} ({activePersona.title})
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewTaskOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTask}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-zinc-950 font-bold transition disabled:opacity-50"
                >
                  {isSubmittingTask ? 'Salvando...' : 'Criar Tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer / Modal: Comentários Relacionais */}
      {activeTaskForComments && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">
                  Comentários da Tarefa
                </span>
                <h3 className="text-base font-bold text-white truncate max-w-xs sm:max-w-md">
                  {activeTaskForComments.title}
                </h3>
              </div>
              <button
                onClick={() => setActiveTaskForComments(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista de Comentários */}
            <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
              {taskComments.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-xs">
                  Nenhum comentário registrado nesta tarefa ainda. Seja o primeiro!
                </div>
              ) : (
                taskComments.map((comm) => {
                  const author = comm.user || { name: 'Usuário', email: '' }
                  const isAlice = comm.user_id?.includes('alice') || author.name?.includes('Alice')

                  return (
                    <div key={comm.id} className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                          <span>{isAlice ? '👩' : '👨'}</span>
                          {author.name || comm.user_id}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(comm.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed pl-5">{comm.content}</p>
                    </div>
                  )
                })
              )}
            </div>

            {/* Input de Envio de Comentário */}
            <form onSubmit={handleAddComment} className="pt-3 border-t border-zinc-800 flex items-center gap-2">
              <input
                type="text"
                placeholder={
                  activePersona.id === 'anon'
                    ? 'Faça login para comentar...'
                    : `Comentar como ${activePersona.name}...`
                }
                disabled={activePersona.id === 'anon'}
                value={newCommentContent}
                onChange={(e) => setNewCommentContent(e.target.value)}
                className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-orange-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={submittingComment || !newCommentContent.trim() || activePersona.id === 'anon'}
                className="p-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-zinc-950 font-bold transition disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
