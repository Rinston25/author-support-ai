import { config } from '../../config.js'
import { notFound } from '../../lib/httpErrors.js'
import { getDraft, regenerateDraft } from '../../ai/drafter.js'
import { summariseUsage } from './repository.js'

export async function getDraftForTicket(fastify, ticketId) {
  const draft = await getDraft(fastify, ticketId)
  if (!draft) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')
  return draft
}

export async function regenerateDraftForTicket(fastify, ticketId, instructions) {
  const draft = await regenerateDraft(fastify, ticketId, instructions)
  if (!draft) throw notFound('TICKET_NOT_FOUND', 'Ticket not found')
  return draft
}

const TOKENS_PER_MILLION = 1_000_000
// Prompt-cache reads are billed at a tenth of the normal input price
const CACHE_READ_PRICE_FACTOR = 0.1

function estimateCost({ inputTokens, outputTokens, cacheReadTokens }) {
  const inputCost = (Number(inputTokens) / TOKENS_PER_MILLION) * config.aiPriceInputPerMtok
  const cacheCost = (Number(cacheReadTokens) / TOKENS_PER_MILLION) * config.aiPriceInputPerMtok * CACHE_READ_PRICE_FACTOR
  const outputCost = (Number(outputTokens) / TOKENS_PER_MILLION) * config.aiPriceOutputPerMtok
  return inputCost + cacheCost + outputCost
}

// The "cost awareness" numbers: calls, success rate, tokens, latency and an
// estimate in USD from the per-million-token prices set in the environment.
export async function getUsage(db) {
  const rows = await summariseUsage(db)
  const byPurpose = rows.map((row) => ({
    purpose: row.purpose,
    calls: row.calls,
    successRate: row.calls === 0 ? null : Math.round((row.successfulCalls / row.calls) * 1000) / 10,
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    cacheReadTokens: Number(row.cacheReadTokens),
    averageLatencyMs: row.averageLatencyMs,
    estimatedCostUsd: Math.round(estimateCost(row) * 1_000_000) / 1_000_000,
  }))

  const total = byPurpose.reduce(
    (sum, row) => ({
      calls: sum.calls + row.calls,
      inputTokens: sum.inputTokens + row.inputTokens,
      outputTokens: sum.outputTokens + row.outputTokens,
      cacheReadTokens: sum.cacheReadTokens + row.cacheReadTokens,
      estimatedCostUsd: sum.estimatedCostUsd + row.estimatedCostUsd,
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, estimatedCostUsd: 0 },
  )
  total.estimatedCostUsd = Math.round(total.estimatedCostUsd * 1_000_000) / 1_000_000

  return {
    model: config.aiModel,
    prices: { inputPerMtokUsd: config.aiPriceInputPerMtok, outputPerMtokUsd: config.aiPriceOutputPerMtok },
    byPurpose,
    total,
  }
}
