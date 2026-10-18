import { CATEGORIES, PRIORITIES } from '../lib/constants.js'
import { publishEvent } from '../modules/events/eventBus.js'
import { AiUnavailableError } from './aiClient.js'
import { fallbackClassify } from './fallbackClassifier.js'
import { buildClassifyRequest, CLASSIFY_TOOL_NAME } from './prompts/classifyPrompt.js'
import { findTicketForClassification, saveClassification, listPendingTicketIds } from './classificationRepository.js'

const MAX_REASONING_WORDS = 25

// Never trust model output blindly: check it against our own lists. Returns the
// cleaned result, or null if it is unusable (the caller then uses the fallback).
export function validateClassification(input) {
  if (!input || typeof input !== 'object') return null
  if (!CATEGORIES.includes(input.category)) return null
  if (!PRIORITIES.includes(input.priority)) return null

  const words = typeof input.reasoning === 'string' ? input.reasoning.trim().split(/\s+/).filter(Boolean) : []
  return {
    category: input.category,
    priority: input.priority,
    // The prompt asks for 25 words; enforce it in code too
    reasoning: words.slice(0, MAX_REASONING_WORDS).join(' '),
  }
}

export async function classifyWithAi(fastify, ticket) {
  const request = buildClassifyRequest({
    subject: ticket.subject, description: ticket.description, bookStatus: ticket.bookStatus,
  })
  const message = await fastify.ai.call({ purpose: 'classify', ticketId: ticket.id, params: request })

  const toolCall = message.content.find((block) => block.type === 'tool_use' && block.name === CLASSIFY_TOOL_NAME)
  const result = validateClassification(toolCall?.input)
  if (!result) throw new AiUnavailableError('AI_INVALID_OUTPUT', 'Model output failed validation')
  return result
}

// Runs after the 201 has been sent. Always ends with a saved classification:
// AI if it works, keyword rules if it does not. The ticket never stays stuck.
// `force` lets an admin's "reclassify" overwrite values they set by hand.
export async function classifyTicket(fastify, ticketId, { force = false } = {}) {
  const ticket = await findTicketForClassification(fastify.db, ticketId)
  if (!ticket) return null

  let result
  let source
  try {
    result = await classifyWithAi(fastify, ticket)
    source = 'ai'
  } catch (error) {
    // AiUnavailableError = expected (outage, no key, bad output); anything else is a bug worth seeing
    if (!(error instanceof AiUnavailableError)) fastify.log.error({ err: error, ticketId }, 'unexpected classifier error')
    fastify.log.warn({ ticketId, reason: error.code || 'UNEXPECTED' }, 'using fallback classifier')
    result = fallbackClassify(ticket.subject, ticket.description)
    source = 'fallback'
  }

  const saved = await saveClassification(fastify.db, ticketId, { ...result, source }, { force })
  // Admins only: the author never sees categories, priorities or AI results
  publishEvent({ type: 'ticket.classified', ticketId, authorId: saved.authorId, audience: 'admins', data: { source } })
  publishEvent({ type: 'ticket.updated', ticketId, authorId: saved.authorId, audience: 'admins', data: { classified: true } })
  return { ...result, source }
}

// Called once when the server is ready: picks up tickets whose classification
// never finished (the process stopped between "201 sent" and "classified").
export async function classifyPendingTickets(fastify) {
  const ticketIds = await listPendingTicketIds(fastify.db)
  for (const ticketId of ticketIds) {
    try {
      await classifyTicket(fastify, ticketId)
    } catch (error) {
      fastify.log.error({ err: error, ticketId }, 'startup classification failed')
    }
  }
  if (ticketIds.length > 0) fastify.log.info({ count: ticketIds.length }, 'classified pending tickets at startup')
}
