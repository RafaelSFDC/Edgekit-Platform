import React, { useState, useEffect, useCallback } from 'react'
import { client, BACKEND_URL } from '../lib/edgekit'
import { usePersona } from '../context/PersonaContext'
import {
  FolderUp,
  FileText,
  Trash2,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Image as ImageIcon,
  KeyRound,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Download,
} from 'lucide-react'

interface StorageFile {
  id: string
  bucket: string
  key: string
  name: string
  size: number
  mimeType: string
  isPublic: boolean
  url: string
  userId?: string
  createdAt?: string
}

export const StorageDemo: React.FC = () => {
  const { activePersona, currentUser } = usePersona()
  const [bucket, setBucket] = useState<'avatars' | 'project_docs'>('avatars')
  const [files, setFiles] = useState<StorageFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, { url: string; expiresAt: number }>>({})

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(null), 5000)
    } else {
      setSuccessMsg(msg)
      setTimeout(() => setSuccessMsg(null), 4000)
    }
  }

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data, error } = await client.storage.from(bucket).list()
      if (error) {
        showNotification(error.message, true)
        setFiles([])
      } else {
        setFiles((data as StorageFile[]) || [])
      }
    } catch (err: any) {
      showNotification(err.message || 'Erro ao carregar arquivos do bucket.', true)
    } finally {
      setLoading(false)
    }
  }, [bucket])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setErrorMsg(null)

    try {
      const cleanFileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      const { data, error } = await client.storage.from(bucket).upload(cleanFileName, file)

      if (error) {
        showNotification(`Rejeitado pelo Storage: ${error.message}`, true)
      } else {
        showNotification(`Upload concluído com sucesso para o bucket "${bucket}"!`)
        await fetchFiles()
      }
    } catch (err: any) {
      showNotification(err.message || 'Falha no upload do arquivo.', true)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDeleteFile(file: StorageFile) {
    if (!confirm(`Deseja excluir o arquivo "${file.name || file.key}"?`)) return
    try {
      const { error } = await client.storage.from(bucket).delete(file.key)
      if (error) {
        showNotification(`Falha ao excluir: ${error.message}`, true)
      } else {
        showNotification('Arquivo excluído com sucesso!')
        setFiles((prev) => prev.filter((f) => f.key !== file.key))
      }
    } catch (err: any) {
      showNotification(err.message, true)
    }
  }

  async function handleGenerateSignedUrl(key: string) {
    try {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(key, 60)
      if (error) {
        showNotification(`Erro ao assinar URL: ${error.message}`, true)
      } else if (data?.url) {
        const fullUrl = data.url.startsWith('http') ? data.url : `${BACKEND_URL}${data.url}`
        setSignedUrls((prev) => ({
          ...prev,
          [key]: { url: fullUrl, expiresAt: Date.now() + 60000 },
        }))
        showNotification('URL assinada gerada (válida por 60 segundos).')
      }
    } catch (err: any) {
      showNotification(err.message, true)
    }
  }

  function formatBytes(bytes: number) {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  return (
    <div className="space-y-6">
      {/* Alertas */}
      {errorMsg && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          <div className="flex-1 font-medium">{errorMsg}</div>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="flex-1">{successMsg}</div>
        </div>
      )}

      {/* Header do Storage */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FolderUp className="w-5 h-5 text-orange-400" />
            Storage Hub (Cloudflare R2)
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Gestão de buckets públicos (<code className="text-orange-300">avatars</code>) e privados (<code className="text-orange-300">project_docs</code> com URLs assinadas).
          </p>
        </div>

        {/* Bucket Switcher & Upload */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs">
            <button
              onClick={() => setBucket('avatars')}
              className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 ${
                bucket === 'avatars' ? 'bg-orange-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              avatars (Público)
            </button>
            <button
              onClick={() => setBucket('project_docs')}
              className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 ${
                bucket === 'project_docs' ? 'bg-orange-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              project_docs (Privado)
            </button>
          </div>

          <label
            className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-zinc-950 font-semibold rounded-xl text-xs transition shadow-lg shadow-orange-500/20 cursor-pointer active:scale-95 ${
              uploading ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <FolderUp className="w-4 h-4" />
            {uploading ? 'Enviando...' : 'Fazer Upload'}
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
              accept={bucket === 'avatars' ? 'image/*' : '.pdf,.txt,.png,.jpg'}
            />
          </label>
        </div>
      </div>

      {/* Regras e Guardrails do Bucket Ativo */}
      <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between text-xs text-zinc-400 gap-3">
        <div className="flex items-center gap-4">
          <span>
            Bucket Selecionado: <strong className="text-zinc-200 font-mono">{bucket}</strong>
          </span>
          <span>
            Visibilidade: <strong className={bucket === 'avatars' ? 'text-emerald-400' : 'text-amber-400'}>
              {bucket === 'avatars' ? 'Pública' : 'Privada (Owner Only)'}
            </strong>
          </span>
          <span>
            Limite por Arquivo: <strong className="text-zinc-200">{bucket === 'avatars' ? '2 MB' : '5 MB'}</strong>
          </span>
        </div>

        <button
          onClick={() => fetchFiles()}
          className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition text-[11px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recarregar Bucket
        </button>
      </div>

      {/* Conteúdo do Bucket */}
      {loading ? (
        <div className="text-center py-16 text-zinc-500 text-xs">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-orange-400" />
          Carregando objetos do R2...
        </div>
      ) : files.length === 0 ? (
        <div className="p-12 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center space-y-2">
          <FileText className="w-8 h-8 text-zinc-600 mx-auto" />
          <h4 className="text-sm font-semibold text-zinc-300">Nenhum arquivo no bucket "{bucket}"</h4>
          <p className="text-xs text-zinc-500">
            {bucket === 'avatars'
              ? 'Envie uma imagem para usar como avatar (máximo 2MB).'
              : 'Envie um documento de projeto (PDF/TXT) para testar URLs temporárias assinadas.'}
          </p>
        </div>
      ) : bucket === 'avatars' ? (
        /* Grid de Imagens / Avatares */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {files.map((file) => {
            const rawUrl = file.url || `/api/v1/storage/${bucket}/${file.key}`
            const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${BACKEND_URL}${rawUrl}`

            return (
              <div
                key={file.key}
                className="group relative rounded-xl bg-zinc-900/80 border border-zinc-800 p-2 space-y-2 hover:border-zinc-700 transition flex flex-col justify-between"
              >
                <div className="aspect-square rounded-lg bg-zinc-950 overflow-hidden flex items-center justify-center border border-zinc-800/80">
                  <img
                    src={fullUrl}
                    alt={file.name || file.key}
                    className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                    onError={(e) => {
                      // Fallback se não for imagem renderizável
                      ;(e.target as any).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%2371717a" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'
                    }}
                  />
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-zinc-200 truncate" title={file.name || file.key}>
                    {file.name || file.key}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">{formatBytes(file.size)}</div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                    title="Abrir imagem pública"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => handleDeleteFile(file)}
                    className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                    title="Excluir arquivo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Tabela de Documentos Privados */
        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/70 text-zinc-400 border-b border-zinc-800 uppercase text-[10px] tracking-wider font-mono">
                <tr>
                  <th className="p-3">Nome do Documento</th>
                  <th className="p-3">Tamanho</th>
                  <th className="p-3">MIME</th>
                  <th className="p-3">URL Assinada (60s)</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {files.map((file) => {
                  const signed = signedUrls[file.key]
                  const isExpired = signed ? Date.now() > signed.expiresAt : true

                  return (
                    <tr key={file.key} className="hover:bg-zinc-800/40 transition">
                      <td className="p-3">
                        <div className="font-semibold text-zinc-200 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-orange-400" />
                          {file.name || file.key}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-zinc-400">{formatBytes(file.size)}</td>
                      <td className="p-3 font-mono text-[11px] text-zinc-500">{file.mimeType || 'binary'}</td>
                      <td className="p-3">
                        {signed && !isExpired ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={signed.url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[11px] font-semibold hover:bg-cyan-500/20 flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              Baixar com Token
                            </a>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              Expira em {Math.round((signed.expiresAt - Date.now()) / 1000)}s
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleGenerateSignedUrl(file.key)}
                            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] flex items-center gap-1"
                          >
                            <KeyRound className="w-3 h-3 text-orange-400" />
                            Gerar Link Assinado
                          </button>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteFile(file)}
                          className="p-1.5 rounded hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition"
                          title="Excluir arquivo do bucket"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
