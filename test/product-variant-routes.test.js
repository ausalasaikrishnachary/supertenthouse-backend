const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const { validateColors, validateSizes } = require('../services/productVariants');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const secret = process.env.JWT_SECRET || 'your_secret_key_here';

const token = role => jwt.sign({ id: 9, role }, secret);

// Loads routes/productRoute.js with stubbed infrastructure so the real handlers and
// the REAL auth middleware run. Returns a router whose routes are arrays of
// middleware ending in the handler, which is exactly how express calls them.
function setup({ role = 'salesman', product = null, noToken = false, files = [] } = {}) {
  const routes = {};
  const queries = [];

  // Express flattens array arguments (`router.post(url, adminOnly, handler)`) into
  // the middleware chain, so the stub has to do the same or a guard array would be
  // mistaken for a single handler.
  const chain = handlers => handlers.flat();

  const row = product ? { ...product } : null;
  const router = {
    use() {},
    get(url, ...handlers) { routes[`GET ${url}`] = chain(handlers); },
    post(url, ...handlers) { routes[`POST ${url}`] = chain(handlers); },
    put(url, ...handlers) { routes[`PUT ${url}`] = chain(handlers); },
    patch(url, ...handlers) { routes[`PATCH ${url}`] = chain(handlers); },
    delete(url, ...handlers) { routes[`DELETE ${url}`] = chain(handlers); }
  };

  // Minimal in-memory stand-in for the products table. Applies the SET clause for
  // real, so a re-read genuinely observes the write.
  const connection = {
    async query(sql, args = []) {
      const text = sql.replace(/\s+/g, ' ').trim();
      queries.push({ sql: text, args });

      if (/^SELECT id, [\w, ]+ FROM products/.test(text)) {
        return [row ? [{ ...row }] : []];
      }

      const update = text.match(/^UPDATE products SET (.+) WHERE id = \?$/);
      if (update) {
        const columns = [...update[1].matchAll(/(\w+) = \?/g)].map(m => m[1]);
        columns.forEach((column, i) => { if (row) row[column] = args[i]; });
        return [{ affectedRows: row ? 1 : 0 }];
      }

      return [[]];
    }
  };

  // Marks upload middleware so a test can assert which routes accept file uploads.
  const uploadMiddleware = label => {
    const fn = (req, res, next) => next();
    fn.uploadMiddleware = label;
    return fn;
  };

  // Real multer is a callable factory that also carries the helpers, so the stub
  // has to be both -- and the instance returned by `multer({ storage })` carries
  // them too, which is what productRoute.js actually calls `.array` on.
  const withHelpers = target => {
    target.array = (field, max) => uploadMiddleware(`array:${field}:${max}`);
    target.single = field => uploadMiddleware(`single:${field}`);
    target.none = () => uploadMiddleware('none');
    target.fields = () => uploadMiddleware('fields');
    return target;
  };
  const multer = options => withHelpers(handler => handler);
  multer.diskStorage = () => ({});
  withHelpers(multer);

  const imports = {
    express: { Router: () => router },
    '../db': { promise: () => connection, query: () => {} },
    multer,
    path: { join: (...parts) => parts.join('/'), extname: () => '.jpg' },
    fs: { existsSync: () => true, mkdirSync() {}, readdirSync: () => [], unlinkSync() {} },
    // Deliberately the real middleware, so 401/403 behaviour is genuinely exercised.
    '../middleware/auth': require('../middleware/auth'),
    '../services/productVariants': require('../services/productVariants'),
    '../services/colorCatalog': require('../services/colorCatalog')
  };

  const module = { exports: {} };
  new Function('require', 'module', 'exports', '__dirname', read('routes/productRoute.js'))(
    id => {
      if (!(id in imports)) throw new Error(`unexpected import: ${id}`);
      return imports[id];
    },
    module,
    module.exports,
    path.join(__dirname, '..', 'routes')
  );

  return { routes, queries, row, product, role, token: noToken ? null : token(role) };
}

