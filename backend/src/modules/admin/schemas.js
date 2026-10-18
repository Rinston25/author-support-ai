import { CATEGORIES, PRIORITIES, TICKET_STATUSES } from '../../lib/constants.js'

const security = [{ bearerAuth: [] }]

const ticketIdParams = {
  type: 'object',
  required: ['ticketId'],
  properties: { ticketId: { type: 'string', format: 'uuid' } },
}

// What the error responses look like, for the API docs
const errorResponse = (description) => ({
  type: 'object',
  description,
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
  },
})
export const standardErrors = {
  401: errorResponse('Missing or invalid token'),
  403: errorResponse('Not an admin'),
  404: errorResponse('Ticket not found'),
}

const sourceEnum = { type: ['string', 'null'], enum: ['ai', 'fallback', 'admin', null] }

const queueItem = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    subject: { type: 'string' },
    status: { type: 'string', enum: TICKET_STATUSES },
    category: { type: ['string', 'null'], description: 'null while classification is pending' },
    priority: { type: ['string', 'null'], description: 'null while classification is pending' },
    classificationStatus: { type: 'string', enum: ['pending', 'done', 'fallback'] },
    categorySource: sourceEnum,
    prioritySource: sourceEnum,
    authorName: { type: 'string' },
    bookTitle: { type: 'string', description: '"General / Account Level" when no book is selected' },
    assigneeId: { type: ['string', 'null'] },
    assigneeName: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    ageMinutes: { type: 'integer', description: 'Minutes since the ticket was created' },
    lastMessageFrom: { type: ['string', 'null'], enum: ['author', 'admin', null] },
    awaitingReply: { type: 'boolean', description: 'True when the last message is from the author' },
  },
}

const queueItemExample = {
  id: 'e2019c96-23ae-4c8a-b2a8-d42c66ec237d', subject: "I haven't received any royalty", status: 'open',
  category: 'royalty_payments', priority: 'critical', classificationStatus: 'done',
  categorySource: 'ai', prioritySource: 'ai', authorName: 'Ananya Reddy', bookTitle: 'Between Two Temples',
  assigneeId: null, assigneeName: null, createdAt: '2026-10-17T02:00:00.000Z', updatedAt: '2026-10-17T02:00:00.000Z',
  ageMinutes: 1800, lastMessageFrom: 'author', awaitingReply: true,
}

const detailTicket = {
  type: 'object',
  properties: {
    ...queueItem.properties,
    description: { type: 'string' },
    aiReasoning: { type: ['string', 'null'] },
    authorId: { type: 'string' },
    bookId: { type: ['string', 'null'] },
    firstResponseAt: { type: ['string', 'null'] },
    resolvedAt: { type: ['string', 'null'] },
  },
}

const ticketDetailResponse = {
  200: {
    type: 'object',
    properties: {
      ticket: detailTicket,
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
      author: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: ['string', 'null'] },
          city: { type: ['string', 'null'] },
          joinedDate: { type: ['string', 'null'] },
          royalty: {
            type: 'object',
            properties: {
              totalPending: { type: 'integer' },
              nextPayoutDate: { type: ['string', 'null'] },
              belowPayoutThreshold: { type: 'boolean' },
            },
          },
          books: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'string' },
                productionStage: { type: ['string', 'null'] },
                totalCopiesSold: { type: 'integer' },
                totalRoyaltyEarned: { type: 'integer' },
                royaltyPaid: { type: 'integer' },
                royaltyPending: { type: 'integer' },
                availableOn: { type: 'array', items: { type: 'string' } },
                printPartner: { type: ['string', 'null'] },
                isSelected: { type: 'boolean', description: "True for the book this ticket is about" },
              },
            },
          },
        },
      },
    },
  },
  ...standardErrors,
}

export const listTicketsSchema = {
  tags: ['Admin'],
  summary: 'Ticket queue with filters, search and sorting',
  description: 'Default sort is "urgency": unresolved first, then priority (critical to low, unclassified last), then oldest first.',
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
      q: { type: 'string', minLength: 1, maxLength: 100, description: 'Searches subject, description, author name and book title' },
      sort: { type: 'string', enum: ['urgency', 'oldest', 'newest'], default: 'urgency' },
      page: { type: 'integer', minimum: 1, default: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
    examples: [{ status: 'open', priority: 'critical', sort: 'urgency', page: 1, pageSize: 20 }],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        items: { type: 'array', items: queueItem },
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
        total: { type: 'integer' },
      },
      examples: [{ items: [queueItemExample], page: 1, pageSize: 20, total: 1 }],
    },
    401: standardErrors[401],
    403: standardErrors[403],
  },
}

