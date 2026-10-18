import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fallbackClassify } from '../src/ai/fallbackClassifier.js'
import { validateClassification } from '../src/ai/classifier.js'

test('royalty words map to royalty_payments', () => {
  const result = fallbackClassify('Where is my payment?', 'I have not been paid for my book.')
  assert.equal(result.category, 'royalty_payments')
  assert.equal(result.priority, 'high')
})

test('an ISBN complaint is high priority, even if it also mentions payment', () => {
  const result = fallbackClassify('Wrong ISBN', 'The ISBN on Amazon is different and my payment is linked to it')
  assert.equal(result.category, 'isbn_metadata')
  assert.equal(result.priority, 'high')
})

test('print defects map to printing_quality', () => {
  assert.equal(fallbackClassify('Bad copies', 'The pages are blurry').category, 'printing_quality')
  assert.equal(fallbackClassify('Bad copies', 'The binding fell apart').category, 'printing_quality')
})

test('listing words map to distribution_availability', () => {
  assert.equal(fallbackClassify('Not on Flipkart', 'It is unavailable').category, 'distribution_availability')
})

test('production words map to book_status_production with medium priority', () => {
  const result = fallbackClassify('Update?', 'Still at typesetting after 3 weeks')
  assert.equal(result.category, 'book_status_production')
  assert.equal(result.priority, 'medium')
})

test('no keyword falls back to general_inquiry / medium', () => {
  const result = fallbackClassify('Hello there', 'Just saying thanks for everything')
  assert.equal(result.category, 'general_inquiry')
  assert.equal(result.priority, 'medium')
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
