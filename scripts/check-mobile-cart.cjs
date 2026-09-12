// Mobile-sized browser regression for cart rendering/hydration. Fixture API only.
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
let browser, server;
(async () => {
  const cartSource = fs.readFileSync(path.join(__dirname, '../../supertenthouse-mobileapp/app/(tabs)/cart.tsx'), 'utf8');
  const activeCart = cartSource.slice(cartSource.lastIndexOf('// app/(tabs)/cart.tsx'));
  assert.doesNotMatch(activeCart, /<div\b/);
  assert.match(fs.readFileSync(path.join(__dirname, '../../supertenthouse-mobileapp/utils/storage.ts'), 'utf8'), /AsyncStorage\.getItem/);
  const cartStore = fs.readFileSync(path.join(__dirname, '../../supertenthouse-mobileapp/store/cart.tsx'), 'utf8');
  const activeStore = cartStore.slice(cartStore.lastIndexOf('// store/cart.tsx'));
  assert.ok(activeStore.indexOf("dispatch({ type: 'ADD_ITEM', payload: cartItem })") < activeStore.indexOf('await axios.post(`${API_BASE_URL}/cart`'));

  const app = express();
  const dist = path.join(__dirname, '../../supertenthouse-mobileapp/dist');
  app.use(express.static(dist));
  app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('auth_token', 'fixture-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: '5', name: 'Cart Customer' }));
    if (!localStorage.getItem('cart_state')) localStorage.setItem('cart_state', JSON.stringify({ items: [{ id: '143', productId: '143', name: 'Persisted Tent', image: '', price: 100, quantity: 2, type: 'product' }], savedForLater: [], appliedCoupon: null, couponDiscount: 0 }));
  });
  let cartFails = false;
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (!request.url().includes('/api/')) return request.continue();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
    if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
    if (request.url().includes('/cart/5')) return request.respond({
      status: cartFails ? 500 : 200, headers, contentType: 'application/json',
      body: JSON.stringify(cartFails ? { success: false } : { success: true, data: [{ id: 1, product_id: 143, product_name: 'Server Tent', price: '125', quantity: '2', image: '' }] })
    });
    return request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], count: 0 }) });
  });
  const url = `http://127.0.0.1:${server.address().port}/cart`;
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('Server Tent'));
  assert.match(await page.evaluate(() => document.body.innerText), /2 items in cart/);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: mobile viewport renders server cart items without a blank-screen error.');

  await page.evaluate(() => localStorage.setItem('cart_state', JSON.stringify({ items: [{ id: '144', productId: '144', name: 'Offline Tent', image: '', price: 80, quantity: 1, type: 'product' }], savedForLater: [], appliedCoupon: null, couponDiscount: 0 })));
  cartFails = true;
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('Offline Tent'));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: persisted cart survives hydration and a temporary API failure.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
