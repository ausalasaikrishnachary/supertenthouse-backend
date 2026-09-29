const test = require('node:test');
const assert = require('node:assert/strict');
const payments = require('../services/orderPayments');

// ─── an in-memory stand-in for the two tables the service touches ────────────
function setup({ orders = [], tableExists = true, rows = [] } = {}) {
  const state = {
    orders: [...orders],
    rows: [...rows],
    created: [],
    updated: [],
    sql: [],
    nextId: 1000
  };
  const connection = {
    async query(sql, args = []) {
      state.sql.push({ sql, args });
      const text = sql.replace(/\s+/g, ' ').trim();

      if (/information_schema\.tables/i.test(text)) return [[{ count: tableExists ? 1 : 0 }]];
      if (/CREATE TABLE/i.test(text)) { state.createdTable = text; return [{}]; }

      const orderMatch = text.match(/SELECT \* FROM (\w+) WHERE id = \?(.*)/i);
      if (orderMatch) {
        const found = state.orders.find(row => String(row.id) === String(args[0]));
        return [found ? [{ ...found }] : []];
      }

      const totals = text.match(/SELECT order_id, COALESCE\(SUM\(amount\), 0\) AS total_paid[\s\S]*?GROUP BY order_id/i);
      if (totals) {
        const source = args[0];
        const ids = args.slice(1).map(String);
        const sums = new Map();
        for (const row of state.rows) {
          if (row.order_source !== source || row.voided_at || !ids.includes(String(row.order_id))) continue;
          sums.set(String(row.order_id), (sums.get(String(row.order_id)) || 0) + Math.round(Number(row.amount) * 100));
        }
        return [[...sums].map(([order_id, paise]) => ({ order_id: Number(order_id), total_paid: paise / 100 }))];
      }

      if (/INSERT INTO order_payments/i.test(text)) {
        const [order_source, order_id, amount, payment_mode, remarks, payment_source, created_by, created_by_name] = args;
        const row = {
          id: ++state.nextId, order_source, order_id, amount, payment_mode, remarks, payment_source,
          created_by, created_by_name, payment_date: new Date(), voided_at: null,
          voided_by: null, voided_by_name: null, void_reason: null
        };
        state.rows.push(row);
        return [{ insertId: row.id }];
      }

      if (/FROM order_payments WHERE/i.test(text)) {
        const [source, orderId, maybeId] = args;
        let found = state.rows.filter(row => row.order_source === source && String(row.order_id) === String(orderId));
        if (text.includes('voided_at IS NULL')) found = found.filter(row => !row.voided_at);
        if (maybeId !== undefined) found = found.filter(row => String(row.id) === String(maybeId));
        return [[...found]];
      }

      if (/UPDATE order_payments SET amount/i.test(text)) {
        const [amount, payment_mode, remarks, paymentId, source, orderId] = args;
        const row = state.rows.find(r => String(r.id) === String(paymentId) && r.order_source === source && String(r.order_id) === String(orderId));
        if (row) { row.amount = amount; row.payment_mode = payment_mode; row.remarks = remarks; }
        return [{ affectedRows: row ? 1 : 0 }];
      }

      if (/UPDATE order_payments SET voided_at/i.test(text)) {
        const [byId, byName, reason, paymentId, source, orderId] = args;
        const row = state.rows.find(r => String(r.id) === String(paymentId) && r.order_source === source && String(r.order_id) === String(orderId));
        if (row) { row.voided_at = new Date(); row.voided_by = byId; row.voided_by_name = byName; row.void_reason = reason; }
        return [{ affectedRows: row ? 1 : 0 }];
      }

      return [[]];
    }
  };
  return { connection, state };
}

const order = (over = {}) => ({ id: 1, grand_total: 1000, ...over });

