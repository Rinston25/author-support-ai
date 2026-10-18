import { extractPlaceholders } from '../lib/placeholders.js'
import { buildRoyaltySummary } from '../lib/royaltyCalendar.js'
import { AiUnavailableError } from './aiClient.js'
import { buildDraftContext } from './contextBuilder.js'
import { loadDraftInputs, findDraft, saveDraft } from './draftRepository.js'

const UNAVAILABLE_REASON = 'AI is temporarily unavailable — please write the reply manually.'
const MAX_INSTRUCTIONS_CHARS = 300

function readyResponse({ body, model, generatedAt, cached }) {
  return {
    status: 'ready',
    draft: body,
    cached,
    model,
    generatedAt,
    // The UI blocks sending while any of these remain in the text
    placeholders: extractPlaceholders(body),
  }
}

// The admin gets an empty editor and a notice, never an error: a manual reply
// must always be possible. This is returned with HTTP 200.
function unavailableResponse() {
  return { status: 'unavailable', draft: null, cached: false, model: null, generatedAt: null, placeholders: [], reason: UNAVAILABLE_REASON }
}

function latestAuthorMessageId(messages) {
  const authorMessages = messages.filter((message) => message.senderRole === 'author')
  return authorMessages.length > 0 ? authorMessages[authorMessages.length - 1].id : null
}

// Builds the prompt and asks the model. Does not touch the database, so the
// quality-check script can use it on made-up tickets.
export async function composeDraft(fastify, inputs, instructions) {
  const { ticket, author, authorBooks, messages } = inputs
  const totalPending = authorBooks.reduce((total, book) => total + book.royaltyPending, 0)

  const context = buildDraftContext({
    ticket,
    author,
    book: authorBooks.find((book) => book.id === ticket.bookId) || null,
    authorBooks,
    royaltySummary: buildRoyaltySummary(totalPending),
    messages,
    instructions,
  })

  const message = await fastify.ai.call({
    purpose: 'draft',
    ticketId: ticket.id,
    params: {
      // Room for ~180 words (about 300 tokens, more with the newer tokenizer)
      // plus the thinking the model may do first. Haiku 5.5 rejects a non-default
      // temperature, so the tone is steered by the prompt and low effort instead.
      max_tokens: 1500,
      output_config: { effort: 'low' },
      system: context.system,
      messages: context.messages,
    },
  })

  // Read blocks by type: a response can start with a (possibly empty) thinking block
  const body = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
  if (!body) throw new AiUnavailableError('AI_INVALID_OUTPUT', 'The model returned no text')
  return { body, prompt: context }
}

async function generateDraft(fastify, inputs, instructions) {
  const { ticket, messages } = inputs
  const { body } = await composeDraft(fastify, inputs, instructions)

  const saved = await saveDraft(fastify.db, {
    ticketId: ticket.id, body, model: fastify.ai.getStatus().model, basedOnMessageId: latestAuthorMessageId(messages),
  })
  return readyResponse({ body, model: fastify.ai.getStatus().model, generatedAt: saved.createdAt, cached: false })
}

async function generateOrUnavailable(fastify, inputs, instructions) {
  try {
    return await generateDraft(fastify, inputs, instructions)
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) fastify.log.error({ err: error, ticketId: inputs.ticket.id }, 'unexpected drafter error')
    return unavailableResponse()
  }
}

// Returns null when the ticket does not exist.
export async function getDraft(fastify, ticketId) {
  const inputs = await loadDraftInputs(fastify.db, ticketId)
  if (!inputs) return null

  // Opening the same ticket twice must not cost two AI calls: reuse the saved
  // draft as long as no new author message has arrived since it was written.
  const cached = await findDraft(fastify.db, ticketId)
  if (cached && cached.basedOnMessageId === latestAuthorMessageId(inputs.messages)) {
    return readyResponse({ body: cached.body, model: cached.model, generatedAt: cached.createdAt, cached: true })
  }
  return generateOrUnavailable(fastify, inputs, null)
}

// Always calls the AI. `instructions` (e.g. "shorter", "mention reprint") is
// optional and capped, so it can't be used to smuggle in a huge prompt.
export async function regenerateDraft(fastify, ticketId, instructions) {
  const inputs = await loadDraftInputs(fastify.db, ticketId)
  if (!inputs) return null
  return generateOrUnavailable(fastify, inputs, instructions ? instructions.slice(0, MAX_INSTRUCTIONS_CHARS) : null)
}
