import fp from 'fastify-plugin'
import pg from 'pg'
import { config } from '../config.js'

// A single shared pool, available everywhere as fastify.db
async function dbPlugin(fastify) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl })
  fastify.decorate('db', pool)
  fastify.addHook('onClose', async () => pool.end())
}

export default fp(dbPlugin)