// Runs a route the way express would: every middleware in order, then the handler.
// `next` is only handed to arity-3 functions, which is exactly how express decides.
async function call(env, method, url, { params = {}, body = {}, files } = {}) {
  const handlers = env.routes[`${method} ${url}`];
  assert.ok(handlers, `route ${method} ${url} is not registered`);

  const req = {
    params,
    body,
    files,
    headers: env.token ? { authorization: `Bearer ${env.token}` } : {}
  };
  const res = {
    code: 200,
    status(code) { this.code = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; }
  };

  let error = null;

  const run = async index => {
    const handler = handlers[index];
    if (!handler) return;

    let advanced = false;
    const next = err => {
      if (err) { error = err; return; }
      if (advanced) return;
      advanced = true;
      return run(index + 1);
    };

    try {
      await (handler.length >= 3 ? handler(req, res, next) : handler(req, res));
    } catch (caught) {
      error = error || caught;
    }
  };

  await run(0);

  return { res, req, error, middleware: handlers.slice(0, -1) };
}

const sampleProduct = () => ({
  id: 12,
  product_name: 'Family Tent',
  price: '4500.00',
  available_stock: 9,
  discount: '0.00',
  sizes: JSON.stringify([{ size: 'M', price: 4500 }]),
  colors: JSON.stringify(['#000080']),
  color_images: JSON.stringify({ '#000080': ['uploads/products/navy-1.png'] }),
});

// A multer upload, as the diskStorage filename callback would have produced it.
const uploaded = (filename, originalname = filename) => ({
  filename,
  originalname,
  mimetype: 'image/png',
  size: 1234,
});

// ─── Guards ────────────────────────────────────────────────────────────────

const MUTATIONS = [
  ['POST /:id/addons'],
  ['POST /'],
  ['PUT /:id'],
  ['PATCH /:id/variants'],
  ['POST /:id/variant-colors'],
  ['DELETE /:id/variant-colors'],
  ['DELETE /:id'],
  ['POST /:id/images'],
  ['DELETE /:productId/images/:imageId']
];

test('every product-mutating route sits behind an authentication guard', () => {
  const { routes } = setup();
  for (const [key] of MUTATIONS) {
    const handlers = routes[key];
    assert.ok(handlers, `${key} is not registered`);
    assert.ok(handlers.length >= 2, `${key} has no middleware in front of its handler`);
  }
});

test('an unauthenticated caller cannot reach any product mutation', async () => {
  for (const [method, url] of [
    ['POST', '/:id/addons'],
    ['POST', '/'],
    ['PUT', '/:id'],
    ['PATCH', '/:id/variants'],
    ['POST', '/:id/variant-colors'],
    ['DELETE', '/:id/variant-colors'],
    ['DELETE', '/:id'],
    ['POST', '/:id/images'],
    ['DELETE', '/:productId/images/:imageId']
  ]) {
    const { res } = await call(setup({ noToken: true }), method, url, { params: { id: '12' } });
    assert.equal(res.code, 401, `${method} ${url} should require a token`);
  }
});

test('product reads stay public', () => {
  const { routes } = setup();
  for (const key of ['GET /', 'GET /:id', 'GET /category/:categoryId', 'GET /colors', 'GET /search']) {
    assert.equal(routes[key].length, 1, `${key} must not require a token`);
  }
});

test('a customer cannot modify products', async () => {
  for (const [method, url] of [
    ['PUT', '/:id'],
    ['PATCH', '/:id/variants'],
    ['POST', '/:id/variant-colors'],
    ['DELETE', '/:id/variant-colors'],
    ['DELETE', '/:id']
  ]) {
    const { res } = await call(setup({ role: 'customer' }), method, url, { params: { id: '12' } });
    assert.equal(res.code, 403, `${method} ${url} must reject a customer`);
  }
});

