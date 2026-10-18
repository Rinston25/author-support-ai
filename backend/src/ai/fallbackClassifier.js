// Keyword rules used whenever the AI can't answer (no key, outage, rate limit,
// open circuit, or invalid output). Deliberately simple and predictable: it is a
// safety net, not a second classifier. Tickets it handles are flagged
// "guessed by rules" in the admin queue so a human double-checks them.
//
// Order matters, most specific first: an ISBN complaint that mentions "paid"
// is still an ISBN complaint, and "amazon" appears in many royalty questions.
const RULES = [
  { pattern: /isbn/, category: 'isbn_metadata', priority: 'high' },
  { pattern: /royalt|payment|\bpaid\b|payout/, category: 'royalty_payments', priority: 'high' },
  { pattern: /blurry|misprint|binding|misalign|print quality/, category: 'printing_quality', priority: 'high' },
  { pattern: /unavailable|amazon|flipkart/, category: 'distribution_availability', priority: 'high' },
  { pattern: /typesetting|cover|proof|status/, category: 'book_status_production', priority: 'medium' },
]

export function fallbackClassify(subject, description) {
  const text = `${subject} ${description}`.toLowerCase()

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return {
        category: rule.category,
        priority: rule.priority,
        reasoning: `Keyword rule matched (${rule.category}); please verify.`,
      }
    }
  }

  // Nothing matched: medium rather than low, so an unknown ticket is not buried
  return {
    category: 'general_inquiry',
    priority: 'medium',
    reasoning: 'No keyword rule matched; please verify.',
  }
}
