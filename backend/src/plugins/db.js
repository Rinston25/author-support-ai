import fp from 'fastify-plugin'
import pg from 'pg'
import { config } from '../config.js'

// Return DATE columns as plain 'YYYY-MM-DD' strings. The default converts them to
// JS Dates in the server's timezone, which can shift the day.
pg.types.setTypeParser(1082, (value) => value)

// A single shared pool, available everywhere as fastify.db
async function dbPlugin(fastify) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl })
  fastify.decorate('db', pool)
  fastify.addHook('onClose', async () => pool.end())
}

export default fp(dbPlugin)
