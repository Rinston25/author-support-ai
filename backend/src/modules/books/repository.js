// SQL only. Every query filters by author_id, so one author can never read
// another author's book. Callers pass the authorId from the JWT.
const BOOK_COLUMNS = `
  id,
  title,
  isbn,
  genre,
  publication_date AS "publicationDate",
  status,
  production_stage AS "productionStage",
  mrp,
  author_royalty_per_copy AS "authorRoyaltyPerCopy",
  total_copies_sold AS "totalCopiesSold",
  total_royalty_earned AS "totalRoyaltyEarned",
  royalty_paid AS "royaltyPaid",
  royalty_pending AS "royaltyPending",
  last_royalty_payout_date AS "lastRoyaltyPayoutDate",
  print_partner AS "printPartner",
  available_on AS "availableOn"`

export async function findBooksByAuthor(db, authorId) {
  const result = await db.query(
    `SELECT ${BOOK_COLUMNS} FROM books WHERE author_id = $1 ORDER BY id`,
    [authorId],
  )
  return result.rows
}

export async function findBookForAuthor(db, bookId, authorId) {
  const result = await db.query(
    `SELECT ${BOOK_COLUMNS} FROM books WHERE id = $1 AND author_id = $2`,
    [bookId, authorId],
  )
  return result.rows[0] || null
}
