function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
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
  const raw = parseJson(value, []);
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

async function resolveOrderItemVariant(connection, item) {
  const [rows] = await connection.query('SELECT price, discount, sizes, colors FROM products WHERE id = ? LIMIT 1', [item.product_id ?? item.productId]);
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
  return { selected_size: sizeOption?.size || null, selected_color: selectedColor || null, price };
}

module.exports = { normalizeSizes, normalizeColors, validateSizes, resolveOrderItemVariant };
