// GET /api/health: used by the host's health check and for quick debugging.
export default async function healthRoutes(fastify) {
  fastify.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Check the database and AI configuration',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            database: { type: 'string' },
            ai: {
              type: 'object',
              properties: {
                configured: { type: 'boolean' },
                model: { type: 'string' },
                circuitOpen: { type: 'boolean' },
                consecutiveFailures: { type: 'integer' },
                reopensAt: { type: ['string', 'null'] },
              },
            },
          },
          examples: [{ status: 'ok', database: 'up', ai: { configured: true, model: 'claude-haiku-5-5', circuitOpen: false, consecutiveFailures: 0, reopensAt: null } }],
        },
      },
    },
  }, async () => {
    let database = 'up'
    try {
      await fastify.db.query('SELECT 1')
    } catch {
      database = 'down'
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      ai: fastify.ai.getStatus(),
    }
  })
}