// ─── status is derived, never conflated with order status ────────────────────
test('no payments means pending, regardless of how far the order has progressed', () => {
  assert.equal(payments.summarise(order(), 0).payment_status, payments.PAYMENT_STATUS.PENDING);
  assert.equal(payments.summarise(order({ status: 'completed' }), 0).payment_status, 'pending');
  assert.equal(payments.summarise(order({ status: 'cancelled' }), 0).payment_status, 'pending');
  assert.equal(payments.summarise(order({ payment_status: 'paid' }), 0).payment_status, 'pending');
});

test('partial payment is reported as partially_paid with the balance still due', () => {
  const summary = payments.summarise(order(), 40000);
  assert.equal(summary.payment_status, 'partially_paid');
  assert.equal(summary.total_paid, 400);
  assert.equal(summary.balance_amount, 600);
});

test('paying the exact balance settles the order to the paisa', () => {
  const summary = payments.summarise(order({ grand_total: 1180 }), 118000);
  assert.equal(summary.payment_status, 'paid');
  assert.equal(summary.balance_amount, 0);
});

test('one paisa short stays partially_paid rather than rounding to paid', () => {
  const summary = payments.summarise(order({ grand_total: 1000 }), 99999);
  assert.equal(summary.payment_status, 'partially_paid');
  assert.equal(summary.balance_amount, 0.01);
});

test('an order with no recorded total can never be reported as fully paid', () => {
  // A zero total must not be satisfied by the absence of a balance.
  assert.equal(payments.summarise({ id: 9 }, 0).payment_status, 'pending');
  assert.equal(payments.summarise({ id: 9 }, 0).balance_amount, 0);
});

test('a zero-total order refuses any payment', async () => {
  const { connection, state } = setup({ orders: [{ id: 9, grand_total: 0 }] });
  await assert.rejects(
    () => payments.recordPayment(connection, { source: 'admin', orderId: 9, amount: 1 }),
    error => error.status === 400
  );
  assert.equal(state.rows.length, 0);
});

test('the order total is read from whichever column the source stores', () => {
  assert.equal(payments.orderTotalPaise({ grand_total: 590 }), 59000);
  assert.equal(payments.orderTotalPaise({ total_amount: 500, grand_total: 590 }), 59000);
  assert.equal(payments.orderTotalPaise({ total: 250 }), 25000);
  assert.equal(payments.orderTotalPaise({ grand_total: 0, total: 250 }), 25000);
});

// ─── amounts ─────────────────────────────────────────────────────────────────
test('amounts are held in paise so repeated payments cannot drift', () => {
  const { connection, state } = setup({ orders: [order({ grand_total: 0.3 })] });
  return (async () => {
    await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 0.1 });
    await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 0.2 });
    const { payment } = await payments.getPaymentSummary(connection, 'admin', 1);
    assert.equal(payment.total_paid, 0.3);
    assert.equal(payment.balance_amount, 0);
    assert.equal(payment.payment_status, 'paid');
    assert.equal(state.rows.length, 2);
  })();
});

test('non-numeric and non-scalar amounts are rejected instead of coerced', async () => {
  const { connection, state } = setup({ orders: [order()] });
  for (const bad of ['12abc', '1.2.3', '1.005', [5], [], {}, true, 'NaN', 'Infinity']) {
    await assert.rejects(
      () => payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: bad }),
      error => error.status === 400,
      `expected ${JSON.stringify(bad)} to be rejected`
    );
  }
  assert.equal(state.rows.length, 0);
});

test('zero, negative and absurd amounts are rejected', async () => {
  const { connection, state } = setup({ orders: [order()] });
  for (const bad of [0, '0', -50, 99999999]) {
    await assert.rejects(
      () => payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: bad }),
      error => error.status === 400
    );
  }
  assert.equal(state.rows.length, 0);
});

test('paying more than the order balance is refused with the amount still due', async () => {
  const { connection } = setup({ orders: [order({ grand_total: 1000 })] });
  await assert.rejects(
    () => payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 1000.01 }),
    error => error.status === 400 && /600 is still due|1000 is still due/.test(error.message)
  );
});

