const test = require('node:test');
const assert = require('node:assert/strict');
const { allocate } = require('../services/invoiceNumbers');

test('preserves an existing invoice and releases its lock', async () => {
  const queries = [];
  const connection = { query: async sql => {
    queries.push(sql);
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.startsWith('SELECT invoice_number')) return [[{ invoice_number: 'INV-ADM-2026-000025' }]];
    return [[]];
  } };
  assert.equal(await allocate(connection, { orderSource: 'admin', orderId: 1 }), 'INV-ADM-2026-000025');
  assert.match(queries.at(-1), /RELEASE_LOCK/);
  assert.equal(queries.some(sql => sql.startsWith('UPDATE')), false);
});

test('rejects invalid IDs and sources before querying', async () => {
  const connection = { query: () => { throw new Error('Unexpected query'); } };
  for (const data of [{ orderId: 0 }, { orderId: 1, orderSource: 'unknown' }]) {
    await assert.rejects(allocate(connection, data), /Valid order source and ID required/);
  }
});

test('missing orders release the lock without generating an invoice', async () => {
  let released = false;
  const connection = { query: async sql => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) released = true;
    return [[]];
  } };
  await assert.rejects(allocate(connection, { orderId: 99 }), /Order not found/);
  assert.equal(released, true);
});
