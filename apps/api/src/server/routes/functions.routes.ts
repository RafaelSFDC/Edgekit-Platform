import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getBindings } from '../env'
import { listLocalFunctions, getLocalFunction } from '../../../../../functions/index'

export const functionsRoutes = new Hono<AppEnv>()

// 1. Lista de funções locais registradas na instância (Seção 11.1 e 15.7)
functionsRoutes.get('/', async (c) => {
  const functions = listLocalFunctions()
  return c.json({
    success: true,
    data: functions,
  })
})

functionsRoutes.get('/list', async (c) => {
  const functions = listLocalFunctions()
  return c.json({
    success: true,
    data: functions,
  })
})

// 2. Status e capacidades de funções (opt-in via ENABLE_FUNCTIONS)
functionsRoutes.get('/status', async (c) => {
  const bindings = await getBindings()
  const isDynamicEnabled = bindings.ENABLE_FUNCTIONS === 'true'
  const localFunctions = listLocalFunctions()

  return c.json({
    success: true,
    data: {
      functionsEnabled: isDynamicEnabled,
      localFunctionsCount: localFunctions.length,
      localFunctions: localFunctions.map((f) => f.name),
      runtime: 'Cloudflare Workers (Edgekit Local Functions)',
      notice: !isDynamicEnabled
        ? 'Edge Functions estão desabilitadas por padrão no plano Free. Para habilitar em planos pagos da Cloudflare, defina ENABLE_FUNCTIONS=true no wrangler.jsonc.'
        : undefined,
    },
  })
})

// 3. Execução de Dynamic Worker (Opt-in com ENABLE_FUNCTIONS=true)
functionsRoutes.all('/dynamic/:scriptName/*', async (c) => {
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
            'Dynamic Workers requerem o plano Cloudflare Workers Paid. Funções locais sob functions/ estão ativas.',
          howToEnable:
            'Para habilitar Workers dinâmicos na Cloudflare, defina ENABLE_FUNCTIONS=true no wrangler.jsonc.',
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

// 4. Execução de Função Local padrão (Seção 11.1)
async function executeLocalFunction(c: any) {
  const functionName = c.req.param('functionName')
  const localFn = getLocalFunction(functionName)

  if (!localFn) {
    return c.json(
      {
        success: false,
        error: {
          code: 'FUNCTION_NOT_FOUND',
          message: `Função local "${functionName}" não encontrada no diretório functions/.`,
          availableFunctions: listLocalFunctions().map((f) => f.name),
        },
      },
      404,
    )
  }

  try {
    const bindings = await getBindings()
    const reqUrl = c.req.url
      ? c.req.url.startsWith('http')
        ? c.req.url
        : `http://localhost${c.req.url}`
      : 'http://localhost'

    let requestBody: any = undefined
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      try {
        requestBody = await c.req.raw.clone().text()
      } catch {
        requestBody = undefined
      }
    }

    const request = new Request(reqUrl, {
      method: c.req.method,
      headers: c.req.raw?.headers || c.req.header(),
      body: requestBody,
    })

    let executionCtx: any = undefined
    try {
      executionCtx = c.executionCtx
    } catch {
      executionCtx = {
        waitUntil: () => {},
        passThroughOnException: () => {},
      }
    }

    const response = await localFn.handler.fetch(request, bindings, executionCtx)
    return response
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: {
          code: 'FUNCTION_EXECUTION_ERROR',
          message: `Erro ao executar a função "${functionName}": ${err.message}`,
        },
      },
      500,
    )
  }
}

functionsRoutes.all('/:functionName', executeLocalFunction)
functionsRoutes.all('/:functionName/*', executeLocalFunction)
