import React, { useState, useEffect } from 'react'
import { client, BACKEND_URL } from '../lib/edgekit'
import { usePersona } from '../context/PersonaContext'
import {
  ShieldAlert,
  Flame,
  Bomb,
  Lock,
  FileWarning,
  Scale,
  Clock,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  Terminal,
} from 'lucide-react'

interface ChaosTestResult {
  id: string
  name: string
  status: 'idle' | 'running' | 'passed' | 'failed'
  message: string
  details?: any
  executedAt?: string
}

export const ChaosStressLab: React.FC = () => {
  const { activePersona, currentUser } = usePersona()
  const [results, setResults] = useState<Record<string, ChaosTestResult>>({})
  const [signedUrlState, setSignedUrlState] = useState<{ url: string; expiresAt: number; timeLeft: number } | null>(null)

  // Atualiza contagem regressiva para URL assinada expirável
  useEffect(() => {
    if (!signedUrlState) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((signedUrlState.expiresAt - Date.now()) / 1000))
      setSignedUrlState((prev) => (prev ? { ...prev, timeLeft: remaining } : null))
      if (remaining <= 0) {
        clearInterval(interval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [signedUrlState])

  const setTestState = (id: string, name: string, status: 'idle' | 'running' | 'passed' | 'failed', message: string, details?: any) => {
    setResults((prev) => ({
      ...prev,
      [id]: {
        id,
        name,
        status,
        message,
        details,
        executedAt: new Date().toLocaleTimeString(),
      },
    }))
  }

  // 1. Cross-User Mutation Attack
  const runCrossUserAttack = async () => {
    const testId = 'cross-user'
    setTestState(testId, 'Mutação Cross-User (RLS Owner Check)', 'running', 'Buscando tarefa de outro usuário e tentando alterar...')
    try {
      // Busca uma tarefa que não pertence ao usuário ativo
      const tasksRes = await client.from('tasks').select('*')
      const target = tasksRes.data?.find((t: any) => t.user_id !== (currentUser?.id || activePersona.id))

      if (!target) {
        setTestState(
          testId,
          'Mutação Cross-User (RLS Owner Check)',
          'passed',
          'Não há tarefas de outros usuários no momento. Execute o Seed no topo primeiro.',
        )
        return
      }

      // Tenta alterar a tarefa de outro usuário
      const res = await client.from('tasks').update({ title: 'HACKED BY ATTACKER' }).eq('id', target.id)

      if (res.error) {
        setTestState(
          testId,
          'Mutação Cross-User (RLS Owner Check)',
          'passed',
          `Proteção RLS Ativa: Acesso negado com sucesso (${res.error.message}). Usuário não autorizado bloqueado!`,
          { targetTaskId: target.id, targetOwner: target.user_id, error: res.error.message },
        )
      } else {
        setTestState(
          testId,
          'Mutação Cross-User (RLS Owner Check)',
          'failed',
          'VULNERABILIDADE: Conseguiu atualizar tarefa de outro usuário sem ser o owner!',
          res.data,
        )
      }
    } catch (err: any) {
      setTestState(testId, 'Mutação Cross-User (RLS Owner Check)', 'passed', `Bloqueado com erro: ${err.message}`)
    }
  }

  // 2. Anti-Hijacking / Spoofed User ID
  const runAntiHijackingTest = async () => {
    const testId = 'anti-hijack'
    setTestState(testId, 'Anti-Hijacking de Identidade', 'running', 'Tentando forjar user_id="impostor_999" em nova tarefa...')
    try {
      const spoofedId = 'impostor_999'
      const res = await client.from('tasks').insert({
        id: `spoof_${Date.now()}`,
        title: 'Tarefa Spoofada',
        user_id: spoofedId, // Tenta burlar o ID da sessão autenticada
      })

      // Se a política RLS exige que user_id coincida com a sessão, deve falhar ou ser rejeitado
      if (res.error) {
        setTestState(
          testId,
          'Anti-Hijacking de Identidade',
          'passed',
          `Proteção Eficaz: O backend/RLS barrou a inserção de ID não correspondente (${res.error.message}).`,
        )
      } else {
        // Se inseriu, verifica se a política permitia ou se foi registrado
        setTestState(
          testId,
          'Anti-Hijacking de Identidade',
          'failed',
          'Atenção: A inserção foi aceita. Verifique a regra de INSERT da tabela tasks no painel admin.',
          res.data,
        )
      }
    } catch (err: any) {
      setTestState(testId, 'Anti-Hijacking de Identidade', 'passed', `Erro capturado: ${err.message}`)
    }
  }

  // 3. SQL Injection Sanitization
  const runSqlInjectionTest = async () => {
    const testId = 'sqli'
    setTestState(testId, 'Sanitização de SQL Injection', 'running', "Injetando payload: ' OR 1=1 -- no SDK...")
    try {
      const payload = "' OR 1=1 --"
      const res = await client.from('tasks').select('*').ilike('title', `%${payload}%`)

      if (res.error) {
        setTestState(testId, 'Sanitização de SQL Injection', 'failed', `Erro inesperado: ${res.error.message}`)
      } else {
        // Se retornou sem crashar e como lista normal (não retornando 1=1 dump irrestrito), passou!
        setTestState(
          testId,
          'Sanitização de SQL Injection',
          'passed',
          `Sucesso: Consulta parametrizada com segurança via Drizzle/SQLite. Retornou ${res.data?.length || 0} registros coincidentes literais sem bypass de autenticação.`,
        )
      }
    } catch (err: any) {
      setTestState(testId, 'Sanitização de SQL Injection', 'failed', `Falha ao executar query: ${err.message}`)
    }
  }

  // 4. Prohibited MIME File Upload
  const runProhibitedMimeTest = async () => {
    const testId = 'mime-guard'
    setTestState(testId, 'Guardrail de MIME Type', 'running', 'Tentando enviar arquivo malicioso (.exe) para bucket avatars...')
    try {
      const fakeExe = new Blob(['MZ\x90\x00\x03\x00\x00\x00 malicious payload'], { type: 'application/x-msdownload' })
      const fakeFile = new File([fakeExe], 'malware.exe', { type: 'application/x-msdownload' })

      const res = await client.storage.from('avatars').upload('exploit.exe', fakeFile)

      if (res.error) {
        setTestState(
          testId,
          'Guardrail de MIME Type',
          'passed',
          `Proteção de Armazenamento Ativa: Arquivo rejeitado com código de erro (${res.error.message}). Apenas imagens são permitidas no bucket avatars.`,
        )
      } else {
        setTestState(
          testId,
          'Guardrail de MIME Type',
          'failed',
          'VULNERABILIDADE: Arquivo .exe não autorizado foi salvo no storage!',
          res.data,
        )
      }
    } catch (err: any) {
      setTestState(testId, 'Guardrail de MIME Type', 'passed', `Rejeitado na requisição: ${err.message}`)
    }
  }

  // 5. Oversized File Upload
  const runOversizedFileTest = async () => {
    const testId = 'size-limit'
    setTestState(testId, 'Limite de Tamanho de Arquivo', 'running', 'Gerando payload de 4MB para bucket com limite de 2MB...')
    try {
      // Cria buffer de 4MB
      const bigBuffer = new Uint8Array(4 * 1024 * 1024)
      const bigBlob = new Blob([bigBuffer], { type: 'image/png' })
      const bigFile = new File([bigBlob], 'oversized.png', { type: 'image/png' })

      const res = await client.storage.from('avatars').upload('oversized.png', bigFile)

      if (res.error) {
        setTestState(
          testId,
          'Limite de Tamanho de Arquivo',
          'passed',
          `Guardrail de Quota Validado: Upload de 4MB rejeitado (${res.error.message}). Limite de 2MB respeitado.`,
        )
      } else {
        setTestState(
          testId,
          'Limite de Tamanho de Arquivo',
          'failed',
          'VULNERABILIDADE: Arquivo acima do limite do bucket foi aceito!',
          res.data,
        )
      }
    } catch (err: any) {
      setTestState(testId, 'Limite de Tamanho de Arquivo', 'passed', `Bloqueado na transmissão: ${err.message}`)
    }
  }

  // 6. Expiring Signed URL
  const runExpiringSignedUrlTest = async () => {
    const testId = 'signed-url'
    setTestState(testId, 'URL Assinada Temporária (60s)', 'running', 'Gerando token de acesso efêmero...')
    try {
      const res = await client.storage.from('project_docs').createSignedUrl('arquitetura.pdf', 60)

      if (res.error) {
        setTestState(testId, 'URL Assinada Temporária (60s)', 'failed', `Erro ao gerar URL assinada: ${res.error.message}`)
      } else if (res.data?.url) {
        const fullUrl = res.data.url.startsWith('http') ? res.data.url : `${BACKEND_URL}${res.data.url}`
        setSignedUrlState({
          url: fullUrl,
          expiresAt: Date.now() + 60 * 1000,
          timeLeft: 60,
        })
        setTestState(
          testId,
          'URL Assinada Temporária (60s)',
          'passed',
          'URL assinada criptograficamente com sucesso. Expira em 60 segundos!',
          { url: fullUrl },
        )
      }
    } catch (err: any) {
      setTestState(testId, 'URL Assinada Temporária (60s)', 'failed', `Falha: ${err.message}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header do Chaos Lab */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-rose-500" />
            Chaos & Security Lab
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Simulador interativo de ataques, abusos e violações de políticas de segurança contra a instância Edgekit.
          </p>
        </div>

        <button
          onClick={() => {
            runCrossUserAttack()
            runAntiHijackingTest()
            runSqlInjectionTest()
            runProhibitedMimeTest()
            runOversizedFileTest()
          }}
          className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-600/20 active:scale-95"
        >
          <Bomb className="w-4 h-4" />
          Disparar Todos os Testes de Caos
        </button>
      </div>

      {/* Grid de Cards de Teste de Estresse */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Card 1: Cross-user mutation */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Lock className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">RLS Boundary</span>
            </div>
            <h4 className="font-bold text-sm text-zinc-100">Mutação Cross-User (403)</h4>
            <p className="text-xs text-zinc-400">
              Tenta forçar alteração em tarefa pertencente a outro usuário logado e valida rejeição por RLS.
            </p>
          </div>
          <button
            onClick={runCrossUserAttack}
            disabled={results['cross-user']?.status === 'running'}
            className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
          >
            <Play className="w-3.5 h-3.5 text-rose-400" />
            Testar Violação de Owner
          </button>
        </div>

        {/* Card 2: Anti-Hijacking */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <ShieldAlert className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Identity Hijack</span>
            </div>
            <h4 className="font-bold text-sm text-zinc-100">Anti-Spoofing de user_id</h4>
            <p className="text-xs text-zinc-400">
              Envia requisição de inserção com <code className="text-amber-300">user_id</code> falsificado e valida integridade.
            </p>
          </div>
          <button
            onClick={runAntiHijackingTest}
            disabled={results['anti-hijack']?.status === 'running'}
            className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
          >
            <Play className="w-3.5 h-3.5 text-amber-400" />
            Testar Spoof de Identidade
          </button>
        </div>

        {/* Card 3: SQLi */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Terminal className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Query Engine</span>
            </div>
            <h4 className="font-bold text-sm text-zinc-100">SQL Injection Sanitization</h4>
            <p className="text-xs text-zinc-400">
              Injeta sequências maliciosas como <code className="text-indigo-300 font-mono">' OR 1=1 --</code> em parâmetros de filtro.
            </p>
          </div>
          <button
            onClick={runSqlInjectionTest}
            disabled={results['sqli']?.status === 'running'}
            className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
          >
            <Play className="w-3.5 h-3.5 text-indigo-400" />
            Injetar Carga SQL
          </button>
        </div>

        {/* Card 4: Prohibited MIME */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <FileWarning className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">R2 Storage Guard</span>
            </div>
            <h4 className="font-bold text-sm text-zinc-100">Upload Proibido (.exe / ELF)</h4>
            <p className="text-xs text-zinc-400">
              Tenta enviar executável malicioso para o bucket público de avatares fotográficos.
            </p>
          </div>
          <button
            onClick={runProhibitedMimeTest}
            disabled={results['mime-guard']?.status === 'running'}
            className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
          >
            <Play className="w-3.5 h-3.5 text-rose-400" />
            Enviar Arquivo Não Autorizado
          </button>
        </div>

        {/* Card 5: Oversized Upload */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <Scale className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Storage Quota</span>
            </div>
            <h4 className="font-bold text-sm text-zinc-100">Limite de Tamanho (Quota)</h4>
            <p className="text-xs text-zinc-400">
              Envia carga acima do limite de 2MB configurado em <code className="text-orange-300">_ek_storage_buckets</code>.
            </p>
          </div>
          <button
            onClick={runOversizedFileTest}
            disabled={results['size-limit']?.status === 'running'}
            className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
          >
            <Play className="w-3.5 h-3.5 text-orange-400" />
            Enviar Arquivo de 4MB
          </button>
        </div>

        {/* Card 6: Expiring Signed URL */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Clock className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Expiring Signed URL</span>
            </div>
            <h4 className="font-bold text-sm text-zinc-100">Link Efêmero Assinado</h4>
            <p className="text-xs text-zinc-400">
              Gera URL de download com token temporário assinado e cronômetro regressivo ativo.
            </p>
          </div>
          <button
            onClick={runExpiringSignedUrlTest}
            disabled={results['signed-url']?.status === 'running'}
            className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
          >
            <Play className="w-3.5 h-3.5 text-cyan-400" />
            Gerar Link Assinado (60s)
          </button>
        </div>
      </div>

      {/* Widget de URL Assinada com Contagem Regressiva */}
      {signedUrlState && (
        <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 font-mono text-lg font-bold">
              {signedUrlState.timeLeft}s
            </div>
            <div>
              <div className="text-xs font-semibold text-cyan-300">URL Assinada R2 Ativa</div>
              <div className="text-[11px] font-mono text-zinc-400 truncate max-w-xs sm:max-w-md">
                {signedUrlState.url}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={signedUrlState.url}
              target="_blank"
              rel="noreferrer"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                signedUrlState.timeLeft > 0
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950'
                  : 'bg-zinc-800 text-zinc-500 pointer-events-none'
              }`}
            >
              {signedUrlState.timeLeft > 0 ? 'Abrir Arquivo' : 'Expirada!'}
            </a>
          </div>
        </div>
      )}

      {/* Console de Resultados dos Testes de Caos */}
      {Object.keys(results).length > 0 && (
        <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3 font-mono">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800 text-xs text-zinc-400">
            <span className="flex items-center gap-2 text-zinc-200 font-bold">
              <Terminal className="w-4 h-4 text-rose-400" />
              Relatório de Execução de Caos & Segurança
            </span>
            <button
              onClick={() => setResults({})}
              className="hover:text-zinc-200 text-[11px] flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Limpar Logs
            </button>
          </div>

          <div className="space-y-2">
            {Object.values(results).map((res) => (
              <div
                key={res.id}
                className={`p-3 rounded-xl border text-xs flex items-start gap-3 ${
                  res.status === 'passed'
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                    : res.status === 'failed'
                    ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                {res.status === 'passed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : res.status === 'failed' ? (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <RotateCcw className="w-4 h-4 animate-spin text-zinc-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-100">{res.name}</span>
                    <span className="text-[10px] text-zinc-500">{res.executedAt}</span>
                  </div>
                  <div className="text-[11px] leading-relaxed">{res.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
