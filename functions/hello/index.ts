/**
 * Edgekit Local Edge Function: hello
 * Handler nativo Cloudflare Workers exportando fetch(request, env, ctx).
 */
export interface FunctionMeta {
  name: string
  description: string
  methods: string[]
  endpoint: string
}

export const meta: FunctionMeta = {
  name: 'hello',
  description: 'Função de saudação demonstrativa com suporte a GET e POST.',
  methods: ['GET', 'POST'],
  endpoint: '/api/v1/functions/hello',
}

export default {
  async fetch(request: Request, _env: any, _ctx: any) {
    const url = new URL(request.url, 'http://localhost')
    const nameParam = url.searchParams.get('name')

    let bodyData: any = null
    if (request.method === 'POST') {
      try {
        bodyData = await request.json()
      } catch {
        // Ignora JSON malformado
      }
    }

    const targetName = bodyData?.name || nameParam || 'Edgekit Developer'

    return Response.json(
      {
        success: true,
        data: {
          greeting: `Hello, ${targetName}!`,
          function: 'hello',
          method: request.method,
          timestamp: new Date().toISOString(),
          runtime: 'Cloudflare Workers (Edgekit Local Functions)',
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Edgekit-Function': 'hello',
        },
      },
    )
  },
}
