import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import dbPlugin from './plugins/db.js'
import errorsPlugin from './plugins/errors.js'
import authPlugin from './plugins/auth.js'
import aiPlugin from './plugins/ai.js'
import authRoutes from './modules/auth/routes.js'
import bookRoutes from './modules/books/routes.js'
import ticketRoutes from './modules/tickets/routes.js'
import { classifyPendingTickets } from './ai/classifier.js'
import eventRoutes from './modules/events/routes.js'
import adminRoutes from './modules/admin/routes.js'
import aiAssistRoutes from './modules/aiAssist/routes.js'
import healthRoutes from './modules/health/routes.js'

// Builds the app without starting it, so tests can import it directly.
export async function buildApp() {
  const app = Fastify({
    logger: { level: config.isProduction ? 'info' : 'debug' },
  })

  await app.register(cors, { origin: config.corsOrigins })
  await app.register(errorsPlugin)
  await app.register(dbPlugin)
  await app.register(authPlugin)
  await app.register(aiPlugin)

  // Every route lives under /api
  await app.register(healthRoutes, { prefix: '/api' })
  await app.register(authRoutes, { prefix: '/api' })
  await app.register(bookRoutes, { prefix: '/api' })
  await app.register(ticketRoutes, { prefix: '/api' })
  await app.register(adminRoutes, { prefix: '/api' })
  await app.register(aiAssistRoutes, { prefix: '/api' })
  await app.register(eventRoutes, { prefix: '/api' })

  // Pick up tickets left unclassified by a crash. Not awaited: the server should
  // start accepting requests straight away.
  app.addHook('onReady', async () => {
    setImmediate(() => {
      classifyPendingTickets(app).catch((error) => app.log.error({ err: error }, 'pending classification failed'))
    })
  })

  return app
}