test('the cumulative balance, not each payment alone, is what gets validated', async () => {
  const { connection } = setup({ orders: [order({ grand_total: 1000 })] });
  await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 600 });
  // 600 alone would fit inside a 1000 order, but 600 + 600 does not.
  await assert.rejects(
    () => payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 600 }),
    error => error.status === 400 && /400 is still due/.test(error.message)
  );
  await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 400 });
  const { payment } = await payments.getPaymentSummary(connection, 'admin', 1);
  assert.equal(payment.payment_status, 'paid');
});

test('a payment is rejected when the order does not exist', async () => {
  const { connection } = setup({ orders: [] });
  await assert.rejects(
    () => payments.recordPayment(connection, { source: 'admin', orderId: 77, amount: 10 }),
    error => error.status === 404
  );
});

test('an unknown order source is rejected', async () => {
  const { connection } = setup({ orders: [order()] });
  await assert.rejects(
    () => payments.recordPayment(connection, { source: 'invoice', orderId: 1, amount: 10 }),
    error => error.status === 400
  );
});

test('over-long remarks are rejected rather than silently truncated', async () => {
  const { connection } = setup({ orders: [order()] });
  await assert.rejects(
    () => payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 10, remarks: 'x'.repeat(256) }),
    error => error.status === 400
  );
});

test('an empty payment mode is rejected', async () => {
  const { connection } = setup({ orders: [order()] });
  await assert.rejects(
    () => payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 10, mode: '   ' }),
    error => error.status === 400
  );
});

// ─── who paid, recorded from the authenticated actor ─────────────────────────
test('the payment source is taken from the actor, not from the request body', async () => {
  const { connection, state } = setup({ orders: [order()] });
  await payments.recordPayment(connection, {
    source: 'customer', orderId: 1, amount: 100,
    actor: { id: 5, role: 'customer', email: 'a@b.com' },
    remarks: 'ignored spoof', payment_source: 'Admin'
  });
  assert.equal(state.rows[0].payment_source, 'Customer');
  assert.equal(state.rows[0].created_by, 5);
  assert.equal(state.rows[0].remarks, 'ignored spoof');
});

// ─── ledger separation across the three order tables ─────────────────────────
test('the same order id in two sources keeps two independent balances', async () => {
  const { connection } = setup({ orders: [{ id: 1, grand_total: 1000 }] });
  await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 100 });
  const admin = await payments.getPaymentSummary(connection, 'admin', 1);
  const customer = await payments.getPaymentSummary(connection, 'customer', 1);
  assert.equal(admin.payment.total_paid, 100);
  assert.equal(customer.payment.total_paid, 0);
  assert.equal(customer.payment.payment_status, 'pending');
});

test('the payments table is created on first use, and the check happens once', async () => {
  // The guard caches its result, so a fresh module instance is needed to observe
  // the create path; otherwise an earlier test has already satisfied the cache.
  const fresh = () => {
    delete require.cache[require.resolve('../services/orderPayments')];
    return require('../services/orderPayments');
  };

  const missing = setup({ orders: [order()], tableExists: false });
  await fresh().getPaymentSummary(missing.connection, 'admin', 1);
  assert.ok(
    missing.state.createdTable && /CREATE TABLE IF NOT EXISTS order_payments/.test(missing.state.createdTable),
    'expected the table to be created when absent'
  );
  // the created table is a payment ledger keyed by source + order id
  assert.match(missing.state.createdTable, /order_source ENUM\('customer','admin','salesman'\)/);
  assert.match(missing.state.createdTable, /amount DECIMAL\(10,2\) NOT NULL/);
  assert.match(missing.state.createdTable, /voided_at DATETIME NULL/);
  // and it must not invent its own order total column
  assert.doesNotMatch(missing.state.createdTable, /order_total|balance_amount|total_paid/);

  const absent = fresh();
  const first = setup({ orders: [order()], tableExists: false });
  await absent.getPaymentSummary(first.connection, 'admin', 1);
  await absent.getPaymentSummary(first.connection, 'admin', 1);
  await absent.getPaymentSummary(first.connection, 'admin', 1);
  assert.equal(first.state.sql.filter(q => /information_schema\.tables/.test(q.sql)).length, 1);

  const present = setup({ orders: [order()], tableExists: true });
  await fresh().getPaymentSummary(present.connection, 'admin', 1);
  assert.equal(present.state.createdTable, undefined);
});

