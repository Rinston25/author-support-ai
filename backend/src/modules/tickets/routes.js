import { createTicketSchema, listTicketsSchema, getTicketSchema, addMessageSchema } from './schemas.js'
import { createTicket, listTickets, getTicket, addAuthorMessage } from './service.js'

// Author-facing tickets. The author always comes from the verified JWT
// (request.user), never from the body, URL or query string.
export default async function ticketRoutes(fastify) {
  const authorOnly = fastify.requireRole('author')

  fastify.post('/tickets', { schema: createTicketSchema, preHandler: authorOnly }, async (request, reply) => {
    const ticket = await createTicket(fastify, request.user, request.body)
    return reply.code(201).send({ ticket })
  })

  fastify.get('/tickets', { schema: listTicketsSchema, preHandler: authorOnly }, async (request) => {
    return { tickets: await listTickets(fastify.db, request.user.authorId, request.query.status) }
  })

  fastify.get('/tickets/:ticketId', { schema: getTicketSchema, preHandler: authorOnly }, async (request) => {
    return { ticket: await getTicket(fastify.db, request.params.ticketId, request.user.authorId) }
  })

  fastify.post('/tickets/:ticketId/messages', { schema: addMessageSchema, preHandler: authorOnly }, async (request, reply) => {
    const result = await addAuthorMessage(fastify, request.user, request.params.ticketId, request.body.body)
    return reply.code(201).send(result)
  })
}
