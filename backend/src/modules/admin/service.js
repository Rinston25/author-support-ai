import { badRequest, conflict, notFound } from '../../lib/httpErrors.js'
import { hasPlaceholders } from '../../lib/placeholders.js'
import { buildRoyaltySummary } from '../../lib/royaltyCalendar.js'
import { withTransaction } from '../../lib/transaction.js'
import { publishEvent } from '../events/eventBus.js'
import { classifyTicket } from '../../ai/classifier.js'
import { findBooksByAuthor } from '../books/repository.js'
import { insertMessage, listAttachments } from '../tickets/repository.js'
import {
  listQueueTickets, countQueueTickets, getQueueStats, findTicketById, findAuthorById,
  listAllMessages, listNotes, insertNote, listAdminUsers, findAdminUser, lockTicketForUpdate, updateTicket,
} from './repository.js'

const RESPONSE_LIMITS = { min: 10, max: 5000 }
const FINISHED_STATUSES = ['resolved', 'closed']

export async function getQueue(db, filters, adminId) {
  const [items, total] = await Promise.all([
    listQueueTickets(db, filters, adminId),
    countQueueTickets(db, filters, adminId),
  ])
  return { items, page: filters.page, pageSize: filters.pageSize, total }
}

export async function getStats(db) {
  const stats = await getQueueStats(db)
  // Fill in zeros so the UI never has to handle a missing key
  const byStatus = { open: 0, in_progress: 0, resolved: 0, closed: 0 }
  for (const row of stats.byStatus) byStatus[row.status] = row.count
  const byPriority = { critical: 0, high: 0, medium: 0, low: 0, unclassified: 0 }
  for (const row of stats.byPriority) byPriority[row.priority] = row.count
  return {
    byStatus,
    byPriority,
    unassigned: stats.unassigned,
    awaitingReply: stats.awaitingReply,
    oldestOpenAgeMinutes: stats.oldestOpenAgeMinutes,
  }
}

export async function listAdmins(db) {
  return { users: await listAdminUsers(db) }
}

// Everything the admin detail screen needs in one response
export async function getTicketDetail(db, ticketId) {
  const ticket = await findTicketById(db, ticketId)
  if (!ticket) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')

  const [author, books, messages, notes, attachments] = await Promise.all([
    findAuthorById(db, ticket.authorId),
    findBooksByAuthor(db, ticket.authorId),
    listAllMessages(db, ticketId),
    listNotes(db, ticketId),
    listAttachments(db, ticketId),
  ])

  const totalPending = books.reduce((total, book) => total + book.royaltyPending, 0)
  return {
    ticket,
    messages,
    notes,
    attachments,
    author: {
      ...author,
      royalty: buildRoyaltySummary(totalPending),
      // The ticket's own book is flagged so the UI can highlight it
      books: books.map((book) => ({
        id: book.id,
        title: book.title,
        status: book.status,
        productionStage: book.productionStage,
        totalCopiesSold: book.totalCopiesSold,
        totalRoyaltyEarned: book.totalRoyaltyEarned,
        royaltyPaid: book.royaltyPaid,
        royaltyPending: book.royaltyPending,
        availableOn: book.availableOn,
        printPartner: book.printPartner,
        isSelected: book.id === ticket.bookId,
      })),
    },
  }
}

// Status changes also keep resolved_at in step: set on resolve, cleared on reopen.
function statusChanges(newStatus, currentResolvedAt) {
  const isFinished = FINISHED_STATUSES.includes(newStatus)
  const resolvedAt = isFinished ? (currentResolvedAt || new Date()) : null
  return { status: newStatus, resolvedAt }
}