// ─── history, correction and void ────────────────────────────────────────────
test('history lists every payment oldest first, and returned amounts are numbers', async () => {
  const { connection } = setup({ orders: [order({ grand_total: 1000 })] });
  await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 100 });
  await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: '250.50' });
  const history = await payments.listPayments(connection, 'admin', 1);
  assert.equal(history.length, 2);
  assert.equal(history[0].amount, 100);
  assert.equal(history[1].amount, 250.5);
  assert.equal(history[0].voided, false);
});

test('voided payments drop out of the balance and reopen it', async () => {
  const { connection } = setup({ orders: [order({ grand_total: 1000 })] });
  const first = await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 400 });
  await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 600 });
  let summary = await payments.getPaymentSummary(connection, 'admin', 1);
  assert.equal(summary.payment.payment_status, 'paid');

  const after = await payments.voidPayment(connection, {
    source: 'admin', orderId: 1, paymentId: first.paymentId, reason: 'Cheque bounced',
    actor: { id: 1, role: 'admin' }
  });
  assert.equal(after.payment.payment_status, 'partially_paid');
  assert.equal(after.payment.balance_amount, 400);
  assert.equal((await payments.listPayments(connection, 'admin', 1)).length, 1);
  // the voided row is still retrievable for audit
  const audit = await payments.listPayments(connection, 'admin', 1, { includeVoided: true });
  assert.equal(audit.length, 2);
  assert.equal(audit[0].voided, true);
  assert.equal(audit[0].void_reason, 'Cheque bounced');
});

test('a payment cannot be voided twice', async () => {
  const { connection } = setup({ orders: [order()] });
  const made = await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 100 });
  await payments.voidPayment(connection, { source: 'admin', orderId: 1, paymentId: made.paymentId, reason: 'mistake' });
  await assert.rejects(
    () => payments.voidPayment(connection, { source: 'admin', orderId: 1, paymentId: made.paymentId, reason: 'again' }),
    error => error.status === 404
  );
});

test('voiding without a reason is refused', async () => {
  const { connection } = setup({ orders: [order()] });
  const made = await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 100 });
  await assert.rejects(
    () => payments.voidPayment(connection, { source: 'admin', orderId: 1, paymentId: made.paymentId, reason: '  ' }),
    error => error.status === 400
  );
});

test('correcting a payment re-checks the balance against the remaining payments', async () => {
  const { connection } = setup({ orders: [order({ grand_total: 1000 })] });
  const first = await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 400 });
  await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 500 });

  await assert.rejects(
    () => payments.updatePayment(connection, { source: 'admin', orderId: 1, paymentId: first.paymentId, amount: 900 }),
    error => error.status === 400 && /500 is still due/.test(error.message)
  );

  const fixed = await payments.updatePayment(connection, {
    source: 'admin', orderId: 1, paymentId: first.paymentId, amount: 500, remarks: 'corrected', mode: 'upi'
  });
  assert.equal(fixed.payment.total_paid, 1000);
  assert.equal(fixed.payment.payment_status, 'paid');
  const history = await payments.listPayments(connection, 'admin', 1);
  assert.equal(history[0].amount, 500);
  assert.equal(history[0].remarks, 'corrected');
  assert.equal(history[0].payment_mode, 'upi');
});

test('correcting a payment to zero or less is refused', async () => {
  const { connection } = setup({ orders: [order()] });
  const made = await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 100 });
  for (const bad of [0, -10]) {
    await assert.rejects(
      () => payments.updatePayment(connection, { source: 'admin', orderId: 1, paymentId: made.paymentId, amount: bad }),
      error => error.status === 400
    );
  }
});

