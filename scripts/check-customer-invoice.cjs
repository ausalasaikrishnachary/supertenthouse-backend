// Real Customer browser -> authenticated invoice route -> Chromium PDF, fixture DB only.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const puppeteer = require('puppeteer');
let browser, server;
const order = { id: 13, customer_id: 5, order_number: 'INVOICE-FIXTURE', invoice_number: 'INV-CUS-2026-000013', status: 'approved', items: [{ name: 'Fixture Tent', quantity: 2, price: 100 }], subtotal: 200, gst: 36, grand_total: 236, created_at: '2026-09-01' };
const db = { promise: () => ({ query: async (sql, params) => {
  assert.ok(sql.startsWith('SELECT'), 'No writes during download');
  if (sql.includes('FROM customers')) return [[{ name: 'Fixture Customer' }]];
  if (sql.includes('_order_items')) return [[{ product_name: 'Fixture Tent', quantity: 2, price: 100, subtotal: 200 }]];
  return [params.length === 2 && params[1] !== 5 ? [] : [order]];
} }) };
(async () => {
  const moduleObject = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/invoiceRoutes.js'), 'utf8'), {
    require: name => name === '../db' ? db : require(name), module: moduleObject, process, console, Buffer,
  });
  const app = express(); app.use(express.json()); app.use('/api/invoice', moduleObject.exports);
  const dist = path.join(__dirname, '../../supertenthouse-mobileapp/dist');
  app.use(express.static(dist)); app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ id: 5 }, process.env.JWT_SECRET || 'my_super_secret_key');
  const post = (body, auth) => fetch(`${base}/api/invoice/generate-pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify({ orderData: body }) });
  assert.equal((await post({ orderId: 13 })).status, 401);
  assert.equal((await post({ orderId: 13 }, jwt.sign({ id: 99 }, process.env.JWT_SECRET || 'my_super_secret_key'))).status, 404);
  const original = order.invoice_number; order.invoice_number = '';
  assert.equal((await post({ orderId: 13 }, token)).status, 409); order.invoice_number = original;
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
  browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(token => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify({ id: 5, name: 'Fixture Customer', email: 'fixture@example.invalid' }));
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.invoiceBlob = blob; return create(blob); };
    HTMLAnchorElement.prototype.click = function () { window.invoiceFilename = this.download; };
  }, token);
  let source = 'customer';
  await page.setRequestInterception(true);
  page.on('request', async request => {
    if (!request.url().includes('/api/')) return request.continue();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' };
    if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
    if (request.url().includes('/invoice/generate-pdf')) {
      assert.equal(request.headers().authorization, `Bearer ${token}`);
      const payload = JSON.parse(request.postData()); assert.equal(payload.orderData.orderSource, source);
      const response = await post(payload.orderData, token);
      return request.respond({ status: response.status, headers, contentType: response.headers.get('content-type'), body: Buffer.from(await response.arrayBuffer()) });
    }
    return request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ success: true, data: request.url().includes('/customer-orders/13') ? { ...order, orderSource: source } : [] }) });
  });
  for (source of ['customer', 'admin']) {
    await page.goto(`${base}/order-details/13?source=${source}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.innerText.includes('Download Invoice'));
    await page.evaluate(() => [...document.querySelectorAll('*')].find(el => el.textContent === 'Download Invoice' && el.children.length === 0).click());
    await page.waitForFunction(() => Boolean(window.invoiceFilename), { timeout: 30000 });
    const result = await page.evaluate(async () => ({ name: window.invoiceFilename, magic: await window.invoiceBlob.slice(0, 5).text(), size: window.invoiceBlob.size }));
    assert.equal(result.magic, '%PDF-'); assert.ok(result.size > 1000);
    assert.equal(result.name, `Invoice_${original}.pdf`);
    console.log(`PASS: Customer browser downloaded ${source}-owned Approved order PDF with token and correct filename.`);
  }
  console.log('PASS: missing auth, wrong owner and missing invoice rejected. No live records changed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
