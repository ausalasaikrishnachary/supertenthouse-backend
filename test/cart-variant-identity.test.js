const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const PRODUCT_ID = 5;
const CUSTOMER_ID = 1;
const PRODUCTS = {
  [PRODUCT_ID]: {
    sizes: JSON.stringify(['S']),
    colors: JSON.stringify(['#FF0000', '#0000FF']),
    color_images: JSON.stringify({
      '#FF0000': ['uploads/tent-red.jpg'],
      '#0000FF': ['uploads/tent-blue.jpg'],
    }),
  },
};

function createCart() {
  return [
    { id: 10, customer_id: CUSTOMER_ID, product_id: PRODUCT_ID, quantity: 1, price: 100, selected_size: 'S', selected_color: '#FF0000', saved_for_later: null },
    { id: 11, customer_id: CUSTOMER_ID, product_id: PRODUCT_ID, quantity: 2, price: 100, selected_size: 'S', selected_color: '#0000FF', saved_for_later: null },
  ];
}

function setup() {
  const handlers = {};
  const router = {
    post: (url, fn) => { handlers[`POST ${url}`] = fn; },
    get: (url, fn) => { handlers[`GET ${url}`] = fn; },
    put: (url, fn) => { handlers[`PUT ${url}`] = fn; },
    delete: (url, fn) => { handlers[`DELETE ${url}`] = fn; },
  };

  const cart = createCart();
  const queries = [];
  const active = row => row.saved_for_later === null || row.saved_for_later === 0;
  const withOptions = rows => rows.map(row => ({
    ...row,
    available_sizes: PRODUCTS[row.product_id]?.sizes ?? null,
    available_colors: PRODUCTS[row.product_id]?.colors ?? null,
    available_color_images: PRODUCTS[row.product_id]?.color_images ?? null,
  }));

  // db is a raw mysql2 connection, so the callback receives the rows array itself.
  const db = {
    query(sql, values, callback) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      queries.push({ sql: s, args: values });
      const done = result => callback(null, result);

      if (s.includes('information_schema.tables')) return done([{ count: 1 }]);
      if (s.includes('SHOW COLUMNS')) return done([{ Field: 'selected_size' }, { Field: 'selected_color' }]);
      if (s.includes('SHOW INDEX')) return done([]);

      // Writes are interpreted from their own WHERE clause, so a statement that
      // matches on product_id alone is modelled as really touching every colour.
      if (s.startsWith('UPDATE cart_items')) {
        const byId = s.includes('WHERE id = ? AND customer_id = ?');
        const quantity = values[0];
        const targets = byId
          ? cart.filter(row => row.id === Number(values[1]) && row.customer_id === values[2])
          : cart.filter(row => row.customer_id === values[1] && row.product_id === values[2]);
        for (const row of targets) row.quantity = quantity;
        return done({ affectedRows: targets.length });
      }
      if (s.startsWith('DELETE FROM cart_items')) {
        const byId = s.includes('WHERE id = ? AND customer_id = ?');
        const doomed = byId
          ? cart.filter(row => row.id === Number(values[0]) && row.customer_id === values[1])
          : cart.filter(row => row.customer_id === values[0] && row.product_id === values[1]);
        for (const row of doomed) cart.splice(cart.indexOf(row), 1);
        return done({ affectedRows: doomed.length });
      }

      // Cart reads must join the product so the client receives the colour options.
      if (s.includes('AS available_colors')) {
        return done(withOptions(cart.filter(row => row.customer_id === values[0] && active(row))));
      }
      if (s.includes('WHERE id = ? AND customer_id = ?')) {
        return done(cart.filter(row => row.id === Number(values[0]) && row.customer_id === values[1] && active(row)));
      }
      if (s.includes('CAST(product_id AS CHAR) = ?')) {
        return done(cart.filter(row => row.customer_id === values[0] && String(row.product_id) === String(values[1]) && active(row)));
      }
      if (s.includes('selected_size = ? AND selected_color = ?')) {
        return done(cart.filter(row =>
          row.customer_id === values[0]
          && row.product_id === values[1]
          && row.selected_size === values[2]
          && row.selected_color === values[3]
          && active(row)));
      }
      if (s.includes('FROM cart_items') && s.includes('product_id = ?')) {
        return done(cart.filter(row => row.customer_id === values[0] && row.product_id === values[1] && active(row)));
      }
      return done([]);
    },
  };

  const imports = {
    express: { Router: () => router },
    '../db': db,
    '../services/productVariants': require('../services/productVariants'),
    '../services/colorCatalog': require('../services/colorCatalog'),
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../routes/CartRoute.js'), 'utf8'),
    { require: id => imports[id], module: { exports: {} }, console }
  );

  const makeRes = () => ({
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  });

  return { handlers, cart, queries, makeRes };
}

const quantityOf = (f, color) => f.cart.find(row => row.selected_color === color)?.quantity;
const survives = (f, color) => f.cart.some(row => row.selected_color === color);

test('reading the cart returns the product colour options for every line', async () => {
  const f = setup();
  const res = f.makeRes();
  await f.handlers['GET /cart/:customerId']({ params: { customerId: CUSTOMER_ID } }, res);

  assert.equal(res.code, 200);
  assert.equal(res.body.data.length, 2);
  for (const row of res.body.data) {
    assert.equal(row.available_colors, PRODUCTS[PRODUCT_ID].colors);
    assert.ok(row.selected_color);
  }
});

