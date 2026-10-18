import { notFound } from '../../lib/httpErrors.js'
import { buildRoyaltySummary } from '../../lib/royaltyCalendar.js'
import { findBooksByAuthor, findBookForAuthor, sumPendingRoyalty } from './repository.js'

// Adds the royalty facts the UI needs so the frontend doesn't re-implement policy.
// Pure function (no DB), so it is easy to test. The threshold flag comes from the
// author's TOTAL pending, but is only shown on books that actually have money pending.
export function addRoyaltyInfo(book, summary) {
  const hasPending = book.royaltyPending > 0
  return {
    ...book,
    // In-production and fully paid books have no upcoming payout to show
    nextPayoutDate: hasPending ? summary.nextPayoutDate : null,
    belowPayoutThreshold: hasPending && summary.belowPayoutThreshold,
  }
}

export async function listBooks(db, authorId) {
  const books = await findBooksByAuthor(db, authorId)
  const totalPending = books.reduce((total, book) => total + book.royaltyPending, 0)
  const summary = buildRoyaltySummary(totalPending)
  return { summary, books: books.map((book) => addRoyaltyInfo(book, summary)) }
}

export async function getBook(db, bookId, authorId) {
  const book = await findBookForAuthor(db, bookId, authorId)
  // Another author's book looks exactly like a missing one: 404, not 403
  if (!book) throw notFound('BOOK_NOT_FOUND', 'Book not found')
  // The threshold depends on all of the author's books, not just this one
  const summary = buildRoyaltySummary(await sumPendingRoyalty(db, authorId))
  return addRoyaltyInfo(book, summary)
}
