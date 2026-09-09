const test = require('node:test');
const assert = require('node:assert/strict');
const { getCustomerDeliveryAddress, addressValues, enrichStaffOrderItems, ensureStaffOrderSnapshotColumns } = require('../services/staffOrderPresentation');

test('schema setup adds only missing nullable snapshot columns', async () => {
  const alterations = [];
  const connection = { query: async sql => {
    if (sql.startsWith('SHOW COLUMNS')) return [[{ Field: 'address_id' }]];
    alterations.push(sql); return [{}];
  } };
  await ensureStaffOrderSnapshotColumns(connection);
  assert.equal(alterations.length, 18);
  assert.ok(alterations.every(sql => /ALTER TABLE (admin_orders|salesman_orders) ADD COLUMN address_/.test(sql) && sql.endsWith(' NULL')));
  assert.equal(alterations.some(sql => /ADD COLUMN address_id/.test(sql)), false);
});

test('captures the default delivery address as an ordered snapshot', async () => {
  const connection = { query: async sql => sql.includes('FROM customers')
    ? [[{ id: 7, name: 'Profile Name', phone: '100', address_line1: 'Profile Road', country: 'India' }]]
    : [[{ id: 9, label: 'Home', full_name: 'Delivery Name', phone: '200', line1: 'Default Road', city: 'Hyd', state: 'TS', pincode: '500001', country: 'India' }]] };
  const address = await getCustomerDeliveryAddress(connection, 7);
  assert.equal(address.address_line1, 'Default Road');
  assert.equal(address.address_full_name, 'Delivery Name');
  assert.equal(addressValues(address).length, 10);
});

test('falls back to profile address when no saved address exists', async () => {
  const connection = { query: async sql => sql.includes('FROM customers')
    ? [[{ id: 7, name: 'Profile Name', phone: '100', address_line1: 'Profile Road', city: 'Hyd', country: 'India' }]] : [[]] };
  const address = await getCustomerDeliveryAddress(connection, 7);
  assert.equal(address.address_line1, 'Profile Road');
  assert.equal(address.address_full_name, 'Profile Name');
});

test('preserves stored order image and backfills only blank historical images', async () => {
  let imageQueries = 0;
  const connection = { query: async (sql) => {
    if (sql.includes('FROM admin_order_items')) return [[
      { product_id: 1, image_url: '/uploads/stored.jpg' }, { product_id: 2, image_url: '' }
    ]];
    imageQueries++; return [[{ image_url: '/uploads/current.jpg' }]];
  } };
  const items = await enrichStaffOrderItems(connection, 'admin_order_items', 5);
  assert.deepEqual(items.map(item => item.image), ['/uploads/stored.jpg', '/uploads/current.jpg']);
  assert.equal(imageQueries, 1);
});

test('rejects a missing selected customer before creating an order', async () => {
  await assert.rejects(getCustomerDeliveryAddress({ query: async () => [[]] }, 999), { status: 404 });
});
