const mysql = require('mysql2/promise');
const assert = require('node:assert/strict');
const db = require('../db');
const { allocate } = require('../services/invoiceNumbers');
const schema = `codex_invoice_test_${Date.now()}`;
let control; const connections = [];
(async () => {
  const { host, user, password, port } = db.config;
  control = await mysql.createConnection({ host, user, password, port });
  await control.query(`CREATE DATABASE ${schema}`);
  for (const table of ['orders', 'admin_orders', 'salesman_orders']) {
    await control.query(`CREATE TABLE ${schema}.${table} (id INT PRIMARY KEY, invoice_number VARCHAR(100) UNIQUE)`);
    await control.query(`INSERT INTO ${schema}.${table} (id) VALUES (1),(2),(3),(4),(5)`);
  }
  async function request(source, id) {
    const connection = await mysql.createConnection({ host, user, password, port, database: schema });
    connections.push(connection);
    return allocate(connection, { orderSource: source, orderId: id });
  }
  const values = await Promise.all(['customer', 'admin', 'salesman'].flatMap(source => [1,2,3,4,5].map(id => request(source, id))));
  assert.equal(new Set(values).size, 15);
  const repeats = await Promise.all(Array.from({ length: 8 }, () => request('admin', 1)));
  assert.ok(repeats.every(value => value === values[5]));
  for (const table of ['orders', 'admin_orders', 'salesman_orders']) {
    const [rows] = await control.query(`SELECT invoice_number FROM ${schema}.${table}`);
    assert.ok(rows.every(row => values.includes(row.invoice_number)));
  }
  console.log('PASS: 15 concurrent allocations unique; 8 concurrent retries return the original persisted invoice. Live orders untouched.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  await Promise.all(connections.map(connection => connection.end()));
  if (control) {
    if (!/^codex_invoice_test_\d+$/.test(schema)) throw new Error('Unsafe test schema cleanup');
    await control.query(`DROP DATABASE IF EXISTS ${schema}`); await control.end();
  }
  db.end();
});
