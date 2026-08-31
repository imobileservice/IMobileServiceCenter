/**
 * Did the cleanup actually lose any compatibility?
 *
 *   npx tsx scripts/check-compat-loss.ts
 *
 * The before/after snapshots record pairs by NAME, so a rename ("A50 W/F" ->
 * "A50") looks like one pair lost and one gained. This compares the CLEANED
 * name on both sides, so renames cancel out and only real losses remain.
 */

import fs from 'fs'
import path from 'path'
import { normalizeModelName, stripBrandPrefix } from '../src/server/api/utils/compatibility'

const read = (label: string) => {
  const file = path.join('scripts', `.compat-${label}.json`)
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file} - run: npx tsx scripts/snapshot-compat.ts ${label}`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/** "<product-id>::<brand> <model>" -> same, with the model name cleaned. */
const cleanPair = (pair: string): string => {
  const [productId, rest = ''] = pair.split('::')
  const words = rest.trim().split(/\s+/)
  const brand = words[0] || ''
  const model = words.slice(1).join(' ')
  const cleaned = normalizeModelName(stripBrandPrefix(model, brand))
  return `${productId}::${brand} ${cleaned}`.toLowerCase()
}

const before = read('before')
const after = read('after')

const beforeSet = new Set<string>(before.pairs.map(cleanPair))
const afterSet = new Set<string>(after.pairs.map(cleanPair))

const lost = [...beforeSet].filter((p) => !afterSet.has(p))
const gained = [...afterSet].filter((p) => !beforeSet.has(p))

console.log('compared on CLEANED names, so renames cancel out\n')
console.log('  distinct pairs before :', beforeSet.size)
console.log('  distinct pairs after  :', afterSet.size)
console.log('\n  GENUINELY LOST        :', lost.length)
for (const p of lost) console.log('    -', p)
console.log('\n  genuinely gained      :', gained.length)
for (const p of gained) console.log('    +', p)
