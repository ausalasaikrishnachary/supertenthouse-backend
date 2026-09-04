// Run with node scripts/check-invoice-pdf.cjs. Uses a fixture DB; never writes orders.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const puppeteer = require('puppeteer');
let handler;
let renderedText = '';
const db = { promise: () => ({ query: async (sql, params) => {
  if (sql.includes('FROM admin_orders')) return [[{ id: 12345, customer_id: 5, invoice_number: 'INV-2026-000123', total_amount: 200, tax_amount: 36, grand_total: 236, payment_method: 'cash', payment_status: 'paid' }]];
  if (sql.includes('FROM customers')) return [[{ name: 'Invoice Fixture Customer' }]];
  if (sql.includes('FROM admin_order_items')) return [[{ product_name: 'Fixture Tent', price: 100, quantity: 2, subtotal: 200 }]];
  throw new Error(`Unexpected query: ${sql}`);
} }) };
const browserAdapter = { launch: async options => {
  const browser = await puppeteer.launch(options);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async () => {
    const page = await newPage();
    const setContent = page.setContent.bind(page);
    page.setContent = async (...args) => {
      await setContent(...args);
      renderedText = await page.evaluate(() => document.body.innerText);
    };
    return page;
  };
  return browser;
} };
const router = { post: (url, ...callbacks) => { handler = callbacks.at(-1); } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/invoiceRoutes.js'), 'utf8'), {
  require: name => name === '../db' ? db : name === 'express' ? { Router: () => router } : name === 'puppeteer' ? browserAdapter : require(name),
  module: { exports: {} }, process, console, Buffer,
});
(async () => {
  const headers = {}; let pdf; let status = 200;
  await handler({ body: { orderData: {
    orderId: 12345, orderSource: 'admin', orderNumber: 'ORDER-12345',
    customerName: 'Invoice Fixture Customer', customerEmail: 'fixture@example.invalid', customerPhone: '0000000000',
    items: [{ name: 'Fixture Tent', price: 100, quantity: 2, total: 200 }],
    subtotal: 999, gst: 999, grandTotal: 999, paymentMethod: 'tampered', paymentStatus: 'paid',
  } } }, { setHeader: (key, value) => { headers[key] = value; }, send: value => { pdf = value; }, status: value => { status = value; return { json: value => { throw new Error(JSON.stringify(value)); } }; } });
  assert.equal(status, 200);
  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), '%PDF-');
  for (const value of ['INV-2026-000123', 'Invoice Fixture Customer', 'Fixture Tent', '236', '36', 'CASH']) assert.ok(renderedText.includes(value), `Missing ${value}`);
  console.log(`PASS: real PDF generated (${pdf.length} bytes); invoice number, customer, items, tax, total and payment verified. No database writes.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
