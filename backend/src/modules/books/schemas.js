const bookSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    isbn: { type: ['string', 'null'] },
    genre: { type: ['string', 'null'] },
    publicationDate: { type: ['string', 'null'], description: 'null while the book is in production' },
    status: { type: 'string' },
    productionStage: { type: ['string', 'null'], description: 'set only for books in production' },
    mrp: { type: ['integer', 'null'] },
    authorRoyaltyPerCopy: { type: ['integer', 'null'] },
    totalCopiesSold: { type: 'integer' },
    totalRoyaltyEarned: { type: 'integer' },
    royaltyPaid: { type: 'integer' },
    royaltyPending: { type: 'integer' },
    lastRoyaltyPayoutDate: { type: ['string', 'null'] },
    printPartner: { type: ['string', 'null'] },
    availableOn: { type: 'array', items: { type: 'string' } },
    nextPayoutDate: { type: ['string', 'null'] },
    belowPayoutThreshold: { type: 'boolean' },
  },
}

const royaltySummarySchema = {
  type: 'object',
  description: "Author-level totals. The 1,000 minimum payout applies to the author's total pending, not per book.",
  properties: {
    totalPending: { type: 'integer' },
    nextPayoutDate: { type: ['string', 'null'] },
    belowPayoutThreshold: { type: 'boolean' },
  },
}

export const listBooksSchema = {
  tags: ['Books'],
  summary: "List the logged-in author's books",
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: { summary: royaltySummarySchema, books: { type: 'array', items: bookSchema } },
    },
  },
}

export const getBookSchema = {
  tags: ['Books'],
  summary: "Get one of the logged-in author's books",
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['bookId'],
    properties: { bookId: { type: 'string', minLength: 1, maxLength: 20, examples: ['BK001'] } },
  },
  response: { 200: { type: 'object', properties: { book: bookSchema } } },
}
