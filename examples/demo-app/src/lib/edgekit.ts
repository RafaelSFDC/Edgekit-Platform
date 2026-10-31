import { createEdgekitClient } from '@edgekit/platform-client'

export const BACKEND_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}`
    : 'http://localhost:8787'

// Chave anônima padrão para dev ou configurável pelo usuário
const storedAnonKey =
  typeof window !== 'undefined' ? localStorage.getItem('ek_demo_anon_key') : null
export const DEFAULT_ANON_KEY = storedAnonKey || 'ek_anon_dev_local_key'

export const client = createEdgekitClient({
  url: BACKEND_URL,
  anonKey: DEFAULT_ANON_KEY,
  credentials: 'include',
})

export function updateClientCredentials(newAnonKey: string, token?: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('ek_demo_anon_key', newAnonKey)
  }
  if (token) {
    client.setToken(token)
  }
}
