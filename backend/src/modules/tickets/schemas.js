import { TICKET_STATUSES } from '../../lib/constants.js'

// Author-facing shapes only: no category, priority, AI reasoning or internal notes.
const ticketBase = {
  id: { type: 'string', format: 'uuid' },
  subject: { type: 'string' },
  description: { type: 'string' },
  status: { type: 'string', enum: TICKET_STATUSES },
  bookId: { type: ['string', 'null'], description: 'null = General / Account Level' },
  bookTitle: { type: ['string', 'null'] },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
}

const ticketListItem = {
  type: 'object',
  properties: {
    ...ticketBase,
    lastMessagePreview: { type: ['string', 'null'] },
    lastMessageSenderRole: { type: ['string', 'null'], enum: ['author', 'admin', null] },
    lastMessageAt: { type: ['string', 'null'] },
  },
}

const messageSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    senderRole: { type: 'string', enum: ['author', 'admin'] },
    senderName: { type: 'string' },
    body: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
}

const ticketIdParams = {
  type: 'object',
  required: ['ticketId'],
  properties: { ticketId: { type: 'string', format: 'uuid' } },
}

export const createTicketSchema = {
  tags: ['Author tickets'],
  summary: 'Raise a support ticket',
  description: 'Returns 201 immediately. Category and priority are filled in shortly after by the classifier.',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['subject', 'description'],
    additionalProperties: false,
    properties: {
      bookId: { type: ['string', 'null'], maxLength: 20, description: 'null or omitted = General / Account Level' },
      subject: { type: 'string', minLength: 5, maxLength: 150 },
      description: { type: 'string', minLength: 20, maxLength: 5000 },
      attachments: {
        type: 'array',
        maxItems: 5,
        description: 'Metadata only; files are not uploaded',
        items: {
          type: 'object',
          required: ['fileName', 'mimeType', 'sizeBytes'],
          additionalProperties: false,
          properties: {
            fileName: { type: 'string', minLength: 1, maxLength: 255 },
            mimeType: { type: 'string', minLength: 1, maxLength: 100 },
            sizeBytes: { type: 'integer', minimum: 0, maximum: 10485760 },
          },
        },
      },
    },
    examples: [{
      bookId: 'BK005',
      subject: "I haven't received any royalty",
      description: 'My book has been live for months and I have not received any royalty payment yet.',
    }],
  },
  response: { 201: { type: 'object', properties: { ticket: { type: 'object', properties: ticketBase } } } },
}

export const listTicketsSchema = {
  tags: ['Author tickets'],
  summary: "List the logged-in author's tickets",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { status: { type: 'string', enum: TICKET_STATUSES } },
  },
  response: { 200: { type: 'object', properties: { tickets: { type: 'array', items: ticketListItem } } } },
}

export const getTicketSchema = {
  tags: ['Author tickets'],
  summary: 'Get one ticket with its conversation',
  security: [{ bearerAuth: [] }],
  params: ticketIdParams,
  response: {
    200: {
      type: 'object',
      properties: {
        ticket: {
          type: 'object',
          properties: {
            ...ticketBase,
            messages: { type: 'array', items: messageSchema },
            attachments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  fileName: { type: 'string' },
                  mimeType: { type: 'string' },
                  sizeBytes: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  },
}

export const addMessageSchema = {
  tags: ['Author tickets'],
  summary: 'Send a follow-up message on a ticket',
  description: 'Reopens a resolved ticket. A closed ticket returns 409 TICKET_CLOSED.',
  security: [{ bearerAuth: [] }],
  params: ticketIdParams,
  body: {
    type: 'object',
    required: ['body'],
    additionalProperties: false,
    properties: { body: { type: 'string', minLength: 1, maxLength: 5000 } },
    examples: [{ body: 'Thank you. I have shared the photos by email.' }],
  },
  response: {
    201: {
      type: 'object',
      properties: {
        message: messageSchema,
        ticketStatus: { type: 'string', enum: TICKET_STATUSES },
      },
    },
  },
}
