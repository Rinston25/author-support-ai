import { notFound } from '../../lib/httpErrors.js'
import { getNextPayoutDate, isBelowPayoutThreshold } from '../../lib/royaltyCalendar.js'
import { findBooksByAuthor, findBookForAuthor } from './repository.js'

// Adds the royalty facts the UI needs so the frontend doesn't re-implement policy.
function addRoyaltyInfo(book) {
  const hasPending = book.royaltyPending > 0
  return {
    ...book,
    // Unpublished or fully paid books have no upcoming payout to show
    nextPayoutDate: hasPending ? getNextPayoutDate() : null,
    belowPayoutThreshold: isBelowPayoutThreshold(book.royaltyPending),
  }
}

export async function listBooks(db, authorId) {
  const books = await findBooksByAuthor(db, authorId)
  return books.map(addRoyaltyInfo)
}

export async function getBook(db, bookId, authorId) {
  const book = await findBookForAuthor(db, bookId, authorId)
  // Another author's book looks exactly like a missing one: 404, not 403
  if (!book) throw notFound('BOOK_NOT_FOUND', 'Book not found')
  return addRoyaltyInfo(book)
}
