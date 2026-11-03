import React, { useState, useEffect } from 'react'
import { PersonaProvider, usePersona, PERSONAS } from './context/PersonaContext'
import { RelationalBoard } from './components/RelationalBoard'
import { AdvancedDataExplorer } from './components/AdvancedDataExplorer'
import { StorageDemo } from './components/StorageDemo'
import { RealtimeDemo } from './components/RealtimeDemo'
import { ChaosStressLab } from './components/ChaosStressLab'
import { ConsumerAuditSuite } from './components/ConsumerAuditSuite'
import { ensureDemoSeed } from './lib/seed'
import { DEFAULT_ANON_KEY, updateClientCredentials } from './lib/edgekit'
import {
  Layers,
  Key,
  ExternalLink,
  ShieldCheck,
  Zap,
  Server,
  FolderKanban,
  Database,
  FolderUp,
  Radio,
  Flame,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  UserCheck,
} from 'lucide-react'

type TabType = 'board' | 'explorer' | 'storage' | 'realtime' | 'chaos' | 'audit'

function AppContent() {
  const { activePersona, switchPersona, isSwitching, currentUser } = usePersona()
  const [activeTab, setActiveTab] = useState<TabType>('board')
  const [anonKey, setAnonKey] = useState(DEFAULT_ANON_KEY)
  const [showKeyConfig, setShowKeyConfig] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [seedNotice, setSeedNotice] = useState<string | null>(null)

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

  const handleRunSeed = async (reset = false) => {
    setIsSeeding(true)
    try {
      const res = await ensureDemoSeed({ reset })
      if (res.success) {
        setSeedNotice(reset ? 'Banco resetado e dados de exemplo recriados!' : 'Dados de exemplo garantidos!')
        setTimeout(() => setSeedNotice(null), 4000)
        // Recarrega persona atual
        await switchPersona(activePersona.id)
      } else {
        setSeedNotice(`Falha no seed: ${res.message}`)
        setTimeout(() => setSeedNotice(null), 5000)
      }
    } catch (err: any) {
      setSeedNotice(`Erro: ${err.message}`)
      setTimeout(() => setSeedNotice(null), 5000)
    } finally {
      setIsSeeding(false)
    }
  }

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Logo e Título */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-zinc-950 font-bold shadow-lg shadow-orange-500/20">
              <Layers className="w-6 h-6 text-zinc-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base tracking-tight text-white">TaskFlow Pro</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  Consumer Reference App
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Aplicação cliente de referência consumindo Edgekit SDK (D1, R2 & Durable Objects)
              </p>
            </div>
          </div>

          {/* Persona Switcher & Ações */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Persona Switcher */}
            <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs">
              <span className="text-[11px] text-zinc-500 px-2 font-medium hidden sm:inline">Persona:</span>
              <button
                onClick={() => switchPersona('alice')}
                disabled={isSwitching}
                className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 ${
                  activePersona.id === 'alice'
                    ? 'bg-orange-500 text-zinc-950 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Alternar para Alice (Product Manager)"
              >
                <span>👩</span>
                <span>Alice (PM)</span>
              </button>
              <button
                onClick={() => switchPersona('bob')}
                disabled={isSwitching}
                className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 ${
                  activePersona.id === 'bob'
                    ? 'bg-blue-600 text-white font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Alternar para Bob (Tech Lead)"
              >
                <span>👨</span>
                <span>Bob (Dev)</span>
              </button>
              <button
                onClick={() => switchPersona('anon')}
                disabled={isSwitching}
                className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 ${
                  activePersona.id === 'anon'
                    ? 'bg-zinc-700 text-zinc-100 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Deslogar e navegar como visitante anônimo"
              >
                <span>👤</span>
                <span>Anônimo</span>
              </button>
            </div>

            {/* Botão de Seed / Reset */}
            <button
              onClick={() => handleRunSeed(false)}
              disabled={isSeeding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs transition"
              title="Garante tabelas, relacionamentos e dados no banco SQLite/D1"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${isSeeding ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{isSeeding ? 'Provisionando...' : 'Seed Demo'}</span>
            </button>

            {/* Links Externos */}
            <a
              href="http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs transition"
              title="Abrir Studio de Administração da Infraestrutura"
            >
              <Server className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">Studio</span>
              <ExternalLink className="w-3 h-3 text-zinc-500" />
            </a>
          </div>
        </div>
      </header>

      {/* Banner de Feedback do Seed */}
      {seedNotice && (
        <div className="bg-orange-500/10 border-b border-orange-500/20 px-4 py-2 text-center text-xs text-orange-300 flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-orange-400" />
          <span>{seedNotice}</span>
        </div>
      )}

      {/* Sub-header com Abas de Navegação */}
      <nav className="border-b border-zinc-800 bg-zinc-950/60 sticky top-[65px] z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto py-2 scrollbar-none">
          <button
            onClick={() => setActiveTab('board')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeTab === 'board'
                ? 'bg-zinc-800 text-orange-400 shadow-sm border border-zinc-700/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            Quadro Relacional (.expand)
          </button>

          <button
            onClick={() => setActiveTab('explorer')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeTab === 'explorer'
                ? 'bg-zinc-800 text-indigo-400 shadow-sm border border-zinc-700/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Database className="w-4 h-4" />
            Data Explorer (Filtros & JSON)
          </button>

          <button
            onClick={() => setActiveTab('storage')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeTab === 'storage'
                ? 'bg-zinc-800 text-orange-400 shadow-sm border border-zinc-700/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <FolderUp className="w-4 h-4" />
            Storage Hub (R2 & URLs Assinadas)
          </button>

          <button
            onClick={() => setActiveTab('realtime')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeTab === 'realtime'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm border border-zinc-700/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Radio className="w-4 h-4" />
            Realtime Colaborativo & CDC
          </button>

          <button
            onClick={() => setActiveTab('chaos')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeTab === 'chaos'
                ? 'bg-zinc-800 text-rose-400 shadow-sm border border-zinc-700/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Flame className="w-4 h-4" />
            Chaos & Security Lab
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeTab === 'audit'
                ? 'bg-zinc-800 text-amber-400 shadow-sm border border-zinc-700/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Auditoria Automatizada (23 Testes)
          </button>
        </div>
      </nav>

      {/* Conteúdo da Aba Ativa */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        {activeTab === 'board' && <RelationalBoard />}
        {activeTab === 'explorer' && <AdvancedDataExplorer />}
        {activeTab === 'storage' && <StorageDemo />}
        {activeTab === 'realtime' && <RealtimeDemo />}
        {activeTab === 'chaos' && <ChaosStressLab />}
        {activeTab === 'audit' && <ConsumerAuditSuite />}
      </main>

      {/* Rodapé Informativo */}
      <footer className="border-t border-zinc-800/80 bg-zinc-900/30 text-xs text-zinc-500 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-zinc-400">TaskFlow Pro</span>
            <span>•</span>
            <span>Cloudflare Workers, D1 (SQLite), R2 Storage & Durable Objects</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span>Persona Ativa: <strong className="text-zinc-300">{activePersona.name} ({activePersona.title})</strong></span>
            <span>•</span>
            <button
              onClick={() => handleRunSeed(true)}
              className="text-rose-400 hover:underline"
              title="Limpa tabelas de tarefas e recria dados do zero"
            >
              Resetar Banco Completo
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <PersonaProvider>
      <AppContent />
    </PersonaProvider>
  )
}
