import fp from 'fastify-plugin'
import { config } from '../config.js'
import { createAiClient, createSdk } from '../ai/aiClient.js'

// Available everywhere as fastify.ai ({ call, getStatus })
async function aiPlugin(fastify) {
  const ai = createAiClient({
    sdk: createSdk(config.anthropicApiKey, config.aiTimeoutMs),
    db: fastify.db,
    logger: fastify.log,
    model: config.aiModel,
  })
  fastify.decorate('ai', ai)
}

export default fp(aiPlugin)
