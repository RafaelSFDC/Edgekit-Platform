import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { secureHeaders } from 'hono/secure-headers'
import type { AppEnv } from './types'
import { checkIpAccess, resolveCorsOrigin } from './auth/security'
import { authContextMiddleware } from './auth/middleware'
import { authRoutes } from './routes/auth.routes'
import { dbRoutes } from './routes/db.routes'
import { storageRoutes } from './routes/storage.routes'
import { realtimeRoutes } from './routes/realtime.routes'
import { functionsRoutes } from './routes/functions.routes'
import { adminRoutes } from './routes/admin.routes'
import { webhookRoutes } from './routes/webhook.routes'

export const app = new Hono<AppEnv>()

// 1. Middlewares Globais
app.use('*', logger())
app.use('*', secureHeaders())
app.use('*', prettyJSON())
app.use(
  '*',
  cors({
    origin: async (origin, c) => (await resolveCorsOrigin(origin, c)) || '',
    allowHeaders: ['Content-Type', 'Authorization', 'apikey', 'x-api-key', 'X-Requested-With', 'x-app-secret'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'X-Edgekit-Version', 'set-auth-token'],
    credentials: true,
  }),
)

// 2. Proteção de Acesso por IP & Contexto de Autenticação para a API
app.use('/api/*', async (c, next) => {
  const ipCheck = await checkIpAccess(c)
  if (!ipCheck.allowed) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN_IP', message: ipCheck.reason || 'Acesso bloqueado por restrição de IP.' },
      },
      403,
    )
  }
  await next()
})
app.use('/api/*', authContextMiddleware())

