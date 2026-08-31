/**
 * Sanity checks for the phone-model name cleaner.
 *
 *   npx tsx scripts/test-model-name.ts
 *
 * The risk is over-stripping: "10 4G" must keep its 4G, "F62" must keep its F.
 * Every case below is real shop data or a near miss of it.
 */

import { normalizeModelName, stripBrandPrefix } from '../src/server/api/utils/compatibility'

const cases: Array<[string, string, string]> = [
  // [ raw name, brand, expected ]
  ['M02 W/F', 'Samsung', 'M02'],
  ['10 4G W/F', 'Redmi', '10 4G'],
  ['A32 4G Incell', 'Samsung', 'A32 4G'],
  ['A51 oled', 'Samsung', 'A51'],
  ['NOT 14 5G INCELL', 'Redmi', 'NOT 14 5G'],
  ['M31/M21 OLED', 'Samsung', 'M31/M21'],
  ['G9A lcd', 'Umidigi', 'G9A'],
  ['samsung A32 W/F', 'Samsung', 'A32'],
  ['Redmi 13C', 'Redmi', '13C'],
  ['x5plus W/F', 'Honor', 'x5plus'],

  // Must NOT be touched
  ['Redmi Note 8', 'Xiaomi', 'Redmi Note 8'],
  ['10 4G', 'Redmi', '10 4G'],
  ['F62', 'Samsung', 'F62'],
  ['A03 Core', 'Samsung', 'A03 Core'],
  ['Note 10 Pro', 'Infinix', 'Note 10 Pro'],
  ['C71/C72', 'Realme', 'C71/C72'],
  ['A05s', 'Samsung', 'A05s'],
  ['Y17s', 'Vivo', 'Y17s'],
  ['15 4G/15 5G/Note 15R', 'Redmi', '15 4G/15 5G/Note 15R'],
  ['A337 30000mah', 'Aspor', 'A337 30000mah'],
  ['Blade A36/A56/A76 5G', 'ZTE', 'Blade A36/A56/A76 5G'],

  // Would empty the name - keep something rather than nothing
  ['Display', 'Samsung', 'Display'],
  ['W/F', 'Samsung', 'W/F'],
]

let pass = 0
let fail = 0

for (const [raw, brand, expected] of cases) {
  const got = normalizeModelName(stripBrandPrefix(raw, brand))
  if (got === expected) {
    pass++
  } else {
    fail++
    console.log(`FAIL  ${brand} "${raw}"  ->  "${got}"   (expected "${expected}")`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
