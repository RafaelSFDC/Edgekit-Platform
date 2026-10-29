import { getBindings } from './env'

export interface CloudflarePlanInfo {
  plan: 'free' | 'paid'
  isPaidPlan: boolean
  features: {
    d1Database: {
      enabled: boolean
      tier: string
      details: string
    }
    r2Storage: {
      enabled: boolean
      tier: string
      details: string
    }
    realtimeDurableObjects: {
      enabled: boolean
      tier: string
      details: string
    }
    dynamicWorkers: {
      enabled: boolean
      tier: string
      details: string
      upgradeNotice?: string
    }
  }
}

export async function getPlanCapabilities(): Promise<CloudflarePlanInfo> {
  const bindings = await getBindings()
  const rawPlan = (bindings.CLOUDFLARE_PLAN || 'free').toLowerCase()
  const isPaid = rawPlan === 'paid' || rawPlan === 'pro' || rawPlan === 'enterprise'
  const enableDynamicWorkers = bindings.ENABLE_DYNAMIC_WORKERS === 'true'

  return {
    plan: isPaid ? 'paid' : 'free',
    isPaidPlan: isPaid,
    features: {
      d1Database: {
        enabled: true,
        tier: 'Free Tier (Incluso)',
        details: '5 Milhões de leituras/dia, 100k escritas/dia, 5GB de dados por banco.',
      },
      r2Storage: {
        enabled: true,
        tier: 'Free Tier (Incluso)',
        details: '10GB de armazenamento gratuito, sem tarifas de saída (egress zero).',
      },
      realtimeDurableObjects: {
        enabled: true,
        tier: 'Free Tier (Incluso nativamente)',
        details:
          'WebSockets com hibernação, salas pub/sub e persistência SQLite sem custo adicional.',
      },
      dynamicWorkers: {
        enabled: isPaid && enableDynamicWorkers,
        tier: isPaid ? 'Paid Tier (Workers for Platforms)' : 'Indisponível no Free Tier',
        details: isPaid
          ? 'Execução dinâmica de sub-workers isolados por script ou tenant.'
          : 'Requer o plano Cloudflare Workers for Platforms.',
        upgradeNotice:
          !isPaid || !enableDynamicWorkers
            ? 'Para executar Dynamic Workers dinâmicos na Cloudflare, é necessário assinar o plano Workers for Platforms da Cloudflare e configurar ENABLE_DYNAMIC_WORKERS=true. No plano gratuito, utilize Webhooks HTTP e Event Hooks nativos.'
            : undefined,
      },
    },
  }
}
