import { listTicketsSchema, statsSchema, getTicketSchema, patchTicketSchema, assignToMeSchema } from './schemas.js'
import { getQueue, getStats, getTicketDetail, changeTicket, assignToMe } from './service.js'

// Every route here is admin-only; admins can see all tickets.
export default async function adminRoutes(fastify) {
  const adminOnly = fastify.requireRole('admin')

  fastify.get('/admin/tickets', { schema: listTicketsSchema, preHandler: adminOnly }, async (request) => {
    return getQueue(fastify.db, request.query, request.user.userId)
  })

  fastify.get('/admin/tickets/stats', { schema: statsSchema, preHandler: adminOnly }, async () => {
    return getStats(fastify.db)
  })

  fastify.get('/admin/tickets/:ticketId', { schema: getTicketSchema, preHandler: adminOnly }, async (request) => {
    return getTicketDetail(fastify.db, request.params.ticketId)
  })

  fastify.patch('/admin/tickets/:ticketId', { schema: patchTicketSchema, preHandler: adminOnly }, async (request) => {
    return changeTicket(fastify.db, request.params.ticketId, request.user.userId, request.body)
  })

  fastify.post('/admin/tickets/:ticketId/assign-to-me', { schema: assignToMeSchema, preHandler: adminOnly }, async (request) => {
    return assignToMe(fastify.db, request.params.ticketId, request.user.userId)
  })
}
