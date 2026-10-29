import { app } from './server/app'
import { RealtimeDurableObject } from './server/realtime/durable-object'
import type { AppBindings } from './server/env'

export { RealtimeDurableObject }

export default {
  async fetch(
    request: Request,
    env: AppBindings,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url)

    // 1. Rotas de API, Documentação e WebSocket vão diretamente para o Hono
    if (
      url.pathname.startsWith('/api') ||
      url.pathname.startsWith('/docs') ||
      url.pathname === '/openapi.json' ||
      url.pathname === '/health'
    ) {
      return app.fetch(request, env as any, ctx)
    }

    // 2. Em produção na Cloudflare com Static Assets: entrega a SPA do Admin Dashboard
    if (env.ASSETS) {
      const assetResponse = await (env.ASSETS as any).fetch(request as any)
      if (assetResponse.status !== 404) {
        return assetResponse as any
      }
      // Se não encontrou o arquivo exato (ex: rota /admin/database da SPA), serve o index.html da SPA
      const indexRequest = new Request(new URL('/index.html', request.url), request as any)
      return (env.ASSETS as any).fetch(indexRequest) as any
    }

    // 3. Fallback: processa pelo Hono
    return app.fetch(request, env as any, ctx) as any
  },
}
