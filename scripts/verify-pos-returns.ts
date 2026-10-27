import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { summarizeSaleReturns } from '../src/lib/utils/sale-returns'
import SaleReturnSummary from '../src/components/sale-return-summary'
import BadProductCards from '../src/components/admin/bad-product-cards'
import PosDeliveryFee from '../src/components/cashier/pos-delivery-fee'

const sale = { id: 'sale', inv_sale_items: [
  { id: 'a', product_id: 'product', product_name: 'Samsung M02 Display', quantity: 2 },
  { id: 'b', product_id: 'product', product_name: 'Samsung A02 Display', quantity: 3 },
] }
const events = [
  { id: 'event-a', reference_id: 'sale', product_id: 'product', sale_item_id: 'b', type: 'return_damaged', quantity: 2, refund_amount: 500 },
  { id: 'legacy', reference_id: 'sale', product_id: 'product', type: 'return_good', quantity: 1 },
  { id: 'other', reference_id: 'other-sale', product_id: 'product', type: 'return_good', quantity: 99 },
]
const updated = summarizeSaleReturns(sale, events)
assert.equal(updated.return_good_quantity, 1)
assert.equal(updated.return_bad_quantity, 2)
assert.equal(updated.inv_sale_items[0].remaining_returnable_quantity, 1)
assert.equal(updated.inv_sale_items[1].remaining_returnable_quantity, 1)
assert.equal(updated.inv_sale_items[1].returned_bad_quantity, 2)
assert.equal(updated.returns[0].product_name, 'Samsung A02 Display')
assert.equal(summarizeSaleReturns(sale, []).inv_sale_items[0].remaining_returnable_quantity, 2)
const history = renderToStaticMarkup(createElement(SaleReturnSummary, { sale: updated }))
assert.match(history, /Good returns: 1/)
assert.match(history, /Bad returns: 2/)
assert.match(history, /Bad — damaged stock/)
assert.match(history, /500\.00/)
const cards = renderToStaticMarkup(createElement(BadProductCards, { items: [
  { product_id: 'product', quantity: 7, damaged_quantity: 2, products: { name: 'Display', barcode: '000206' } },
] }))
assert.match(cards, /lg:grid-cols-4/)
assert.match(cards, /Bad quantity: 2/)
assert.match(cards, /Good stock: 7/)
assert.match(cards, /000206/)
const fee = renderToStaticMarkup(createElement(PosDeliveryFee, {
  value: '125.50', onChange: () => {}, onReset: () => {}, disabled: false, invalid: false, overridden: true,
}))
assert.match(fee, /Use admin default/)
assert.match(fee, /value="125.50"/)
assert.doesNotMatch(fee, /disabled=""/)
console.log('PASS: exact-line/legacy return summaries, history conditions/refunds, four-column bad-product cards, editable fee and default reset.')