test('salesmen are refused the full-product and image routes', async () => {
  for (const [method, url] of [
    ['POST', '/'],
    ['PUT', '/:id'],
    ['DELETE', '/:id'],
    ['POST', '/:id/images'],
    ['DELETE', '/:productId/images/:imageId'],
    ['POST', '/:id/addons']
  ]) {
    const env = setup({ role: 'salesman' });
    const { res } = await call(env, method, url, { params: { id: '12', productId: '12', imageId: '3' } });
    assert.equal(res.code, 403, `${method} ${url} must stay admin-only`);
    assert.equal(env.queries.length, 0, `${method} ${url} must not touch the database`);
  }
});

test('an admin keeps full access to every product mutation', async () => {
  const { routes } = setup({ role: 'admin' });
  // Two guards plus the handler.
  assert.equal(routes['PATCH /:id/variants'].length, 3, 'admin must satisfy the staff-only guard');
  // Two guards, the upload middleware, then the handler.
  assert.equal(routes['PUT /:id'].length, 4, 'admin must satisfy adminOnly plus upload');
});

test('the variants route accepts JSON only, with no file-upload middleware', () => {
  const { routes } = setup();
  const middleware = routes['PATCH /:id/variants'].slice(0, -1);
  assert.equal(middleware.length, 2, 'expected exactly the two auth guards and nothing else');
  for (const fn of middleware) {
    assert.equal(fn.uploadMiddleware, undefined, 'no multer middleware may guard this route');
  }
});

