// No database writes or credentials required. Run: npm run verify:supplier-stock
import assert from 'node:assert/strict'
import { PRODUCT_SELECT, resolveQuantity, toCatalogItem } from '../src/server/api/supplier/shop.shared'

const cases = [
  { name: 'missing inventory cannot use stale product stock', product: { stock: 12 }, expected: 0 },
  { name: 'null inventory cannot use stale product stock', product: { stock: 12, inv_stock: null }, expected: 0 },
  { name: 'empty inventory join cannot use stale product stock', product: { stock: 12, inv_stock: [] }, expected: 0 },
  { name: 'empty branches override stale totals', product: { stock: 12, inv_stock: { quantity: 12, qty_meegoda: 0, qty_padukka: 0, qty_padukka_new: 0 } }, expected: 0 },
  { name: 'array joins also use actual branch stock', product: { stock: 12, inv_stock: [{ quantity: 12, qty_meegoda: 0, qty_padukka: 0, qty_padukka_new: 0 }] }, expected: 0 },
  { name: 'only Meegoda contributes to supplier availability', product: { stock: 0, inv_stock: { quantity: 0, qty_meegoda: 2, qty_padukka: 3, qty_padukka_new: 4 } }, expected: 2 },
  { name: 'Padukka-only stock is unavailable to suppliers', product: { inv_stock: [{ quantity: 2, qty_meegoda: 0, qty_padukka: 2, qty_padukka_new: 0 }] }, expected: 0 },
  { name: 'Padukka New-only stock is unavailable to suppliers', product: { inv_stock: { quantity: 1, qty_meegoda: 0, qty_padukka: 0, qty_padukka_new: 1 } }, expected: 0 },
  { name: 'numeric strings use Meegoda only', product: { inv_stock: { qty_meegoda: '2', qty_padukka: '3', qty_padukka_new: '0' } }, expected: 2 },
  { name: 'missing Meegoda cannot use other branches or totals', product: { stock: 12, inv_stock: { quantity: 12, qty_padukka: 8, qty_padukka_new: 4 } }, expected: 0 },
  { name: 'Meegoda-only query remains available', product: { inv_stock: { qty_meegoda: 3 } }, expected: 3 },
  { name: 'invalid excluded branch cannot suppress Meegoda', product: { inv_stock: { qty_meegoda: 3, qty_padukka: 'invalid', qty_padukka_new: -1 } }, expected: 3 },
  { name: 'infinite Meegoda cannot confirm availability', product: { inv_stock: { qty_meegoda: Infinity, qty_padukka: 2 } }, expected: 0 },
  { name: 'null branches cannot revive a saved total', product: { inv_stock: { quantity: 12, qty_meegoda: null, qty_padukka: null, qty_padukka_new: null } }, expected: 0 },
  { name: 'invalid branch stock cannot confirm availability', product: { inv_stock: { qty_meegoda: 'invalid', qty_padukka: 2 } }, expected: 0 },
  { name: 'negative branch stock cannot confirm availability', product: { inv_stock: { qty_meegoda: -1, qty_padukka: 2 } }, expected: 0 },
  { name: 'infinite quantities cannot confirm availability', product: { inv_stock: { quantity: Infinity } }, expected: 0 },
  { name: 'legacy totals cannot confirm Meegoda availability', product: { stock: 0, inv_stock: { quantity: 3 } }, expected: 0 },
  { name: 'legacy zero overrides stale product stock', product: { stock: 12, inv_stock: [{ quantity: 0 }] }, expected: 0 },
  { name: 'null legacy quantity cannot use product stock', product: { stock: 12, inv_stock: { quantity: null } }, expected: 0 },
]

for (const { name, product, expected } of cases) {
  assert.equal(resolveQuantity(product), expected, name)
  const item = toCatalogItem({ id: 'test-product', name: 'Display', buy_price: 150, ...product })
  assert.equal(item.in_stock, expected > 0, name)
  assert.equal(item.inventory_price, 150, 'Trade pricing is preserved')
  assert.equal('quantity' in item, false, 'Stock counts remain private')
  for (const field of ['stock', 'qty_meegoda', 'qty_padukka', 'qty_padukka_new', 'inv_stock']) {
    assert.equal(field in item, false, `${field} remains private`)
  }
}

assert.match(PRODUCT_SELECT, /inv_stock\s*\(qty_meegoda\)/, 'Supplier queries read Meegoda stock only')
assert.doesNotMatch(PRODUCT_SELECT, /qty_padukka|quantity|\bstock\b/, 'Other branch stock and totals are excluded')

console.log(`PASS: ${cases.length} supplier stock regression cases`)
