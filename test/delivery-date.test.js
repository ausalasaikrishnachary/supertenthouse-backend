const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeDeliveryDate, setDeliveryDate } = require('../services/deliveryDate');

const readRoute = file => fs.readFileSync(path.join(__dirname, '..', 'routes', file), 'utf8');
// Several route files carry large commented-out legacy blocks; asserting against
// the raw text would match dead code.
const live = file => readRoute(file).split(/\r?\n/).filter(line => !/^\s*\/\//.test(line)).join('\n');

// A delivery date is the one date on an order that a person has to agree. It is
// written from three different screens, so these tests pin down what is accepted,
// what is refused, and what a customer is allowed to see.

test('a day staff chose is stored exactly as they wrote it', () => {
  assert.equal(normalizeDeliveryDate('2026-12-01'), '2026-12-01');
  assert.equal(normalizeDeliveryDate('2026-02-28'), '2026-02-28');
  // A leap day is a real day in a leap year and must not be refused.
  assert.equal(normalizeDeliveryDate('2028-02-29'), '2028-02-29');
});

test('surrounding whitespace from a text box is not treated as part of the day', () => {
  assert.equal(normalizeDeliveryDate('  2026-12-01  '), '2026-12-01');
});

test('a delivery date left blank means not promised yet, not today', () => {
  for (const blank of [null, '', '   ']) {
    assert.equal(normalizeDeliveryDate(blank), null, `${JSON.stringify(blank)} should clear the date`);
  }
  // An absent field on an edit is different: it means leave the stored date alone.
  assert.equal(normalizeDeliveryDate(undefined), undefined);
});

test('a date that does not exist is refused instead of silently moving', () => {
  // new Date('2026-02-31') is not an error in JavaScript, it is the 3rd of March.
  // Storing that would promise a day the salesman never picked.
  for (const impossible of ['2026-02-31', '2027-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-32']) {
    assert.throws(() => normalizeDeliveryDate(impossible), { status: 400 },
      `${impossible} is not a real day and must be refused`);
  }
});

test('a value that is not a calendar day is refused with a readable message', () => {
  for (const bad of [1750000000000, '01-12-2026', '2026/12/01', 'next friday', '2026-12-01T10:00:00Z', {}, [], true]) {
    assert.throws(() => normalizeDeliveryDate(bad), { status: 400 },
      `${JSON.stringify(bad)} is not a YYYY-MM-DD day`);
  }
  assert.throws(() => normalizeDeliveryDate('tomorrow'), /YYYY-MM-DD/);
});

test('an invalid date never reaches the database', async () => {
  let written = 0;
  const connection = { query: async () => { written++; return [[]]; } };
  await assert.rejects(
    setDeliveryDate(connection, { table: 'admin_orders', id: 1, value: '2026-02-31' }),
    { status: 400 }
  );
  assert.equal(written, 0, 'a refused date must not be written');
});

test('an edit that sends no date at all is refused rather than silently clearing', async () => {
  let written = 0;
  const connection = { query: async () => { written++; return [[]]; } };
  await assert.rejects(
    setDeliveryDate(connection, { table: 'admin_orders', id: 1 }),
    { status: 400 }
  );
  assert.equal(written, 0);
});

test('a saved day is written to the order and to no other column', async () => {
  const statements = [];
  const connection = { query: async (sql, params) => {
    statements.push([sql, params]);
    if (sql.startsWith('SELECT')) return [[{ id: 5, delivery_date: null, status: 'pending' }]];
    return [{ changedRows: 1 }];
  } };
  const order = await setDeliveryDate(connection, { table: 'admin_orders', id: 5, value: '2026-12-01' });
  const [updateSql, updateParams] = statements[0];
  assert.match(updateSql, /UPDATE admin_orders SET delivery_date = \?/);
  assert.doesNotMatch(updateSql, /status|payment/i, 'a delivery date must not disturb the status or the money');
  assert.deepEqual(updateParams, ['2026-12-01', 5]);
  assert.equal(order.delivery_date, '2026-12-01');
});

test('clearing a date writes NULL rather than an empty string', async () => {
  const statements = [];
  const connection = { query: async (sql, params) => {
    statements.push([sql, params]);
    if (sql.startsWith('SELECT')) return [[{ id: 5 }]];
    return [{ changedRows: 1 }];
  } };
  const order = await setDeliveryDate(connection, { table: 'admin_orders', id: 5, value: '' });
  assert.deepEqual(statements[0][1], [null, 5]);
  assert.equal(order.delivery_date, null);
});

test('a salesman can only reach their own order, and the check is in the write itself', async () => {
  const statements = [];
  const connection = { query: async (sql, params) => {
    statements.push([sql, params]);
    if (sql.startsWith('SELECT')) return [[{ id: 9, delivery_date: null }]];
    return [{ changedRows: 1 }];
  } };
  await setDeliveryDate(connection, { table: 'salesman_orders', id: 9, value: '2026-12-01', salesmanId: 3 });
  for (const [sql, params] of statements) {
    assert.match(sql, /AND salesman_id = \?/, 'the owner must be part of the query, not a later check');
    assert.ok(params.includes(3), 'the owner id must be bound as a parameter');
  }
  // An admin reaches every order, so the row is addressed by id alone.
  const adminStatements = [];
  const adminConnection = { query: async (sql, params) => {
    adminStatements.push([sql, params]);
    if (sql.startsWith('SELECT')) return [[{ id: 9 }]];
    return [{ changedRows: 1 }];
  } };
  await setDeliveryDate(adminConnection, { table: 'salesman_orders', id: 9, value: '2026-12-01' });
  assert.doesNotMatch(adminStatements[0][0], /salesman_id/);
  assert.deepEqual(adminStatements[0][1], ['2026-12-01', 9]);
});

test("someone else's order is reported as not found, not as forbidden", async () => {
  // Saying "forbidden" would confirm the order number belongs to another
  // salesman, so the owner filter simply matches nothing.
  const connection = { query: async sql => sql.startsWith('SELECT') ? [[]] : [{ changedRows: 0 }] };
  await assert.rejects(
    setDeliveryDate(connection, { table: 'salesman_orders', id: 9, value: '2026-12-01', salesmanId: 3 }),
    { status: 404 }
  );
});

test('both staff panels can set a delivery date on an order they created', () => {
  assert.match(live('orderRoutes.js'),
    /router\.put\("\/:id\/delivery-date", \.\.\.adminOnly, deliveryDateRoutes\.createHandler\('admin_orders'\)\)/);
  assert.match(live('salesmanorderRoutes.js'),
    /router\.put\("\/:id\/delivery-date", authenticate, requireRole\("salesman", "admin"\),\s*\n\s*deliveryDateService\.createHandler\('salesman_orders', \{ salesmanScoped: true \}\)\)/);
});

test('a customer who placed the order themselves can still be given a promised day', () => {
  // `orders` is created by the customer app, not by a staff panel, so without
  // this route a customer who orders directly would never have a delivery date
  // at all and would be told "to be confirmed" forever.
  assert.match(live('customerorderRoutes.js'),
    /router\.put\("\/:id\/delivery-date", \.\.\.adminOnly, deliveryDateService\.createHandler\('orders'\)\)/);
});

test('only staff can write a delivery date, and the customer app cannot', () => {
  for (const [file, expected] of [
    ['orderRoutes.js', 1],
    ['salesmanorderRoutes.js', 1],
    ['customerorderRoutes.js', 1]
  ]) {
    const routes = live(file).match(/router\.(put|post|patch)\([^)]*delivery-date/g) || [];
    assert.equal(routes.length, expected, `${file} should expose exactly one delivery-date write`);
  }
  // Every delivery-date write must sit behind staff auth, and the checkout the
  // customer app calls must offer no way to set one at all.
  for (const file of ['orderRoutes.js', 'salesmanorderRoutes.js', 'customerorderRoutes.js']) {
    const routes = live(file).match(/router\.(put|post|patch)\([^)]*delivery-date[^\n]*/g) || [];
    for (const route of routes) {
      assert.match(route, /adminOnly|requireRole/, `${file} must not leave a delivery-date write open`);
    }
  }
  assert.doesNotMatch(live('checkout.js'), /delivery-date|delivery_date/,
    'the customer app must not be able to set a delivery date');
  assert.doesNotMatch(live('orderPayments.js'), /delivery.date/i);
});

test('an order can be created with or without a promised delivery day', () => {
  for (const file of ['orderRoutes.js', 'salesmanorderRoutes.js']) {
    const source = live(file);
    assert.match(source, /delivery_date,/, `${file} should store the delivery date on the order`);
    assert.match(source, /deliveryDate \?\? null/, `${file} should leave it null when none was agreed`);
    // and it is never quietly replaced with today
    assert.doesNotMatch(source, /delivery_date[^\n]*CURDATE\(\)/i);
  }
});

test('customers are shown the promised day for staff-created orders', () => {
  // The customer-facing queries list their columns by hand, so a new column has
  // to be added to each of them or a customer silently never sees it.
  const source = live('customerorderRoutes.js');
  const staffQueries = source.match(/o\.order_date AS created_at,[\s\S]{0,80}?o\.status/g) || [];
  assert.equal(staffQueries.length, 4, 'expected the two staff-order queries in the list and the two in the detail route');
  for (const query of staffQueries) {
    assert.match(query, /o\.delivery_date/, 'every staff-order customer query must select the delivery date');
  }
});

test('a customer order keeps its own event date rather than gaining a second one', () => {
  // The customer checkout already asks for a day and stores it in event_date. That
  // column stays exactly as it is. What is deliberately NOT done is promoting it
  // to the delivery date: the customer app fills event_date with today's date
  // rather than a day anyone chose, so treating it as the promised day would show
  // a placeholder to the customer as if staff had agreed it.
  const checkout = live('checkout.js');
  assert.match(checkout, /event_date, event_time/, 'checkout still stores the requested day');
  assert.doesNotMatch(checkout, /delivery_date/, 'checkout must not write a delivery date of its own');
  // `orders` is read with o.*, so the new column reaches the customer unaided.
  assert.match(live('customerorderRoutes.js'), /SELECT\s*\n\s*o\.\*,\s*\n\s*c\.name as customer_name/);
});