test('correcting or voiding a payment that was already voided reports not found', async () => {
  const { connection } = setup({ orders: [order()] });
  const made = await payments.recordPayment(connection, { source: 'admin', orderId: 1, amount: 100 });
  await payments.voidPayment(connection, { source: 'admin', orderId: 1, paymentId: made.paymentId, reason: 'x' });
  await assert.rejects(
    () => payments.updatePayment(connection, { source: 'admin', orderId: 1, paymentId: made.paymentId, amount: 50 }),
    error => error.status === 404
  );
  await assert.rejects(
    () => payments.voidPayment(connection, { source: 'admin', orderId: 1, paymentId: made.paymentId, reason: 'y' }),
    error => error.status === 404
  );
});

// ─── order creation ──────────────────────────────────────────────────────────
test('an initial advance is recorded as a normal payment', async () => {
  const { connection } = setup({ orders: [order({ grand_total: 1000 })] });
  const made = await payments.recordInitialAdvance(connection, {
    source: 'salesman', orderId: 1, amount: 250, mode: 'cash', actor: { id: 3, role: 'salesman', name: 'Ravi' }
  });
  assert.equal(made.payment.payment_status, 'partially_paid');
  assert.equal(made.payment.total_paid, 250);
});

test('no advance leaves a brand new order at zero paid and pending', async () => {
  for (const empty of [undefined, null, '', 0, '0']) {
    const { connection, state } = setup({ orders: [order()] });
    const made = await payments.recordInitialAdvance(connection, { source: 'admin', orderId: 1, amount: empty });
    assert.equal(made, null);
    assert.equal(state.rows.length, 0);
  }
});

// ─── list attachment stays one query for a whole page ─────────────────────────
test('a page of orders is summarised with a single grouped totals query', async () => {
  const { connection, state } = setup({
    orders: [{ id: 1, grand_total: 1000 }, { id: 2, grand_total: 500 }, { id: 3, grand_total: 200 }],
    rows: [
      { id: 1, order_source: 'admin', order_id: 1, amount: 1000, voided_at: null },
      { id: 2, order_source: 'admin', order_id: 2, amount: 200, voided_at: null },
      { id: 3, order_source: 'admin', order_id: 2, amount: 50, voided_at: null },
      { id: 4, order_source: 'admin', order_id: 3, amount: 999, voided_at: new Date() }
    ]
  });
  const orders = [{ id: 1, grand_total: 1000 }, { id: 2, grand_total: 500 }, { id: 3, grand_total: 200 }];
  await payments.attachPaymentSummaries(connection, 'admin', orders);

  assert.equal(state.sql.filter(q => /SUM\(amount\)/.test(q.sql)).length, 1);
  assert.equal(orders[0].payment_status, 'paid');
  assert.equal(orders[0].balance_amount, 0);
  assert.equal(orders[1].payment_status, 'partially_paid');
  assert.equal(orders[1].total_paid, 250);
  assert.equal(orders[2].payment_status, 'pending');
  assert.equal(orders[2].total_paid, 0);
  // the flat fields mirror the block so every panel can read one shape
  for (const orderRow of orders) {
    assert.equal(orderRow.order_total, orderRow.payment.order_total);
    assert.equal(orderRow.total_paid, orderRow.payment.total_paid);
    assert.equal(orderRow.balance_amount, orderRow.payment.balance_amount);
    assert.equal(orderRow.payment_status, orderRow.payment.payment_status);
  }
});

test('a voided payment is left out of the totals an order is summarised with', async () => {
  const { connection } = setup({
    orders: [{ id: 1, grand_total: 1000 }],
    rows: [
      { id: 1, order_source: 'admin', order_id: 1, amount: 1000, voided_at: null },
      { id: 2, order_source: 'admin', order_id: 1, amount: 250, voided_at: new Date() }
    ]
  });
  const { payment } = await payments.getPaymentSummary(connection, 'admin', 1);
  assert.equal(payment.total_paid, 1000);
  assert.equal(payment.balance_amount, 0);
});
