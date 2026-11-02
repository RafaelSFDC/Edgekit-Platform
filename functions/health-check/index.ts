/**
 * Edgekit Local Edge Function: health-check
 * Diagnóstico rápido da infraestrutura e headers da requisição.
 */
export const meta = {
  name: 'health-check',
  description: 'Diagnóstico rápido da infraestrutura edge e headers da requisição.',
  methods: ['GET'],
  endpoint: '/api/v1/functions/health-check',
}

export default {
  async fetch(request: Request, _env: any, _ctx: any) {
    return Response.json(
      {
        success: true,
        data: {
          status: 'healthy',
          function: 'health-check',
          cfRay: request.headers.get('cf-ray') || 'edge-local',
          clientIp: request.headers.get('cf-connecting-ip') || '127.0.0.1',
          timestamp: new Date().toISOString(),
          uptimeSeconds: Math.floor(performance.now() / 1000),
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Edgekit-Function': 'health-check',
        },
      },
    )
  },
}
