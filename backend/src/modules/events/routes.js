import { config } from '../../config.js'
import { unauthorized } from '../../lib/httpErrors.js'
import { subscribeToEvents } from './eventBus.js'

const HEARTBEAT_MS = 25_000
const RECONNECT_DELAY_MS = 3_000

// Who may see which event.
//   admins -> everything
//   authors -> only events for their own tickets, and never the admin-only ones
//              (internal notes, AI classification results)
export function shouldDeliver(event, user) {
  if (user.role === 'admin') return true
  return event.audience === 'all' && event.authorId === user.authorId
}

// The stream carries only a tiny summary. Clients refetch the ticket on an event,
// so nothing sensitive ever travels through it.
export function formatEvent(event) {
  const payload = { type: event.type, ticketId: event.ticketId, at: event.at, ...event.data }
  return `event: ${event.type}\ndata: ${JSON.stringify(payload)}\n\n`
}

// EventSource cannot send an Authorization header, so for this one route the
// token comes from the query string. It is verified exactly like the header token.
const eventsSchema = {
  tags: ['Events'],
  summary: 'Live ticket events (Server-Sent Events)',
  description: [
    'Open with `new EventSource("/api/events?token=<jwt>")`. Authors receive events for their own tickets only; admins receive all events.',
    '',
    'Event types: `ticket.created`, `ticket.updated`, `ticket.classified` (admins only), `message.created`.',
    'Each event has a small JSON payload (`type`, `ticketId`, `at` and a safe summary). Refetch the ticket to get details.',
    'A `: heartbeat` comment is sent every 25 seconds, and `retry: 3000` tells the browser how long to wait before reconnecting.',
  ].join('\n'),
  querystring: {
    type: 'object',
    // Not "required" on purpose: a missing token must be a 401, like any bad token, not a 400
    properties: { token: { type: 'string', description: 'The JWT from POST /api/auth/login' } },
  },
  response: {
    200: { description: 'text/event-stream', type: 'string', examples: ['event: message.created\ndata: {"type":"message.created","ticketId":"...","at":"2026-10-18T09:00:00.000Z","senderRole":"admin"}\n\n'] },
  },
}

// The origin check mirrors the CORS plugin, which does not run for hijacked responses
function allowedOriginHeader(requestOrigin) {
  return config.corsOrigins.includes(requestOrigin) ? { 'access-control-allow-origin': requestOrigin, vary: 'Origin' } : {}
}

export default async function eventRoutes(fastify) {
  fastify.get('/events', { schema: eventsSchema }, async (request, reply) => {
    let user
    try {
      user = fastify.jwt.verify(request.query.token || '')
    } catch {
      throw unauthorized()
    }

    // From here on we write the response ourselves and keep it open
    reply.hijack()
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      // Tells nginx-style proxies (Render) not to buffer the stream
      'x-accel-buffering': 'no',
      ...allowedOriginHeader(request.headers.origin),
    })
    reply.raw.write(`retry: ${RECONNECT_DELAY_MS}\n\n`)

    const unsubscribe = subscribeToEvents((event) => {
      if (shouldDeliver(event, user)) reply.raw.write(formatEvent(event))
    })

    // Proxies close idle connections; a comment line keeps this one alive
    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), HEARTBEAT_MS)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })
}
