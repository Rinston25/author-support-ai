import { CATEGORIES, PRIORITIES, TICKET_STATUSES } from '../../lib/constants.js'

const ticketIdParams = {
  type: 'object',
  required: ['ticketId'],
  properties: { ticketId: { type: 'string', format: 'uuid' } },
}

const queueItem = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    subject: { type: 'string' },
    status: { type: 'string', enum: TICKET_STATUSES },
    category: { type: ['string', 'null'], description: 'null while classification is pending' },
    priority: { type: ['string', 'null'], description: 'null while classification is pending' },
    classificationStatus: { type: 'string', enum: ['pending', 'done', 'fallback'] },
    categorySource: { type: ['string', 'null'], enum: ['ai', 'fallback', 'admin', null] },
    prioritySource: { type: ['string', 'null'], enum: ['ai', 'fallback', 'admin', null] },
    authorId: { type: 'string' },
    authorName: { type: 'string' },
    bookId: { type: ['string', 'null'] },
    bookTitle: { type: ['string', 'null'] },
    assignedToId: { type: ['string', 'null'] },
    assignedToName: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    ageSeconds: { type: 'integer', description: 'Time since the ticket was created' },
  },
}

const detailTicket = {
  type: 'object',
  properties: {
    ...queueItem.properties,
    description: { type: 'string' },
    aiReasoning: { type: ['string', 'null'] },
    firstResponseAt: { type: ['string', 'null'] },
    resolvedAt: { type: ['string', 'null'] },
  },
}

// Detail is a big nested object; the exact book/author fields are documented
// in the books schema, so here they are passed through as-is.
const ticketDetailResponse = {
  200: {
    type: 'object',
    properties: {
      ticket: detailTicket,
      author: { type: 'object', additionalProperties: true },
      authorBooks: { type: 'array', items: { type: 'object', additionalProperties: true } },
      book: { type: ['object', 'null'], additionalProperties: true },
      messages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            senderRole: { type: 'string' },
            senderName: { type: 'string' },
            body: { type: 'string' },
            aiAssisted: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      notes: {
        type: 'array',
        description: 'Internal notes. Never visible to authors.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            adminName: { type: 'string' },
            body: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      attachments: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
  },
}

const security = [{ bearerAuth: [] }]

export const listTicketsSchema = {
  tags: ['Admin tickets'],
  summary: 'Ticket queue with filters, search and sorting',
  description: 'Default sort is "urgency": unresolved first, then priority, then oldest first.',
  security,
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: TICKET_STATUSES },
      category: { type: 'string', enum: CATEGORIES },
      priority: { type: 'string', enum: PRIORITIES },
      assignee: {
        type: 'string',
        pattern: '^(me|unassigned|[0-9a-fA-F-]{36})$',
        description: '"me", "unassigned" or an admin user id',
      },
      from: { type: 'string', format: 'date', description: 'Created on or after this date' },
      to: { type: 'string', format: 'date', description: 'Created on or before this date' },
      q: { type: 'string', minLength: 1, maxLength: 100, description: 'Searches subject, description and author name' },
      sort: { type: 'string', enum: ['urgency', 'oldest', 'newest'], default: 'urgency' },
      page: { type: 'integer', minimum: 1, default: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        tickets: { type: 'array', items: queueItem },
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
        total: { type: 'integer' },
      },
    },
  },
}

export const statsSchema = {
  tags: ['Admin tickets'],
  summary: 'Counts for the queue header',
  description: 'byPriority only counts unresolved tickets (open or in progress).',
  security,
  response: {
    200: {
      type: 'object',
      properties: {
        byStatus: { type: 'object', additionalProperties: { type: 'integer' } },
        byPriority: { type: 'object', additionalProperties: { type: 'integer' } },
        unassigned: { type: 'integer' },
        oldestUnresolvedAgeSeconds: { type: ['integer', 'null'] },
      },
    },
  },
}

export const getTicketSchema = {
  tags: ['Admin tickets'],
  summary: 'Full ticket: conversation, internal notes, AI reasoning, author and books',
  security,
  params: ticketIdParams,
  response: ticketDetailResponse,
}

export const patchTicketSchema = {
  tags: ['Admin tickets'],
  summary: 'Change status, category, priority or assignee',
  description: 'Changing category or priority marks that field as set by an admin.',
  security,
  params: ticketIdParams,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      status: { type: 'string', enum: TICKET_STATUSES },
      category: { type: 'string', enum: CATEGORIES },
      priority: { type: 'string', enum: PRIORITIES },
      assignedTo: { type: ['string', 'null'], format: 'uuid', description: 'Admin user id, or null to unassign' },
    },
    examples: [{ priority: 'critical', status: 'in_progress' }],
  },
  response: ticketDetailResponse,
}

export const assignToMeSchema = {
  tags: ['Admin tickets'],
  summary: 'Assign the ticket to the logged-in admin',
  security,
  params: ticketIdParams,
  response: ticketDetailResponse,
}
