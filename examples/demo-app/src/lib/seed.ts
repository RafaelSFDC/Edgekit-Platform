import { BACKEND_URL } from './edgekit'

export interface SeedResult {
  success: boolean
  message: string
  data?: {
    projects: number
    tasks: number
    comments: number
    users: string[]
    buckets: string[]
  }
}

/**
 * Auto-Provisioner do TaskFlow Pro:
 * Inicializa o schema relacional (projects, tasks, comments), buckets e dados de exemplo
 * diretamente no D1/SQLite sem exigir setup manual no Admin Studio.
 */
export async function ensureDemoSeed(options: { reset?: boolean } = {}): Promise<SeedResult> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/admin/seed-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: options.reset }),
    })
    const json = await res.json()
    return json
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Falha ao provisionar dados de demonstração.',
    }
  }
}
