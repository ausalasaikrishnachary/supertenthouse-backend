// End-to-end regression: real MySQL temporary tables, HTTP APIs and browser.
// Temporary tables shadow live tables only on this dedicated connection.
require('dotenv').config();
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const puppeteer = require('puppeteer');
const db = require('../db');
const { updateAdminOrder } = require('../services/adminOrderStatus');
let connection, server, browser;
(async () => {
  const { host, user, password, database, port } = db.config;
  connection = await mysql.createConnection({ host, user, password, database, port });
  for (const table of ['customers', 'admin_orders', 'admin_order_items', 'salesman_notifications']) {
    const [definition] = await connection.query(`SHOW CREATE TABLE ${table}`);
    await connection.query(definition[0]['Create Table'].replace('CREATE TABLE', 'CREATE TEMPORARY TABLE'));
  }
  await connection.query("INSERT INTO customers (id,name,email,password,is_salesman) VALUES (5,'Fixture Salesman','fixture@example.invalid','unused',1),(6,'Other customer','other@example.invalid','unused',0)");
  await connection.query("INSERT INTO admin_orders (id,customer_id,order_number,status) VALUES (901,6,'NOTIFICATION-FIXTURE','approved')");
  await updateAdminOrder(connection, 901, { status: 'processing' }, { id: 1, role: 'admin' });
  await updateAdminOrder(connection, 901, { status: 'processing' }, { id: 1, role: 'admin' });
  await updateAdminOrder(connection, 901, { payment_status: 'paid' }, { id: 1, role: 'admin' });
  let [rows] = await connection.query('SELECT * FROM salesman_notifications');
  assert.equal(rows.length, 1); assert.equal(rows[0].salesman_id, 5);
  const failingConnection = {
    beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(), rollback: () => connection.rollback(),
    query: (sql, args) => { if (sql.includes('INSERT INTO salesman_notifications')) throw new Error('Fixture notification failure'); return connection.query(sql, args); },
  };
  await assert.rejects(updateAdminOrder(failingConnection, 901, { status: 'completed' }, { id: 1, role: 'admin' }));
  const [unchanged] = await connection.query('SELECT status FROM admin_orders WHERE id = 901');
  assert.equal(unchanged[0].status, 'processing');
  const app = express(); app.use(express.json());
  const moduleContext = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/salesmanNotificationRoutes.js'), 'utf8'), {
    require: name => name === '../db' ? { promise: () => connection } : name === '../services/salesmanNotificationService' ? { ensureSalesmanNotificationsTable: async () => {} } : name === '../middleware/auth' ? require('../middleware/auth') : require(name),
    module: moduleContext, console,
  });
  app.use('/api/salesman/notifications', moduleContext.exports);
  app.get('/api/salesman-orders', (req, res) => res.json({ success: true, data: [] }));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const api = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ id: 5, role: 'salesman' }, process.env.JWT_SECRET || 'your_secret_key_here');
  const otherToken = jwt.sign({ id: 6, role: 'salesman' }, process.env.JWT_SECRET || 'your_secret_key_here');
  const denied = await fetch(`${api}/api/salesman/notifications/admin-orders/901`, { headers: { Authorization: `Bearer ${otherToken}` } });
  assert.equal(denied.status, 404);
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
  browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', error => console.error('Browser error:', error.message));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    if (request.url().includes(':5000/api/')) {
      try {
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS' };
        if (request.method() === 'OPTIONS') { await request.respond({ status: 204, headers: cors }); return; }
        const target = api + new URL(request.url()).pathname + new URL(request.url()).search;
        const response = await fetch(target, { method: request.method(), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: request.postData() });
        await request.respond({ status: response.status, contentType: 'application/json', headers: cors, body: await response.text() });
      } catch { await request.abort(); }
    } else await request.continue();
  });
  await page.evaluateOnNewDocument(token => {
    localStorage.setItem('token', token); localStorage.setItem('role', 'salesman'); localStorage.setItem('user', JSON.stringify({ id: 5, name: 'Fixture Salesman' }));
  }, token);
  await page.goto('http://localhost:8080/salesman/dashboard', { waitUntil: 'networkidle0' });
  try { await page.waitForSelector('button[aria-label="Notifications (1 unread)"]'); }
  catch (error) { console.log('Browser state:', await page.evaluate(() => document.body.innerText.slice(0, 1800))); throw error; }
  await page.click('button[aria-label="Notifications (1 unread)"]');
  await page.waitForFunction(() => document.body.innerText.includes('NOTIFICATION-FIXTURE'));
  await page.evaluate(() => [...document.querySelectorAll('section[aria-label="Notifications"] button')].find(b => b.textContent.includes('NOTIFICATION-FIXTURE')).click());
  await page.waitForFunction(() => location.pathname.endsWith('/901') && location.search.includes('source=admin'));
  await page.waitForFunction(() => document.body.innerText.includes('NOTIFICATION-FIXTURE') && !document.body.innerText.includes('Loading order details'));
  [rows] = await connection.query('SELECT is_read FROM salesman_notifications');
  assert.equal(rows[0].is_read, 1);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('button[aria-label="Notifications (0 unread)"]');
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.$('button[aria-label="Notifications (0 unread)"]'));
  console.log('PASS: real DB status update → one notification → navbar badge → Admin order details → persisted read state; unauthorized read denied. No live order rows modified.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
  if (connection) await connection.end(); db.end();
});
