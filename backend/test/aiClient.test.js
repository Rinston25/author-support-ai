import { test } from 'node:test'
import assert from 'node:assert/strict'
import Anthropic from '@anthropic-ai/sdk'
import { createAiClient, AiError } from '../src/ai/aiClient.js'

// A fake database and logger, so these tests need neither Postgres nor an API key.
const silentLogger = { info() {}, warn() {}, error() {} }
function fakeDb() {
  const rows = []
  return { rows, query: async (sql, values) => { rows.push(values) } }
}

// Fake SDK: each call returns the next scripted outcome (a message, or an error to throw).
function fakeSdk(outcomes) {
  let calls = 0
  return {
    get calls() { return calls },
    messages: {
      create: async () => {
        const outcome = outcomes[Math.min(calls++, outcomes.length - 1)]
        if (outcome instanceof Error || outcome.status >= 400) throw outcome
        return outcome
      },
    },
  }
}

const okMessage = { stop_reason: 'end_turn', content: [], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 } }
const serverError = Object.assign(new Error('boom'), { status: 500 })
const badRequest = Object.assign(new Error('bad'), { status: 400 })

function buildClient(sdk, overrides = {}) {
  const waits = []
  const db = fakeDb()
  const clock = { time: 1_000_000 }
  const client = createAiClient({
    sdk, db, logger: silentLogger, model: 'test-model',
    sleep: async (milliseconds) => { waits.push(milliseconds) },
    random: () => 0,
    now: () => clock.time,
    ...overrides,
  })
  return { client, waits, db, clock }
}

const request = { purpose: 'classify', ticketId: null, params: {} }

test('without an API key every call fails fast with AI_NOT_CONFIGURED', async () => {
  const { client } = buildClient(null)
  await assert.rejects(client.call(request), (error) => error instanceof AiError && error.code === 'AI_NOT_CONFIGURED')
  assert.equal(client.getStatus().configured, false)
})

test('a 500 is retried and the second attempt can succeed', async () => {
  const sdk = fakeSdk([serverError, okMessage])
  const { client, waits } = buildClient(sdk)
  const message = await client.call(request)
  assert.equal(message, okMessage)
  assert.equal(sdk.calls, 2)
  assert.equal(waits.length, 1) // backed off once
})

test('retries use exponential backoff and stop after 3 attempts', async () => {
  const sdk = fakeSdk([serverError])
  const { client, waits } = buildClient(sdk)
  await assert.rejects(client.call(request), (error) => error.code === 'AI_SERVER_ERROR')
  assert.equal(sdk.calls, 3)
  assert.deepEqual(waits, [500, 1000])
})

test('retry-after from a 429 is respected', async () => {
  const rateLimited = Object.assign(new Error('slow down'), { status: 429, headers: { 'retry-after': '3' } })
  const sdk = fakeSdk([rateLimited, okMessage])
  const { client, waits } = buildClient(sdk)
  await client.call(request)
  assert.deepEqual(waits, [3000])
})

test('a 400 is not retried', async () => {
  const sdk = fakeSdk([badRequest])
  const { client } = buildClient(sdk)
  await assert.rejects(client.call(request), (error) => error.code === 'AI_REQUEST_REJECTED')
  assert.equal(sdk.calls, 1)
})

test('network errors are retried', async () => {
  const sdk = fakeSdk([new Anthropic.APIConnectionError({ message: 'offline' }), okMessage])
  const { client } = buildClient(sdk)
  await client.call(request)
  assert.equal(sdk.calls, 2)
})

test('after 3 failed calls the circuit opens, then closes after 60 seconds', async () => {
  const sdk = fakeSdk([badRequest])
  const { client, clock } = buildClient(sdk)

  for (let attempt = 0; attempt < 3; attempt++) {
    await assert.rejects(client.call(request), (error) => error.code === 'AI_REQUEST_REJECTED')
  }
  assert.equal(client.getStatus().circuitOpen, true)

  // While open the SDK is not touched at all
  const callsBefore = sdk.calls
  await assert.rejects(client.call(request), (error) => error.code === 'AI_CIRCUIT_OPEN')
  assert.equal(sdk.calls, callsBefore)

  clock.time += 61_000
  assert.equal(client.getStatus().circuitOpen, false)
})

test('a success resets the failure count', async () => {
  const sdk = fakeSdk([badRequest, badRequest, okMessage, badRequest, badRequest])
  const { client } = buildClient(sdk)
  await assert.rejects(client.call(request))
  await assert.rejects(client.call(request))
  await client.call(request)
  assert.equal(client.getStatus().consecutiveFailures, 0)
  await assert.rejects(client.call(request))
  await assert.rejects(client.call(request))
  assert.equal(client.getStatus().circuitOpen, false) // only 2 in a row since the success
})

test('every attempt is written to the usage log, with token counts on success', async () => {
  const sdk = fakeSdk([serverError, okMessage])
  const { client, db } = buildClient(sdk)
  await client.call(request)
  assert.equal(db.rows.length, 2)
  const failedRow = db.rows[0]
  const successRow = db.rows[1]
  assert.equal(failedRow[7], false) // success flag
  assert.equal(failedRow[8], 'AI_SERVER_ERROR')
  assert.equal(successRow[3], 10) // input tokens
  assert.equal(successRow[4], 5) // output tokens
})

test('a refusal is reported but does not count towards the circuit breaker', async () => {
  const refusal = { stop_reason: 'refusal', content: [], usage: {} }
  const sdk = fakeSdk([refusal])
  const { client } = buildClient(sdk)
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(client.call(request), (error) => error.code === 'AI_REFUSED')
  }
  assert.equal(client.getStatus().circuitOpen, false)
})
