// One error class for every "expected" failure. The global error handler
// turns it into the standard { error: { code, message, details } } shape.
export class AppError extends Error {
  constructor(statusCode, code, message, details = []) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details)
export const unauthorized = (message = 'Missing or invalid token') => new AppError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'You do not have access to this resource') => new AppError(403, 'FORBIDDEN', message)
export const notFound = (code, message) => new AppError(404, code, message)
export const conflict = (code, message) => new AppError(409, code, message)
export const aiUnavailable = (message = 'AI is currently unavailable') => new AppError(503, 'AI_UNAVAILABLE', message)
