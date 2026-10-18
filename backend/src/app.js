import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import dbPlugin from './plugins/db.js'
import errorsPlugin from './plugins/errors.js'
import authPlugin from './plugins/auth.js'
import authRoutes from './modules/auth/routes.js'
import bookRoutes from './modules/books/routes.js'
import healthRoutes from './modules/health/routes.js'

// Builds the app without starting it, so tests can import it directly.
export async function buildApp() {
  const app = Fastify({
    logger: { level: config.isProduction ? 'info' : 'debug' },
  })

  await app.register(cors, { origin: config.corsOrigin })
  await app.register(errorsPlugin)
  await app.register(dbPlugin)
  await app.register(authPlugin)

  // Every route lives under /api
  await app.register(healthRoutes, { prefix: '/api' })
  await app.register(authRoutes, { prefix: '/api' })
  await app.register(bookRoutes, { prefix: '/api' })

  return app
}
