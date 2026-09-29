const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getCustomerDeliveryAddress, addressValues, enrichStaffOrderItems, ensureStaffOrderSnapshotColumns } = require('../services/staffOrderPresentation');

test('schema setup adds only missing nullable snapshot columns', async () => {
  const alterations = [];
  const connection = { query: async sql => {
    if (sql.startsWith('SHOW COLUMNS')) return [[{ Field: 'address_id' }]];
    alterations.push(sql); return [{}];
  } };
  await ensureStaffOrderSnapshotColumns(connection);
  // Spelled out as the exact set rather than a count, so dropping a column is
  // caught here and adding one does not mean editing a magic number.
  assert.deepEqual(alterations.map(sql => sql.replace(/^ALTER TABLE (\w+) ADD COLUMN (\w+) .*$/, '$1.$2')).sort(), [
    'admin_order_items.selected_color', 'admin_order_items.selected_size',
    'admin_orders.address_city', 'admin_orders.address_country', 'admin_orders.address_full_name',
    'admin_orders.address_label', 'admin_orders.address_line1', 'admin_orders.address_line2',
    'admin_orders.address_phone', 'admin_orders.address_pincode', 'admin_orders.address_state',
    'admin_orders.delivery_date',
    'orders.delivery_date',
    'salesman_order_items.selected_color', 'salesman_order_items.selected_size',
    'salesman_orders.address_city', 'salesman_orders.address_country', 'salesman_orders.address_full_name',
    'salesman_orders.address_label', 'salesman_orders.address_line1', 'salesman_orders.address_line2',
    'salesman_orders.address_phone', 'salesman_orders.address_pincode', 'salesman_orders.address_state',
    'salesman_orders.delivery_date'
  ]);
  assert.ok(alterations.every(sql => /ALTER TABLE (admin_orders|salesman_orders|admin_order_items|salesman_order_items|orders) ADD COLUMN (address_|selected_|delivery_date)/.test(sql) && sql.endsWith(' NULL')));
  assert.equal(alterations.some(sql => /ADD COLUMN address_id/.test(sql)), false);
  assert.equal(alterations.filter(sql => /ADD COLUMN selected_(size|color)/.test(sql)).length, 4);
});

test('the delivery date column is a nullable day, not a timestamp', () => {
  // Checked against the source rather than a second call into the ensure helper,
  // which memoises its schema promise and would silently reuse the first test's
  // connection instead of this one.
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'staffOrderPresentation.js'), 'utf8');
  assert.match(source, /delivery_date: 'DATE NULL'/,
    'a delivery date is a calendar day, so it must not be a DATETIME');
  assert.doesNotMatch(source, /delivery_date: 'DATETIME/i);
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

test('resolves the colour name from the line own colour value', async () => {
  const connection = { query: async () => [[
    { product_id: 1, selected_color: '#0000FF' }, { product_id: 1, selected_color: '#FF0000' }
  ]] };
  const items = await enrichStaffOrderItems(connection, 'admin_order_items', 5);
  assert.equal(items[0].selected_color_name, 'Blue');
  assert.equal(items[1].selected_color_name, 'Red');
});

test('keeps a colour name already stored on the order line', async () => {
  const connection = { query: async () => [[{ product_id: 1, selected_color: '#1E90FF', selected_color_name: 'Name At Order Time' }]] };
  const items = await enrichStaffOrderItems(connection, 'admin_order_items', 5);
  assert.equal(items[0].selected_color_name, 'Name At Order Time');
});

test('leaves the name empty for a colour that cannot be resolved', async () => {
  const connection = { query: async () => [[{ product_id: 1, selected_color: 'colour-id-99' }]] };
  const items = await enrichStaffOrderItems(connection, 'admin_order_items', 5);
  assert.equal(items[0].selected_color_name, null);
  assert.equal(items[0].selected_color, 'colour-id-99');
});

test('never turns an unknown technical value into a display name', async () => {
  const stored = ['colour-id-99', '12', 'red_1', 'rgb(255,0,0)', 'hsl(0,0%,0%)', '#GGG', 'ff0000x'];
  const connection = { query: async () => [stored.map(value => ({ product_id: 1, selected_color: value }))] };
  const items = await enrichStaffOrderItems(connection, 'admin_order_items', 5);
  assert.deepEqual(items.map(item => item.selected_color_name), stored.map(() => null));
});

test('adds no colour name for a line with no colour selected', async () => {
  const connection = { query: async () => [[{ product_id: 1, image_url: '/uploads/a.jpg' }]] };
  const items = await enrichStaffOrderItems(connection, 'admin_order_items', 5);
  assert.equal('selected_color_name' in items[0], false);
});

test('resolves the colour name the same way for salesman order items', async () => {
  const connection = { query: async sql => {
    if (sql.includes('FROM salesman_order_items')) return [[{ product_id: 1, selected_color: '#FF0000', image_url: '/uploads/red.jpg' }]];
    return [[]];
  } };
  const items = await enrichStaffOrderItems(connection, 'salesman_order_items', 9);
  assert.equal(items[0].selected_color_name, 'Red');
  assert.equal(items[0].image, '/uploads/red.jpg');
});

test('rejects a missing selected customer before creating an order', async () => {
  await assert.rejects(getCustomerDeliveryAddress({ query: async () => [[]] }, 999), { status: 404 });
});
