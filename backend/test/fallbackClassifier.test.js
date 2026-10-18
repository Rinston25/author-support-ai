import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fallbackClassify } from '../src/ai/fallbackClassifier.js'
import { validateClassification } from '../src/ai/classifier.js'

// One test per row of the rules table, in the same order.

test('rule 1: isbn -> isbn_metadata / high', () => {
  const result = fallbackClassify('Wrong ISBN', 'The ISBN on Amazon is different from my copy')
  assert.deepEqual([result.category, result.priority], ['isbn_metadata', 'high'])
})

test('rule 1 beats the money rule: an ISBN complaint that mentions payment is still ISBN', () => {
  const result = fallbackClassify('Wrong ISBN', 'The ISBN is wrong and I was paid on the wrong book')
  assert.equal(result.category, 'isbn_metadata')
})

test('rule 2: money word + "not received" -> royalty_payments / critical', () => {
  const result = fallbackClassify('Royalty', "I haven't received any royalty for my book")
  assert.deepEqual([result.category, result.priority], ['royalty_payments', 'critical'])
})

test('rule 2: money word + months -> critical', () => {
  const result = fallbackClassify('Payment', 'Still no payout after 6 months')
  assert.deepEqual([result.category, result.priority], ['royalty_payments', 'critical'])
})

test('rule 3: money word alone -> royalty_payments / high', () => {
  const result = fallbackClassify('Royalty amount', 'My royalty seems too low for 200 copies')
  assert.deepEqual([result.category, result.priority], ['royalty_payments', 'high'])
})

test('rule 3: bank and payout also count as money words', () => {
  assert.equal(fallbackClassify('Bank', 'Where do I add my bank details?').category, 'royalty_payments')
  assert.equal(fallbackClassify('Payout', 'When is the next payout?').category, 'royalty_payments')
})

test('rule 4: print defect words -> printing_quality / high', () => {
  for (const word of ['blurry', 'misprint', 'binding', 'pages', 'quality', 'defect']) {
    const result = fallbackClassify('Copies', `The ${word} is a problem`)
    assert.deepEqual([word, result.category, result.priority], [word, 'printing_quality', 'high'])
  }
})

test('rule 5: availability words -> distribution_availability / high', () => {
  for (const word of ['unavailable', 'out of stock', 'amazon', 'flipkart', 'listing']) {
    const result = fallbackClassify('Book', `My book is ${word} right now`)
    assert.deepEqual([word, result.category, result.priority], [word, 'distribution_availability', 'high'])
  }
})

test('rule 6: production words -> book_status_production / medium', () => {
  for (const word of ['typesetting', 'cover', 'proof', 'editing', 'status', 'stage', 'delay']) {
    const result = fallbackClassify('Question', `Where are we with the ${word}?`)
    assert.deepEqual([word, result.category, result.priority], [word, 'book_status_production', 'medium'])
  }
})

test('rule 7: bio / description / update -> general_inquiry / low', () => {
  for (const word of ['bio', 'description', 'update']) {
    const result = fallbackClassify('Request', `Please change my ${word}`)
    assert.deepEqual([word, result.category, result.priority], [word, 'general_inquiry', 'low'])
  }
})

test('rule 8: nothing matches -> general_inquiry / medium', () => {
  const result = fallbackClassify('Hello there', 'Just saying thanks for everything')
  assert.deepEqual([result.category, result.priority], ['general_inquiry', 'medium'])
})

test('matching is case-insensitive and uses whole words', () => {
  assert.equal(fallbackClassify('ISBN', 'WRONG ISBN').category, 'isbn_metadata')
  // "unpaid" and "bankrupt" must not trigger the money rule
  assert.equal(fallbackClassify('Hi', 'Nothing about unpaid or bankrupt things').category, 'general_inquiry')
})

test('every result carries the standard reasoning', () => {
  assert.equal(fallbackClassify('a', 'b').reasoning, 'Classified by keyword rules (AI unavailable)')
})

test('model output is validated before it is trusted', () => {
  assert.equal(validateClassification({ category: 'refunds', priority: 'high', reasoning: 'x' }), null)
  assert.equal(validateClassification({ category: 'royalty_payments', priority: 'urgent', reasoning: 'x' }), null)
  assert.equal(validateClassification(undefined), null)
})

test('valid model output passes, and reasoning is cut to 25 words', () => {
  const longReasoning = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ')
  const result = validateClassification({ category: 'royalty_payments', priority: 'critical', reasoning: longReasoning })
  assert.equal(result.category, 'royalty_payments')
  assert.equal(result.reasoning.split(' ').length, 25)
})