test('each cart line reports the name and image of its own selected colour', async () => {
  const f = setup();
  const res = f.makeRes();
  await f.handlers['GET /cart/:customerId']({ params: { customerId: CUSTOMER_ID } }, res);

  const byColour = Object.fromEntries(res.body.data.map(row => [row.selected_color, row]));
  assert.deepEqual(
    [byColour['#FF0000'].selected_color_name, byColour['#FF0000'].selected_color_image],
    ['Red', 'uploads/tent-red.jpg']
  );
  assert.deepEqual(
    [byColour['#0000FF'].selected_color_name, byColour['#0000FF'].selected_color_image],
    ['Blue', 'uploads/tent-blue.jpg']
  );
});

test('the cart never reports a hex code as the colour name', async () => {
  const f = setup();
  const res = f.makeRes();
  await f.handlers['GET /cart/:customerId']({ params: { customerId: CUSTOMER_ID } }, res);

  for (const row of res.body.data) {
    assert.doesNotMatch(row.selected_color_name, /^#|^rgb/i);
    assert.ok(row.selected_color_name);
  }
});

test('colour picker options pair each name with that colour\'s own image', async () => {
  const f = setup();
  const res = f.makeRes();
  await f.handlers['GET /cart/:customerId']({ params: { customerId: CUSTOMER_ID } }, res);

  const options = res.body.data[0].selected_color_options;
  assert.deepEqual(options, [
    { value: '#FF0000', name: 'Red', image: 'uploads/tent-red.jpg' },
    { value: '#0000FF', name: 'Blue', image: 'uploads/tent-blue.jpg' },
  ]);
});

test('a quantity change targets one cart row and leaves the other colour untouched', async () => {
  const f = setup();
  const res = f.makeRes();
  await f.handlers['PUT /cart']({ body: { customerId: CUSTOMER_ID, productId: PRODUCT_ID, cartItemId: 11, quantity: 5 } }, res);

  assert.equal(res.code, 200);
  assert.equal(quantityOf(f, '#0000FF'), 5);
  assert.equal(quantityOf(f, '#FF0000'), 1, 'sibling colour quantity must not change');
});

test('a quantity change can name the colour instead of the cart row id', async () => {
  const f = setup();
  const res = f.makeRes();
  await f.handlers['PUT /cart']({ body: { customerId: CUSTOMER_ID, productId: PRODUCT_ID, selectedSize: 'S', selectedColor: '#0000FF', quantity: 7 } }, res);

  assert.equal(quantityOf(f, '#0000FF'), 7);
  assert.equal(quantityOf(f, '#FF0000'), 1);
});

test('a product-only quantity change is refused while several colours are in the cart', async () => {
  const f = setup();
  const res = f.makeRes();
  await f.handlers['PUT /cart']({ body: { customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 9 } }, res);

  assert.equal(res.body.message, 'Item not found in cart');
  assert.equal(quantityOf(f, '#FF0000'), 1);
  assert.equal(quantityOf(f, '#0000FF'), 2);
  assert.ok(!f.queries.some(q => q.sql.startsWith('UPDATE cart_items')));
});

test('a product-only quantity change still works when the product has one colour', async () => {
  const f = setup();
  f.cart.splice(1, 1);
  const res = f.makeRes();
  await f.handlers['PUT /cart']({ body: { customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 4 } }, res);

  assert.equal(res.body.message, 'Quantity updated');
  assert.equal(quantityOf(f, '#FF0000'), 4);
});

test('setting the quantity to zero removes only the addressed colour', async () => {
  const f = setup();
  const res = f.makeRes();
  await f.handlers['PUT /cart']({ body: { customerId: CUSTOMER_ID, productId: PRODUCT_ID, cartItemId: 11, quantity: 0 } }, res);

  assert.equal(res.code, 200);
  assert.ok(!survives(f, '#0000FF'));
  assert.ok(survives(f, '#FF0000'), 'the other colour must remain in the cart');
});

test('deleting a line removes only the colour it names', async () => {
  const f = setup();
  const res = f.makeRes();
  await f.handlers['DELETE /cart/item']({ body: { customerId: CUSTOMER_ID, productId: PRODUCT_ID, selectedSize: 'S', selectedColor: '#0000FF' } }, res);

  assert.equal(res.code, 200);
  assert.ok(!survives(f, '#0000FF'));
  assert.ok(survives(f, '#FF0000'), 'removing one colour must not remove the other');
  assert.equal(f.cart.length, 1);
});

test('a product-only delete is refused while several colours are in the cart', async () => {
  const f = setup();
  const res = f.makeRes();
  await f.handlers['DELETE /cart/item']({ body: { customerId: CUSTOMER_ID, productId: PRODUCT_ID } }, res);

  assert.equal(res.body.message, 'Item not found in cart');
  assert.equal(f.cart.length, 2, 'an ambiguous delete must not remove any colour');
  assert.ok(!f.queries.some(q => q.sql.startsWith('DELETE FROM cart_items')));
});

test('cart mutations never address rows by product_id alone', async () => {
  const f = setup();
  const put = f.makeRes();
  await f.handlers['PUT /cart']({ body: { customerId: CUSTOMER_ID, productId: PRODUCT_ID, cartItemId: 11, quantity: 3 } }, put);
  const del = f.makeRes();
  await f.handlers['DELETE /cart/item']({ body: { customerId: CUSTOMER_ID, productId: PRODUCT_ID, cartItemId: 10 } }, del);

  for (const { sql } of f.queries.filter(q => /^(UPDATE|DELETE) cart_items/.test(q.sql))) {
    assert.match(sql, /WHERE id = \? AND customer_id = \?/, `variant-unsafe statement: ${sql}`);
    assert.doesNotMatch(sql, /product_id = \?/, `variant-unsafe statement: ${sql}`);
  }
});
