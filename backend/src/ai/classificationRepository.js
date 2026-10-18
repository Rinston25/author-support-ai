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

// Saves the result without ever overwriting a value an admin has set by hand:
// the AI is slow, so an admin may have already corrected the ticket.
export async function saveClassification(db, ticketId, { category, priority, reasoning, source }) {
  const classificationStatus = source === 'ai' ? 'done' : 'fallback'
  const result = await db.query(
    `UPDATE tickets SET
       category        = CASE WHEN category_source = 'admin' THEN category ELSE $2 END,
       category_source = CASE WHEN category_source = 'admin' THEN 'admin' ELSE $5 END,
       priority        = CASE WHEN priority_source = 'admin' THEN priority ELSE $3 END,
       priority_source = CASE WHEN priority_source = 'admin' THEN 'admin' ELSE $5 END,
       ai_reasoning    = $4,
       classification_status = $6,
       updated_at = now()
     WHERE id = $1
     RETURNING author_id AS "authorId"`,
    [ticketId, category, priority, reasoning, source, classificationStatus],
  )
  return result.rows[0] || null
}
