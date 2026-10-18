// SQL only, for the drafter. Admin-side: nothing here is scoped to one author.

// Everything contextBuilder needs, in a few small queries
export async function loadDraftInputs(db, ticketId) {
  const ticketResult = await db.query(
    `SELECT id, subject, description, category, author_id AS "authorId", book_id AS "bookId"
     FROM tickets WHERE id = $1`,
    [ticketId],
  )
  const ticket = ticketResult.rows[0]
  if (!ticket) return null

  const [authorResult, booksResult, messagesResult] = await Promise.all([
    db.query(`SELECT name, city, joined_date AS "joinedDate" FROM authors WHERE id = $1`, [ticket.authorId]),
    db.query(
      `SELECT id, title, isbn, genre, publication_date AS "publicationDate", status,
              production_stage AS "productionStage", mrp,
              author_royalty_per_copy AS "authorRoyaltyPerCopy",
              total_copies_sold AS "totalCopiesSold", total_royalty_earned AS "totalRoyaltyEarned",
              royalty_paid AS "royaltyPaid", royalty_pending AS "royaltyPending",
              last_royalty_payout_date AS "lastRoyaltyPayoutDate", print_partner AS "printPartner",
              available_on AS "availableOn"
       FROM books WHERE author_id = $1 ORDER BY id`,
      [ticket.authorId],
    ),
    db.query(
      `SELECT id, sender_role AS "senderRole", body, created_at AS "createdAt"
       FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at`,
      [ticketId],
    ),
  ])

  return {
    ticket,
    author: authorResult.rows[0],
    authorBooks: booksResult.rows,
    messages: messagesResult.rows,
  }
}

export async function findDraft(db, ticketId) {
  const result = await db.query(
    `SELECT body, model, based_on_message_id AS "basedOnMessageId", created_at AS "createdAt"
     FROM ai_drafts WHERE ticket_id = $1`,
    [ticketId],
  )
  return result.rows[0] || null
}

export async function saveDraft(db, { ticketId, body, model, basedOnMessageId }) {
  const result = await db.query(
    `INSERT INTO ai_drafts (ticket_id, body, model, based_on_message_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (ticket_id) DO UPDATE
       SET body = EXCLUDED.body, model = EXCLUDED.model,
           based_on_message_id = EXCLUDED.based_on_message_id, created_at = now()
     RETURNING created_at AS "createdAt"`,
    [ticketId, body, model, basedOnMessageId],
  )
  return result.rows[0]
}

// Called when a new author message arrives: the cached draft no longer answers it
export async function deleteDraft(db, ticketId) {
  await db.query('DELETE FROM ai_drafts WHERE ticket_id = $1', [ticketId])
}
