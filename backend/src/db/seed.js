// Seeds the dataset, one login per author, two admins and a few demo tickets.
// Safe to run repeatedly: it empties the tables first. Never calls the AI:
// demo tickets get fixed classifications.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { config } from '../config.js'

const AUTHOR_PASSWORD = 'Author@123'
const ADMIN_PASSWORD = 'Admin@123'

// The raw dataset is not committed (see .gitignore), so allow overriding its location.
const defaultDataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../bookleaf_sample_data.json')
const dataPath = process.env.SEED_DATA_PATH || defaultDataPath

// "In Production - Cover Design" -> "Cover Design"; published books have no stage.
function parseProductionStage(status) {
  const prefix = 'In Production - '
  return status.startsWith(prefix) ? status.slice(prefix.length) : null
}

// Demo tickets. hoursAgo is the age of the ticket; replies are admin replies
// given as hours after the ticket was created.
const demoTickets = [
  {
    bookId: 'BK005',
    subject: "I haven't received any royalty",
    description: 'My book has been live since July 2024 and I have not received a single royalty payment. Can you tell me what is going on?',
    status: 'open', category: 'royalty_payments', priority: 'critical',
    reasoning: 'No payout since publication, well past the 45-day window.',
    hoursAgo: 30,
  },
  {
    bookId: 'BK016',
    subject: 'Why is my pending royalty not paid yet?',
    description: 'My dashboard shows a pending royalty but nothing has reached my bank account. When will I get it?',
    status: 'in_progress', category: 'royalty_payments', priority: 'medium',
    reasoning: 'Question about payout timing; pending amount is below the minimum threshold.',
    hoursAgo: 52, assignedToAdmin: 'admin@bookleaf.com',
    replies: [{
      hoursAfter: 6, aiAssisted: true,
      body: 'Thank you for reaching out. Your pending royalty is currently below our Rs 1,000 minimum payout threshold, so it rolls over to the next quarter and will be paid once the accumulated amount crosses the threshold. We will confirm the exact payout date in our next update.\n\nThe BookLeaf Support Team',
    }],
  },
  {
    bookId: 'BK004',
    subject: 'Different ISBN on Amazon than on my printed copy',
    description: 'The ISBN shown on the Amazon listing does not match the ISBN printed on the back of my physical copy.',
    status: 'in_progress', category: 'isbn_metadata', priority: 'high',
    reasoning: 'ISBN mismatch between listing and physical copy.',
    hoursAgo: 20, assignedToAdmin: 'ops@bookleaf.com',
    notes: ['Escalated to production team, waiting on their check of the registered ISBN.'],
  },
  {
    bookId: 'BK003',
    subject: 'Print quality of my author copies is poor',
    description: 'I received my author copies and the images are blurry and a few pages look misaligned.',
    status: 'resolved', category: 'printing_quality', priority: 'high',
    reasoning: 'Quality defects on received copies.',
    hoursAgo: 140, assignedToAdmin: 'admin@bookleaf.com',
    replies: [{
      hoursAfter: 10, aiAssisted: true,
      body: 'We are sorry about the quality of your copies. Please share a few photos of the defective pages. Once we verify them we will arrange a free reprint, which takes 5-7 business days.\n\nThe BookLeaf Support Team',
    }],
  },
  {
    bookId: 'BK001',
    subject: 'Book shows Currently Unavailable on Amazon',
    description: 'My book is published but Amazon India shows it as Currently Unavailable.',
    status: 'open', category: 'distribution_availability', priority: 'high',
    reasoning: 'Published book showing unavailable on a platform.',
    hoursAgo: 8,
  },
  {
    bookId: 'BK013',
    subject: 'When will my book be done?',
    description: 'It has been 3 weeks and my book is still at the cover design stage. When will it be done?',
    status: 'open', category: 'book_status_production', priority: 'medium',
    reasoning: 'Production timeline question.',
    // Shows the "guessed by rules" badge in the admin queue
    classificationStatus: 'fallback', source: 'fallback',
    hoursAgo: 4,
  },
  {
    bookId: 'BK002',
    subject: 'Can I update my book description?',
    description: 'My book is already live. Can I still change the description shown on Amazon?',
    status: 'closed', category: 'isbn_metadata', priority: 'low',
    reasoning: 'Routine description update request.',
    hoursAgo: 200, assignedToAdmin: 'ops@bookleaf.com',
    replies: [{
      hoursAfter: 5, aiAssisted: false,
      body: 'Yes, you can. Metadata updates can be submitted through the dashboard or by emailing us, and changes usually reflect on platforms within 3-5 business days.\n\nThe BookLeaf Support Team',
    }],
  },
  {
    authorId: 'AUTH006', bookId: null,
    subject: 'How do I link my bank account?',
    description: 'I want to make sure my bank details are linked so royalties reach the right account. Where do I do this?',
    status: 'open', category: 'general_inquiry', priority: 'low',
    reasoning: 'Account question.',
    // An admin corrected the AI here, so the queue shows "overridden"
    source: 'admin',
    hoursAgo: 2,
  },
]

