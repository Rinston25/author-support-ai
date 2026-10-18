// Quality check for the AI features. Runs the classifier and the drafter on the
// sample queries from the brief (attached to real seeded books) and writes the
// result to docs/ai-eval-results.md.
//
//   npm run ai:eval          (needs ANTHROPIC_API_KEY in backend/.env and a seeded database)
//
// Nothing is saved to the tickets tables: the queries are made up in memory.
// The calls are real, so they do appear in ai_usage_log.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from '../src/config.js'
import '../src/db/pgTypes.js'
import { createAiClient, createSdk } from '../src/ai/aiClient.js'
import { classifyWithAi } from '../src/ai/classifier.js'
import { composeDraft } from '../src/ai/drafter.js'
import { fallbackClassify } from '../src/ai/fallbackClassifier.js'

if (!config.anthropicApiKey) {
  console.error('ANTHROPIC_API_KEY is not set in backend/.env, so there is nothing to evaluate.')
  process.exit(1)
}

// category/priorities are what we EXPECT; a priority list means any of those is acceptable
const CASES = [
  { name: '1. Royalty never received (brief)', bookId: 'BK005', subject: "I haven't received any royalty",
    description: "I published my book 4 months ago and still haven't received any royalty. What's going on?",
    category: 'royalty_payments', priorities: ['critical'] },
  { name: '2. Royalty too low (brief)', bookId: 'BK003', subject: 'My royalty seems too low',
    description: 'My royalty amount seems too low. I sold 200 copies but only received 3,000.',
    category: 'royalty_payments', priorities: ['high'] },
  { name: '3. ISBN mismatch (brief)', bookId: 'BK004', subject: 'Different ISBN on Amazon',
    description: "My book is showing a different ISBN on Amazon than what's on the physical copy.",
    category: 'isbn_metadata', priorities: ['high', 'critical'] },
  { name: '4. Print quality (brief)', bookId: 'BK002', subject: 'Terrible print quality',
    description: 'I received my author copies and the print quality is terrible. The images are blurry and pages are misaligned.',
    category: 'printing_quality', priorities: ['high'] },
  { name: '5. Unavailable on Amazon (brief)', bookId: 'BK001', subject: 'Currently Unavailable on Amazon',
    description: 'My book is published but it\'s showing as "Currently Unavailable" on Amazon.',
    category: 'distribution_availability', priorities: ['high'] },
  { name: '6. Stuck in typesetting (brief)', bookId: 'BK015', subject: 'Still in typesetting',
    description: "It's been 3 weeks and my book is still in typesetting. When will it be done?",
    category: 'book_status_production', priorities: ['medium'] },
  { name: '7. Update description (brief)', bookId: 'BK012', subject: 'Update book description',
    description: "Can I update the description of my book on Amazon after it's already live?",
    category: 'general_inquiry', priorities: ['low'] },
  { name: '8. Six months without royalty', bookId: 'BK005', subject: 'No royalty for 6 months',
    description: "I haven't received any royalty for 6 months. This is really not acceptable.",
    category: 'royalty_payments', priorities: ['critical'] },
  { name: '9. Bio change', bookId: null, authorId: 'AUTH006', subject: 'Can I update my author bio?',
    description: 'Hi, I would like to change the short author bio that appears on my book pages. Can I do that?',
    category: 'general_inquiry', priorities: ['low'] },
]

const pool = new pg.Pool({ connectionString: config.databaseUrl })
const logger = { info() {}, warn: console.warn, error: console.error }
const ai = createAiClient({ sdk: createSdk(config.anthropicApiKey, config.aiTimeoutMs), db: pool, logger, model: config.aiModel })
const fastify = { db: pool, log: logger, ai }

async function loadAuthorInputs(testCase) {
  const bookRow = testCase.bookId ? await pool.query('SELECT author_id FROM books WHERE id = $1', [testCase.bookId]) : null
  const authorId = testCase.authorId || bookRow.rows[0].author_id
  const author = (await pool.query(`SELECT name, city, joined_date AS "joinedDate" FROM authors WHERE id = $1`, [authorId])).rows[0]
  const authorBooks = (await pool.query(
    `SELECT id, title, isbn, genre, publication_date AS "publicationDate", status, production_stage AS "productionStage",
            mrp, author_royalty_per_copy AS "authorRoyaltyPerCopy", total_copies_sold AS "totalCopiesSold",
            total_royalty_earned AS "totalRoyaltyEarned", royalty_paid AS "royaltyPaid", royalty_pending AS "royaltyPending",
            last_royalty_payout_date AS "lastRoyaltyPayoutDate", print_partner AS "printPartner", available_on AS "availableOn"
     FROM books WHERE author_id = $1 ORDER BY id`, [authorId])).rows
  return { author, authorBooks }
}

// Numbers in the reply must appear somewhere in what we sent the model (FACTS or POLICY).
function findUngroundedNumbers(draft, promptText) {
  const normalise = (text) => text.replace(/,/g, '')
  const known = normalise(promptText)
  const numbers = normalise(draft).match(/\d+(\.\d+)?/g) || []
  return [...new Set(numbers)].filter((number) => !new RegExp(`(^|\\D)${number}(\\D|$)`).test(known))
}

function checkDraft(draft, firstName, promptText) {
  const words = draft.trim().split(/\s+/).length
  return {
    words,
    wordCountOk: words >= 90 && words <= 180,
    greetsByName: new RegExp(`\\b${firstName}\\b`).test(draft.split('\n')[0]),
    signedOff: /Warm regards,?\s*\n?\s*The BookLeaf Support Team/i.test(draft),
    noMarkdownHeadings: !/^#{1,6}\s/m.test(draft),
    placeholders: draft.match(/\[CONFIRM:[^\]]*\]/g) || [],
    ungroundedNumbers: findUngroundedNumbers(draft, promptText),
  }
}

