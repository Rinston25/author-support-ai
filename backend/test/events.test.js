import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldDeliver, formatEvent } from '../src/modules/events/routes.js'

const admin = { role: 'admin', authorId: null }
const priya = { role: 'author', authorId: 'AUTH001' }
const rohit = { role: 'author', authorId: 'AUTH002' }

const event = (overrides) => ({ type: 'ticket.updated', ticketId: 't1', authorId: 'AUTH001', audience: 'all', data: {}, at: '2026-10-18T00:00:00.000Z', ...overrides })

test('admins receive every event', () => {
  assert.equal(shouldDeliver(event(), admin), true)
  assert.equal(shouldDeliver(event({ audience: 'admins' }), admin), true)
})

test('an author receives events for their own tickets', () => {
  assert.equal(shouldDeliver(event(), priya), true)
})

test('an author never receives another author\'s events', () => {
  assert.equal(shouldDeliver(event(), rohit), false)
})

test('admin-only events (notes, classification) never reach the ticket\'s own author', () => {
  assert.equal(shouldDeliver(event({ audience: 'admins' }), priya), false)
})

test('event payload is a small safe summary', () => {
  const text = formatEvent(event({ type: 'message.created', data: { senderRole: 'admin' } }))
  assert.match(text, /^event: message\.created\ndata: /)
  assert.ok(text.endsWith('\n\n'))
  const payload = JSON.parse(text.split('data: ')[1])
  assert.deepEqual(Object.keys(payload).sort(), ['at', 'senderRole', 'ticketId', 'type'])
})
