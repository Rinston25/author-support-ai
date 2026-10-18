import { config } from '../../config.js'

// GET /api/health: used by the host's health check and for quick debugging.
// The AI circuit-breaker state is added here once aiClient.js exists.
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
            ai: { type: 'object', properties: { configured: { type: 'boolean' } } },
          },
          example: { status: 'ok', database: 'up', ai: { configured: true } },
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
      ai: { configured: Boolean(config.anthropicApiKey) },
    }
  })
}
