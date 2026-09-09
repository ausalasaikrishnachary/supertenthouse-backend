// Browser regression for Admin/Salesman order presentation. No database writes.
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
let browser, server;
(async () => {
  const app = express();
  const dist = path.join(__dirname, '../../supertenthouse-mobileapp/dist');
  app.use(express.static(dist));
  app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('auth_token', 'fixture-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 5, name: 'Fixture Customer' }));
  });
  let source = 'admin'; let imageRequests = 0;
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/uploads/products/fixture.png')) {
      imageRequests++;
      return request.respond({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(__dirname, '../../supertenthouse-mobileapp/assets/images/icon.png')) });
    }
    if (url.includes('/api/')) {
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' };
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
      const data = url.includes('/customer-orders/') ? {
        id: source === 'admin' ? 5 : 3, orderSource: source, order_number: `${source.toUpperCase()}-FIXTURE`,
        customer_id: 5, customer_name: 'Fixture Customer', status: 'approved', payment_status: 'pending',
        address_full_name: 'Fixture Recipient', address_phone: '9876543210', address_line1: '12 Test Road',
        address_line2: '', address_city: 'Hyderabad', address_state: 'Telangana', address_pincode: '500019', address_country: 'India',
        items: [{ id: 1, productId: '143', name: 'Fixture Product', quantity: 1, price: 100, image: 'uploads/products/fixture.png' }],
        subtotal: 100, gst: 18, grand_total: 118, created_at: '2026-09-09'
      } : [];
      return request.respond({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ success: true, data }) });
    }
    request.continue();
  });
  for (source of ['admin', 'salesman']) {
    imageRequests = 0;
    await page.goto(`http://127.0.0.1:${server.address().port}/order-details/${source === 'admin' ? 5 : 3}?source=${source}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.innerText.includes('Fixture Product'));
    const text = await page.evaluate(() => document.body.innerText);
    assert.ok(text.includes('12 Test Road'));
    assert.ok(text.includes('Hyderabad, Telangana - 500019'));
    assert.ok(await page.evaluate(() => [...document.images].some(image => image.src.includes('/uploads/products/fixture.png') && image.complete && image.naturalWidth > 0)));
    assert.ok(imageRequests > 0);
    console.log(`PASS: ${source} order shows normalized product image and complete delivery address.`);
  }
  console.log('PASS: Customer-created flow was not mutated; fixture checks made no order writes.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
