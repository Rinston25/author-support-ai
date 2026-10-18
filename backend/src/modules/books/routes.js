import { listBooksSchema, getBookSchema } from './schemas.js'
import { listBooks, getBook } from './service.js'

// The authorId always comes from the verified JWT, never from the client.
export default async function bookRoutes(fastify) {
  const authorOnly = fastify.requireRole('author')

  fastify.get('/books', { schema: listBooksSchema, preHandler: authorOnly }, async (request) => {
    return listBooks(fastify.db, request.user.authorId)
  })

  fastify.get('/books/:bookId', { schema: getBookSchema, preHandler: authorOnly }, async (request) => {
    return { book: await getBook(fastify.db, request.params.bookId, request.user.authorId) }
  })
}
