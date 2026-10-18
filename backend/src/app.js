import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import dbPlugin from './plugins/db.js'
import errorsPlugin from './plugins/errors.js'
import healthRoutes from './modules/health/routes.js'

// Builds the app without starting it, so tests can import it directly.
export async function buildApp() {
  const app = Fastify({
    logger: { level: config.isProduction ? 'info' : 'debug' },
  })

  await app.register(cors, { origin: config.corsOrigin })
  await app.register(errorsPlugin)
  await app.register(dbPlugin)

  // Every route lives under /api
  await app.register(healthRoutes, { prefix: '/api' })

  return app
}
