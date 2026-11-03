import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { client } from '../lib/edgekit'

export interface Persona {
  id: 'alice' | 'bob' | 'anon'
  name: string
  title: string
  email: string | null
  avatar: string
  color: string
  badgeClass: string
}

export const PERSONAS: Record<'alice' | 'bob' | 'anon', Persona> = {
  alice: {
    id: 'alice',
    name: 'Alice',
    title: 'Product Manager',
    email: 'alice@taskflow.local',
    avatar: '👩',
    color: '#f97316',
    badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  },
  bob: {
    id: 'bob',
    name: 'Bob',
    title: 'Tech Lead',
    email: 'bob@taskflow.local',
    avatar: '👨',
    color: '#3b82f6',
    badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  },
  anon: {
    id: 'anon',
    name: 'Anônimo',
    title: 'Visitante Público',
    email: null,
    avatar: '👤',
    color: '#71717a',
    badgeClass: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  },
}

interface PersonaContextValue {
  activePersona: Persona
  currentUser: any
  session: any
  isSwitching: boolean
  error: string | null
  switchPersona: (personaKey: 'alice' | 'bob' | 'anon') => Promise<void>
  refreshUser: () => Promise<void>
}

const PersonaContext = createContext<PersonaContextValue | undefined>(undefined)

const PERSONA_STORAGE_KEY = 'ek_taskflow_active_persona'

export const PersonaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePersona, setActivePersona] = useState<Persona>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(PERSONA_STORAGE_KEY) as 'alice' | 'bob' | 'anon'
      if (saved && PERSONAS[saved]) return PERSONAS[saved]
    }
    return PERSONAS.alice
  })
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [isSwitching, setIsSwitching] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const refreshUser = useCallback(async () => {
    try {
      const res = await client.auth.getSession()
      if (res.data) {
        setCurrentUser(res.data.user || null)
        setSession(res.data.session || null)
      } else {
        setCurrentUser(null)
        setSession(null)
      }
    } catch {
      setCurrentUser(null)
      setSession(null)
    }
  }, [])

  const switchPersona = useCallback(
    async (personaKey: 'alice' | 'bob' | 'anon') => {
      setIsSwitching(true)
      setError(null)
      try {
        if (personaKey === 'anon') {
          await client.auth.signOut().catch(() => {})
          localStorage.setItem(PERSONA_STORAGE_KEY, 'anon')
          setActivePersona(PERSONAS.anon)
          setCurrentUser(null)
          setSession(null)
        } else {
          const target = PERSONAS[personaKey]
          if (!target.email) return

          // Desloga sessão anterior antes de alternar
          await client.auth.signOut().catch(() => {})

          // Autentica com as credenciais padrão do seed
          const res = await client.auth.signInWithPassword({
            email: target.email,
            password: 'Password123!',
          })

          if (res.error) {
            setError(`Falha ao alternar para ${target.name}: ${res.error.message}`)
          } else {
            localStorage.setItem(PERSONA_STORAGE_KEY, personaKey)
            setActivePersona(target)
            await refreshUser()
          }
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao alternar de usuário')
      } finally {
        setIsSwitching(false)
      }
    },
    [refreshUser],
  )

  // Ao montar, inicializa a sessão da persona salva
  useEffect(() => {
    const init = async () => {
      const saved = (localStorage.getItem(PERSONA_STORAGE_KEY) as 'alice' | 'bob' | 'anon') || 'alice'
      await switchPersona(saved)
    }
    init()
  }, [])

  return (
    <PersonaContext.Provider
      value={{
        activePersona,
        currentUser,
        session,
        isSwitching,
        error,
        switchPersona,
        refreshUser,
      }}
    >
      {children}
    </PersonaContext.Provider>
  )
}

export function usePersona() {
  const context = useContext(PersonaContext)
  if (!context) {
    throw new Error('usePersona deve ser usado dentro de um PersonaProvider')
  }
  return context
}