const results = []
for (const testCase of CASES) {
  console.log(`Running ${testCase.name} ...`)
  const { author, authorBooks } = await loadAuthorInputs(testCase)
  const book = authorBooks.find((item) => item.id === testCase.bookId) || null

  // Classification
  let classification
  try {
    classification = { ...(await classifyWithAi(fastify, { id: null, subject: testCase.subject, description: testCase.description, bookStatus: book?.status })), source: 'ai' }
  } catch (error) {
    classification = { ...fallbackClassify(testCase.subject, testCase.description), source: `fallback (${error.code || error.message})` }
  }
  const classificationOk = classification.category === testCase.category && testCase.priorities.includes(classification.priority)

  // Draft, using the category the classifier chose, like the real flow
  const ticket = { id: null, subject: testCase.subject, description: testCase.description, category: classification.category, bookId: testCase.bookId }
  const inputs = { ticket, author, authorBooks, messages: [{ id: 'm0', senderRole: 'author', body: testCase.description, createdAt: new Date() }] }
  let draft = null
  let draftChecks = null
  try {
    const composed = await composeDraft(fastify, inputs, null)
    draft = composed.body
    const promptText = composed.prompt.system.map((block) => block.text).join('\n') + '\n' + composed.prompt.messages[0].content
    draftChecks = checkDraft(draft, author.name.split(' ')[0], promptText)
  } catch (error) {
    draft = `(no draft: ${error.code || error.message})`
  }
  results.push({ testCase, author, book, classification, classificationOk, draft, draftChecks })
}

const usage = (await pool.query(
  `SELECT purpose, count(*)::int AS calls, sum(input_tokens)::int AS input, sum(output_tokens)::int AS output,
          sum(cache_read_tokens)::int AS cached, round(avg(latency_ms))::int AS latency
   FROM ai_usage_log WHERE created_at > now() - interval '15 minutes' GROUP BY purpose ORDER BY purpose`)).rows
await pool.end()

const yesNo = (value) => (value ? 'yes' : 'NO')
const lines = [
  '# AI evaluation results',
  '',
  `Model: \`${config.aiModel}\` · Generated: ${new Date().toISOString()} · Script: \`npm run ai:eval\``,
  '',
  'The sample queries from the assignment brief (plus a 6-month royalty case and a bio change) were run through the real classifier and drafter against the seeded data. Each query is attached to a real book where one fits.',
  '',
  '## Classification',
  '',
  '| # | Query | Expected | Got | Source | Correct |',
  '|---|---|---|---|---|---|',
  ...results.map(({ testCase, classification, classificationOk }) =>
    `| ${testCase.name.split('.')[0]} | ${testCase.name.replace(/^\d+\.\s*/, '')} | ${testCase.category} / ${testCase.priorities.join(' or ')} | ${classification.category} / ${classification.priority} | ${classification.source} | ${yesNo(classificationOk)} |`),
  '',
  `Classification correct: **${results.filter((item) => item.classificationOk).length} / ${results.length}**`,
  '',
  '## Draft checks',
  '',
  'Automatic checks on each draft: 90 to 180 words, greets the author by first name, signed off, no markdown headings, and **every number in the reply appears in the facts or policy we sent** (so nothing is invented).',
  '',
  '| # | Words | In range | Greets by name | Sign-off | No headings | Placeholders | Numbers not in the facts |',
  '|---|---|---|---|---|---|---|---|',
  ...results.map(({ testCase, draftChecks }) => draftChecks
    ? `| ${testCase.name.split('.')[0]} | ${draftChecks.words} | ${yesNo(draftChecks.wordCountOk)} | ${yesNo(draftChecks.greetsByName)} | ${yesNo(draftChecks.signedOff)} | ${yesNo(draftChecks.noMarkdownHeadings)} | ${draftChecks.placeholders.length} | ${draftChecks.ungroundedNumbers.length === 0 ? 'none' : draftChecks.ungroundedNumbers.join(', ')} |`
    : `| ${testCase.name.split('.')[0]} | - | - | - | - | - | - | no draft |`),
  '',
  '## Usage during this run',
  '',
  '| Purpose | Calls | Input tokens | Output tokens | Cache-read tokens | Avg latency (ms) |',
  '|---|---|---|---|---|---|',
  ...usage.map((row) => `| ${row.purpose} | ${row.calls} | ${row.input ?? 0} | ${row.output ?? 0} | ${row.cached ?? 0} | ${row.latency ?? 0} |`),
  '',
  '## Drafts',
  '',
  ...results.flatMap(({ testCase, author, book, classification, draft }) => [
    `### ${testCase.name}`,
    '',
    `**Author:** ${author.name} · **Book:** ${book ? `${book.title} (${book.status})` : 'General / Account Level'}`,
    '',
    `> ${testCase.description}`,
    '',
    `**Classified as:** ${classification.category} / ${classification.priority} (${classification.source}) — ${classification.reasoning}`,
    '',
    '```text',
    draft,
    '```',
    '',
  ]),
]

const outputPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../docs/ai-eval-results.md')
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, lines.join('\n'))
console.log(`\nWrote ${outputPath}`)
console.log(`Classification correct: ${results.filter((item) => item.classificationOk).length} / ${results.length}`)
