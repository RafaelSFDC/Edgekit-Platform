import React, { useState, useEffect, useCallback } from 'react'
import { client } from '../lib/edgekit'
import { User, LogIn, UserPlus, LogOut, CheckCircle2, AlertCircle, Shield, KeyRound } from 'lucide-react'

interface AuthCardProps {
  user: any
  onUserChange: (user: any) => void
}

export function AuthCard({ user, onUserChange }: AuthCardProps) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const checkCurrentSession = useCallback(async () => {
    try {
      const { data, error } = await client.auth.getUser()
      if (!error && data?.user) {
        onUserChange(data.user)
      } else {
        onUserChange(null)
      }
    } catch {
      onUserChange(null)
    }
  }, [onUserChange])

  useEffect(() => {
    checkCurrentSession()
  }, [checkCurrentSession])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      if (isSignUp) {
        const { data, error } = await client.auth.signUp({
          name,
          email,
          password,
        })

        if (error) {
          setMessage({ type: 'error', text: error.message || 'Falha ao cadastrar usuário' })
        } else {
          setMessage({ type: 'success', text: 'Conta criada com sucesso!' })
          if (data?.user) {
            onUserChange(data.user)
          } else {
            await checkCurrentSession()
          }
        }
      } else {
        const { data, error } = await client.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          setMessage({ type: 'error', text: error.message || 'Credenciais inválidas' })
        } else {
          setMessage({ type: 'success', text: 'Login realizado com sucesso!' })
          if (data?.user) {
            onUserChange(data.user)
          } else {
            await checkCurrentSession()
          }
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro inesperado' })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    setLoading(true)
    try {
      await client.auth.signOut()
      onUserChange(null)
      setMessage({ type: 'success', text: 'Você saiu da sua conta.' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao deslogar' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Autenticação (Better Auth)</h2>
            <p className="text-xs text-zinc-400">Usuários Finais da Aplicação (Tabela `users`)</p>
          </div>
        </div>

        {user && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Autenticado
          </span>
        )}
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/50'
              : 'bg-red-950/40 text-red-300 border border-red-800/50'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {user ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-600/20 text-orange-400 flex items-center justify-center font-bold text-base border border-orange-500/30">
                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-200">{user.name || 'Sem nome'}</h3>
                  <p className="text-xs text-zinc-400">{user.email}</p>
                </div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                Papel: {user.role || 'user'}
              </span>
            </div>

            <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-500 space-y-1 font-mono">
              <div className="flex justify-between">
                <span>User ID:</span>
                <span className="text-zinc-400">{user.id}</span>
              </div>
              {user.organizationId && (
                <div className="flex justify-between">
                  <span>Org ID:</span>
                  <span className="text-zinc-400">{user.organizationId}</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleLogout}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors border border-zinc-700"
          >
            <LogOut className="w-4 h-4 text-zinc-400" />
            Desconectar (Sign Out)
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex p-1 bg-zinc-950/70 border border-zinc-800 rounded-xl mb-4">
            <button
              type="button"
              onClick={() => setIsSignUp(false)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                !isSignUp
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Entrar (Sign In)
            </button>
            <button
              type="button"
              onClick={() => setIsSignUp(true)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                isSignUp
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Criar Conta (Sign Up)
            </button>
          </div>

          {isSignUp && (
            <div>
              <label htmlFor="auth-name-input" className="block text-xs font-medium text-zinc-400 mb-1">
                Nome Completo
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <input
                  id="auth-name-input"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full pl-9 pr-3 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="auth-email-input" className="block text-xs font-medium text-zinc-400 mb-1">
              E-mail
            </label>
            <div className="relative">
              <LogIn className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                id="auth-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full pl-9 pr-3 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="auth-password-input" className="block text-xs font-medium text-zinc-400 mb-1">
              Senha
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                id="auth-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-sm bg-orange-600 hover:bg-orange-500 text-white transition-colors shadow-lg shadow-orange-600/20 disabled:opacity-50"
          >
            {isSignUp ? (
              <>
                <UserPlus className="w-4 h-4" />
                {loading ? 'Cadastrando...' : 'Cadastrar Usuário'}
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                {loading ? 'Entrando...' : 'Entrar no App'}
              </>
            )}
          </button>
        </form>
      )}
    </div>
  )
}