// PATCH: any mix of status / category / priority / assignedTo
export async function changeTicket(db, ticketId, changes) {
  const ticket = await findTicketById(db, ticketId)
  if (!ticket) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')

  const update = {}

  if (changes.status !== undefined) {
    Object.assign(update, statusChanges(changes.status, ticket.resolvedAt))
  }

  // A manual override always wins over the AI, and is remembered as such
  if (changes.category !== undefined) {
    update.category = changes.category
    update.categorySource = 'admin'
    update.classificationStatus = 'done'
  }
  if (changes.priority !== undefined) {
    update.priority = changes.priority
    update.prioritySource = 'admin'
    update.classificationStatus = 'done'
  }

  if (changes.assignedTo !== undefined) {
    if (changes.assignedTo !== null && !(await findAdminUser(db, changes.assignedTo))) {
      throw badRequest('INVALID_ASSIGNEE', 'assignedTo must be the id of an admin user')
    }
    update.assignedTo = changes.assignedTo
  }

  await updateTicket(db, ticketId, update)
  publishEvent({ type: 'ticket.updated', ticketId, authorId: ticket.authorId, data: { status: update.status || ticket.status } })
  return getTicketDetail(db, ticketId)
}

export async function assignToMe(db, ticketId, adminId) {
  const ticket = await findTicketById(db, ticketId)
  if (!ticket) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')

  // Picking up an untouched ticket means work has started
  const changes = { assignedTo: adminId }
  if (ticket.status === 'open') changes.status = 'in_progress'
  return changeTicket(db, ticketId, changes)
}

export async function sendResponse(db, ticketId, adminId, { body, aiAssisted, newStatus }) {
  const cleanBody = body.trim()
  if (cleanBody.length < RESPONSE_LIMITS.min || cleanBody.length > RESPONSE_LIMITS.max) {
    throw badRequest('VALIDATION_ERROR', 'Request validation failed', [
      { field: 'body', message: `must be between ${RESPONSE_LIMITS.min} and ${RESPONSE_LIMITS.max} characters` },
    ])
  }
  // Never let an unchecked "[CONFIRM: ...]" reach an author
  if (hasPlaceholders(cleanBody)) {
    throw badRequest('UNRESOLVED_PLACEHOLDERS', 'Replace or remove every [CONFIRM: ...] placeholder before sending')
  }

  // Message, first_response_at, status and assignment succeed or fail together
  const result = await withTransaction(db, async (client) => {
    const ticket = await lockTicketForUpdate(client, ticketId)
    if (!ticket) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')
    if (ticket.status === 'closed') {
      throw conflict('TICKET_CLOSED', 'This ticket is closed and cannot be replied to')
    }

    const message = await insertMessage(client, {
      ticketId, senderUserId: adminId, senderRole: 'admin', body: cleanBody, aiAssisted,
    })

    const changes = {}
    if (!ticket.firstResponseAt) changes.firstResponseAt = new Date()
    if (!ticket.assignedTo) changes.assignedTo = adminId

    // Default: replying to an untouched ticket moves it to in progress
    const targetStatus = newStatus || (ticket.status === 'open' ? 'in_progress' : ticket.status)
    if (targetStatus !== ticket.status || newStatus) {
      Object.assign(changes, statusChanges(targetStatus, ticket.resolvedAt))
    }
    await updateTicket(client, ticketId, changes)
    return { message, authorId: ticket.authorId, status: targetStatus }
  })

  publishEvent({ type: 'message.created', ticketId, authorId: result.authorId, data: { senderRole: 'admin' } })
  publishEvent({ type: 'ticket.updated', ticketId, authorId: result.authorId, data: { status: result.status } })
  return { message: result.message, ticketStatus: result.status }
}

export async function addNote(db, ticketId, adminId, body) {
  const ticket = await findTicketById(db, ticketId)
  if (!ticket) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')

  const cleanBody = body.trim()
  if (cleanBody.length === 0) {
    throw badRequest('VALIDATION_ERROR', 'Request validation failed', [{ field: 'body', message: 'must not be empty' }])
  }
  const note = await insertNote(db, { ticketId, adminUserId: adminId, body: cleanBody })

  // Admins only: the author's stream must never learn that a note exists
  publishEvent({ type: 'ticket.updated', ticketId, authorId: ticket.authorId, audience: 'admins', data: { note: true } })
  return { note }
}

// Re-runs the classifier. It keeps values an admin set by hand unless force is true.
export async function reclassify(fastify, ticketId, force) {
  const ticket = await findTicketById(fastify.db, ticketId)
  if (!ticket) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')
  await classifyTicket(fastify, ticketId, { force })
  return getTicketDetail(fastify.db, ticketId)
}
