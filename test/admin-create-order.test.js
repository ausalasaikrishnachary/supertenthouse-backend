const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup(failRead = false) {
  let handler; const queries = [];
  const router = { post: (url, fn) => { handler = fn; }, get() {}, put() {}, delete() {} };
  const db = { promise: () => ({ query: async (sql, args) => {
    queries.push({ sql, args });
    if (sql.includes('INSERT INTO admin_orders')) return [{ insertId: 12 }];
    if (sql.includes('SELECT product_name')) return [[{ product_name: 'Test Tent', product_code: 'T', discount: 0 }]];
    if (sql.includes('SELECT * FROM admin_orders')) {
      if (failRead) throw new Error('fixture read failure');
      return [[{ id: 12 }]];
    }
    return [[]];
  } }) };
  const imports = { express: { Router: () => router }, '../db': db, '../middleware/auth': { adminOnly: [] }, './invoiceRoutes': { getOrCreateInvoiceNumber: async () => 'INV-TEST' } };
  imports['../services/adminOrderStatus'] = { handler() {} };
  imports['../services/salesmanNotificationService'] = { ensureSalesmanNotificationsTable: async () => {}, notifyAdminOrderCreated: require('../services/salesmanNotificationService').notifyAdminOrderCreated };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/orderRoutes.js'), 'utf8'), { require: id => imports[id], module: { exports: {} }, console });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  return { handler, queries, res };
}
const body = { customer_id: 1, total_amount: '999', items: [{ product_id: 2, quantity: 2, price: '100.00' }] };
test('order creation calculates numeric totals and reads response before commit', async () => {
  const f = setup(); await f.handler({ body }, f.res);
  assert.equal(f.res.code, 201);
  const insert = f.queries.find(q => q.sql.includes('INSERT INTO admin_orders'));
  assert.deepEqual(Array.from(insert.args).slice(2, 5), [200, 36, 236]);
  assert.ok(f.queries.findIndex(q => q.sql === 'COMMIT') > f.queries.findIndex(q => q.sql.includes('SELECT * FROM admin_order_items')));
});
test('a response-read failure rolls back rather than committing a hidden order', async () => {
  const f = setup(true); await f.handler({ body }, f.res);
  assert.equal(f.res.code, 500);
  assert.ok(f.queries.some(q => q.sql === 'ROLLBACK'));
  assert.ok(!f.queries.some(q => q.sql === 'COMMIT'));
});
test('invalid item payloads are rejected without database writes', async () => {
  for (const items of [{}, [{ product_id: 2, quantity: -1, price: 100 }]]) {
    const f = setup(); await f.handler({ body: { customer_id: 1, items } }, f.res);
    assert.equal(f.res.code, 400); assert.equal(f.queries.length, 0);
  }
});
