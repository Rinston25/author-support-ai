import Anthropic from '@anthropic-ai/sdk'

// The ONE place that talks to the Anthropic SDK. Everything else (classifier,
// drafter) goes through call(), so timeout, retry, circuit breaker and usage
// logging are applied consistently and can't be forgotten.

// The per-call timeout (AI_TIMEOUT_MS, default 15s) is set on the SDK client in createSdk().
const MAX_RETRIES = 2 // so at most 3 attempts per call
const BASE_BACKOFF_MS = 500
const MAX_RETRY_WAIT_MS = 10_000
const BREAKER_FAILURE_LIMIT = 3 // consecutive failed calls before we stop trying
const BREAKER_OPEN_MS = 60_000

// Every AI failure becomes an AiUnavailableError with a short code, so callers can fall
// back without caring which SDK error it was.
export class AiUnavailableError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

// Only temporary problems are worth retrying: rate limits, server errors, network.
// A 400/401/404 will fail the same way every time.
function isRetryable(error) {
  if (error instanceof Anthropic.APIConnectionError) return true // includes timeouts
  return error.status === 429 || error.status >= 500
}

function toAiUnavailableErrorCode(error) {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'AI_TIMEOUT'
  if (error instanceof Anthropic.APIConnectionError) return 'AI_NETWORK_ERROR'
  if (error.status === 429) return 'AI_RATE_LIMITED'
  if (error.status >= 500) return 'AI_SERVER_ERROR'
  return 'AI_REQUEST_REJECTED'
}

// Honour the server's retry-after (in seconds) when it sends one
function readRetryAfterMs(error) {
  const headers = error.headers
  const value = headers && typeof headers.get === 'function' ? headers.get('retry-after') : headers?.['retry-after']
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.min(seconds * 1000, MAX_RETRY_WAIT_MS)
}

// `sdk` is null when no API key is configured: the app still runs, every call
// just fails fast with AI_NOT_CONFIGURED and callers use their fallback.
// Clock, sleep and randomness are injectable so tests don't have to wait.
export function createAiClient({
  sdk, db, logger, model,
  sleep = defaultSleep, random = Math.random, now = Date.now,
}) {
  let consecutiveFailures = 0
  let circuitOpenUntil = 0
  let trialInFlight = false

  // closed    = normal
  // open      = 60s pause after 3 failures; calls are refused without touching the API
  // half_open = the pause is over; exactly ONE trial call is allowed through.
  //             Success closes the circuit, failure opens it again for another 60s.
  function getCircuitState() {
    if (consecutiveFailures < BREAKER_FAILURE_LIMIT) return 'closed'
    return now() < circuitOpenUntil ? 'open' : 'half_open'
  }

  function isCircuitOpen() {
    return getCircuitState() === 'open'
  }

  function recordSuccess() {
    consecutiveFailures = 0
    circuitOpenUntil = 0
  }

  function recordFailure() {
    consecutiveFailures += 1
    if (consecutiveFailures >= BREAKER_FAILURE_LIMIT) {
      // After the pause the next call is allowed through as a trial. If it
      // fails too, the count is still over the limit, so the circuit reopens.
      circuitOpenUntil = now() + BREAKER_OPEN_MS
      logger.warn({ consecutiveFailures }, 'AI circuit breaker opened')
    }
  }

  // Cost awareness: one row per API call. Logging must never break a request.
  async function logUsage({ purpose, ticketId, usage, latencyMs, errorCode }) {
    logger.info({
      purpose, ticketId, model, latencyMs,
      inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens,
      cacheReadTokens: usage?.cache_read_input_tokens, success: !errorCode, errorCode,
    }, 'ai call')
    try {
      await db.query(
        `INSERT INTO ai_usage_log
           (ticket_id, purpose, model, input_tokens, output_tokens, cache_read_tokens, latency_ms, success, error_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          ticketId || null, purpose, model,
          usage?.input_tokens ?? null, usage?.output_tokens ?? null, usage?.cache_read_input_tokens ?? null,
          latencyMs, !errorCode, errorCode || null,
        ],
      )
    } catch (loggingError) {
      logger.error({ err: loggingError }, 'could not write ai_usage_log')
    }
  }

  // params = the Messages API body without `model` (system, messages, tools, max_tokens...)
  async function call({ purpose, ticketId, params }) {
    if (!sdk) throw new AiUnavailableError('AI_NOT_CONFIGURED', 'ANTHROPIC_API_KEY is not set')
    const circuitState = getCircuitState()
    if (circuitState === 'open' || (circuitState === 'half_open' && trialInFlight)) {
      throw new AiUnavailableError('AI_CIRCUIT_OPEN', 'AI calls are paused after repeated failures')
    }
    const isTrial = circuitState === 'half_open'
    if (isTrial) trialInFlight = true
    try {
      return await callWithRetries({ purpose, ticketId, params })
    } finally {
      if (isTrial) trialInFlight = false
    }
  }

  async function callWithRetries({ purpose, ticketId, params }) {

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const startedAt = now()
      try {
        const message = await sdk.messages.create({ model, ...params })
        const latencyMs = now() - startedAt

        // A safety refusal is a normal 200 response, not an outage: don't count
        // it against the circuit breaker, and don't retry the same prompt.
        if (message.stop_reason === 'refusal') {
          await logUsage({ purpose, ticketId, usage: message.usage, latencyMs, errorCode: 'AI_REFUSED' })
          throw new AiUnavailableError('AI_REFUSED', 'The model declined this request')
        }

        await logUsage({ purpose, ticketId, usage: message.usage, latencyMs })
        recordSuccess()
        return message
      } catch (error) {
        if (error instanceof AiUnavailableError) throw error

        const code = toAiUnavailableErrorCode(error)
        await logUsage({ purpose, ticketId, latencyMs: now() - startedAt, errorCode: code })

        const hasAttemptsLeft = attempt < MAX_RETRIES
        if (!isRetryable(error) || !hasAttemptsLeft) {
          recordFailure()
          throw new AiUnavailableError(code, `AI call failed (${code})`)
        }

        // Exponential backoff (500ms, 1s...) plus jitter so many clients don't retry in lockstep
        const backoffMs = BASE_BACKOFF_MS * 2 ** attempt + random() * 250
        await sleep(readRetryAfterMs(error) ?? backoffMs)
      }
    }
  }

  function isEnabled() {
    return Boolean(sdk)
  }

  function getStatus() {
    return {
      configured: isEnabled(),
      model,
      circuit: getCircuitState(),
      circuitOpen: isCircuitOpen(),
      consecutiveFailures,
      reopensAt: isCircuitOpen() ? new Date(circuitOpenUntil).toISOString() : null,
    }
  }

  return { call, getStatus, isEnabled }
}

// Real SDK client. maxRetries is 0 because we do our own retries above, with
// backoff we can see, log and test.
export function createSdk(apiKey, timeoutMs) {
  if (!apiKey) return null
  return new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 })
}
