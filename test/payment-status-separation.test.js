const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Several of these files carry large commented-out legacy blocks. Searching the
// raw text would assert against dead code, so assertions run on live lines only.
const live = file => read(file)
  .split(/\r?\n/)
  .filter(line => !/^\s*\/\//.test(line))
  .join('\n');

// The single most important rule in this feature: an order's workflow status and
// its payment status are independent. These tests fail if that separation is
// quietly undone anywhere in the backend.
test('no order is created already marked as paid', () => {
  for (const file of ['routes/orderRoutes.js', 'routes/salesmanorderRoutes.js', 'routes/checkout.js']) {
    const source = live(file);
    // An INSERT must never hardcode a paid status.
    for (const match of source.matchAll(/INSERT INTO (?:admin_orders|salesman_orders|orders)\s*\([\s\S]{0,600}?VALUES\s*\(([\s\S]{0,400}?)\)/gi)) {
      const literals = match[1];
      assert.doesNotMatch(
        literals,
        /'paid'|'Paid'|'PAID'/i,
        `${file} creates an order with a hardcoded paid status: ${literals.slice(0, 120).replace(/\s+/g, ' ')}`
      );
    }
  }
});

test('order creation seeds a pending payment status, never a paid one', () => {
  assert.match(live('routes/orderRoutes.js'), /'approved',\s*'pending'/);
  assert.match(live('routes/salesmanorderRoutes.js'), /'pending',\s*'pending',\s*\?/);
  assert.doesNotMatch(live('routes/orderRoutes.js'), /'approved',\s*'Paid'/i);
});

test('the shared status handler cannot write a payment status', () => {
  const source = live('services/adminOrderStatus.js');
  const allowedBlock = source.slice(source.indexOf('const allowed'), source.indexOf('const allowed') + 220);
  assert.doesNotMatch(allowedBlock, /payment_status/, 'adminOrderStatus must not accept payment_status as a writable field');
  // it notices the field so an older client is told why nothing changed
  assert.match(source, /paymentStatusIgnored/);
  assert.doesNotMatch(source, /changes\.payment_status\s*=/);
  // and the update only ever carries the order status
  assert.doesNotMatch(source, /payment_status = \?/);
});

test('no status endpoint derives a payment status from the order status', () => {
  const files = [
    'routes/orderRoutes.js',
    'routes/salesmanorderRoutes.js',
    'routes/customerorderRoutes.js',
    'routes/checkout.js',
    'services/adminOrderStatus.js'
  ];
  for (const file of files) {
    const source = read(file);
    // The old bug: `status === 'completed' ? 'paid' : ...` written into a payment
    // column, or a completed/approved status being mapped to a payment value.
    assert.doesNotMatch(
      source,
      /payment_status\s*[:=]\s*[^;\n]*(completed|approved)/i,
      `${file} maps an order status onto payment_status`
    );
    assert.doesNotMatch(
      source,
      /SET[^;]*payment_status\s*=\s*\?\s*[^;]*status/i,
      `${file} writes an order status into the payment_status column`
    );
  }
});

test('no route still exposes a status-only payment_status write', () => {
  const combined = [
    live('routes/orderRoutes.js'),
    live('routes/salesmanorderRoutes.js'),
    live('routes/customerorderRoutes.js'),
    live('routes/checkout.js')
  ].join('\n');
  assert.doesNotMatch(combined, /payment_status\s*=\s*\?/);
  assert.doesNotMatch(combined, /"payment_status = \?"/);
});

test('the customer order status route requires staff authentication', () => {
  const source = live('routes/checkout.js');
  const routeLine = source.match(/router\.put\("\/order\/:orderId\/status"[^)]*\)/);
  assert.ok(routeLine, 'expected the checkout status route to exist');
  assert.match(routeLine[0], /paymentAuth/);
  assert.match(routeLine[0], /requireRole\("admin", "salesman"\)/);
});

test('the checkout status route refuses to set a payment status at all', () => {
  const source = live('routes/checkout.js');
  const start = source.indexOf('router.put("/order/:orderId/status"');
  const body = source.slice(start, start + 1800);
  assert.match(body, /paymentStatus[\s\S]{0,400}?derived from recorded payments/);
  assert.doesNotMatch(body, /updates\.payment_status/);
});

test('every order read path returns the derived payment block', () => {
  for (const file of ['routes/orderRoutes.js', 'routes/salesmanorderRoutes.js', 'routes/customerorderRoutes.js', 'routes/checkout.js']) {
    const source = read(file);
    const attachments = source.match(/attachPaymentSummaries\(/g) || [];
    assert.ok(attachments.length >= 2, `${file} should summarise payments on more than one read path (found ${attachments.length})`);
  }
});

test('the customer order list summarises each source against its own ledger', () => {
  const source = live('routes/customerorderRoutes.js');
  for (const ledgerSource of ['customer', 'admin', 'salesman']) {
    assert.match(
      source,
      new RegExp(`attachPaymentSummaries\\(\\s*[^,]+,\\s*'${ledgerSource}'`),
      `expected the combined customer order list to summarise ${ledgerSource} orders`
    );
  }
});

test('the invoice reports the ledger figures rather than the legacy column', () => {
  const source = live('services/invoiceData.js');
  assert.match(source, /getPaymentSummary/);
  assert.match(source, /paymentStatus:\s*payment\.payment_status/);
  assert.match(source, /totalPaid:\s*payment\.total_paid/);
  assert.match(source, /balanceAmount:\s*payment\.balance_amount/);
  assert.doesNotMatch(source, /paymentStatus:\s*order\.payment_status/);
});

test('checkout validates the advance against the order total before writing', () => {
  const source = live('routes/checkout.js');
  const start = source.indexOf('router.post("/order"');
  const body = source.slice(start, start + 6000);
  assert.match(body, /orderPayments\.parseAmount\(advanceAmount/);
  assert.match(body, /advancePaise < 0/);
  assert.match(body, /advancePaise > orderTotalPaise/);
  assert.match(body, /recordPayment/);
  // the raw client value must not reach the column unchecked
  assert.doesNotMatch(body, /parseFloat\(advanceAmount\) \|\| 0/);
});

test('the order create routes apply the advance before committing', () => {
  for (const file of ['routes/orderRoutes.js', 'routes/salesmanorderRoutes.js']) {
    const source = live(file);
    assert.match(source, /\badvance\b/, `${file} should accept an advance`);
    const recordAt = source.indexOf('orderPayments.recordPayment');
    const commitAt = source.indexOf('await db.promise().query("COMMIT")');
    assert.ok(recordAt > 0, `${file} should record the advance as a payment`);
    assert.ok(commitAt > 0 && recordAt < commitAt, `${file} must apply the advance before the commit`);
  }
});

test('the payment router is mounted', () => {
  const server = read('server.js');
  assert.match(server, /orderPaymentRoutes = require\("\.\/routes\/orderPayments"\)/);
  assert.match(server, /app\.use\("\/api\/order-payments", orderPaymentRoutes\)/);
});