test('server.js no longer exposes the colour-image repair route to anonymous callers', () => {
  const source = read('server.js');
  assert.match(source, /app\.post\("\/api\/fix-color-images\/:id", adminOnly,/);
  assert.match(source, /require\("\.\/middleware\/auth"\)/);
});

// ─── PATCH /:id/variants ───────────────────────────────────────────────────

test('the variants endpoint requires a positive integer product id', async () => {
  for (const id of ['0', '-3', 'abc', '12.5']) {
    const { res } = await call(setup({ product: sampleProduct() }), 'PATCH', '/:id/variants', {
      params: { id },
      body: { sizes: [] }
    });
    assert.equal(res.code, 400, `id "${id}" should be rejected`);
  }
});

test('the variants endpoint needs at least one of sizes or colors', async () => {
  const env = setup({ product: sampleProduct() });
  const { res } = await call(env, 'PATCH', '/:id/variants', { params: { id: '12' }, body: { price: 1 } });
  assert.equal(res.code, 400);
  assert.match(res.body.message, /Nothing to update/);
  assert.equal(env.queries.length, 0, 'a no-op request must not reach the database');
});

test('the variants endpoint refuses colour images', async () => {
  const env = setup({ product: sampleProduct() });
  const { res } = await call(env, 'PATCH', '/:id/variants', {
    params: { id: '12' },
    body: { colors: ['Red'], color_images: { Red: ['uploads/products/evil.jpg'] } }
  });
  assert.equal(res.code, 400);
  assert.match(res.body.message, /uploaded through \/variant-colors/);
  // The smuggled map must not reach the column.
  assert.equal(env.row.color_images, JSON.stringify({ '#000080': ['uploads/products/navy-1.png'] }));
  assert.equal(env.queries.some(q => /^UPDATE/.test(q.sql)), false, 'nothing may be written');
});

test('the variants endpoint reports a missing product as 404', async () => {
  const { res } = await call(setup({ product: null }), 'PATCH', '/:id/variants', {
    params: { id: '12' },
    body: { sizes: [] }
  });
  assert.equal(res.code, 404);
  assert.match(res.body.message, /Product not found/);
});

test('a sizes-only save touches only the sizes column', async () => {
  const env = setup({ product: sampleProduct() });
  const { res } = await call(env, 'PATCH', '/:id/variants', {
    params: { id: '12' },
    body: { sizes: [{ size: 'L', price: 5200 }] }
  });

  assert.equal(res.code, 200);
  const update = env.queries.find(q => /^UPDATE products/.test(q.sql));
  assert.equal(update.sql, 'UPDATE products SET sizes = ? WHERE id = ?');
  assert.deepEqual(JSON.parse(update.args[0]), [{ size: 'L', price: 5200 }]);
  assert.equal(update.args[1], 12);

  // Every other product field is untouched.
  assert.equal(env.row.product_name, 'Family Tent');
  assert.equal(env.row.price, '4500.00');
  assert.equal(env.row.available_stock, 9);
  assert.equal(env.row.colors, JSON.stringify(['#000080']), 'colors must survive a sizes-only save');
});

test('a colors-only save touches only the colors column', async () => {
  const env = setup({ product: sampleProduct() });
  const { res } = await call(env, 'PATCH', '/:id/variants', {
    params: { id: '12' },
    body: { colors: ['#FF0000', 'Blue'] }
  });

  assert.equal(res.code, 200);
  const update = env.queries.find(q => /^UPDATE products/.test(q.sql));
  assert.equal(update.sql, 'UPDATE products SET colors = ? WHERE id = ?');
  assert.deepEqual(JSON.parse(update.args[0]), ['#FF0000', 'Blue']);
  assert.equal(env.row.sizes, JSON.stringify([{ size: 'M', price: 4500 }]), 'sizes must survive a colors-only save');
});

test('saving both columns writes both and nothing else', async () => {
  const env = setup({ product: sampleProduct() });
  await call(env, 'PATCH', '/:id/variants', {
    params: { id: '12' },
    body: { sizes: [{ size: 'S', price: 4000 }], colors: ['Green'] }
  });

  const update = env.queries.find(q => /^UPDATE products/.test(q.sql));
  assert.equal(update.sql, 'UPDATE products SET sizes = ?, colors = ? WHERE id = ?');

  // A value that is identical to the stored one must still be a 200, not a 404:
  // MySQL reports zero affected rows for a no-op UPDATE.
  const repeat = await call(setup({ product: sampleProduct() }), 'PATCH', '/:id/variants', {
    params: { id: '12' },
    body: { sizes: [{ size: 'M', price: 4500 }] }
  });
  assert.equal(repeat.res.code, 200);
});

test('the response reports the values actually stored, not the request echoed back', async () => {
  const env = setup({ product: sampleProduct() });
  const { res } = await call(env, 'PATCH', '/:id/variants', {
    params: { id: '12' },
    body: { colors: ['#0f0'] }
  });

  assert.equal(res.code, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.product.id, 12);
  // "#0f0" is normalised to the catalog's canonical "#00FF00" on write.
  assert.deepEqual(res.body.product.colors, ['#00FF00']);
  assert.deepEqual(res.body.product.sizes, [{ size: 'M', price: 4500 }]);
});

test('an explicitly empty array clears the list instead of being ignored', async () => {
  const env = setup({ product: sampleProduct() });
  const { res } = await call(env, 'PATCH', '/:id/variants', {
    params: { id: '12' },
    body: { colors: [] }
  });

  assert.equal(res.code, 200);
  assert.equal(env.row.colors, '[]');
  assert.deepEqual(res.body.product.colors, []);
});

test('invalid sizes are rejected before any write', async () => {
  for (const sizes of [
    [{ size: 'M' }, { size: 'm' }],          // duplicate, case-insensitively
    [{ size: '' }],                          // blank
    [{ size: 'M', price: -5 }],              // negative price
    [{ size: 'M', price: 'abc' }],          // non-numeric price
    [{ name: 'M', price: 10 }, { size: 'm', price: 20 }], // duplicate via the name alias
    'not-an-array',
    'not-json'                              // must not be read as "clear the list"
  ]) {
    const env = setup({ product: sampleProduct() });
    const { res } = await call(env, 'PATCH', '/:id/variants', { params: { id: '12' }, body: { sizes } });
    assert.equal(res.code, 400, `sizes ${JSON.stringify(sizes)} should be rejected`);
    assert.equal(env.row.sizes, JSON.stringify([{ size: 'M', price: 4500 }]), 'stored sizes must not change');
  }
});

test('invalid colours are rejected before any write', async () => {
  for (const colors of [
    ['rgb(255,0,0)'],          // not hex, not a display name
    ['#GGGGGG'],               // malformed hex
    [''],                      // blank
    ['Red', 'red'],            // duplicate name
    ['Red', '#FF0000'],        // same colour expressed two ways
    [{ hue: 0 }],              // object
    'not-an-array',
    'not-json',                // a malformed string must not be read as "clear the list"
    '["#FF0000",'              // truncated JSON
  ]) {
    const env = setup({ product: sampleProduct() });
    const { res } = await call(env, 'PATCH', '/:id/variants', { params: { id: '12' }, body: { colors } });
    assert.equal(res.code, 400, `colors ${JSON.stringify(colors)} should be rejected`);
    assert.equal(env.row.colors, JSON.stringify(['#000080']), 'stored colors must not change');
  }
});

test("a salesman's variants save never rewrites an order", async () => {
  const env = setup({ product: sampleProduct() });
  await call(env, 'PATCH', '/:id/variants', {
    params: { id: '12' },
    body: { sizes: [{ size: 'XL', price: 6000 }], colors: ['Red', 'Blue'] }
  });

  // Order items are frozen snapshots taken at checkout, so the only table this
  // endpoint may ever write is `products`.
  for (const q of env.queries) {
    assert.doesNotMatch(q.sql, /\b(orders|order_items|cart_items|wishlists)\b/);
  }
  const writes = env.queries.filter(q => /^(UPDATE|INSERT|DELETE)/.test(q.sql));
  assert.equal(writes.length, 1, 'exactly one write, and it is the products update');
});

// ─── Colour photos ─────────────────────────────────────────────────────────

test('a salesman may upload a colour photo', async () => {
  const env = setup({ product: sampleProduct() });
  const { res } = await call(env, 'POST', '/:id/variant-colors', {
    params: { id: '12' },
    body: { color: '#000080' },
    files: [uploaded('1700000000-123456789.png')]
  });

  assert.equal(res.code, 201);
  const write = env.queries.find(q => /^UPDATE products/.test(q.sql));
  // Only color_images is touched; sizes and colors are left exactly as they were.
  assert.equal(write.sql, 'UPDATE products SET color_images = ? WHERE id = ?');
  assert.deepEqual(JSON.parse(write.args[0]), {
    '#000080': ['uploads/products/navy-1.png', 'uploads/products/1700000000-123456789.png']
  });
});

test('a salesman may add a colour with a photo in one go', async () => {
  const env = setup({ product: sampleProduct() });
  // The colour is added through the variants endpoint first...
  await call(env, 'PATCH', '/:id/variants', { params: { id: '12' }, body: { colors: ['#000080', '#FF0000'] } });
  // ...and the photo attaches to the newly stored key.
  const { res } = await call(env, 'POST', '/:id/variant-colors', {
    params: { id: '12' },
    body: { color: '#FF0000' },
    files: [uploaded('red-1.png')]
  });

  assert.equal(res.code, 201);
  assert.equal(res.body.color, '#FF0000');
  assert.deepEqual(JSON.parse(env.row.color_images), {
    '#000080': ['uploads/products/navy-1.png'],
    '#FF0000': ['uploads/products/red-1.png'],
  });
});

test('the stored path is built from the multer filename, never from client input', async () => {
  const env = setup({ product: sampleProduct() });
  // A hostile originalname, and a body that tries to smuggle a path in.
  await call(env, 'POST', '/:id/variant-colors', {
    params: { id: '12' },
    body: { color: '#000080', color_images: JSON.stringify({ '#000080': ['../../etc/passwd'] }) },
    files: [uploaded('safe-name.png', '../../etc/passwd.png')]
  });

  const stored = JSON.stringify(JSON.parse(env.row.color_images));
  assert.doesNotMatch(stored, /etc\/passwd|\.\./);
  assert.match(stored, /uploads\/products\/safe-name\.png/);
});

test('the colour must already be one of the product colours', async () => {
  for (const color of ['#123456', 'NotAColour', '', undefined]) {
    const env = setup({ product: sampleProduct() });
    const { res } = await call(env, 'POST', '/:id/variant-colors', {
      params: { id: '12' },
      body: { color },
      files: [uploaded('x.png')]
    });
    assert.equal(res.code, 400, `colour ${JSON.stringify(color)} should be rejected`);
    assert.match(res.body.message, /Add this colour to the product/);
    assert.equal(env.queries.some(q => /^UPDATE/.test(q.sql)), false, 'nothing may be written');
  }
});

test('the colour key is matched case-insensitively but written in its stored form', async () => {
  const env = setup({ product: sampleProduct() });
  const { res } = await call(env, 'POST', '/:id/variant-colors', {
    params: { id: '12' },
    body: { color: '  #000080  ' },
    files: [uploaded('x.png')]
  });

  assert.equal(res.code, 201);
  // The map key is the stored value, not the trimmed request echo, so a differently
  // cased submission cannot create a second unreachable entry.
  assert.equal(res.body.color, '#000080');
  assert.deepEqual(Object.keys(JSON.parse(env.row.color_images)), ['#000080']);
});

test('uploading requires a file and a valid product', async () => {
  const noFile = await call(setup({ product: sampleProduct() }), 'POST', '/:id/variant-colors', {
    params: { id: '12' }, body: { color: '#000080' }, files: []
  });
  assert.equal(noFile.res.code, 400);
  assert.match(noFile.res.body.message, /at least one photo/);

  const badId = await call(setup({ product: sampleProduct() }), 'POST', '/:id/variant-colors', {
    params: { id: '0' }, body: { color: '#000080' }, files: [uploaded('x.png')]
  });
  assert.equal(badId.res.code, 400);

  const missing = await call(setup({ product: null }), 'POST', '/:id/variant-colors', {
    params: { id: '12' }, body: { color: '#000080' }, files: [uploaded('x.png')]
  });
  assert.equal(missing.res.code, 404);
});

test('a salesman may remove one colour photo, and the last one drops the key', async () => {
  const env = setup({ product: sampleProduct() });
  const { res } = await call(env, 'DELETE', '/:id/variant-colors', {
    params: { id: '12' },
    body: { color: '#000080', images: ['uploads/products/navy-1.png'] }
  });

  assert.equal(res.code, 200);
  assert.deepEqual(res.body.images, []);
  assert.deepEqual(JSON.parse(env.row.color_images), {}, 'an empty list must not leave an empty key behind');
});

test('removing keeps the colours that survive', async () => {
  const env = setup({
    product: {
      ...sampleProduct(),
      color_images: JSON.stringify({ '#000080': ['uploads/products/a.png', 'uploads/products/b.png'] }),
    },
  });

  const { res } = await call(env, 'DELETE', '/:id/variant-colors', {
    params: { id: '12' },
    body: { color: '#000080', images: ['uploads/products/a.png'] }
  });

  assert.equal(res.code, 200);
  assert.deepEqual(res.body.images, ['uploads/products/b.png']);
});

test('removal refuses a path that is not attached to that colour', async () => {
  for (const images of [
    ['../../secret.txt'],
    ['uploads/products/other.png'],
    // Attached to a different colour, so still not removable through this one.
    ['uploads/products/someone-elses.png'],
  ]) {
    const env = setup({
      product: {
        ...sampleProduct(),
        colors: JSON.stringify(['#000080', '#FF0000']),
        color_images: JSON.stringify({ '#FF0000': ['uploads/products/someone-elses.png'] }),
      },
    });

    const { res } = await call(env, 'DELETE', '/:id/variant-colors', {
      params: { id: '12' },
      body: { color: '#000080', images }
    });

    assert.equal(res.code, 400, `${JSON.stringify(images)} should be rejected`);
    assert.match(res.body.message, /not attached to this colour/);
    assert.equal(env.queries.some(q => /^UPDATE/.test(q.sql)), false, 'nothing may be written');
  }
});

test('removal needs a colour, at least one path, and an existing product', async () => {
  const nothing = await call(setup({ product: sampleProduct() }), 'DELETE', '/:id/variant-colors', {
    params: { id: '12' }, body: { color: '#000080', images: [] }
  });
  assert.equal(nothing.res.code, 400);

  const unknown = await call(setup({ product: sampleProduct() }), 'DELETE', '/:id/variant-colors', {
    params: { id: '12' }, body: { color: '#123456', images: ['uploads/products/navy-1.png'] }
  });
  assert.equal(unknown.res.code, 400);
  assert.match(unknown.res.body.message, /Unknown colour/);

  const missing = await call(setup({ product: null }), 'DELETE', '/:id/variant-colors', {
    params: { id: '12' }, body: { color: '#000080', images: ['uploads/products/navy-1.png'] }
  });
  assert.equal(missing.res.code, 404);
});

test('a legacy colour value does not block attaching a photo', async () => {
  // normalizeColors is deliberately permissive on the read path, so a row with a
  // value the strict writer would reject can still be managed.
  const env = setup({ product: { ...sampleProduct(), colors: JSON.stringify(['#000080', 'legacy-0012']) } });
  const { res } = await call(env, 'POST', '/:id/variant-colors', {
    params: { id: '12' },
    body: { color: 'legacy-0012' },
    files: [uploaded('x.png')]
  });

  assert.equal(res.code, 201);
  assert.equal(res.body.color, 'legacy-0012');
});

test('a malformed color_images column is repaired rather than crashing the write', async () => {
  const env = setup({ product: { ...sampleProduct(), color_images: 'not json' } });
  const { res } = await call(env, 'POST', '/:id/variant-colors', {
    params: { id: '12' },
    body: { color: '#000080' },
    files: [uploaded('x.png')]
  });

  assert.equal(res.code, 201);
  assert.deepEqual(JSON.parse(env.row.color_images), { '#000080': ['uploads/products/x.png'] });
});

test('no colour-photo request ever rewrites sizes, colors, or an order', async () => {
  const env = setup({ product: sampleProduct() });
  await call(env, 'POST', '/:id/variant-colors', {
    params: { id: '12' }, body: { color: '#000080' }, files: [uploaded('x.png')]
  });
  await call(env, 'DELETE', '/:id/variant-colors', {
    params: { id: '12' }, body: { color: '#000080', images: ['uploads/products/navy-1.png'] }
  });

  for (const q of env.queries) {
    assert.doesNotMatch(q.sql, /\b(orders|order_items|cart_items|wishlists)\b/);
    if (/^UPDATE/.test(q.sql)) {
      assert.equal(q.sql, 'UPDATE products SET color_images = ? WHERE id = ?');
    }
  }
  assert.equal(env.row.sizes, JSON.stringify([{ size: 'M', price: 4500 }]));
  assert.equal(env.row.colors, JSON.stringify(['#000080']));
});

// ─── validateColors in isolation ───────────────────────────────────────────

test('validateColors canonicalises hex and keeps display names verbatim', () => {
  assert.deepEqual(validateColors(['#f00', 'blue', 'Sky Blue']), ['#FF0000', 'blue', 'Sky Blue']);
});

test('validateColors accepts an empty list', () => {
  assert.deepEqual(validateColors([]), []);
});

test('validateColors tolerates a JSON string body, as multipart forms send', () => {
  assert.deepEqual(validateColors('["#FF0000"]'), ['#FF0000']);
  assert.throws(() => validateColors('{"a":1}'), { status: 400 });
});

test('validateSizes accepts a JSON string body too', () => {
  assert.deepEqual(validateSizes('[{"size":"M","price":10}]'), [{ size: 'M', price: 10 }]);
});
