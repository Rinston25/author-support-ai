import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { config } from '../config.js'
import { unauthorized, forbidden } from '../lib/httpErrors.js'

// JWT payload is { userId, role, authorId }. authorId is null for admins.
// Author routes must take the author from here, never from the request body or URL.
async function authPlugin(fastify) {
  await fastify.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: '8h' },
  })

  // For routes any logged-in user may call (e.g. GET /auth/me)
  async function authenticate(request) {
    try {
      await request.jwtVerify()
    } catch {
      throw unauthorized()
    }
  }
  fastify.decorate('authenticate', authenticate)

  // Returns a preHandler that checks the token AND the role in one step,
  // so a route can't forget one of them: preHandler: fastify.requireRole('admin')
  fastify.decorate('requireRole', (requiredRole) => async (request) => {
    await authenticate(request)
    if (request.user.role !== requiredRole) {
      throw forbidden()
    }
  })
}

export default fp(authPlugin)
