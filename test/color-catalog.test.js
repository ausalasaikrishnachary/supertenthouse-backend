const test = require('node:test');
const assert = require('node:assert/strict');
const {
  describeColor,
  describeColorOptions,
  colorNameFor,
  colorImageFor,
  attachSelectedColor,
  normalizeColorValue,
} = require('../services/colorCatalog');

// Blue is deliberately NOT first in the colour list, so any code that falls back
// to the first option fails these tests.
const COLOR_IMAGES = JSON.stringify({
  '#FF0000': ['uploads/tent-red-1.jpg', 'uploads/tent-red-2.jpg'],
  '#0000FF': ['uploads/tent-blue.jpg'],
  '#008000': ['uploads/tent-green.jpg'],
});
const COLORS = JSON.stringify(['#FF0000', '#0000FF', '#008000']);

test('a selected colour resolves to its own name and its own image', () => {
  assert.deepEqual(describeColor('#0000FF', COLOR_IMAGES), {
    value: '#0000FF',
    name: 'Blue',
    image: 'uploads/tent-blue.jpg',
  });
  assert.deepEqual(describeColor('#FF0000', COLOR_IMAGES), {
    value: '#FF0000',
    name: 'Red',
    image: 'uploads/tent-red-1.jpg',
  });
  assert.deepEqual(describeColor('#008000', COLOR_IMAGES), {
    value: '#008000',
    name: 'Green',
    image: 'uploads/tent-green.jpg',
  });
});

test('each colour in a list keeps a name and image that agree', () => {
  const options = describeColorOptions(COLORS, COLOR_IMAGES);
  assert.deepEqual(options, [
    { value: '#FF0000', name: 'Red', image: 'uploads/tent-red-1.jpg' },
    { value: '#0000FF', name: 'Blue', image: 'uploads/tent-blue.jpg' },
    { value: '#008000', name: 'Green', image: 'uploads/tent-green.jpg' },
  ]);
  for (const option of options) {
    // The image must be the one stored under this colour's own key.
    assert.equal(option.image, colorImageFor(option.value, COLOR_IMAGES));
    assert.equal(option.name, colorNameFor(option.value));
  }
});

test('the stored colour value is never returned as the display name', () => {
  for (const value of ['#FF0000', '#0000FF', '#008000']) {
    const described = describeColor(value, COLOR_IMAGES);
    assert.notEqual(described.name, value);
    assert.doesNotMatch(described.name, /^#|^rgb/i);
  }
});

test('an unknown hex resolves to no name instead of leaking the value', () => {
  const described = describeColor('#123456', COLOR_IMAGES);
  assert.equal(described.name, null);
  assert.equal(described.image, null);
});

test('an opaque stored token is never mistaken for a display name', () => {
  // These are the values that used to reach the screen verbatim, because they are
  // not valid hex and the old "is it display text?" check was too permissive.
  for (const token of ['colour-id-99', '12', 'red_1', 'rgb(255,0,0)', 'rgba(255,0,0,0.5)', 'hsl(0,0%,0%)', '#GGG', 'ff0000x', '  ']) {
    assert.equal(colorNameFor(token), null, `expected no display name for ${JSON.stringify(token)}`);
  }
});

test('real colour names are still passed through untouched', () => {
  for (const name of ['Blue', 'Sky Blue', 'Hot Pink', 'Off-White']) {
    assert.equal(colorNameFor(name), name);
  }
});

test('a colour with no image keeps its name and reports no image', () => {
  const described = describeColor('#0000FF', JSON.stringify({ '#FF0000': ['uploads/red.jpg'] }));
  assert.equal(described.name, 'Blue');
  assert.equal(described.image, null);
});

test('a colour with no name but an image still resolves the image', () => {
  const described = describeColor('#123456', JSON.stringify({ '#123456': ['uploads/custom.jpg'] }));
  assert.equal(described.image, 'uploads/custom.jpg');
});

test('a stored colour that is already a name is passed through untouched', () => {
  assert.equal(colorNameFor('Ocean Blue'), 'Ocean Blue');
  assert.deepEqual(describeColor('Ocean Blue', COLOR_IMAGES), {
    value: 'Ocean Blue', name: 'Ocean Blue', image: null,
  });
});

test('hex matching ignores case and short form', () => {
  assert.equal(normalizeColorValue('#abc'), '#AABBCC');
  assert.equal(normalizeColorValue('abc'), '#AABBCC');
  assert.equal(normalizeColorValue('  #0000ff '), '#0000FF');
  assert.equal(colorNameFor('#0000ff'), 'Blue');
  assert.equal(colorImageFor('#0000ff', COLOR_IMAGES), 'uploads/tent-blue.jpg');
});

test('a lowercase-keyed image map still resolves an uppercase colour value', () => {
  const lower = JSON.stringify({ '#0000ff': ['uploads/blue.jpg'] });
  assert.equal(colorImageFor('#0000FF', lower), 'uploads/blue.jpg');
});

test('colour options parse the JSON string columns MySQL returns', () => {
  assert.deepEqual(describeColorOptions(COLORS, COLOR_IMAGES).length, 3);
  assert.deepEqual(describeColorOptions('[]', COLOR_IMAGES), []);
  assert.deepEqual(describeColorOptions(null, null), []);
  assert.deepEqual(describeColorOptions('not json', null), []);
});

test('attaching a selection never falls back to the first colour', () => {
  const row = {
    id: 11,
    selected_color: '#008000',
    available_colors: COLORS,
    available_color_images: COLOR_IMAGES,
  };
  const decorated = attachSelectedColor(row);
  assert.equal(decorated.selected_color_name, 'Green');
  assert.equal(decorated.selected_color_image, 'uploads/tent-green.jpg');
  assert.notEqual(decorated.selected_color_image, 'uploads/tent-red-1.jpg');
});

test('two lines for one product keep independent colours', () => {
  const shared = { available_colors: COLORS, available_color_images: COLOR_IMAGES };
  const red = attachSelectedColor({ ...shared, id: 10, selected_color: '#FF0000' });
  const blue = attachSelectedColor({ ...shared, id: 11, selected_color: '#0000FF' });
  assert.deepEqual(
    [red.id, red.selected_color_name, red.selected_color_image],
    [10, 'Red', 'uploads/tent-red-1.jpg']
  );
  assert.deepEqual(
    [blue.id, blue.selected_color_name, blue.selected_color_image],
    [11, 'Blue', 'uploads/tent-blue.jpg']
  );
});

test('a line with no colour selection is left without colour fields', () => {
  const decorated = attachSelectedColor({
    id: 12, selected_color: null, available_colors: COLORS, available_color_images: COLOR_IMAGES,
  });
  assert.equal(decorated.selected_color_name, undefined);
  assert.equal(decorated.selected_color_image, undefined);
});