// 3. Health Checks
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'Edgekit Platform Serverless Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }),
)
app.get('/api/v1/health', (c) =>
  c.json({
    status: 'ok',
    service: 'Edgekit Platform Serverless Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }),
)

// 4. OpenAPI Specification & Documentação Interativa via Scalar
app.get('/openapi.json', (c) => {
  return c.json({
    openapi: '3.1.0',
    info: {
      title: 'Edgekit Platform - Cloudflare Serverless Backend API',
      version: '1.0.0',
      description:
        'Open-Source Self-Hosted Backend-as-a-Service na Cloudflare com Auth, D1 Database, R2 Storage e Realtime Durable Objects.',
    },
    paths: {
      '/api/v1/auth/me': {
        get: {
          summary: 'Obter dados da sessão do usuário autenticado',
          responses: { '200': { description: 'Dados do usuário e permissões' } },
        },
      },
      '/api/v1/auth/public-config': {
        get: {
          summary: 'Configurações públicas da aplicação (OAuth providers, anon key)',
          responses: { '200': { description: 'Configurações públicas' } },
        },
      },
      '/api/v1/db/{table}': {
        get: {
          summary: 'Consultar registros de uma tabela com filtros dinâmicos',
          parameters: [
            { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'select', in: 'query', schema: { type: 'string' }, description: 'Colunas separadas por vírgula' },
            { name: 'expand', in: 'query', schema: { type: 'string' }, description: 'Relações a expandir' },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'offset', in: 'query', schema: { type: 'integer' } },
            { name: 'order', in: 'query', schema: { type: 'string' }, description: 'ex: created_at.desc' },
          ],
          responses: { '200': { description: 'Lista de registros encontrados' } },
        },
        post: {
          summary: 'Inserir novo(s) registro(s)',
          parameters: [{ name: 'table', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '201': { description: 'Registro criado' } },
        },
      },
      '/api/v1/db/{table}/query': {
        post: {
          summary: 'Executar consulta declarativa estruturada (Zero-SQL)',
          parameters: [{ name: 'table', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Resultados da consulta' } },
        },
      },
      '/api/v1/db/{table}/{id}': {
        get: {
          summary: 'Obter registro específico por ID',
          parameters: [
            { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'expand', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Registro encontrado' }, '404': { description: 'Não encontrado' } },
        },
        patch: {
          summary: 'Atualizar registro específico por ID',
          parameters: [
            { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Registro atualizado' } },
        },
        delete: {
          summary: 'Excluir registro por ID',
          parameters: [
            { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Registro excluído' } },
        },
      },
      '/api/v1/db/batch': {
        post: {
          summary: 'Executar mutações atômicas transacionais em lote',
          responses: { '200': { description: 'Operações executadas com sucesso' } },
        },
      },
      '/api/v1/storage/{bucket}/list': {
        get: {
          summary: 'Listar arquivos em um bucket de storage',
          parameters: [{ name: 'bucket', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Lista de arquivos' } },
        },
      },
      '/api/v1/storage/{bucket}/upload': {
        post: {
          summary: 'Upload de arquivo para o R2 com verificação de políticas',
          parameters: [{ name: 'bucket', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '201': { description: 'Metadados do arquivo enviado' } },
        },
      },
      '/api/v1/storage/{bucket}/signed-url': {
        post: {
          summary: 'Gerar URL temporária pré-assinada com HMAC-SHA256',
          parameters: [{ name: 'bucket', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'URL assinada e expiração' } },
        },
      },
      '/api/v1/storage/{bucket}/file/{path}': {
        get: {
          summary: 'Download ou streaming HTTP 206 de arquivo',
          parameters: [
            { name: 'bucket', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'path', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Arquivo completo' }, '206': { description: 'Partial content (streaming)' } },
        },
      },
      '/api/v1/realtime/ws': {
        get: {
          summary: 'Handshake WebSocket multiplexado do Hub Realtime (Hibernation API)',
          responses: { '101': { description: 'Switching Protocols para WebSocket' } },
        },
      },
      '/api/v1/realtime/{channel}/broadcast': {
        post: {
          summary: 'Enviar mensagem de broadcast em tempo real para um canal',
          parameters: [{ name: 'channel', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Mensagem transmitida' } },
        },
      },
      '/api/v1/realtime/{channel}/presence': {
        get: {
          summary: 'Consultar presença e conexões ativas no canal',
          parameters: [{ name: 'channel', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Lista de usuários conectados' } },
        },
      },
      '/api/v1/webhooks': {
        get: {
          summary: 'Listar webhooks cadastrados (Admin / service_role)',
          responses: { '200': { description: 'Lista de webhooks' } },
        },
        post: {
          summary: 'Cadastrar novo webhook HTTP assinado',
          responses: { '201': { description: 'Webhook criado' } },
        },
      },
      '/api/v1/webhooks/{id}/test': {
        post: {
          summary: 'Testar disparo de webhook (Ping Test com assinatura HMAC e medição de latência)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Resultado da entrega e latência' } },
        },
      },
      '/api/v1/functions/status': {
        get: {
          summary: 'Consultar status e capacidades de Edge Functions',
          responses: { '200': { description: 'Status das funções' } },
        },
      },
    },
  })
})

app.get('/docs', (c) => {
  return c.html(`
<!doctype html>
<html>
  <head>
    <title>Edgekit Platform API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23f97316' stroke-width='2'><path d='M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'/></svg>" />
    <style>
      body { margin: 0; background: #09090b; }
    </style>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>
  `)
})

// 5. Montagem dos Módulos da API
app.route('/api/v1/auth', authRoutes)
app.route('/api/v1/db', dbRoutes)
app.route('/api/v1/storage', storageRoutes)
app.route('/api/v1/realtime', realtimeRoutes)
app.route('/api/v1/webhooks', webhookRoutes)
app.route('/api/v1/functions', functionsRoutes)
app.route('/api/v1/admin', adminRoutes)

// 6. Tratamento de Erros e Rotas Não Encontradas
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Rota não encontrada: ${c.req.method} ${c.req.path}`,
      },
    },
    404,
  )
})

app.onError((err, c) => {
  console.error('[Edgekit Platform Error]:', err)
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Erro inesperado no servidor',
      },
    },
    500,
  )
})
