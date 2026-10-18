import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getNextPayoutDate, buildRoyaltySummary } from '../src/lib/royaltyCalendar.js'
import { addRoyaltyInfo } from '../src/modules/books/service.js'

// Dates are fixed so the tests don't depend on when they are run.
const OCT_18_2026 = new Date('2026-10-18T10:00:00Z')

test('next payout is the quarter end plus 45 days', () => {
  assert.equal(getNextPayoutDate(OCT_18_2026), '2026-11-14') // Sep 30 + 45
  assert.equal(getNextPayoutDate(new Date('2026-01-10T00:00:00Z')), '2026-02-14') // Dec 31 + 45
  assert.equal(getNextPayoutDate(new Date('2026-04-02T00:00:00Z')), '2026-05-15') // Mar 31 + 45
  assert.equal(getNextPayoutDate(new Date('2026-07-01T00:00:00Z')), '2026-08-14') // Jun 30 + 45
})

test('payout day itself still counts as upcoming; the day after rolls to the next quarter', () => {
  assert.equal(getNextPayoutDate(new Date('2026-11-14T23:00:00Z')), '2026-11-14')
  assert.equal(getNextPayoutDate(new Date('2026-11-15T00:00:00Z')), '2027-02-14')
})

test('total pending of 1000 or more is not below the threshold', () => {
  assert.equal(buildRoyaltySummary(1000, OCT_18_2026).belowPayoutThreshold, false)
  const summary = buildRoyaltySummary(3570, OCT_18_2026)
  assert.equal(summary.belowPayoutThreshold, false)
  assert.equal(summary.nextPayoutDate, '2026-11-14')
})

test('total pending under 1000 is below the threshold and rolls over', () => {
  const summary = buildRoyaltySummary(850, OCT_18_2026)
  assert.equal(summary.belowPayoutThreshold, true)
  assert.equal(summary.totalPending, 850)
})

test('nothing pending means no payout date and no threshold warning', () => {
  const summary = buildRoyaltySummary(0, OCT_18_2026)
  assert.equal(summary.nextPayoutDate, null)
  assert.equal(summary.belowPayoutThreshold, false)
})

test('threshold uses the author total, not each book on its own', () => {
  // Two books of 600 each are both under 1000, but together they reach it
  const summary = buildRoyaltySummary(1200, OCT_18_2026)
  const book = addRoyaltyInfo({ royaltyPending: 600 }, summary)
  assert.equal(book.belowPayoutThreshold, false)
  assert.equal(book.nextPayoutDate, '2026-11-14')
})

test('a book in production shows no payout info, even when the author total is low', () => {
  const summary = buildRoyaltySummary(850, OCT_18_2026)
  const inProduction = addRoyaltyInfo({ royaltyPending: 0, productionStage: 'Cover Design' }, summary)
  assert.equal(inProduction.nextPayoutDate, null)
  assert.equal(inProduction.belowPayoutThreshold, false)

  const published = addRoyaltyInfo({ royaltyPending: 850 }, summary)
  assert.equal(published.belowPayoutThreshold, true)
})
