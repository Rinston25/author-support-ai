import { badRequest, notFound } from '../../lib/httpErrors.js'
import { buildRoyaltySummary } from '../../lib/royaltyCalendar.js'
import { publishEvent } from '../events/eventBus.js'
import { findBooksByAuthor } from '../books/repository.js'
import { listAttachments } from '../tickets/repository.js'
import {
  listQueueTickets, countQueueTickets, getQueueStats, findTicketById, findAuthorById,
  listAllMessages, listNotes, findAdminUser, updateTicket,
} from './repository.js'

export async function getQueue(db, filters, adminId) {
  const [tickets, total] = await Promise.all([
    listQueueTickets(db, filters, adminId),
    countQueueTickets(db, filters, adminId),
  ])
  return { tickets, page: filters.page, pageSize: filters.pageSize, total }
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
    oldestUnresolvedAgeSeconds: stats.oldestAgeSeconds,
  }
}

// Everything the admin detail screen needs in one response
export async function getTicketDetail(db, ticketId) {
  const ticket = await findTicketById(db, ticketId)
  if (!ticket) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')

  const [author, authorBooks, messages, notes, attachments] = await Promise.all([
    findAuthorById(db, ticket.authorId),
    findBooksByAuthor(db, ticket.authorId),
    listAllMessages(db, ticketId),
    listNotes(db, ticketId),
    listAttachments(db, ticketId),
  ])

  const totalPending = authorBooks.reduce((total, book) => total + book.royaltyPending, 0)
  return {
    ticket,
    author: { ...author, royalty: buildRoyaltySummary(totalPending) },
    authorBooks,
    // The book the ticket is about, picked out of the author's books
    book: authorBooks.find((book) => book.id === ticket.bookId) || null,
    messages,
    notes,
    attachments,
  }
}

// PATCH: any mix of status / category / priority / assignedTo
export async function changeTicket(db, ticketId, adminId, changes) {
  const ticket = await findTicketById(db, ticketId)
  if (!ticket) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')

  const update = {}

  if (changes.status !== undefined) {
    update.status = changes.status
    const isFinished = changes.status === 'resolved' || changes.status === 'closed'
    // Stamp the time once; clear it if the ticket is reopened
    if (isFinished && !ticket.resolvedAt) update.resolvedAt = new Date()
    if (!isFinished) update.resolvedAt = null
  }

  // A manual override always wins over the AI, and is remembered as such
  if (changes.category !== undefined) {
    update.category = changes.category
    update.categorySource = 'admin'
  }
  if (changes.priority !== undefined) {
    update.priority = changes.priority
    update.prioritySource = 'admin'
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
  return changeTicket(db, ticketId, adminId, { assignedTo: adminId })
}
