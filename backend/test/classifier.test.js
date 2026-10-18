import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { classifyTicket } from '../src/ai/classifier.js'
import { AiUnavailableError } from '../src/ai/aiClient.js'
import { hasDatabase, createTestPool, createTestTicket, deleteTestTicket, silentLogger } from './helpers/testDb.js'

// The AI client is always mocked here: these tests never reach the real API.
const skip = hasDatabase ? false : 'DATABASE_URL not set'
const pool = hasDatabase ? createTestPool() : null
const createdTicketIds = []

after(async () => {
  for (const ticketId of createdTicketIds) await deleteTestTicket(pool, ticketId)
  await pool?.end()
})

function fastifyWith(aiCall) {
  return { db: pool, log: silentLogger, ai: { call: aiCall } }
}

function toolReply(input) {
  return { content: [{ type: 'tool_use', name: 'record_classification', input }] }
}

async function newTicket(overrides) {
  const ticketId = await createTestTicket(pool, overrides)
  createdTicketIds.push(ticketId)
  return ticketId
}

async function readTicket(ticketId) {
  const result = await pool.query(
    `SELECT category, priority, category_source AS "categorySource", priority_source AS "prioritySource",
            classification_status AS "classificationStatus", ai_reasoning AS "aiReasoning"
     FROM tickets WHERE id = $1`, [ticketId])
  return result.rows[0]
}

test('AI result is saved with source ai', { skip }, async () => {
  const ticketId = await newTicket()
  const fastify = fastifyWith(async () => toolReply({ category: 'royalty_payments', priority: 'critical', reasoning: 'Months overdue.' }))
  await classifyTicket(fastify, ticketId)
  const ticket = await readTicket(ticketId)
  assert.deepEqual(
    [ticket.category, ticket.priority, ticket.categorySource, ticket.classificationStatus],
    ['royalty_payments', 'critical', 'ai', 'done'],
  )
})

test('falls back to keyword rules when the AI client throws', { skip }, async () => {
  const ticketId = await newTicket({ subject: 'Wrong ISBN', description: 'The ISBN on my listing is wrong, please fix it.' })
  const fastify = fastifyWith(async () => { throw new AiUnavailableError('AI_SERVER_ERROR', 'down') })
  await classifyTicket(fastify, ticketId)
  const ticket = await readTicket(ticketId)
  assert.deepEqual(
    [ticket.category, ticket.priority, ticket.categorySource, ticket.prioritySource, ticket.classificationStatus],
    ['isbn_metadata', 'high', 'fallback', 'fallback', 'fallback'],
  )
  assert.match(ticket.aiReasoning, /keyword rules/)
})

test('falls back when the AI returns an invalid category', { skip }, async () => {
  const ticketId = await newTicket({ subject: 'Hello', description: 'Just a general note about my account please.' })
  const fastify = fastifyWith(async () => toolReply({ category: 'refunds', priority: 'high', reasoning: 'x' }))
  await classifyTicket(fastify, ticketId)
  assert.equal((await readTicket(ticketId)).classificationStatus, 'fallback')
})

test('falls back when the AI returns no tool call at all', { skip }, async () => {
  const ticketId = await newTicket()
  const fastify = fastifyWith(async () => ({ content: [{ type: 'text', text: 'hello' }] }))
  await classifyTicket(fastify, ticketId)
  assert.equal((await readTicket(ticketId)).classificationStatus, 'fallback')
})

test('a category set by an admin is never overwritten by the AI', { skip }, async () => {
  const ticketId = await newTicket({ category: 'general_inquiry', categorySource: 'admin' })
  const fastify = fastifyWith(async () => toolReply({ category: 'royalty_payments', priority: 'high', reasoning: 'Money.' }))
  await classifyTicket(fastify, ticketId)
  const ticket = await readTicket(ticketId)
  assert.deepEqual([ticket.category, ticket.categorySource], ['general_inquiry', 'admin'])
  // The priority was not set by an admin, so the AI may fill it in
  assert.deepEqual([ticket.priority, ticket.prioritySource], ['high', 'ai'])
})

test('a priority set by an admin is never overwritten, even by the fallback rules', { skip }, async () => {
  const ticketId = await newTicket({ subject: 'Wrong ISBN', description: 'The ISBN on my listing is wrong, please fix it.', priority: 'low', prioritySource: 'admin' })
  const fastify = fastifyWith(async () => { throw new AiUnavailableError('AI_NOT_CONFIGURED', 'no key') })
  await classifyTicket(fastify, ticketId)
  const ticket = await readTicket(ticketId)
  assert.deepEqual([ticket.priority, ticket.prioritySource], ['low', 'admin'])
  assert.equal(ticket.category, 'isbn_metadata')
})

test('force: true is the only way to overwrite admin values', { skip }, async () => {
  const ticketId = await newTicket({ category: 'general_inquiry', categorySource: 'admin', priority: 'low', prioritySource: 'admin' })
  const fastify = fastifyWith(async () => toolReply({ category: 'royalty_payments', priority: 'critical', reasoning: 'Overdue.' }))
  await classifyTicket(fastify, ticketId, { force: true })
  const ticket = await readTicket(ticketId)
  assert.deepEqual([ticket.category, ticket.priority, ticket.categorySource], ['royalty_payments', 'critical', 'ai'])
})

test('when an admin owns both fields the ticket stays done, not fallback', { skip }, async () => {
  const ticketId = await newTicket({
    subject: 'Wrong ISBN', description: 'The ISBN on my listing is wrong, please fix it.',
    category: 'general_inquiry', categorySource: 'admin', priority: 'low', prioritySource: 'admin', classificationStatus: 'done',
  })
  const fastify = fastifyWith(async () => { throw new AiUnavailableError('AI_NOT_CONFIGURED', 'no key') })
  await classifyTicket(fastify, ticketId)
  assert.equal((await readTicket(ticketId)).classificationStatus, 'done')
})

test('the classify request sends only ticket text: no knowledge base, truncated description', { skip }, async () => {
  const ticketId = await newTicket({ description: 'x'.repeat(4000) })
  let sentParams
  const fastify = fastifyWith(async ({ params }) => {
    sentParams = params
    return toolReply({ category: 'general_inquiry', priority: 'low', reasoning: 'ok' })
  })
  await classifyTicket(fastify, ticketId)
  const userText = sentParams.messages[0].content
  assert.ok(userText.length < 1700, 'description is cut to ~1500 chars')
  assert.equal(sentParams.messages.length, 1) // no history
  assert.equal(sentParams.tool_choice.name, 'record_classification')
})
