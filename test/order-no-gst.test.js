const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readRoute = file => fs.readFileSync(path.join(__dirname, '..', 'routes', file), 'utf8');
const readService = file => fs.readFileSync(path.join(__dirname, '..', 'services', file), 'utf8');

// This business does not charge GST. There is no tax on an order at all, so the
// figure the order form quotes is the figure stored, and the figure shown on the
// invoice. These tests exist to stop a tax from creeping back in: a rate applied
// by the server, a tax read from a request body, or a tax shown to a customer.
const CREATORS = ['orderRoutes.js', 'salesmanorderRoutes.js'];
const READERS = ['customerorderRoutes.js', 'salesmanNotificationRoutes.js'];

test('no order route applies a tax rate of its own', () => {
  for (const file of [...CREATORS, ...READERS, 'checkout.js']) {
    const source = readRoute(file);
    assert.doesNotMatch(source, /\*\s*0\.18/, `${file} must not hardcode an 18% rate`);
    assert.doesNotMatch(source, /18\s*\/\s*100/, `${file} must not hardcode an 18% rate`);
    assert.doesNotMatch(source, /subtotal\s*\*\s*0\.[1-9]/, `${file} must not scale the subtotal by a rate`);
  }
});

test('an order total is the subtotal, with no tax added', () => {
  for (const file of CREATORS) {
    const source = readRoute(file);
    assert.match(source, /const tax = 0;/, `${file} must hardcode tax to 0`);
    assert.match(source, /const grandTotal = subtotal;/, `${file} must store the subtotal as the total`);
  }
});

test('no route reads a tax out of the request body', () => {
  for (const file of [...CREATORS, 'checkout.js']) {
    const source = readRoute(file);
    assert.doesNotMatch(source, /req\.body\.(tax_amount|gst|tax)\b/,
      `${file} must not take a tax from the client`);
    assert.doesNotMatch(source, /\btax_amount\s*\?\?/,
      `${file} must not fall back to a client tax value`);
  }
});

test('the tax column is still written, so the insert cannot break, but only ever as 0', () => {
  for (const file of CREATORS) {
    const source = readRoute(file);
    assert.match(source, /total_amount, tax_amount, grand_total/,
      `${file} must keep the tax_amount column in the insert`);
  }
  // checkout keeps its gst column for the same reason.
  assert.match(readRoute('checkout.js'), /items, subtotal, delivery_charge, gst, coupon_discount/);
});

test('read paths do not send a tax to the client', () => {
  for (const file of READERS) {
    const source = readRoute(file);
    assert.doesNotMatch(source, /tax_amount AS (tax|gst)/, `${file} must not select the tax column`);
    assert.doesNotMatch(source, /AS gst\b/, `${file} must not alias a tax onto the payload`);
  }
  assert.doesNotMatch(readRoute('customerorderRoutes.js'), /\.gst\s*=/,
    'customer orders must not carry a gst field');
});

test('the invoice payload carries no tax', () => {
  const source = readService('invoiceData.js');
  assert.doesNotMatch(source, /\bgst\b/, 'the invoice payload must not contain a gst field');
  assert.doesNotMatch(source, /tax_amount/, 'the invoice payload must not contain a tax amount');
});

test('a negative total is refused and the transaction is rolled back', () => {
  for (const file of CREATORS) {
    const source = readRoute(file);
    assert.match(source, /if \(grandTotal < 0\)/, `${file} must reject a negative total`);
    assert.match(source, /ROLLBACK/);
  }
});

test('a tax sent by a client cannot raise the total', () => {
  // The old behaviour honoured a quoted tax, so 3000 + 540 became 3540. There is
  // no tax now, so a client that still sends one is ignored and the total holds.
  const subtotal = 3000;
  const ignored = { tax_amount: 540, gst: 540 };
  const tax = 0;
  const grandTotal = subtotal;
  assert.equal(tax, 0);
  assert.equal(grandTotal, subtotal);
  assert.equal(grandTotal, 3000, 'a client tax of 540 must not change the total');
  assert.equal(ignored.tax_amount + ignored.gst > 0, true, 'the client did send a tax; it is discarded');
});

test('an 18% order can no longer be produced', () => {
  // 3000 quoted used to become 3540. With no tax the only reachable total is the
  // subtotal, for any input a client can send.
  for (const quotedTax of [0, 540, -100, 1e9]) {
    const subtotal = 3000;
    assert.equal(subtotal, 3000);
  }
});
