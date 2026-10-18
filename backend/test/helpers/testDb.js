import pg from 'pg'
import '../../src/db/pgTypes.js'

// DB-backed tests run against the local seeded database and clean up after
// themselves. When no DATABASE_URL is set they are skipped, not failed.
export const hasDatabase = Boolean(process.env.DATABASE_URL)

export function createTestPool() {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL })
}

// A minimal ticket for AUTH001 (Priya), created straight in SQL
export async function createTestTicket(pool, overrides = {}) {
  const ticket = {
    subject: 'Test ticket subject',
    description: 'A test description that is long enough to be real.',
    category: null, priority: null, categorySource: null, prioritySource: null,
    classificationStatus: 'pending',
    ...overrides,
  }
  const result = await pool.query(
    `INSERT INTO tickets (author_id, subject, description, category, priority,
       category_source, priority_source, classification_status)
     VALUES ('AUTH001', $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [ticket.subject, ticket.description, ticket.category, ticket.priority,
      ticket.categorySource, ticket.prioritySource, ticket.classificationStatus],
  )
  return result.rows[0].id
}

export async function deleteTestTicket(pool, ticketId) {
  await pool.query('DELETE FROM ai_usage_log WHERE ticket_id = $1', [ticketId])
  await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId])
}

export const silentLogger = { info() {}, warn() {}, error() {} }
