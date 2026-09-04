const puppeteer = require('puppeteer');
const fs = require('fs');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('path');
let browser, server;
(async () => {
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
  browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage(); let status = 'completed'; let reads = 0;
  const app = express(); const dist = path.join(__dirname, '../../supertenthouse-mobileapp/dist');
  app.use(express.static(dist)); app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('auth_token', 'fixture-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 5, name: 'Fixture Customer', email: 'fixture@example.invalid' }));
  });
  await page.setRequestInterception(true);
  page.on('request', async request => {
    if (request.url().includes('/api/')) {
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' };
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
      const isOrder = request.url().includes('/customer-orders/13');
      if (isOrder) { reads++; assert.ok(request.url().includes('source=customer')); }
      return request.respond({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(isOrder ? { success: true, data: { id: 13, orderSource: 'customer', order_number: 'TIMELINE-FIXTURE', customer_name: 'Fixture Customer', status, payment_status: 'paid', items: [], grand_total: 118, subtotal: 100, gst: 18, created_at: '2026-09-01', updated_at: '2026-09-04' } } : { success: true, data: [] }) });
    }
    return request.continue();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/order-details/13?source=customer`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => /Completed\s*• Current/.test(document.body.innerText));
  status = 'approved';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => /Order Approved\s*• Current/.test(document.body.innerText));
  const text = await page.evaluate(() => document.body.innerText);
  assert.ok(/Processing\s*Not reached/.test(text));
  assert.ok(/Completed\s*Not reached/.test(text));
  assert.ok(!/Completed\s*• Current/.test(text));
  assert.ok(reads >= 2);
  console.log('PASS: browser refreshed Completed to Approved; Processing/Completed not reached even with paid payment status. No live orders changed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
