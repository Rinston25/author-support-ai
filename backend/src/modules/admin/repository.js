// SQL only. Admin queries are not scoped to an author: admins see every ticket.
import { PRIORITIES } from '../../lib/constants.js'

// Shared by the list and the count so both always filter identically.
const QUEUE_FROM = `
  FROM tickets t
  JOIN authors a ON a.id = t.author_id
  LEFT JOIN books b ON b.id = t.book_id
  LEFT JOIN users assignee ON assignee.id = t.assigned_to`

// Turns the validated query filters into a WHERE clause with $1, $2... placeholders.
// Only values are parameterised; column names below are fixed strings, never user input.
function buildWhere(filters, adminId) {
  const conditions = []
  const values = []
  const addCondition = (sqlWithQuestionMark, value) => {
    values.push(value)
    conditions.push(sqlWithQuestionMark.replace('?', `$${values.length}`))
  }

  if (filters.status) addCondition('t.status = ?', filters.status)
  if (filters.category) addCondition('t.category = ?', filters.category)
  if (filters.priority) addCondition('t.priority = ?', filters.priority)

  if (filters.assignee === 'me') addCondition('t.assigned_to = ?', adminId)
  else if (filters.assignee === 'unassigned') conditions.push('t.assigned_to IS NULL')
  else if (filters.assignee) addCondition('t.assigned_to = ?', filters.assignee)

  if (filters.from) addCondition('t.created_at >= ?::date', filters.from)
  // "to" is a whole day, so include everything before the next midnight
  if (filters.to) addCondition("t.created_at < (?::date + interval '1 day')", filters.to)

  if (filters.q) {
    // Escape LIKE wildcards so a search for "100%" is literal
    const escaped = filters.q.replace(/[\\%_]/g, (character) => `\\${character}`)
    values.push(`%${escaped}%`)
    const placeholder = `$${values.length}`
    conditions.push(`(t.subject ILIKE ${placeholder} OR t.description ILIKE ${placeholder} OR a.name ILIKE ${placeholder})`)
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { whereSql, values }
}

// Position in PRIORITIES = urgency. A ticket still being classified is treated
// like "medium" so it doesn't sink to the bottom or jump to the top.
const PRIORITY_RANK_SQL = `CASE t.priority
  ${PRIORITIES.map((priority, index) => `WHEN '${priority}' THEN ${index}`).join('\n  ')}
  ELSE ${PRIORITIES.indexOf('medium')} END`

const SORT_SQL = {
  // Unresolved first, then most urgent, then oldest first
  urgency: `(t.status IN ('resolved', 'closed')) ASC, ${PRIORITY_RANK_SQL} ASC, t.created_at ASC`,
  oldest: 't.created_at ASC',
  newest: 't.created_at DESC',
}

export async function listQueueTickets(db, filters, adminId) {
  const { whereSql, values } = buildWhere(filters, adminId)
  const offset = (filters.page - 1) * filters.pageSize
  const result = await db.query(
    `SELECT t.id, t.subject, t.status, t.category, t.priority,
            t.classification_status AS "classificationStatus",
            t.category_source AS "categorySource",
            t.priority_source AS "prioritySource",
            t.author_id AS "authorId", a.name AS "authorName",
            t.book_id AS "bookId", b.title AS "bookTitle",
            t.assigned_to AS "assignedToId", assignee.name AS "assignedToName",
            t.created_at AS "createdAt", t.updated_at AS "updatedAt",
            floor(extract(epoch FROM (now() - t.created_at)))::int AS "ageSeconds"
     ${QUEUE_FROM}
     ${whereSql}
     ORDER BY ${SORT_SQL[filters.sort]}
     LIMIT ${filters.pageSize} OFFSET ${offset}`,
    values,
  )
  return result.rows
}

export async function countQueueTickets(db, filters, adminId) {
  const { whereSql, values } = buildWhere(filters, adminId)
  const result = await db.query(`SELECT count(*)::int AS total ${QUEUE_FROM} ${whereSql}`, values)
  return result.rows[0].total
}

export async function getQueueStats(db) {
  const [byStatus, byPriority, other] = await Promise.all([
    db.query('SELECT status, count(*)::int AS count FROM tickets GROUP BY status'),
    // Priority counts only cover tickets that still need work
    db.query(`SELECT COALESCE(priority, 'unclassified') AS priority, count(*)::int AS count
              FROM tickets WHERE status IN ('open', 'in_progress') GROUP BY 1`),
    db.query(`SELECT
                count(*) FILTER (WHERE assigned_to IS NULL)::int AS "unassigned",
                floor(extract(epoch FROM (now() - min(created_at))))::int AS "oldestAgeSeconds"
              FROM tickets WHERE status IN ('open', 'in_progress')`),
  ])
  return { byStatus: byStatus.rows, byPriority: byPriority.rows, ...other.rows[0] }
}

export async function findTicketById(db, ticketId) {
  const result = await db.query(
    `SELECT t.id, t.subject, t.description, t.status, t.category, t.priority,
            t.classification_status AS "classificationStatus",
            t.category_source AS "categorySource",
            t.priority_source AS "prioritySource",
            t.ai_reasoning AS "aiReasoning",
            t.author_id AS "authorId", t.book_id AS "bookId",
            t.assigned_to AS "assignedToId", assignee.name AS "assignedToName",
            t.created_at AS "createdAt", t.updated_at AS "updatedAt",
            t.first_response_at AS "firstResponseAt", t.resolved_at AS "resolvedAt",
            floor(extract(epoch FROM (now() - t.created_at)))::int AS "ageSeconds"
     FROM tickets t
     LEFT JOIN users assignee ON assignee.id = t.assigned_to
     WHERE t.id = $1`,
    [ticketId],
  )
  return result.rows[0] || null
}

export async function findAuthorById(db, authorId) {
  const result = await db.query(
    `SELECT id, name, email, phone, city, joined_date AS "joinedDate" FROM authors WHERE id = $1`,
    [authorId],
  )
  return result.rows[0]
}

export async function listAllMessages(db, ticketId) {
  const result = await db.query(
    `SELECT m.id, m.sender_role AS "senderRole", u.name AS "senderName",
            m.body, m.ai_assisted AS "aiAssisted", m.created_at AS "createdAt"
     FROM ticket_messages m
     JOIN users u ON u.id = m.sender_user_id
     WHERE m.ticket_id = $1
     ORDER BY m.created_at`,
    [ticketId],
  )
  return result.rows
}

export async function listNotes(db, ticketId) {
  const result = await db.query(
    `SELECT n.id, u.name AS "adminName", n.body, n.created_at AS "createdAt"
     FROM internal_notes n
     JOIN users u ON u.id = n.admin_user_id
     WHERE n.ticket_id = $1
     ORDER BY n.created_at`,
    [ticketId],
  )
  return result.rows
}

export async function findAdminUser(db, userId) {
  const result = await db.query(`SELECT id FROM users WHERE id = $1 AND role = 'admin'`, [userId])
  return result.rows[0] || null
}

// Which request field maps to which column. Only these can ever be updated.
const UPDATABLE_COLUMNS = {
  status: 'status',
  category: 'category',
  priority: 'priority',
  assignedTo: 'assigned_to',
  categorySource: 'category_source',
  prioritySource: 'priority_source',
  resolvedAt: 'resolved_at',
}

// `changes` uses the keys above. The value `undefined` means "leave alone";
// null is a real value (e.g. un-assign).
export async function updateTicket(db, ticketId, changes) {
  const assignments = []
  const values = [ticketId]
  for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (changes[field] === undefined) continue
    values.push(changes[field])
    assignments.push(`${column} = $${values.length}`)
  }
  assignments.push('updated_at = now()')
  await db.query(`UPDATE tickets SET ${assignments.join(', ')} WHERE id = $1`, values)
}
