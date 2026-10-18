import fp from 'fastify-plugin'
import { AppError } from '../lib/httpErrors.js'

// Every error leaves the API in the same shape, and stack traces never reach the client.
async function errorsPlugin(fastify) {
  fastify.setErrorHandler((error, request, reply) => {
    // Fastify's JSON Schema validation errors -> 400 with per-field details
    if (error.validation) {
      const details = error.validation.map((problem) => ({
        field: (problem.instancePath || problem.params?.missingProperty || '').replace(/^\//, ''),
        message: problem.message,
      }))
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details },
      })
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      })
    }

    // Anything else is a bug: log it fully, tell the client nothing specific.
    request.log.error(error)
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] },
    })
  })

  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'ROUTE_NOT_FOUND', message: `${request.method} ${request.url} does not exist`, details: [] },
    })
  })
}

export default fp(errorsPlugin)
