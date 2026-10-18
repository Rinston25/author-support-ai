import { getDraftSchema, regenerateDraftSchema, usageSchema } from './schemas.js'
import { getDraftForTicket, regenerateDraftForTicket, getUsage } from './service.js'

// AI-assisted features for the admin portal.
export default async function aiAssistRoutes(fastify) {
  const adminOnly = fastify.requireRole('admin')

  fastify.get('/admin/tickets/:ticketId/draft', { schema: getDraftSchema, onRequest: adminOnly }, async (request) => {
    return getDraftForTicket(fastify, request.params.ticketId)
  })

  fastify.post('/admin/tickets/:ticketId/draft/regenerate', { schema: regenerateDraftSchema, onRequest: adminOnly }, async (request) => {
    return regenerateDraftForTicket(fastify, request.params.ticketId, request.body?.instructions)
  })

  fastify.get('/admin/ai/usage', { schema: usageSchema, onRequest: adminOnly }, async () => {
    return getUsage(fastify.db)
  })
}
