import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDraftContext, formatDate, formatRupees } from '../src/ai/contextBuilder.js'
import { getSection } from '../src/ai/knowledgeBase.js'

const TODAY = new Date('2026-10-18T10:00:00Z')

const author = { name: 'Ananya Reddy', city: 'Hyderabad', joinedDate: '2024-02-20' }
const book = {
  id: 'BK005', title: 'Between Two Temples', isbn: '978-93-5XXXX-05-9', genre: 'Historical Fiction',
  status: 'Published & Live', productionStage: null, publicationDate: '2024-07-05', mrp: 425,
  authorRoyaltyPerCopy: 38, totalCopiesSold: 67, totalRoyaltyEarned: 2546, royaltyPaid: 0, royaltyPending: 2546,
  lastRoyaltyPayoutDate: null, printPartner: 'Epitome Books', availableOn: ['Amazon India', 'BookLeaf Store'],
}
const royaltySummary = { totalPending: 2546, nextPayoutDate: '2026-11-14', belowPayoutThreshold: false }

function message(index, senderRole) {
  return { id: `m${index}`, senderRole, body: `message number ${index}`, createdAt: new Date(`2026-10-${10 + index}T08:00:00Z`) }
}

function build(overrides = {}) {
  return buildDraftContext({
    ticket: { id: 't1', subject: "I haven't received any royalty", description: 'No royalty so far.', category: 'royalty_payments', bookId: 'BK005' },
    author, book, authorBooks: [book], royaltySummary,
    messages: [message(0, 'author')],
    today: TODAY,
    ...overrides,
  })
}

const userText = (context) => context.messages[0].content

test('includes only the knowledge-base section for the ticket category', () => {
  const text = userText(build())
  assert.ok(text.includes(getSection('royalty_payments')), 'royalty section is present')
  for (const other of ['isbn_metadata', 'printing_quality', 'distribution_availability', 'book_status_production']) {
    assert.ok(!text.includes(getSection(other)), `${other} section must not be sent`)
  }
})

test('a different category pulls a different section', () => {
  const text = userText(build({ ticket: { id: 't1', subject: 'Blurry', description: 'Bad copies', category: 'printing_quality', bookId: 'BK005' } }))
  assert.ok(text.includes(getSection('printing_quality')))
  assert.ok(!text.includes(getSection('royalty_payments')))
})

test('an unclassified ticket falls back to the general section', () => {
  const text = userText(build({ ticket: { id: 't1', subject: 'Hi', description: 'Hello', category: null, bookId: null }, book: null }))
  assert.ok(text.includes(getSection('general_inquiry')))
})

test('adds at most two examples for the category', () => {
  const text = userText(build())
  const exampleCount = (text.match(/Author query:/g) || []).length
  assert.ok(exampleCount >= 1 && exampleCount <= 2)
})

test('the static system prompt is cached and holds role, company and tone', () => {
  const { system } = build()
  assert.equal(system[0].cache_control.type, 'ephemeral')
  assert.match(system[0].text, /BookLeaf Publishing author support team/)
  assert.match(system[0].text, /Standard Free/) // company.md
  assert.match(system[0].text, /Always empathetic and professional/) // tone.md
})

test('the system prompt is identical for every ticket (so the cache can hit)', () => {
  const first = build().system[0].text
  const second = build({ ticket: { id: 't9', subject: 'Other', description: 'Other', category: 'isbn_metadata', bookId: 'BK005' } }).system[0].text
  assert.equal(first, second)
})

test('facts come from the data, with formatted rupees and dates', () => {
  const text = userText(build())
  assert.match(text, /Author first name: Ananya/)
  assert.match(text, /Royalty pending: ₹2,546/)
  assert.match(text, /Next payout date: 14 November 2026/)
  assert.match(text, /Today: 18 October 2026/)
})

test('null facts are dropped instead of written as "null"', () => {
  const text = userText(build())
  assert.ok(!text.includes('null'), 'no literal null anywhere')
  assert.ok(!text.includes('undefined'))
  assert.ok(!text.includes('Last royalty payout date'), 'a missing payout date is omitted')
})

test('an unpublished book shows its stage and no sales numbers', () => {
  const production = { ...book, id: 'BK013', status: 'In Production - Cover Design', productionStage: 'Cover Design', mrp: null, publicationDate: null, totalCopiesSold: 0, totalRoyaltyEarned: 0, royaltyPaid: 0, royaltyPending: 0, printPartner: null, availableOn: [] }
  const text = userText(build({ book: production, authorBooks: [production] }))
  assert.match(text, /Production stage: Cover Design/)
  // Match the fact lines only: the policy text itself legitimately mentions MRP
  assert.ok(!/^Copies sold:/m.test(text))
  assert.ok(!/^MRP:/m.test(text))
  assert.ok(!/^Available on:/m.test(text))
})

test('below-threshold royalty is explained in the facts', () => {
  const text = userText(build({ royaltySummary: { totalPending: 850, nextPayoutDate: '2026-11-14', belowPayoutThreshold: true } }))
  assert.match(text, /below the ₹1,000 minimum payout/)
})

test('a general ticket lists the author books instead of one book', () => {
  const text = userText(build({ ticket: { id: 't1', subject: 'Hi', description: 'Hello', category: 'general_inquiry', bookId: null }, book: null }))
  assert.match(text, /General \/ Account Level/)
  assert.match(text, /Author books: Between Two Temples \(Published & Live\)/)
})

test('only the last 4 follow-up messages are sent, older ones become one line', () => {
  const messages = [message(0, 'author'), ...[1, 2, 3, 4, 5, 6].map((index) => message(index, index % 2 ? 'admin' : 'author'))]
  const text = userText(build({ messages }))
  assert.match(text, /\(2 earlier messages omitted\)/)
  assert.ok(!text.includes('message number 1'))
  assert.ok(!text.includes('message number 2'))
  for (const index of [3, 4, 5, 6]) assert.ok(text.includes(`message number ${index}`))
})

test('admin instructions appear only when given', () => {
  assert.ok(!userText(build()).includes('ADMIN INSTRUCTIONS'))
  assert.ok(!userText(build({ instructions: '   ' })).includes('ADMIN INSTRUCTIONS'))
  assert.match(userText(build({ instructions: 'Keep it shorter' })), /ADMIN INSTRUCTIONS\nKeep it shorter/)
})

test('sections come in the documented order', () => {
  const text = userText(build({ instructions: 'Shorter' }))
  const positions = ['POLICY', 'FACTS', 'CONVERSATION', 'ADMIN INSTRUCTIONS'].map((heading) => text.indexOf(heading))
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
  assert.ok(positions.every((position) => position >= 0))
})

test('formatters', () => {
  assert.equal(formatRupees(11970), '₹11,970')
  assert.equal(formatDate('2026-11-14'), '14 November 2026')
  assert.equal(formatDate(null), null)
})
