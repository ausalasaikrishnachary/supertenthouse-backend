const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSizes, validateSizes, resolveOrderItemVariant } = require('../services/productVariants');

test('normalizes legacy labels and priced size records', () => {
  assert.deepEqual(normalizeSizes('["S",{"size":"M","price":550}]'), [
    { size: 'S', price: null }, { size: 'M', price: 550 },
  ]);
});

test('rejects blank, duplicate and non-positive priced sizes', () => {
  for (const value of [[{ size: '', price: 10 }], [{ size: 'M', price: 10 }, { size: 'm', price: 20 }], [{ size: 'L', price: 0 }]]) {
    assert.throws(() => validateSizes(value), /unique, non-empty, and have a positive price/);
  }
});

test('uses stored size price and validates configured size and colour', async () => {
  const connection = { query: async () => [[{ price: 500, sizes: JSON.stringify([{ size: 'L', price: 600 }]), colors: JSON.stringify(['#000000']) }]] };
  assert.deepEqual(await resolveOrderItemVariant(connection, { product_id: 1, selectedSize: 'L', selectedColor: '#000000', price: 1 }), {
    selected_size: 'L', selected_color: '#000000', price: 600,
  });
  await assert.rejects(resolveOrderItemVariant(connection, { product_id: 1, selectedSize: 'XL', selectedColor: '#000000' }), /valid product size/);
  await assert.rejects(resolveOrderItemVariant(connection, { product_id: 1, selectedSize: 'L', selectedColor: '#ffffff' }), /valid product colour/);
});

test('legacy products without variants retain their base price', async () => {
  const connection = { query: async () => [[{ price: '99.50', sizes: null, colors: null }]] };
  assert.deepEqual(await resolveOrderItemVariant(connection, { product_id: 2 }), { selected_size: null, selected_color: null, price: 99.5 });
});
