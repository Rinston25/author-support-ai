import { EventEmitter } from 'node:events'

// In-process pub/sub. Fine for one server instance; with several instances this
// would need Redis pub/sub behind this same publishEvent/subscribeToEvents
// interface, so every instance sees every event.
//
// An event looks like:
//   { type, ticketId, authorId, audience, data, at }
// type:     ticket.created | ticket.updated | ticket.classified | message.created
// audience: 'all'    -> the ticket's author and every admin
//           'admins' -> admins only (internal notes, AI classification results)
// data:     a tiny, safe summary. Clients refetch the ticket, so nothing sensitive
//           travels through the stream.
const emitter = new EventEmitter()
// One listener is added per connected browser tab, so don't cap it.
emitter.setMaxListeners(0)

export function publishEvent({ type, ticketId, authorId, audience = 'all', data = {} }) {
  emitter.emit('event', { type, ticketId, authorId, audience, data, at: new Date().toISOString() })
}

// Returns an unsubscribe function
export function subscribeToEvents(listener) {
  emitter.on('event', listener)
  return () => emitter.off('event', listener)
}
