// SQL only. Every read takes the authorId from the JWT and puts it in the WHERE
// clause, so an author can never see another author's ticket. `client` can be a
// pool or a transaction client; both have .query().

const TICKET_COLUMNS = `
  t.id,
  t.subject,
  t.description,
  t.status,
  t.book_id AS "bookId",
  b.title AS "bookTitle",
  t.created_at AS "createdAt",
  t.updated_at AS "updatedAt"`

export async function insertTicket(client, { authorId, bookId, subject, description }) {
  const result = await client.query(
    `INSERT INTO tickets (author_id, book_id, subject, description)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [authorId, bookId, subject, description],
  )
  return result.rows[0].id
}

export async function insertMessage(client, { ticketId, senderUserId, senderRole, body, aiAssisted = false }) {
  const result = await client.query(
    `INSERT INTO ticket_messages (ticket_id, sender_user_id, sender_role, body, ai_assisted)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, sender_role AS "senderRole", body, created_at AS "createdAt"`,
    [ticketId, senderUserId, senderRole, body, aiAssisted],
  )
  return result.rows[0]
}

export async function insertAttachments(client, ticketId, attachments) {
  for (const attachment of attachments) {
    await client.query(
      `INSERT INTO ticket_attachments (ticket_id, file_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4)`,
      [ticketId, attachment.fileName, attachment.mimeType, attachment.sizeBytes],
    )
  }
}

// The list view: each ticket plus a short preview of its latest message
export async function listTicketsForAuthor(db, authorId, status) {
  const result = await db.query(
    `SELECT ${TICKET_COLUMNS},
            last_message.preview AS "lastMessagePreview",
            last_message.sender_role AS "lastMessageSenderRole",
            last_message.created_at AS "lastMessageAt"
     FROM tickets t
     LEFT JOIN books b ON b.id = t.book_id
     LEFT JOIN LATERAL (
       SELECT left(body, 140) AS preview, sender_role, created_at
       FROM ticket_messages
       WHERE ticket_id = t.id
       ORDER BY created_at DESC
       LIMIT 1
     ) last_message ON true
     WHERE t.author_id = $1
       AND ($2::text IS NULL OR t.status = $2)
     ORDER BY t.updated_at DESC`,
    [authorId, status || null],
  )
  return result.rows
}

export async function findTicketForAuthor(client, ticketId, authorId) {
  const result = await client.query(
    `SELECT ${TICKET_COLUMNS}
     FROM tickets t
     LEFT JOIN books b ON b.id = t.book_id
     WHERE t.id = $1 AND t.author_id = $2`,
    [ticketId, authorId],
  )
  return result.rows[0] || null
}

// Locks the row so two follow-ups at once can't both "reopen" the ticket
export async function lockTicketForAuthor(client, ticketId, authorId) {
  const result = await client.query(
    `SELECT id, status FROM tickets WHERE id = $1 AND author_id = $2 FOR UPDATE`,
    [ticketId, authorId],
  )
  return result.rows[0] || null
}

// Admin replies show a generic team name, not the individual admin's name.
export async function listPublicMessages(db, ticketId) {
  const result = await db.query(
    `SELECT m.id,
            m.sender_role AS "senderRole",
            CASE WHEN m.sender_role = 'admin' THEN 'BookLeaf Support Team' ELSE u.name END AS "senderName",
            m.body,
            m.created_at AS "createdAt"
     FROM ticket_messages m
     JOIN users u ON u.id = m.sender_user_id
     WHERE m.ticket_id = $1
     ORDER BY m.created_at`,
    [ticketId],
  )
  return result.rows
}

export async function listAttachments(db, ticketId) {
  const result = await db.query(
    `SELECT id, file_name AS "fileName", mime_type AS "mimeType", size_bytes AS "sizeBytes"
     FROM ticket_attachments WHERE ticket_id = $1 ORDER BY created_at`,
    [ticketId],
  )
  return result.rows
}

// An author follow-up reopens a resolved ticket; in other states status is unchanged.
export async function touchTicketAfterAuthorMessage(client, ticketId) {
  const result = await client.query(
    `UPDATE tickets
     SET status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END,
         resolved_at = CASE WHEN status = 'resolved' THEN NULL ELSE resolved_at END,
         updated_at = now()
     WHERE id = $1
     RETURNING status`,
    [ticketId],
  )
  return result.rows[0].status
}
