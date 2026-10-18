import {
  listTicketsSchema, statsSchema, getTicketSchema, patchTicketSchema, assignToMeSchema,
  sendResponseSchema, addNoteSchema, listUsersSchema,
} from './schemas.js'
import {
  getQueue, getStats, getTicketDetail, changeTicket, assignToMe, sendResponse, addNote, listAdmins,
} from './service.js'

// Every route here is admin-only; admins can see all tickets.
export default async function adminRoutes(fastify) {
  const adminOnly = fastify.requireRole('admin')

  fastify.get('/admin/tickets', { schema: listTicketsSchema, onRequest: adminOnly }, async (request) => {
    return getQueue(fastify.db, request.query, request.user.userId)
  })

  fastify.get('/admin/tickets/stats', { schema: statsSchema, onRequest: adminOnly }, async () => {
    return getStats(fastify.db)
  })

  fastify.get('/admin/tickets/:ticketId', { schema: getTicketSchema, onRequest: adminOnly }, async (request) => {
    return getTicketDetail(fastify.db, request.params.ticketId)
  })

  fastify.patch('/admin/tickets/:ticketId', { schema: patchTicketSchema, onRequest: adminOnly }, async (request) => {
    return changeTicket(fastify.db, request.params.ticketId, request.body)
  })

  fastify.post('/admin/tickets/:ticketId/assign-to-me', { schema: assignToMeSchema, onRequest: adminOnly }, async (request) => {
    return assignToMe(fastify.db, request.params.ticketId, request.user.userId)
  })

  fastify.post('/admin/tickets/:ticketId/responses', { schema: sendResponseSchema, onRequest: adminOnly }, async (request, reply) => {
    const result = await sendResponse(fastify.db, request.params.ticketId, request.user.userId, request.body)
    return reply.code(201).send(result)
  })

  fastify.post('/admin/tickets/:ticketId/notes', { schema: addNoteSchema, onRequest: adminOnly }, async (request, reply) => {
    const result = await addNote(fastify.db, request.params.ticketId, request.user.userId, request.body.body)
    return reply.code(201).send(result)
  })

  fastify.get('/admin/users', { schema: listUsersSchema, onRequest: adminOnly }, async () => {
    return listAdmins(fastify.db)
  })
}