export const statsSchema = {
  tags: ['Admin'],
  summary: 'Counts for the queue header',
  description: 'byPriority only counts unresolved tickets (open or in progress). oldestOpenAgeMinutes is the age of the oldest unresolved ticket.',
  security,
  response: {
    200: {
      type: 'object',
      properties: {
        byStatus: { type: 'object', additionalProperties: { type: 'integer' } },
        byPriority: { type: 'object', additionalProperties: { type: 'integer' } },
        unassigned: { type: 'integer' },
        awaitingReply: { type: 'integer', description: 'Unresolved tickets whose last message is from the author' },
        oldestOpenAgeMinutes: { type: ['integer', 'null'] },
      },
      examples: [{
        byStatus: { open: 4, in_progress: 2, resolved: 1, closed: 1 },
        byPriority: { critical: 1, high: 2, medium: 2, low: 1, unclassified: 0 },
        unassigned: 4, awaitingReply: 5, oldestOpenAgeMinutes: 3120,
      }],
    },
    401: standardErrors[401],
    403: standardErrors[403],
  },
}

export const getTicketSchema = {
  tags: ['Admin'],
  summary: 'Full ticket: conversation, internal notes, AI reasoning, author panel and books',
  security,
  params: ticketIdParams,
  response: ticketDetailResponse,
}

export const patchTicketSchema = {
  tags: ['Admin'],
  summary: 'Change status, category, priority or assignee',
  description: 'Changing category or priority marks that field as set by an admin. Resolving sets resolved_at; reopening clears it.',
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
  tags: ['Admin'],
  summary: 'Assign the ticket to the logged-in admin',
  description: 'An open ticket moves to in_progress.',
  security,
  params: ticketIdParams,
  response: ticketDetailResponse,
}

export const sendResponseSchema = {
  tags: ['Admin'],
  summary: 'Send a reply to the author',
  description: 'Rejects bodies that still contain [CONFIRM: ...] placeholders (400 UNRESOLVED_PLACEHOLDERS) and replies on closed tickets (409 TICKET_CLOSED). Sets first_response_at, and assigns the ticket to the sender if it was unassigned.',
  security,
  params: ticketIdParams,
  body: {
    type: 'object',
    required: ['body', 'aiAssisted'],
    additionalProperties: false,
    properties: {
      body: { type: 'string', minLength: 10, maxLength: 5000 },
      aiAssisted: { type: 'boolean', description: 'True when the text started from an AI draft' },
      newStatus: { type: 'string', enum: ['in_progress', 'resolved'] },
    },
    examples: [{
      body: 'Hi Ananya, thank you for getting in touch. Your next payout is due by 14 November 2026.',
      aiAssisted: true,
      newStatus: 'in_progress',
    }],
  },
  response: {
    201: {
      type: 'object',
      properties: {
        message: {
          type: 'object',
          properties: {
            id: { type: 'string' }, senderRole: { type: 'string' }, body: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ticketStatus: { type: 'string', enum: TICKET_STATUSES },
      },
    },
    400: errorResponse('Validation error or UNRESOLVED_PLACEHOLDERS'),
    409: errorResponse('TICKET_CLOSED'),
    ...standardErrors,
  },
}

export const addNoteSchema = {
  tags: ['Admin'],
  summary: 'Add an internal note (never visible to the author)',
  security,
  params: ticketIdParams,
  body: {
    type: 'object',
    required: ['body'],
    additionalProperties: false,
    properties: { body: { type: 'string', minLength: 1, maxLength: 2000 } },
    examples: [{ body: 'Checked with the print partner; reprint approved.' }],
  },
  response: {
    201: {
      type: 'object',
      properties: {
        note: {
          type: 'object',
          properties: { id: { type: 'string' }, body: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } },
        },
      },
    },
    ...standardErrors,
  },
}

export const listUsersSchema = {
  tags: ['Admin'],
  summary: 'List admin users (for the assignee dropdown)',
  security,
  response: {
    200: {
      type: 'object',
      properties: {
        users: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } } },
        },
      },
      examples: [{ users: [{ id: 'cd1e0000-0000-4000-8000-000000000001', name: 'BookLeaf Admin', email: 'admin@bookleaf.com' }] }],
    },
    401: standardErrors[401],
    403: standardErrors[403],
  },
}

export const reclassifySchema = {
  tags: ['AI'],
  summary: 'Re-run the AI classifier on a ticket',
  description: 'Uses the keyword rules if the AI is unavailable. Category or priority set by an admin is kept unless force is true.',
  security,
  params: ticketIdParams,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: { force: { type: 'boolean', default: false, description: 'Also overwrite values set by an admin' } },
    examples: [{ force: false }],
  },
  response: ticketDetailResponse,
}
