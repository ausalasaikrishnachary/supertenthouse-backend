const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

let browser;
let server;
(async () => {
  const app = express();
  const dist = path.join(__dirname, '../../supertenthouse-mobileapp/dist');
  app.use(express.static(dist));
  app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  const executablePath = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(fs.existsSync);
  browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('auth_token', 'fixture-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: '5', name: 'Wishlist Customer', email: 'fixture@example.com' }));
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (!request.url().includes('/api/')) return request.continue();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
    if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
    let body = { success: true, data: [] };
    if (request.url().includes('/wishlist/5')) body = { success: true, data: [
      { wishlist_id: 901, id: '99', item_id: '7', product_id: '7', item_type: 'product' },
      { wishlist_id: 902, id: '98', item_id: '7', product_id: '7', item_type: 'package' },
    ] };
    else if (/\/api\/products(?:\?|$)/.test(request.url())) body = [{ id: 7, product_name: 'Exact Product Seven', price: 700, images: [] }];
    else if (/\/api\/packages(?:\?|$)/.test(request.url())) body = [{ id: 7, package_name: 'Exact Package Seven', price: 1700, images: [] }];
    return request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto(`http://127.0.0.1:${server.address().port}/wishlist`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('Exact Product Seven') && document.body.innerText.includes('Exact Package Seven'));
  const text = await page.evaluate(() => document.body.innerText);
  assert.match(text, /2 saved items/);
  assert.ok(await page.$('[aria-label="Remove Exact Package Seven from wishlist"]'));
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  console.log('PASS: exact colliding Wishlist items render with targeted delete controls.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
