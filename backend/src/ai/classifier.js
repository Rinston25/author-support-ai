import { CATEGORIES, PRIORITIES } from '../lib/constants.js'
import { publishEvent } from '../modules/events/eventBus.js'
import { AiError } from './aiClient.js'
import { fallbackClassify } from './fallbackClassifier.js'
import { buildClassifyRequest, CLASSIFY_TOOL_NAME } from './prompts/classifyPrompt.js'
import { findTicketForClassification, saveClassification } from './classificationRepository.js'

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

async function classifyWithAi(fastify, ticket) {
  const request = buildClassifyRequest({
    subject: ticket.subject, description: ticket.description, bookStatus: ticket.bookStatus,
  })
  const message = await fastify.ai.call({ purpose: 'classify', ticketId: ticket.id, params: request })

  const toolCall = message.content.find((block) => block.type === 'tool_use' && block.name === CLASSIFY_TOOL_NAME)
  const result = validateClassification(toolCall?.input)
  if (!result) throw new AiError('AI_INVALID_OUTPUT', 'Model output failed validation')
  return result
}

// Runs after the 201 has been sent. Always ends with a saved classification:
// AI if it works, keyword rules if it does not. The ticket never stays stuck.
export async function classifyTicket(fastify, ticketId) {
  const ticket = await findTicketForClassification(fastify.db, ticketId)
  if (!ticket) return

  let result
  let source
  try {
    result = await classifyWithAi(fastify, ticket)
    source = 'ai'
  } catch (error) {
    // AiError = expected (outage, no key, bad output); anything else is a bug worth seeing
    if (!(error instanceof AiError)) fastify.log.error({ err: error, ticketId }, 'unexpected classifier error')
    fastify.log.warn({ ticketId, reason: error.code || 'UNEXPECTED' }, 'using fallback classifier')
    result = fallbackClassify(ticket.subject, ticket.description)
    source = 'fallback'
  }

  const saved = await saveClassification(fastify.db, ticketId, { ...result, source })
  // No category/priority in the event: authors receive events for their own tickets
  publishEvent({ type: 'ticket.classified', ticketId, authorId: saved.authorId, data: {} })
}
