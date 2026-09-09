const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const orderReader = require('../middleware/orderReader');

function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

function fixture() {
  const routes = {};
  const queries = [];
  const invoices = [];
  const router = { get: (url, ...handlers) => { routes[url] = handlers; }, put() {}, post() {}, delete() {} };
  const db = { promise: () => ({ query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('FROM admin_order_items')) return [[{ name: 'Admin Tent', price: 100, quantity: 1 }]];
    if (sql.includes('FROM salesman_order_items')) return [[{ name: 'Salesman Tent', price: 100, quantity: 1 }]];
    if (sql.includes('FROM salesman_orders') && sql.includes('WHERE o.customer_id = ?')) {
      return [[{ id: 25, customer_id: 7, order_number: 'SALESMAN-25', tax: 18, address_line1: 'Snapshot Road' }]];
    }
    if (params[0] !== '25' || (params.length > 1 && params[1] !== 7)) return [[]];
    return [[{ id: 25, customer_id: 7, order_number: sql.includes('FROM salesman_orders') ? 'SALESMAN-25' : sql.includes('FROM admin_orders') ? 'ADMIN-25' : 'CUSTOMER-25', tax: 18, items: '[]', address_line1: 'Snapshot Road' }]];
  } }) };
  const imports = {
    express: { Router: () => router }, '../db': db,
    '../middleware/auth': { adminOnly: [] }, '../middleware/orderReader': orderReader,
    './invoiceRoutes': { getOrCreateInvoiceNumber: async data => { invoices.push(data); return 'INV-25'; } },
    '../services/staffOrderPresentation': { ensureStaffOrderSnapshotColumns: async () => {}, enrichStaffOrderItems: async (_connection, table) => {
      const [items] = await db.promise().query(`SELECT * FROM ${table}`, ['25']); return items;
    } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/customerorderRoutes.js'), 'utf8'), {
    require: name => { if (!(name in imports)) throw new Error(name); return imports[name]; }, module: { exports: {} }, console,
  });
  return { routes, queries, invoices };
}

for (const source of ['customer', 'admin', 'salesman']) {
  test(`overlapping ID resolves only the ${source} order with customer ownership`, async () => {
    const f = fixture(); const res = response();
    await f.routes['/:id'].at(-1)({ params: { id: '25' }, query: { source }, orderCustomerId: 7 }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.data.orderSource, source);
    assert.equal(res.body.data.order_number, `${source.toUpperCase()}-25`);
    assert.equal(f.invoices[0].orderSource, source);
    assert.match(f.queries[0].sql, /AND o.customer_id = \?/);
    if (source === 'admin' || source === 'salesman') assert.equal(res.body.data.gst, 18);
  });
}

test('customer order history includes salesman orders assigned to that customer', async () => {
  const f = fixture(); const res = response();
  await f.routes['/customer/:customerId'].at(-1)({ params: { customerId: '7' }, orderCustomerId: 7 }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].orderSource, 'salesman');
  assert.equal(res.body.data[0].customer_id, 7);
  assert.equal(res.body.data[0].items[0].name, 'Salesman Tent');
  assert.equal(f.invoices[0].orderId, 25);
  assert.equal(f.invoices[0].orderSource, 'salesman');
});
test('missing or another customer’s order does not fall back to a different source', async () => {
  for (const [id, owner] of [['25', 8], ['999', 7]]) {
    const f = fixture(); const res = response();
    await f.routes['/:id'].at(-1)({ params: { id }, query: { source: 'admin' }, orderCustomerId: owner }, res);
    assert.equal(res.code, 404);
    assert.equal(f.queries.length, 1);
    assert.equal(f.invoices.length, 0);
  }
});
test('invalid source is rejected before database access', async () => {
  const f = fixture(); const res = response();
  await f.routes['/:id'].at(-1)({ params: { id: '25' }, query: { source: 'other' }, orderCustomerId: 7 }, res);
  assert.equal(res.code, 400);
  assert.equal(f.queries.length, 0);
});
test('customer cannot request another customer’s list', async () => {
  const f = fixture(); const res = response();
  await f.routes['/customer/:customerId'].at(-1)({ params: { customerId: '8' }, orderCustomerId: 7 }, res);
  assert.equal(res.code, 403);
  assert.equal(f.queries.length, 0);
});
test('customer login token scopes reads; missing credentials are rejected', () => {
  const req = { headers: { authorization: `Bearer ${jwt.sign({ id: 7 }, process.env.JWT_SECRET || 'my_super_secret_key')}` } };
  let called = false;
  orderReader(req, response(), () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.orderCustomerId, 7);
  const res = response();
  orderReader({ headers: {} }, res, () => assert.fail('unauthenticated'));
  assert.equal(res.code, 401);
});

test('legacy links default to customer orders, while staff reads retain admin access', async () => {
  const f = fixture(); const res = response();
  await f.routes['/:id'].at(-1)({ params: { id: '25' }, query: {}, orderCustomerId: 7 }, res);
  assert.equal(res.body.data.orderSource, 'customer');
  let allowed = false;
  orderReader({ headers: { authorization: `Bearer ${jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET || 'your_secret_key_here')}` } }, response(), () => { allowed = true; });
  assert.equal(allowed, true);
});

test('customer list, details and invoice keep the source discriminator', () => {
  const root = path.join(__dirname, '../../supertenthouse-mobileapp/app');
  const list = fs.readFileSync(path.join(root, '(tabs)/orders.tsx'), 'utf8');
  const details = fs.readFileSync(path.join(root, 'order-details/[id].tsx'), 'utf8');
  assert.match(list, /\?source=\$\{item.orderSource/);
  assert.match(list, /keyExtractor=.*item.orderSource/);
  assert.match(details, /params: \{ source \}/);
  assert.match(list, /'salesman'/);
  assert.match(details, /'customer', 'admin', 'salesman'/);
  assert.equal((details.match(/orderSource: order.orderSource/g) || []).length, 2);
});
