// SQL only, for the classifier.

export async function findTicketForClassification(db, ticketId) {
  const result = await db.query(
    `SELECT t.id, t.subject, t.description, t.author_id AS "authorId", b.status AS "bookStatus"
     FROM tickets t
     LEFT JOIN books b ON b.id = t.book_id
     WHERE t.id = $1`,
    [ticketId],
  )
  return result.rows[0] || null
}

// Pending tickets are re-classified when the server starts (e.g. after a crash)
export async function listPendingTicketIds(db) {
  const result = await db.query(
    `SELECT id FROM tickets WHERE classification_status = 'pending' ORDER BY created_at`,
  )
  return result.rows.map((row) => row.id)
}

// Saves the result without ever overwriting a value an admin has set by hand:
// the AI is slow, so an admin may have already corrected the ticket.
// `force` (admin pressed "reclassify" and confirmed) is the only way past that.
export async function saveClassification(db, ticketId, { category, priority, reasoning, source }, { force = false } = {}) {
  const classificationStatus = source === 'ai' ? 'done' : 'fallback'
  const keepAdminValues = !force
  const result = await db.query(
    `UPDATE tickets SET
       category        = CASE WHEN $7 AND category_source = 'admin' THEN category ELSE $2 END,
       category_source = CASE WHEN $7 AND category_source = 'admin' THEN 'admin' ELSE $5 END,
       priority        = CASE WHEN $7 AND priority_source = 'admin' THEN priority ELSE $3 END,
       priority_source = CASE WHEN $7 AND priority_source = 'admin' THEN 'admin' ELSE $5 END,
       ai_reasoning    = $4,
       -- If an admin owns both fields, the ticket is "done" whatever the AI said
       classification_status = CASE WHEN $7 AND category_source = 'admin' AND priority_source = 'admin'
                                    THEN 'done' ELSE $6 END,
       updated_at = now()
     WHERE id = $1
     RETURNING author_id AS "authorId"`,
    [ticketId, category, priority, reasoning, source, classificationStatus, keepAdminValues],
  )
  return result.rows[0] || null
}
