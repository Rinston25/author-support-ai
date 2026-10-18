// Keyword rules used whenever the AI can't answer (no key, outage, rate limit,
// open circuit, or invalid output). Deliberately simple and predictable: it is a
// safety net, not a second classifier. Tickets it handles are flagged
// "guessed by rules" in the admin queue so a human double-checks them.
//
// Order matters, most specific first: an ISBN complaint that mentions "paid" is
// still an ISBN complaint, and a royalty question that mentions "amazon" is
// still a royalty question.
const MONEY_WORDS = /\b(royalty|royalties|payment|payments|paid|payout|payouts|bank)\b/

// "Money is missing for a long time" is the one royalty case that is critical
const MISSING_LONG_TIME = /\b(not received|haven['’]?t received|have not received|never received|months?)\b/

const RULES = [
  { test: (text) => /\bisbn\b/.test(text), category: 'isbn_metadata', priority: 'high' },
  { test: (text) => MONEY_WORDS.test(text) && MISSING_LONG_TIME.test(text), category: 'royalty_payments', priority: 'critical' },
  { test: (text) => MONEY_WORDS.test(text), category: 'royalty_payments', priority: 'high' },
  { test: (text) => /\b(blurry|misprint|misprints|binding|pages|quality|defect|defects|defective)\b/.test(text), category: 'printing_quality', priority: 'high' },
  { test: (text) => /\b(unavailable|out of stock|amazon|flipkart|listing)\b/.test(text), category: 'distribution_availability', priority: 'high' },
  { test: (text) => /\b(typesetting|cover|proof|proofs|editing|status|stage|delay|delayed)\b/.test(text), category: 'book_status_production', priority: 'medium' },
  { test: (text) => /\b(bio|description|update)\b/.test(text), category: 'general_inquiry', priority: 'low' },
]

const FALLBACK_REASONING = 'Classified by keyword rules (AI unavailable)'

export function fallbackClassify(subject, description) {
  const text = `${subject} ${description}`.toLowerCase()

  for (const rule of RULES) {
    if (rule.test(text)) {
      return { category: rule.category, priority: rule.priority, reasoning: FALLBACK_REASONING }
    }
  }

  // Nothing matched: medium rather than low, so an unknown ticket is not buried
  return { category: 'general_inquiry', priority: 'medium', reasoning: FALLBACK_REASONING }
}
