import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATEGORIES } from '../lib/constants.js'

// The knowledge base is a handful of small markdown files. They are read once
// at startup and kept in memory: no disk access per ticket, and a missing file
// crashes the boot (loudly) instead of silently weakening every draft.
const folder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'knowledge-base')

function readFile(name) {
  return fs.readFileSync(path.join(folder, name), 'utf8').trim()
}

const company = readFile('company.md')
const tone = readFile('tone.md')

// One file per category, named after the category key
const sections = {}
for (const category of CATEGORIES) {
  sections[category] = readFile(`${category}.md`)
}

// examples.md is split into blocks that each start with "## Example" and carry
// a "category: <key>" line.
const examples = readFile('examples.md')
  .split(/^## Example$/m)
  .slice(1)
  .map((block) => {
    const category = block.match(/^category:\s*(\w+)/m)?.[1]
    return { category, text: block.replace(/^category:.*\n/m, '').trim() }
  })
  .filter((example) => CATEGORIES.includes(example.category))

export function getCompany() {
  return company
}

export function getTone() {
  return tone
}

// Only the section for this category: never the whole knowledge base, so each
// draft stays small and focused on the policy that actually applies.
export function getSection(category) {
  return sections[category] || sections.general_inquiry
}

export function getExamples(category, limit = 2) {
  return examples.filter((example) => example.category === category).slice(0, limit).map((example) => example.text)
}
