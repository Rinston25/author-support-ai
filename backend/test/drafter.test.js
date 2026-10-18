import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { getDraft, regenerateDraft } from '../src/ai/drafter.js'
import { AiUnavailableError } from '../src/ai/aiClient.js'
import { extractPlaceholders } from '../src/lib/placeholders.js'
import { addAuthorMessage } from '../src/modules/tickets/service.js'
import { hasDatabase, createTestPool, createTestTicket, deleteTestTicket, silentLogger } from './helpers/testDb.js'

// The AI client is always a mock: these tests never reach the real API.
const skip = hasDatabase ? false : 'DATABASE_URL not set'
const pool = hasDatabase ? createTestPool() : null
const createdTicketIds = []

after(async () => {
  for (const ticketId of createdTicketIds) await deleteTestTicket(pool, ticketId)
  await pool?.end()
})

// Counts calls so tests can prove "no AI call happened"
function fakeFastify(behaviour) {
  const fastify = {
    db: pool, log: silentLogger, calls: 0,
    ai: {
      getStatus: () => ({ model: 'test-model' }),
      call: async (request) => {
        fastify.calls += 1
        fastify.lastRequest = request
        return behaviour()
      },
    },
  }
  return fastify
}

const draftText = (text) => () => ({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }] })

// A ticket with its first author message, like a real created ticket
async function newTicket() {
  const ticketId = await createTestTicket(pool, { category: 'royalty_payments', classificationStatus: 'done' })
  createdTicketIds.push(ticketId)
  const user = await pool.query(`SELECT id FROM users WHERE author_id = 'AUTH001'`)
  await pool.query(
    `INSERT INTO ticket_messages (ticket_id, sender_user_id, sender_role, body) VALUES ($1, $2, 'author', 'Where is my royalty?')`,
    [ticketId, user.rows[0].id],
  )
  return { ticketId, authorUserId: user.rows[0].id }
}

test('returns "unavailable" (not an error) when the AI client throws', { skip }, async () => {
  const { ticketId } = await newTicket()
  const fastify = fakeFastify(() => { throw new AiUnavailableError('AI_SERVER_ERROR', 'down') })
  const result = await getDraft(fastify, ticketId)
  assert.equal(result.status, 'unavailable')
  assert.equal(result.draft, null)
  assert.match(result.reason, /write the reply manually/)
})

test('returns "unavailable" for unexpected errors too', { skip }, async () => {
  const { ticketId } = await newTicket()
  const fastify = fakeFastify(() => { throw new Error('something odd') })
  assert.equal((await getDraft(fastify, ticketId)).status, 'unavailable')
})

test('returns "unavailable" when the model returns no text', { skip }, async () => {
  const { ticketId } = await newTicket()
  const fastify = fakeFastify(() => ({ content: [{ type: 'thinking', thinking: '' }] }))
  assert.equal((await getDraft(fastify, ticketId)).status, 'unavailable')
})

test('a missing ticket returns null', { skip }, async () => {
  const fastify = fakeFastify(draftText('x'))
  assert.equal(await getDraft(fastify, '00000000-0000-4000-8000-000000000000'), null)
})

test('first open generates and saves; opening again is a cache hit with no AI call', { skip }, async () => {
  const { ticketId } = await newTicket()
  const fastify = fakeFastify(draftText('Hi Priya, thanks for writing in.\n\nWarm regards,\nThe BookLeaf Support Team'))

  const first = await getDraft(fastify, ticketId)
  assert.equal(first.status, 'ready')
  assert.equal(first.cached, false)
  assert.equal(fastify.calls, 1)

  const second = await getDraft(fastify, ticketId)
  assert.equal(second.cached, true)
  assert.equal(second.draft, first.draft)
  assert.equal(fastify.calls, 1, 'no second AI call')
})

test('regenerate always calls the AI and replaces the saved draft', { skip }, async () => {
  const { ticketId } = await newTicket()
  const fastify = fakeFastify(draftText('first version'))
  await getDraft(fastify, ticketId)

  const again = fakeFastify(draftText('second version'))
  const result = await regenerateDraft(again, ticketId, 'Keep it shorter')
  assert.equal(result.draft, 'second version')
  assert.equal(again.calls, 1)
  assert.match(again.lastRequest.params.messages[0].content, /ADMIN INSTRUCTIONS\nKeep it shorter/)

  const cached = await getDraft(fakeFastify(draftText('never used')), ticketId)
  assert.equal(cached.draft, 'second version')
})

test('regenerate caps instructions at 300 characters', { skip }, async () => {
  const { ticketId } = await newTicket()
  const fastify = fakeFastify(draftText('ok'))
  await regenerateDraft(fastify, ticketId, 'x'.repeat(1000))
  const sent = fastify.lastRequest.params.messages[0].content
  assert.ok(!sent.includes('x'.repeat(301)))
})

test('a new author message invalidates the cached draft', { skip }, async () => {
  const { ticketId, authorUserId } = await newTicket()
  const fastify = fakeFastify(draftText('draft for the first message'))
  await getDraft(fastify, ticketId)
  assert.equal(fastify.calls, 1)

  // The real service path: it deletes the saved draft in the same transaction
  await addAuthorMessage({ db: pool, log: silentLogger }, { userId: authorUserId, authorId: 'AUTH001' }, ticketId, 'Any update please?')

  const afterFollowUp = fakeFastify(draftText('draft for the follow-up'))
  const result = await getDraft(afterFollowUp, ticketId)
  assert.equal(result.cached, false)
  assert.equal(result.draft, 'draft for the follow-up')
  assert.equal(afterFollowUp.calls, 1)
})

test('a stale draft is also detected by message id, even if it was not deleted', { skip }, async () => {
  const { ticketId, authorUserId } = await newTicket()
  await getDraft(fakeFastify(draftText('old draft')), ticketId)
  // Add an author message directly in SQL, bypassing the service's delete
  await pool.query(
    `INSERT INTO ticket_messages (ticket_id, sender_user_id, sender_role, body) VALUES ($1, $2, 'author', 'Follow up')`,
    [ticketId, authorUserId],
  )
  const fastify = fakeFastify(draftText('fresh draft'))
  const result = await getDraft(fastify, ticketId)
  assert.equal(result.draft, 'fresh draft')
})

test('placeholders are extracted from the draft', { skip }, async () => {
  const { ticketId } = await newTicket()
  const fastify = fakeFastify(draftText('Please [CONFIRM: bank details linked?] and [CONFIRM: payout date]. Thanks'))
  const result = await getDraft(fastify, ticketId)
  assert.deepEqual(result.placeholders, ['[CONFIRM: bank details linked?]', '[CONFIRM: payout date]'])
})

test('the draft request sends one cached system block and no sampling parameters', { skip }, async () => {
  const { ticketId } = await newTicket()
  const fastify = fakeFastify(draftText('ok'))
  await getDraft(fastify, ticketId)
  const { params } = fastify.lastRequest
  assert.equal(params.system[0].cache_control.type, 'ephemeral')
  assert.equal(params.temperature, undefined) // Haiku 5.5 rejects non-default values
  assert.equal(params.messages.length, 1)
})

test('extractPlaceholders on plain text finds nothing', () => {
  assert.deepEqual(extractPlaceholders('All good here'), [])
})
