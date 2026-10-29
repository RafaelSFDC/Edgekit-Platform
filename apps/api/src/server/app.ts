import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import type { AppEnv } from './types'
import { authContextMiddleware } from './auth/middleware'
import { authRoutes } from './routes/auth.routes'
import { dbRoutes } from './routes/db.routes'
import { storageRoutes } from './routes/storage.routes'
import { realtimeRoutes } from './routes/realtime.routes'
import { functionsRoutes } from './routes/functions.routes'
import { adminRoutes } from './routes/admin.routes'

export const app = new Hono<AppEnv>()

// 1. Middlewares Globais
app.use('*', logger())
app.use('*', secureHeaders())
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowHeaders: ['Content-Type', 'Authorization', 'apikey', 'x-api-key', 'X-Requested-With'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'X-HonoBase-Version'],
    credentials: true,
  }),
)

// 2. Middleware de Contexto de Autenticação para a API
app.use('/api/*', authContextMiddleware())

// 3. Health Checks
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'HonoBase Serverless Backend',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }),
)
app.get('/api/v1/health', (c) =>
  c.json({
    status: 'ok',
    service: 'HonoBase Serverless Backend',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }),
)

// 4. OpenAPI Specification & Documentação Interativa via Scalar
app.get('/openapi.json', (c) => {
  return c.json({
    openapi: '3.1.0',
    info: {
      title: 'HonoBase - Cloudflare Serverless Backend API',
      version: '0.1.0',
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
      '/api/v1/db/{table}': {
        get: {
          summary: 'Consultar registros de uma tabela com filtros dinâmicos',
          parameters: [
            { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'select', in: 'query', schema: { type: 'string' }, description: 'Colunas separadas por vírgula' },
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
      '/api/v1/storage/{bucket}/upload': {
        post: {
          summary: 'Upload de arquivo para o R2',
          parameters: [{ name: 'bucket', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '201': { description: 'Metadados do arquivo enviado' } },
        },
      },
      '/api/v1/realtime/{channel}/broadcast': {
        post: {
          summary: 'Enviar mensagem de broadcast em tempo real para um canal',
          parameters: [{ name: 'channel', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Mensagem transmitida' } },
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
    <title>HonoBase API Reference</title>
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
app.route('/api/v1/functions', functionsRoutes)
app.route('/api/v1/admin', adminRoutes)

// 6. Tratamento de Erros Global
app.onError((err, c) => {
  console.error('[HonoBase Error]:', err)
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
