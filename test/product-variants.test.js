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
  const connection = { query: async () => [[{
    price: 500,
    sizes: JSON.stringify([{ size: 'L', price: 600 }]),
    colors: JSON.stringify(['#000000']),
    color_images: JSON.stringify({ '#000000': ['uploads/tent-black.jpg'] }),
  }]] };
  assert.deepEqual(await resolveOrderItemVariant(connection, { product_id: 1, selectedSize: 'L', selectedColor: '#000000', price: 1 }), {
    selected_size: 'L',
    selected_color: '#000000',
    selected_color_name: 'Black',
    selected_color_image: 'uploads/tent-black.jpg',
    price: 600,
  });
  await assert.rejects(resolveOrderItemVariant(connection, { product_id: 1, selectedSize: 'XL', selectedColor: '#000000' }), /valid product size/);
  await assert.rejects(resolveOrderItemVariant(connection, { product_id: 1, selectedSize: 'L', selectedColor: '#ffffff' }), /valid product colour/);
});

test('the order snapshot carries the chosen colour, not the first colour', async () => {
  const connection = { query: async () => [[{
    price: 500,
    sizes: null,
    colors: JSON.stringify(['#0000FF', '#FF0000']),
    color_images: JSON.stringify({ '#0000FF': ['uploads/blue.jpg'], '#FF0000': ['uploads/red.jpg'] }),
  }]] };

  const blue = await resolveOrderItemVariant(connection, { product_id: 1, selectedColor: '#0000ff' });
  assert.deepEqual(
    [blue.selected_color, blue.selected_color_name, blue.selected_color_image],
    ['#0000ff', 'Blue', 'uploads/blue.jpg']
  );

  const red = await resolveOrderItemVariant(connection, { product_id: 1, selectedColor: '#FF0000' });
  assert.deepEqual(
    [red.selected_color, red.selected_color_name, red.selected_color_image],
    ['#FF0000', 'Red', 'uploads/red.jpg']
  );
});

test('legacy products without variants retain their base price', async () => {
  const connection = { query: async () => [[{ price: '99.50', sizes: null, colors: null, color_images: null }]] };
  assert.deepEqual(await resolveOrderItemVariant(connection, { product_id: 2 }), {
    selected_size: null,
    selected_color: null,
    selected_color_name: null,
    selected_color_image: null,
    price: 99.5,
  });
});
