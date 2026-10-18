// The drafter writes "[CONFIRM: ...]" wherever staff must check a fact before
// sending. Sending is blocked until every one has been resolved by a human.
const PLACEHOLDER_PATTERN = /\[CONFIRM:[^\]]*\]/gi

export function extractPlaceholders(text) {
  return text.match(PLACEHOLDER_PATTERN) || []
}

export function hasPlaceholders(text) {
  // A half-deleted "[CONFIRM:" also counts, so it can't slip through
  return /\[CONFIRM:/i.test(text)
}
