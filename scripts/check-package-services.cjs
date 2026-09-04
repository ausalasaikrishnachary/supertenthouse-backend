const mysql = require('mysql2/promise');
const express = require('express');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const db = require('../db');
let connection, server;
(async () => {
  const { host, user, password, database, port } = db.config;
  connection = await mysql.createConnection({ host, user, password, database, port });
  for (const table of ['packages', 'package_products', 'package_addons']) {
    const [definition] = await connection.query(`SHOW CREATE TABLE ${table}`);
    await connection.query(definition[0]['Create Table'].replace('CREATE TABLE', 'CREATE TEMPORARY TABLE'));
  }
  const mockedDb = { query(sql, args, callback) { connection.query(sql, args).then(([rows]) => callback(null, rows)).catch(callback); } };
  const moduleContext = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/packages.js'), 'utf8'), {
    require: id => id === '../db' ? mockedDb : id === '../services/packageCustomServices' ? require('../services/packageCustomServices') : require(id),
    module: moduleContext, __dirname: path.join(__dirname, '../routes'), console,
  });
  const app = express(); app.use(express.json()); app.use('/packages', moduleContext.exports);
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/packages`;
  const base = { package_name: 'Fixture services', tier: 'Basic', price: 100, catering: true, is_active: true };
  const request = async (method, endpoint, body) => {
    const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
  };
  const created = await request('POST', url, { ...base, custom_services: ['Valet, Parking', 'Kids & Games'] });
  const read = async () => (await connection.query('SELECT custom_services,catering FROM packages WHERE id = ?', [created.id]))[0][0];
  assert.deepEqual(JSON.parse((await read()).custom_services), ['Valet, Parking', 'Kids & Games']);
  await request('PUT', `${url}/${created.id}`, base);
  assert.equal(JSON.parse((await read()).custom_services).length, 2);
  await request('PUT', `${url}/${created.id}`, { ...base, custom_services: [] });
  assert.deepEqual(JSON.parse((await read()).custom_services), []);
  assert.equal(JSON.parse((await read()).catering), true);
  console.log('PASS: real API create, read, edit, clear and legacy omission persistence; predefined catering preserved. Only temporary tables modified.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve)); if (connection) await connection.end(); db.end();
});