async function seed() {
  const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
  const client = new pg.Client({ connectionString: config.databaseUrl })
  await client.connect()

  try {
    await client.query('BEGIN')
    await client.query('TRUNCATE ai_usage_log, ai_drafts, ticket_attachments, internal_notes, ticket_messages, tickets, books, users, authors CASCADE')

    // Same demo password for everyone, so hash once per password
    const authorHash = await bcrypt.hash(AUTHOR_PASSWORD, 10)
    const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10)

    // Authors, their login users and their books
    for (const author of dataset.authors) {
      await client.query(
        `INSERT INTO authors (id, name, email, phone, city, joined_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [author.author_id, author.name, author.email, author.phone, author.city, author.joined_date],
      )
      await client.query(
        `INSERT INTO users (email, password_hash, role, name, author_id)
         VALUES ($1, $2, 'author', $3, $4)`,
        [author.email.toLowerCase(), authorHash, author.name, author.author_id],
      )

      for (const book of author.books) {
        await client.query(
          `INSERT INTO books (id, author_id, title, isbn, genre, publication_date, status, production_stage,
             mrp, author_royalty_per_copy, total_copies_sold, total_royalty_earned, royalty_paid,
             royalty_pending, last_royalty_payout_date, print_partner, available_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            book.book_id, author.author_id, book.title, book.isbn, book.genre, book.publication_date,
            book.status, parseProductionStage(book.status), book.mrp, book.author_royalty_per_copy,
            book.total_copies_sold, book.total_royalty_earned, book.royalty_paid, book.royalty_pending,
            book.last_royalty_payout_date, book.print_partner, book.available_on || [],
          ],
        )
      }
    }

    // Admins
    const adminIds = {}
    for (const [email, name] of [['admin@bookleaf.com', 'BookLeaf Admin'], ['ops@bookleaf.com', 'BookLeaf Ops']]) {
      const result = await client.query(
        `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, 'admin', $3) RETURNING id`,
        [email, adminHash, name],
      )
      adminIds[email] = result.rows[0].id
    }

    // Demo tickets
    for (const demo of demoTickets) {
      await insertDemoTicket(client, demo, adminIds)
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }

  console.log(`Seeded ${dataset.authors.length} authors, ${demoTickets.length} demo tickets.`)
  console.log('\nTest credentials')
  console.log(`  Admin:  admin@bookleaf.com / ${ADMIN_PASSWORD}   (also ops@bookleaf.com)`)
  console.log(`  Author: ${dataset.authors[0].email} / ${AUTHOR_PASSWORD}   (every author uses this password)`)
}

async function insertDemoTicket(client, demo, adminIds) {
  // Take the author from the book so ticket and book always agree
  let authorId = demo.authorId
  if (demo.bookId) {
    const bookRow = await client.query('SELECT author_id FROM books WHERE id = $1', [demo.bookId])
    authorId = bookRow.rows[0].author_id
  }
  const authorUser = await client.query('SELECT id FROM users WHERE author_id = $1', [authorId])
  const authorUserId = authorUser.rows[0].id

  const source = demo.source || 'ai'
  const classificationStatus = demo.classificationStatus || 'done'
  const assignedTo = demo.assignedToAdmin ? adminIds[demo.assignedToAdmin] : null
  const replies = demo.replies || []
  const isFinished = demo.status === 'resolved' || demo.status === 'closed'

  const ticketRow = await client.query(
    `INSERT INTO tickets (author_id, book_id, subject, description, status, category, priority,
       classification_status, category_source, priority_source, ai_reasoning, assigned_to,
       created_at, updated_at, first_response_at, resolved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,
       now() - make_interval(hours => $12),
       now() - make_interval(hours => $12) + make_interval(hours => $13),
       CASE WHEN $14::int > 0 THEN now() - make_interval(hours => $12) + make_interval(hours => $14::int) END,
       CASE WHEN $15 THEN now() - make_interval(hours => $12) + make_interval(hours => $13) END)
     RETURNING id`,
    [
      authorId, demo.bookId, demo.subject, demo.description, demo.status, demo.category, demo.priority,
      classificationStatus, source, demo.reasoning, assignedTo,
      demo.hoursAgo,
      replies.length > 0 ? replies[replies.length - 1].hoursAfter : 0,
      replies.length > 0 ? replies[0].hoursAfter : 0,
      isFinished,
    ],
  )
  const ticketId = ticketRow.rows[0].id

  // The author's original description is the first message in the thread
  await client.query(
    `INSERT INTO ticket_messages (ticket_id, sender_user_id, sender_role, body, created_at)
     VALUES ($1, $2, 'author', $3, now() - make_interval(hours => $4))`,
    [ticketId, authorUserId, demo.description, demo.hoursAgo],
  )

  for (const reply of replies) {
    await client.query(
      `INSERT INTO ticket_messages (ticket_id, sender_user_id, sender_role, body, ai_assisted, created_at)
       VALUES ($1, $2, 'admin', $3, $4, now() - make_interval(hours => $5) + make_interval(hours => $6))`,
      [ticketId, assignedTo, reply.body, reply.aiAssisted, demo.hoursAgo, reply.hoursAfter],
    )
  }

  for (const noteBody of demo.notes || []) {
    await client.query(
      'INSERT INTO internal_notes (ticket_id, admin_user_id, body) VALUES ($1, $2, $3)',
      [ticketId, assignedTo, noteBody],
    )
  }
}

await seed()
