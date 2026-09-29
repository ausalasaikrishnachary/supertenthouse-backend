const { describeColor, normalizeColorValue, colorNameFor } = require('./colorCatalog');

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// The read path above deliberately tolerates a malformed JSON column: it just yields
// no options, which is harmless. A WRITE must not be that forgiving, because falling
// back to [] would silently wipe a product's variants whenever a client sent a
// malformed string. So on the write path a string has to parse.
function parseJsonStrict(value) {
  if (typeof value !== 'string') return value;
  if (value === '') return [];
  try { return JSON.parse(value); }
  catch { throw Object.assign(new Error('Expected a JSON array'), { status: 400 }); }
}

function normalizeSizes(value) {
  const raw = parseJson(value, []);
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map(entry => {
    const size = String(typeof entry === 'object' && entry ? (entry.size ?? entry.name ?? entry.label ?? '') : entry).trim();
    const rawPrice = typeof entry === 'object' && entry ? entry.price : null;
    const price = rawPrice == null || rawPrice === '' ? null : Number(rawPrice);
    if (!size || (price != null && (!Number.isFinite(price) || price <= 0))) return null;
    const key = size.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    return { size, price };
  }).filter(Boolean);
}

function validateSizes(value) {
  const raw = parseJsonStrict(value);
  if (!Array.isArray(raw)) throw Object.assign(new Error('Sizes must be an array'), { status: 400 });
  const normalized = normalizeSizes(raw);
  if (normalized.length !== raw.length) {
    throw Object.assign(new Error('Every size must be unique, non-empty, and have a positive price when supplied'), { status: 400 });
  }
  return normalized;
}

function normalizeColors(value) {
  const raw = parseJson(value, []);
  return Array.isArray(raw) ? [...new Set(raw.map(color => String(color).trim()).filter(Boolean))] : [];
}

// Write-path validation for `products.colors`.
//
// The read path above has to stay permissive: it must cope with whatever legacy
// rows already contain. A WRITE is different, because a stored colour is rendered
// straight to customers as a name. So a value is only accepted when it is either a
// canonical hex or a plain display name.
//
// `colorNameFor` is the same predicate the UI uses to decide whether a token is
// renderable, so reusing it here keeps the write rule and the render rule from
// ever drifting apart.
function validateColors(value) {
  const raw = parseJsonStrict(value);
  if (!Array.isArray(raw)) throw Object.assign(new Error('Colors must be an array'), { status: 400 });

  const seen = new Set();
  const normalized = [];

  for (const entry of raw) {
    const token = String(entry ?? '').trim();
    if (!token) throw Object.assign(new Error('Colours cannot be blank'), { status: 400 });

    const hex = normalizeColorValue(token);
    if (!hex && !colorNameFor(token)) {
      throw Object.assign(new Error(`"${token}" is not a valid colour`), { status: 400 });
    }

    // Store the canonical hex so the value lines up with the keys `color_images`
    // is written under.
    const canonical = hex || token;
    // De-duplicate on the resolved NAME, not the raw token, so "Red" and "#FF0000"
    // are recognised as the same colour instead of both being stored.
    const key = String(colorNameFor(canonical) || canonical).toLowerCase();
    if (seen.has(key)) throw Object.assign(new Error('Colours must be unique'), { status: 400 });

    seen.add(key);
    normalized.push(canonical);
  }

  return normalized;
}

async function resolveOrderItemVariant(connection, item) {
  const [rows] = await connection.query('SELECT price, discount, sizes, colors, color_images FROM products WHERE id = ? LIMIT 1', [item.product_id ?? item.productId]);
  if (!rows[0]) throw Object.assign(new Error('Product not found'), { status: 404 });
  const product = rows[0];
  const sizes = normalizeSizes(product.sizes);
  const colors = normalizeColors(product.colors);
  const selectedSize = String(item.selected_size ?? item.selectedSize ?? '').trim();
  const selectedColor = String(item.selected_color ?? item.selectedColor ?? '').trim();
  const sizeOption = selectedSize ? sizes.find(option => option.size.toLowerCase() === selectedSize.toLowerCase()) : null;
  if (sizes.length && !sizeOption) throw Object.assign(new Error('Select a valid product size'), { status: 400 });
  if (colors.length && (!selectedColor || !colors.some(color => color.toLowerCase() === selectedColor.toLowerCase()))) {
    throw Object.assign(new Error('Select a valid product colour'), { status: 400 });
  }
  const basePrice = Number(product.price) * (1 - Math.max(0, Number(product.discount) || 0) / 100);
  const price = sizeOption?.price ?? basePrice;
  if (!Number.isFinite(price) || price < 0) throw Object.assign(new Error('Product price is invalid'), { status: 400 });
  // Snapshot the colour's display name and image from the colour the customer
  // actually chose, so the saved order never has to be re-resolved later.
  const described = describeColor(selectedColor, product.color_images);
  return {
    selected_size: sizeOption?.size || null,
    selected_color: selectedColor || null,
    selected_color_name: described?.name || null,
    selected_color_image: described?.image || null,
    price,
  };
}

module.exports = { normalizeSizes, normalizeColors, validateColors, validateSizes, resolveOrderItemVariant };
