import React, { useState, useEffect } from 'react'
import { AuthCard } from './components/AuthCard'
import { DatabaseDemo } from './components/DatabaseDemo'
import { StorageDemo } from './components/StorageDemo'
import { RealtimeDemo } from './components/RealtimeDemo'
import { ConsumerAuditSuite } from './components/ConsumerAuditSuite'
import { DEFAULT_ANON_KEY, updateClientCredentials } from './lib/edgekit'
import { Layers, Key, ExternalLink, ShieldCheck, Zap, Server, ShieldAlert } from 'lucide-react'

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [anonKey, setAnonKey] = useState(DEFAULT_ANON_KEY)
  const [showKeyConfig, setShowKeyConfig] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'db' | 'storage' | 'realtime' | 'audit'>('all')

  useEffect(() => {
    // Tenta carregar anonKey da configuração pública da API se não estiver customizada
    fetch('/api/v1/auth/public-config')
      .then((res) => res.json())
      .then((json) => {
        if (json.data?.anonKey) {
          setAnonKey((current) => {
            if (current === 'ek_anon_dev_local_key') {
              updateClientCredentials(json.data.anonKey)
              return json.data.anonKey
            }
            return current
          })
        }
      })
      .catch(() => {})
  }, [])

  function handleSaveKey(e: React.FormEvent) {
    e.preventDefault()
    updateClientCredentials(anonKey)
    setShowKeyConfig(false)
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center text-white font-bold shadow-lg shadow-orange-600/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base tracking-tight text-white">Edgekit Platform</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  Demo Consumer App
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Frontend Mock de Testes consumindo Better Auth, SDK & Durable Objects
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs">
            <button
              onClick={() => setShowKeyConfig(!showKeyConfig)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            >
              <Key className="w-3.5 h-3.5 text-orange-400" />
              <span>Chave Anon: <code className="text-zinc-400">{anonKey.slice(0, 12)}...</code></span>
            </button>

            <a
              href="http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
              title="Abrir Studio de Administração da Infraestrutura"
            >
              <Server className="w-3.5 h-3.5 text-blue-400" />
              <span>Admin Studio</span>
              <ExternalLink className="w-3 h-3 text-zinc-500" />
            </a>

            <a
              href="http://localhost:8787/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span>Scalar Docs</span>
              <ExternalLink className="w-3 h-3 text-zinc-500" />
            </a>
          </div>
        </div>
      </header>

      {/* Modal / Dropdown Configurar Chave */}
      {showKeyConfig && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full pt-4">
          <form
            onSubmit={handleSaveKey}
            className="p-4 rounded-xl bg-zinc-900 border border-orange-500/30 flex flex-wrap items-center gap-3"
          >
            <div className="flex-1 min-w-[280px]">
              <label htmlFor="anon-key-input" className="block text-xs font-medium text-zinc-300 mb-1">
                Configurar Chave Anônima Pública (`EDGEKIT_ANON_KEY`):
              </label>
              <input
                id="anon-key-input"
                type="text"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value.trim())}
                placeholder="ek_anon_..."
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div className="flex items-end gap-2 pt-4">
              <button
                type="submit"
                className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Salvar Chave
              </button>
              <button
                type="button"
                onClick={() => setShowKeyConfig(false)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        {/* Banner Informativo */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-950/30 via-zinc-900 to-zinc-900 border border-orange-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">
                Isolamento Zero-Trust: 1 Deploy = 1 Backend de Produto
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Este app simula o frontend do seu produto consumindo o SDK oficial. Usuários criados aqui
                pertencem à tabela <code className="text-orange-400 font-mono">users</code> e não têm
                nenhum acesso ao painel de administração da plataforma.
              </p>
            </div>
          </div>

          <div className="flex gap-1.5 shrink-0 bg-zinc-950/70 p-1 rounded-xl border border-zinc-800 text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                activeTab === 'all' ? 'bg-orange-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Todos os Serviços
            </button>
            <button
              onClick={() => setActiveTab('db')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                activeTab === 'db' ? 'bg-orange-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Database
            </button>
            <button
              onClick={() => setActiveTab('storage')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                activeTab === 'storage' ? 'bg-orange-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Storage
            </button>
            <button
              onClick={() => setActiveTab('realtime')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                activeTab === 'realtime' ? 'bg-orange-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Realtime
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'audit' ? 'bg-orange-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-orange-300" />
              <span>Auditoria & Edge-Cases</span>
            </button>
          </div>
        </div>

        {/* View da Auditoria Completa */}
        {activeTab === 'audit' ? (
          <ConsumerAuditSuite />
        ) : (
          /* Grid de Serviços */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna 1: Autenticação (Better Auth) */}
            <div className="lg:col-span-1">
              <AuthCard user={currentUser} onUserChange={setCurrentUser} />
            </div>

            {/* Coluna 2 e 3: Serviços Interativos do Backend */}
            <div className="lg:col-span-2 space-y-6">
              {(activeTab === 'all' || activeTab === 'db') && (
                <DatabaseDemo user={currentUser} />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(activeTab === 'all' || activeTab === 'storage') && (
                  <div className={activeTab === 'storage' ? 'md:col-span-2' : ''}>
                    <StorageDemo user={currentUser} />
                  </div>
                )}

                {(activeTab === 'all' || activeTab === 'realtime') && (
                  <div className={activeTab === 'realtime' ? 'md:col-span-2' : ''}>
                    <RealtimeDemo user={currentUser} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 py-4 text-center text-xs text-zinc-500">
        <p>
          Edgekit Platform • Ambiente de Desenvolvimento Local • Porta 5174
        </p>
      </footer>
    </div>
  )
}
