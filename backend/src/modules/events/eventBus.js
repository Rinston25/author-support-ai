import { EventEmitter } from 'node:events'

// In-process pub/sub. Fine for one server instance; with several instances
// this would need Redis pub/sub (or Postgres LISTEN/NOTIFY) so every instance
// sees every event.
//
// An event looks like: { type, ticketId, authorId, data }
// Types: ticket.created, ticket.updated, ticket.classified, message.created
const emitter = new EventEmitter()
// One listener is added per connected browser tab, so don't cap it.
emitter.setMaxListeners(0)

export function publishEvent(event) {
  emitter.emit('event', event)
}

// Returns an unsubscribe function
export function subscribeToEvents(listener) {
  emitter.on('event', listener)
  return () => emitter.off('event', listener)
}
