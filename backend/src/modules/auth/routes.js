import { loginSchema, meSchema } from './schemas.js'
import { login, getCurrentUser } from './service.js'

// HTTP only: validation comes from the schemas, rules live in the service.
export default async function authRoutes(fastify) {
  fastify.post('/auth/login', { schema: loginSchema }, async (request) => {
    const { email, password } = request.body
    return login(fastify, email, password)
  })

  fastify.get('/auth/me', { schema: meSchema, onRequest: fastify.authenticate }, async (request) => {
    return { user: await getCurrentUser(fastify, request.user.userId) }
  })
}
