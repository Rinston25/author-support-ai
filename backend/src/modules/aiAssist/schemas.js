import { standardErrors } from '../admin/schemas.js'

const security = [{ bearerAuth: [] }]

const ticketIdParams = {
  type: 'object',
  required: ['ticketId'],
  properties: { ticketId: { type: 'string', format: 'uuid' } },
}

const draftResponse = {
  200: {
    type: 'object',
    description: 'Always 200. When the AI is unavailable, status is "unavailable" and draft is null, so the UI can show an empty editor.',
    properties: {
      status: { type: 'string', enum: ['ready', 'unavailable'] },
      draft: { type: ['string', 'null'] },
      cached: { type: 'boolean', description: 'True when a saved draft was reused (no AI call)' },
      model: { type: ['string', 'null'] },
      generatedAt: { type: ['string', 'null'] },
      placeholders: { type: 'array', items: { type: 'string' }, description: 'Every [CONFIRM: ...] in the draft' },
      reason: { type: 'string', description: 'Only when status is "unavailable"' },
    },
    examples: [{
      status: 'ready',
      draft: 'Hi Ananya,\n\nThank you for writing in... [CONFIRM: bank details linked?]\n\nWarm regards,\nThe BookLeaf Support Team',
      cached: false,
      model: 'claude-haiku-5-5',
      generatedAt: '2026-10-18T09:00:00.000Z',
      placeholders: ['[CONFIRM: bank details linked?]'],
    }],
  },
  401: standardErrors[401],
  403: standardErrors[403],
  404: standardErrors[404],
}

export const getDraftSchema = {
  tags: ['AI'],
  summary: 'Get the AI-drafted reply for a ticket',
  description: 'Returns the saved draft if no new author message has arrived since it was written; otherwise generates one.',
  security,
  params: ticketIdParams,
  response: draftResponse,
}

export const regenerateDraftSchema = {
  tags: ['AI'],
  summary: 'Generate a fresh draft, optionally with instructions',
  security,
  params: ticketIdParams,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      instructions: { type: 'string', maxLength: 300, description: 'For example "shorter" or "mention the reprint"' },
    },
    examples: [{ instructions: 'Keep it shorter and mention the free reprint.' }],
  },
  response: draftResponse,
}

export const usageSchema = {
  tags: ['AI'],
  summary: 'AI usage and estimated cost',
  description: 'Totals from ai_usage_log. Cost is an estimate from AI_PRICE_INPUT_PER_MTOK and AI_PRICE_OUTPUT_PER_MTOK.',
  security,
  response: {
    200: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        prices: { type: 'object', additionalProperties: { type: 'number' } },
        byPurpose: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              purpose: { type: 'string', enum: ['classify', 'draft'] },
              calls: { type: 'integer' },
              successRate: { type: ['number', 'null'], description: 'Percent' },
              inputTokens: { type: 'integer' },
              outputTokens: { type: 'integer' },
              cacheReadTokens: { type: 'integer' },
              averageLatencyMs: { type: 'integer' },
              estimatedCostUsd: { type: 'number' },
            },
          },
        },
        total: { type: 'object', additionalProperties: { type: 'number' } },
      },
      examples: [{
        model: 'claude-haiku-5-5',
        prices: { inputPerMtokUsd: 0.1, outputPerMtokUsd: 0.5 },
        byPurpose: [{ purpose: 'classify', calls: 10, successRate: 100, inputTokens: 5000, outputTokens: 600, cacheReadTokens: 0, averageLatencyMs: 700, estimatedCostUsd: 0.0008 }],
        total: { calls: 10, inputTokens: 5000, outputTokens: 600, cacheReadTokens: 0, estimatedCostUsd: 0.0008 },
      }],
    },
    401: standardErrors[401],
    403: standardErrors[403],
  },
}
