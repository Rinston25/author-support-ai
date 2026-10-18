import { badRequest, conflict, notFound } from '../../lib/httpErrors.js'
import { withTransaction } from '../../lib/transaction.js'
import { classifyTicket } from '../../ai/classifier.js'
import { publishEvent } from '../events/eventBus.js'
import { findBookForAuthor } from '../books/repository.js'
import { deleteDraft } from '../../ai/draftRepository.js'
import {
  insertTicket, insertMessage, insertAttachments, listTicketsForAuthor, findTicketForAuthor,
  lockTicketForAuthor, listPublicMessages, listAttachments, touchTicketAfterAuthorMessage,
} from './repository.js'

const SUBJECT_LIMITS = { min: 5, max: 150 }
const DESCRIPTION_LIMITS = { min: 20, max: 5000 }

// JSON Schema counts spaces, so "     " would pass minLength. Check the trimmed text too.
function requireLength(field, text, limits) {
  if (text.length < limits.min || text.length > limits.max) {
    throw badRequest('VALIDATION_ERROR', 'Request validation failed', [
      { field, message: `must be between ${limits.min} and ${limits.max} characters` },
    ])
  }
}

export async function createTicket(fastify, user, { bookId, subject, description, attachments = [] }) {
  const cleanSubject = subject.trim()
  const cleanDescription = description.trim()
  requireLength('subject', cleanSubject, SUBJECT_LIMITS)
  requireLength('description', cleanDescription, DESCRIPTION_LIMITS)

  // A book that isn't theirs looks the same as one that doesn't exist
  if (bookId) {
    const book = await findBookForAuthor(fastify.db, bookId, user.authorId)
    if (!book) throw notFound('BOOK_NOT_FOUND', 'Book not found')
  }

  // Ticket, first message and attachments are saved together or not at all
  const ticketId = await withTransaction(fastify.db, async (client) => {
    const newTicketId = await insertTicket(client, {
      authorId: user.authorId, bookId: bookId || null, subject: cleanSubject, description: cleanDescription,
    })
    // The author's description is the first message, so the thread starts complete
    await insertMessage(client, {
      ticketId: newTicketId, senderUserId: user.userId, senderRole: 'author', body: cleanDescription,
    })
    await insertAttachments(client, newTicketId, attachments)
    return newTicketId
  })

  publishEvent({ type: 'ticket.created', ticketId, authorId: user.authorId, data: { status: 'open' } })

  // Runs after the 201 has been sent. The AI is never allowed to slow down or
  // fail ticket creation, so its errors are only logged.
  setImmediate(() => {
    classifyTicket(fastify, ticketId).catch((error) => {
      fastify.log.error({ err: error, ticketId }, 'classification failed')
    })
  })

  return findTicketForAuthor(fastify.db, ticketId, user.authorId)
}

export async function listTickets(db, authorId, status) {
  return listTicketsForAuthor(db, authorId, status)
}

export async function getTicket(db, ticketId, authorId) {
  const ticket = await findTicketForAuthor(db, ticketId, authorId)
  // Someone else's ticket is reported as missing, never as forbidden
  if (!ticket) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')
  const [messages, attachments] = await Promise.all([
    listPublicMessages(db, ticketId),
    listAttachments(db, ticketId),
  ])
  return { ...ticket, messages, attachments }
}

export async function addAuthorMessage(fastify, user, ticketId, body) {
  const cleanBody = body.trim()
  if (cleanBody.length === 0) {
    throw badRequest('VALIDATION_ERROR', 'Request validation failed', [
      { field: 'body', message: 'must not be empty' },
    ])
  }

  const result = await withTransaction(fastify.db, async (client) => {
    const ticket = await lockTicketForAuthor(client, ticketId, user.authorId)
    if (!ticket) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')
    if (ticket.status === 'closed') {
      throw conflict('TICKET_CLOSED', 'This ticket is closed. Please raise a new ticket.')
    }

    const message = await insertMessage(client, {
      ticketId, senderUserId: user.userId, senderRole: 'author', body: cleanBody,
    })
    const newStatus = await touchTicketAfterAuthorMessage(client, ticketId)
    // The saved AI draft answered the previous message, not this one
    await deleteDraft(client, ticketId)
    return { message, previousStatus: ticket.status, newStatus }
  })

  publishEvent({ type: 'message.created', ticketId, authorId: user.authorId, data: { senderRole: 'author' } })
  if (result.previousStatus !== result.newStatus) {
    publishEvent({ type: 'ticket.updated', ticketId, authorId: user.authorId, data: { status: result.newStatus } })
  }

  return { message: result.message, ticketStatus: result.newStatus }
}
