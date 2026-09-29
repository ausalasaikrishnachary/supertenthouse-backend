const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Loads the router with a stubbed connection, so the real handlers run.
function setup({ role = 'admin', userId = 1, order = null, ledger = [] } = {}) {
  const routes = {};
  const auth = [];
  const queries = [];
  const rows = [...ledger];
  const router = {
    use(handler) { if (typeof handler === 'function') auth.push(handler); },
    get(url, fn) { routes[`GET ${url}`] = fn; },
    post(url, fn) { routes[`POST ${url}`] = fn; },
    put(url, fn) { routes[`PUT ${url}`] = fn; }
  };
  const connection = {
    async query(sql, args = []) {
      queries.push({ sql, args });
      const text = sql.replace(/\s+/g, ' ').trim();
      if (/information_schema\.tables/.test(text)) return [[{ count: 1 }]];
      if (/COALESCE\(SUM\(amount\)/.test(text)) {
        const [source] = args;
        const paid = rows
          .filter(row => row.order_source === source && !row.voided_at)
          .reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
        return [[{ order_id: Number(args[1]), total_paid: paid / 100 }]];
      }
      if (/FROM order_payments WHERE/.test(text)) {
        const [source, orderId, maybeId] = args;
        let found = rows.filter(row => row.order_source === source && String(row.order_id) === String(orderId));
        if (text.includes('voided_at IS NULL')) found = found.filter(row => !row.voided_at);
        if (maybeId !== undefined) found = found.filter(row => String(row.id) === String(maybeId));
        return [[...found]];
      }
      if (/UPDATE order_payments SET voided_at/.test(text)) {
        const [, , reason, paymentId, source, orderId] = args;
        const row = rows.find(r => String(r.id) === String(paymentId) && r.order_source === source && String(r.order_id) === String(orderId));
        if (row) { row.voided_at = new Date(); row.void_reason = reason; }
        return [{ affectedRows: row ? 1 : 0 }];
      }
      if (/UPDATE order_payments SET amount/.test(text)) {
        const [amount, , , paymentId, source, orderId] = args;
        const row = rows.find(r => String(r.id) === String(paymentId) && r.order_source === source && String(r.order_id) === String(orderId));
        if (row) row.amount = amount;
        return [{ affectedRows: row ? 1 : 0 }];
      }
      if (/SELECT \* FROM (\w+) WHERE id = \?/.test(text)) return [order ? [{ ...order }] : []];
      return [[]];
    }
  };
  const service = require('../services/orderPayments');
  const imports = {
    express: { Router: () => router },
    '../db': { promise: () => connection },
    '../middleware/paymentAuth': (req, res, next) => {
      req.user = { id: userId, role, email: `${role}@test.local` };
      return next();
    },
    '../services/orderPayments': {
      ...service,
      withTransaction: work => work(connection),
      lockOrderRow: async () => order
    }
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', read('routes/orderPayments.js'))(
    id => {
      if (!(id in imports)) throw new Error(`unexpected import: ${id}`);
      return imports[id];
    },
    module,
    module.exports
  );
  const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return { routes, res, auth, queries, req: { params: {}, body: {}, user: { id: userId, role } } };
}

const ownedByCustomer = { role: 'customer', userId: 7, order: { id: 5, customer_id: 7, grand_total: 1000 } };

test('every payment route sits behind the auth middleware', () => {
  const { routes, auth } = setup();
  assert.equal(auth.length, 1, 'expected one router-level auth guard covering all payment routes');
  assert.deepEqual(Object.keys(routes).sort(), [
    'GET /:source/:orderId',
    'POST /:source/:orderId',
    'POST /:source/:orderId/:paymentId/void',
    'PUT /:source/:orderId/:paymentId'
  ]);
});

test('a customer cannot pay somebody else\'s order', async () => {
  const { routes, res, req } = setup({ role: 'customer', userId: 7, order: { id: 5, customer_id: 99, grand_total: 1000 } });
  req.params = { source: 'customer', orderId: '5' };
  req.body = { amount: 100 };
  await routes['POST /:source/:orderId'](req, res);
  assert.equal(res.code, 403);
  assert.match(res.body.message, /permission/i);
});

test('a customer can pay their own order and sees the derived status come back', async () => {
  const { routes, res, req } = setup(ownedByCustomer);
  req.params = { source: 'customer', orderId: '5' };
  req.body = { amount: 100 };
  await routes['POST /:source/:orderId'](req, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.payment_status, 'partially_paid');
  assert.equal(res.body.data.balance_amount, 900);
});

test('a salesman cannot pay another salesman\'s order', async () => {
  const { routes, res, req } = setup({ role: 'salesman', userId: 4, order: { id: 5, salesman_id: 77, grand_total: 1000 } });
  req.params = { source: 'salesman', orderId: '5' };
  req.body = { amount: 100 };
  await routes['POST /:source/:orderId'](req, res);
  assert.equal(res.code, 403);
});

test('a salesman can pay their own order', async () => {
  const { routes, res, req } = setup({ role: 'salesman', userId: 4, order: { id: 5, salesman_id: 4, grand_total: 1000 } });
  req.params = { source: 'salesman', orderId: '5' };
  req.body = { amount: 100, mode: 'cash' };
  await routes['POST /:source/:orderId'](req, res);
  assert.equal(res.code, 201);
});

test('an admin can pay any order in any of the three sources', async () => {
  for (const source of ['customer', 'admin', 'salesman']) {
    const { routes, res, req } = setup({ role: 'admin', order: { id: 5, customer_id: 2, salesman_id: 3, grand_total: 1000 } });
    req.params = { source, orderId: '5' };
    req.body = { amount: 100 };
    await routes['POST /:source/:orderId'](req, res);
    assert.equal(res.code, 201, `expected an admin to pay a ${source} order`);
  }
});

test('a customer can add a payment but cannot correct or void a recorded one', async () => {
  const correction = setup(ownedByCustomer);
  correction.req.params = { source: 'customer', orderId: '5', paymentId: '3' };
  correction.req.body = { amount: 50 };
  await correction.routes['PUT /:source/:orderId/:paymentId'](correction.req, correction.res);
  assert.equal(correction.res.code, 403);

  const voided = setup(ownedByCustomer);
  voided.req.params = { source: 'customer', orderId: '5', paymentId: '3' };
  voided.req.body = { reason: 'changed my mind' };
  await voided.routes['POST /:source/:orderId/:paymentId/void'](voided.req, voided.res);
  assert.equal(voided.res.code, 403);
});

test('an admin may correct and void', async () => {
  const ledger = [{ id: 3, order_source: 'admin', order_id: 5, amount: 400, voided_at: null }];
  const correction = setup({ role: 'admin', order: { id: 5, grand_total: 1000 }, ledger });
  correction.req.params = { source: 'admin', orderId: '5', paymentId: '3' };
  correction.req.body = { amount: 50 };
  await correction.routes['PUT /:source/:orderId/:paymentId'](correction.req, correction.res);
  assert.equal(correction.res.code, 200);

  const voided = setup({ role: 'admin', order: { id: 5, grand_total: 1000 }, ledger });
  voided.req.params = { source: 'admin', orderId: '5', paymentId: '3' };
  voided.req.body = { reason: 'entered twice' };
  await voided.routes['POST /:source/:orderId/:paymentId/void'](voided.req, voided.res);
  assert.equal(voided.res.code, 200);
  assert.equal(voided.res.body.data.payment_status, 'pending');
  assert.equal(voided.res.body.data.balance_amount, 1000);
});

test('correcting a payment that does not exist is a 404', async () => {
  const { routes, res, req } = setup({ role: 'admin', order: { id: 5, grand_total: 1000 }, ledger: [] });
  req.params = { source: 'admin', orderId: '5', paymentId: '999' };
  req.body = { amount: 50 };
  await routes['PUT /:source/:orderId/:paymentId'](req, res);
  assert.equal(res.code, 404);
});

test('an unknown order source is a 400, not a crash', async () => {
  const { routes, res, req } = setup({ order: { id: 5, grand_total: 100 } });
  req.params = { source: 'invoice', orderId: '5' };
  req.body = { amount: 10 };
  await routes['POST /:source/:orderId'](req, res);
  assert.equal(res.code, 400);
  assert.match(res.body.message, /Invalid order source/);
});

test('a non-numeric order id is a 400 and reaches no query', async () => {
  const { routes, res, req, queries } = setup({ order: { id: 5, grand_total: 100 } });
  req.params = { source: 'admin', orderId: 'abc' };
  req.body = { amount: 10 };
  await routes['POST /:source/:orderId'](req, res);
  assert.equal(res.code, 400);
  assert.match(res.body.message, /Invalid order id/);
  assert.equal(queries.length, 0, 'an invalid id must not be interpolated into a query');
});

test('a missing order is a 404', async () => {
  const { routes, res, req } = setup({ role: 'admin', order: null });
  req.params = { source: 'admin', orderId: '404' };
  req.body = { amount: 10 };
  await routes['POST /:source/:orderId'](req, res);
  assert.equal(res.code, 404);
});

test('a rejected amount comes back as a 400 with the reason, not a 500', async () => {
  for (const amount of [-5, 0, 'abc', 5000]) {
    const { routes, res, req } = setup({ role: 'admin', order: { id: 5, grand_total: 1000 } });
    req.params = { source: 'admin', orderId: '5' };
    req.body = { amount };
    await routes['POST /:source/:orderId'](req, res);
    assert.equal(res.code, 400, `expected ${JSON.stringify(amount)} to be a 400`);
    assert.ok(res.body.message && !/retry/i.test(res.body.message));
  }
});

test('the history endpoint returns the summary and the full audit trail', async () => {
  const { routes, res, req } = setup({ role: 'admin', order: { id: 5, grand_total: 1000 } });
  req.params = { source: 'admin', orderId: '5' };
  await routes['GET /:source/:orderId'](req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.data.orderSource, 'admin');
  assert.equal(res.body.data.order_total, 1000);
  assert.ok(Array.isArray(res.body.data.history));
});

test('a real auth token is required, and a forged role is not accepted', async () => {
  delete require.cache[require.resolve('../middleware/paymentAuth')];
  const jwt = require('jsonwebtoken');
  const paymentAuth = require('../middleware/paymentAuth');
  const run = (header) => {
    const req = { headers: { authorization: header } };
    const res = {
      code: 200,
      status(c) { this.code = c; return this; },
      json(b) { this.body = b; return this; }
    };
    let called = false;
    paymentAuth(req, res, () => { called = true; });
    return { req, res, called };
  };

  assert.equal(run(undefined).res.code, 401);
  assert.equal(run('Bearer not-a-token').res.code, 401);
  assert.equal(run('Basic abc').res.code, 401);

  const customerToken = jwt.sign({ id: 7, email: 'c@x.com' }, process.env.JWT_SECRET || 'my_super_secret_key');
  const customer = run(`Bearer ${customerToken}`);
  assert.equal(customer.called, true);
  assert.equal(customer.req.user.role, 'customer');
  assert.equal(customer.req.user.id, 7);

  const adminToken = jwt.sign({ id: 1, email: 'a@x.com', role: 'admin' }, process.env.JWT_SECRET || 'your_secret_key_here');
  const admin = run(`Bearer ${adminToken}`);
  assert.equal(admin.req.user.role, 'admin');

  // A customer token cannot be re-signed as an admin: the customer secret does
  // not verify a token claiming role admin, and the staff secret rejects it too.
  const spoofed = jwt.sign({ id: 7, email: 'c@x.com', role: 'admin' }, process.env.JWT_SECRET || 'my_super_secret_key');
  const spoof = run(`Bearer ${spoofed}`);
  assert.equal(spoof.res.code, 401, 'a customer secret must not mint an admin role');
});
