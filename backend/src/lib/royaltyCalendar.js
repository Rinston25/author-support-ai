import { MINIMUM_PAYOUT_RUPEES } from './constants.js'

// Policy: royalties are calculated quarterly (quarters end Mar 31, Jun 30,
// Sep 30, Dec 31) and paid within 45 days of the quarter ending.
const QUARTER_ENDS = [
  { month: 2, day: 31 }, // March (months are 0-based in JS Dates)
  { month: 5, day: 30 },
  { month: 8, day: 30 },
  { month: 11, day: 31 },
]
const PAYOUT_WINDOW_DAYS = 45

// Returns the earliest payout deadline that is today or later, as 'YYYY-MM-DD'.
// Dates are computed in UTC so the result doesn't depend on the server's timezone.
export function getNextPayoutDate(today = new Date()) {
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  for (let year = today.getUTCFullYear() - 1; year <= today.getUTCFullYear() + 1; year++) {
    for (const quarterEnd of QUARTER_ENDS) {
      const payoutDate = new Date(Date.UTC(year, quarterEnd.month, quarterEnd.day + PAYOUT_WINDOW_DAYS))
      if (payoutDate.getTime() >= startOfToday) {
        return payoutDate.toISOString().slice(0, 10)
      }
    }
  }
}

// The 1,000 minimum applies to the author's TOTAL pending royalty across all
// their books, not to each book. Below it, everything rolls over to next quarter.
export function isBelowPayoutThreshold(totalPendingRupees) {
  return totalPendingRupees > 0 && totalPendingRupees < MINIMUM_PAYOUT_RUPEES
}

// Author-level royalty facts shown above the book list.
export function buildRoyaltySummary(totalPendingRupees, today = new Date()) {
  return {
    totalPending: totalPendingRupees,
    // Nothing pending means there is no payout to look forward to
    nextPayoutDate: totalPendingRupees > 0 ? getNextPayoutDate(today) : null,
    belowPayoutThreshold: isBelowPayoutThreshold(totalPendingRupees),
  }
}
