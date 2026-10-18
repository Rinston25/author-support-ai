// Reads env vars once and fails fast, so a bad deploy crashes at boot
// instead of failing on the first request.
const requiredVariables = ['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGIN']

const missingVariables = requiredVariables.filter((name) => !process.env[name])
if (missingVariables.length > 0) {
  throw new Error(`Missing required env vars: ${missingVariables.join(', ')}`)
}

export const config = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_ORIGIN,
  // The AI key is optional on purpose: the app must still run without it.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  aiModel: process.env.AI_MODEL || 'claude-haiku-5-5',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 15000),
  // Per-million-token prices, only used to estimate cost on the usage endpoint
  aiPriceInputPerMtok: Number(process.env.AI_PRICE_INPUT_PER_MTOK || 0.1),
  aiPriceOutputPerMtok: Number(process.env.AI_PRICE_OUTPUT_PER_MTOK || 0.5),
  isProduction: process.env.NODE_ENV === 'production',
}
