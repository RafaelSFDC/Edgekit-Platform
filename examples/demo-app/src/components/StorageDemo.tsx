import React, { useState, useEffect, useCallback } from 'react'
import { client } from '../lib/edgekit'
import { FolderUp, FileText, Trash2, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'

interface StorageDemoProps {
  user: any
}

interface StorageFile {
  id: string
  bucket: string
  key: string
  name: string
  size: number
  mimeType: string
  isPublic: boolean
  url: string
  createdAt?: string
}

export function StorageDemo({ user: _user }: StorageDemoProps) {
  const [bucket, setBucket] = useState('default')
  const [files, setFiles] = useState<StorageFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data, error } = await client.storage.from(bucket).list()
      if (error) {
        setErrorMsg(error.message)
        setFiles([])
      } else {
        setFiles((data as StorageFile[]) || [])
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar arquivos do bucket.')
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
      const { error } = await client.storage.from(bucket).upload('demo', file)
      if (error) {
        setErrorMsg(error.message)
      } else {
        await fetchFiles()
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha no upload do arquivo.')
    } finally {
      setUploading(false)
      // Limpa input
      e.target.value = ''
    }
  }

  async function handleDeleteFile(key: string) {
    try {
      const { error } = await client.storage.from(bucket).delete(key)
      if (error) {
        setErrorMsg(error.message)
      } else {
        setFiles((prev) => prev.filter((f) => f.key !== key))
      }
    } catch (err: any) {
      setErrorMsg(err.message)
    }
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
            <FolderUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Storage Cloudflare R2</h2>
            <p className="text-xs text-zinc-400">Upload & Streaming Nativo (HTTP 206)</p>
          </div>
        </div>

        <button
          onClick={fetchFiles}
          disabled={loading}
          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          title="Atualizar arquivos"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="storage-bucket-input" className="text-xs font-medium text-zinc-400">
            Bucket:
          </label>
          <input
            id="storage-bucket-input"
            type="text"
            value={bucket}
            onChange={(e) => setBucket(e.target.value.trim().toLowerCase())}
            placeholder="default"
            className="px-2.5 py-1 bg-zinc-950/60 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-orange-500 w-32"
          />
        </div>

        <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-medium transition-colors shadow-lg shadow-orange-600/20 disabled:opacity-50">
          <FolderUp className="w-4 h-4" />
          {uploading ? 'Enviando...' : 'Enviar Arquivo'}
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-950/30 border border-red-800/40 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Lista de Arquivos */}
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {files.length === 0 && !loading && (
          <div className="py-8 text-center text-zinc-500 text-sm">
            Nenhum arquivo no bucket <code className="text-zinc-400">"{bucket}"</code>.
          </div>
        )}

        {files.map((file) => {
          const isImage = file.mimeType?.startsWith('image/')
          const fileUrl = client.storage.from(bucket).getPublicUrl(file.key).data.publicUrl

          return (
            <div
              key={file.key}
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/50 border border-zinc-800/80 hover:border-zinc-700/80 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {isImage ? (
                  <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                    <img
                      src={fileUrl}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        ;(e.target as any).style.display = 'none'
                      }}
                    />
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-zinc-900 text-zinc-400 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                )}

                <div className="truncate">
                  <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                  <p className="text-[10px] font-mono text-zinc-500">
                    {formatBytes(file.size)} • {file.mimeType}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 ml-2">
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 text-zinc-400 hover:text-orange-400 rounded-lg hover:bg-zinc-800 transition-colors"
                  title="Abrir arquivo"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={() => handleDeleteFile(file.key)}
                  className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-red-950/30 transition-colors"
                  title="Excluir arquivo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
