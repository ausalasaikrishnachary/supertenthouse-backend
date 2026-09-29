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
  imports['../services/staffOrderPresentation'] = {
    addressFields: ['address_id'], addressValues: address => [address.address_id],
    ensureStaffOrderSnapshotColumns: async () => {}, getCustomerDeliveryAddress: async () => ({ address_id: 3 })
  };
  imports['../services/productVariants'] = { resolveOrderItemVariant: async (_connection, item) => ({ price: Number(item.price), selected_size: null, selected_color: null, selected_color_name: null, selected_color_image: null }) };
  // The real module: it reads no connection until a request arrives, so loading
  // it here keeps the create path's date validation under test rather than mocked.
  imports['../services/deliveryDate'] = require('../services/deliveryDate');
  imports['../services/colorCatalog'] = require('../services/colorCatalog');
  imports['../services/orderItemMedia'] = require('../services/orderItemMedia');
  // Orders carry a derived payment block now; the fixture has no ledger.
  imports['../services/orderPayments'] = {
    ...require('../services/orderPayments'),
    recordPayment: async () => { throw new Error('recordPayment should not run without an advance'); },
    parseAmount: (value, label) => (value === undefined || value === null || value === '' ? 0 : require('../services/orderPayments').parseAmount(value, label)),
    summarise: require('../services/orderPayments').summarise,
    attachPaymentSummaries: async (_connection, _source, orders) => orders
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/orderRoutes.js'), 'utf8'), { require: id => imports[id], module: { exports: {} }, console });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  return { handler, queries, res };
}
const body = { customer_id: 1, total_amount: '999', items: [{ product_id: 2, quantity: 2, price: '100.00' }] };
test('order creation calculates numeric totals and reads response before commit', async () => {
  const f = setup(); await f.handler({ body }, f.res);
  assert.equal(f.res.code, 201);
  const insert = f.queries.find(q => q.sql.includes('INSERT INTO admin_orders'));
  // Totals come from the line items, not the client's own total_amount of '999'.
  // No tax was quoted, so none is added: the stored total matches the form.
  assert.deepEqual(Array.from(insert.args).slice(2, 5), [200, 0, 200]);
  assert.ok(f.queries.findIndex(q => q.sql === 'COMMIT') > f.queries.findIndex(q => q.sql.includes('SELECT * FROM admin_order_items')));
});
test('a tax sent by the caller is ignored, because this business charges none', async () => {
  // There is no GST on an order. Even if a stale client still posts tax_amount,
  // it must not reach the total: the stored figures stay [subtotal, 0, subtotal].
  const f = setup();
  await f.handler({ body: { ...body, tax_amount: 36, gst: 36 } }, f.res);
  assert.equal(f.res.code, 201);
  const insert = f.queries.find(q => q.sql.includes('INSERT INTO admin_orders'));
  assert.deepEqual(Array.from(insert.args).slice(2, 5), [200, 0, 200]);
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
test('a promised delivery day is stored on the order it was agreed for', async () => {
  const f = setup();
  await f.handler({ body: { ...body, delivery_date: '2026-12-01' } }, f.res);
  assert.equal(f.res.code, 201);
  const insert = f.queries.find(q => q.sql.includes('INSERT INTO admin_orders'));
  assert.match(insert.sql, /delivery_date/);
  // the day follows the payment method and precedes the address snapshot
  assert.ok(Array.from(insert.args).includes('2026-12-01'));
});
test('an order with no promised day is created with a null one, not today', async () => {
  const f = setup(); await f.handler({ body }, f.res);
  assert.equal(f.res.code, 201);
  const insert = f.queries.find(q => q.sql.includes('INSERT INTO admin_orders'));
  // only the order date may hold a moment in time; the delivery date stays null
  const deliveryValue = Array.from(insert.args)[7];
  assert.equal(deliveryValue, null);
});
test('a delivery day that is not a real date is refused before anything is written', async () => {
  for (const bad of ['2026-02-31', 'next week', '2026-13-01']) {
    const f = setup();
    await f.handler({ body: { ...body, delivery_date: bad } }, f.res);
    assert.equal(f.res.code, 400, `${bad} must be refused`);
    assert.equal(f.queries.length, 0, `${bad} must not reach the database`);
  }
});
