// Local integration check. Requires verify-pos-returns.sql in the disposable test database.
const { execFileSync, spawn } = require('node:child_process')
const assert = require('node:assert/strict')
const psql = process.env.POS_TEST_PSQL || 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
const args = ['-h', '127.0.0.1', '-p', '55439', '-U', 'pos_returns_test', '-d', 'pos_delivery_fee_test', '-v', 'ON_ERROR_STOP=1', '-At']
const run = sql => execFileSync(psql, [...args, '-c', sql], { encoding: 'utf8', windowsHide: true }).trim()
const product = '00000000-0000-0000-0000-000000000001'
const invoice = run(`SELECT process_sale(p_items := '[{"product_id":"${product}","quantity":1,"price":100}]')->>'invoice_number'`)
const call = `SELECT process_return_item('${invoice}', '${product}', 1, 'good')`
const processQuery = sql => new Promise(resolve => {
  const child = spawn(psql, [...args, '-c', sql], { windowsHide: true })
  let error = ''
  child.stdout.resume()
  child.stderr.on('data', value => { error += value })
  child.on('error', error => resolve({ code: -1, error: error.message }))
  child.on('close', code => resolve({ code, error }))
})
Promise.all([
  processQuery(`BEGIN; ${call}; SELECT pg_sleep(0.5); COMMIT;`),
  processQuery(call),
]).then(results => {
  assert.equal(results.filter(result => result.code === 0).length, 1)
  assert.match(results.find(result => result.code !== 0).error, /exceeds remaining returnable/)
  assert.equal(run(`SELECT SUM(m.quantity) FROM inv_stock_movements m JOIN inv_sales s ON s.id = m.reference_id WHERE s.invoice_number = '${invoice}' AND m.type = 'return_good'`), '1')
  console.log('PASS: two simultaneous returns allow exactly one refund and one restock.')
}).catch(error => { console.error(error); process.exitCode = 1 })
