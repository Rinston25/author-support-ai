// Display labels. The keys match the values the API returns.
export const CATEGORY_LABELS = {
  royalty_payments: 'Royalty & Payments',
  isbn_metadata: 'ISBN & Metadata Issues',
  printing_quality: 'Printing & Quality',
  distribution_availability: 'Distribution & Availability',
  book_status_production: 'Book Status & Production Updates',
  general_inquiry: 'General Inquiry',
}

export const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const PRIORITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

// The production stages from the BookLeaf knowledge base, in order
export const PRODUCTION_STAGES = [
  'Manuscript Received',
  'Editing',
  'Cover Design',
  'Typesetting',
  'Proofreading',
  'ISBN Assignment',
  'Printing',
  'Distribution Setup',
  'Published & Live',
]

// Test logins shown on the sign-in page
export const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@bookleaf.com', password: 'Admin@123', note: 'Ops team: queue, AI drafts' },
  { label: 'Author: Priya Sharma', email: 'priya.sharma@email.com', password: 'Author@123', note: '2 published books' },
  { label: 'Author: Kavita Deshmukh', email: 'kavita.deshmukh@email.com', password: 'Author@123', note: 'Book in typesetting; pending royalty below ₹1,000' },
  { label: 'Author: Sneha Kulkarni', email: 'sneha.kulkarni@email.com', password: 'Author@123', note: 'Book in cover design' },
  { label: 'Author: Ananya Reddy', email: 'ananya.reddy@email.com', password: 'Author@123', note: 'No royalty paid yet' },
]
