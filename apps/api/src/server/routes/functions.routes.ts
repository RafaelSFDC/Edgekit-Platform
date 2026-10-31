import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getBindings } from '../env'
import { requireAuth } from '../auth/middleware'

export const functionsRoutes = new Hono<AppEnv>()

// Status e capacidades de funções (opt-in via ENABLE_FUNCTIONS)
functionsRoutes.get('/status', async (c) => {
  const bindings = await getBindings()
  const isEnabled = bindings.ENABLE_FUNCTIONS === 'true'

  return c.json({
    success: true,
    data: {
      functionsEnabled: isEnabled,
      runtime: isEnabled ? 'Cloudflare Worker Loader / Dynamic Workers' : 'disabled',
      notice: !isEnabled
        ? 'Edge Functions estão desabilitadas por padrão no plano Free. Para habilitar em planos pagos da Cloudflare, defina ENABLE_FUNCTIONS=true no wrangler.jsonc.'
        : undefined,
    },
  })
})

// Execução de Dynamic Worker (Opt-in com ENABLE_FUNCTIONS=true)
functionsRoutes.all('/dynamic/:scriptName/*', requireAuth(), async (c) => {
  const scriptName = c.req.param('scriptName')
  const bindings = await getBindings()

  const isEnabled = bindings.ENABLE_FUNCTIONS === 'true'
  const dispatcher = (bindings as any).DISPATCHER || (bindings as any).LOADER

  if (!isEnabled || !dispatcher) {
    return c.json(
      {
        success: false,
        error: {
          code: 'DYNAMIC_WORKERS_UNAVAILABLE',
          message:
            'Dynamic Workers requerem o plano Cloudflare Workers Paid. No plano gratuito, utilize Webhooks HTTP e Event Hooks nativos.',
          howToEnable:
            'Para habilitar no plano pago da Cloudflare, defina ENABLE_FUNCTIONS=true no wrangler.jsonc.',
        },
      },
      501,
    )
  }

  try {
    const worker = dispatcher.get(scriptName)
    const subResponse = await worker.fetch(c.req.raw)
    return subResponse
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: {
          code: 'DYNAMIC_WORKER_EXECUTION_ERROR',
          message: `Falha ao executar a Edge Function "${scriptName}": ${err.message}`,
        },
      },
      500,
    )
  }
})
