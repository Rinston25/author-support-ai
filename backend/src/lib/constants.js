// Single source of truth for category / priority / status values.
// The SQL CHECK constraints in 001_init.sql must list the same values.
export const CATEGORY_LABELS = {
  royalty_payments: 'Royalty & Payments',
  isbn_metadata: 'ISBN & Metadata Issues',
  printing_quality: 'Printing & Quality',
  distribution_availability: 'Distribution & Availability',
  book_status_production: 'Book Status & Production Updates',
  general_inquiry: 'General Inquiry',
}
export const CATEGORIES = Object.keys(CATEGORY_LABELS)

// Ordered most to least urgent; the queue sorts by position in this list.
export const PRIORITIES = ['critical', 'high', 'medium', 'low']

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed']
