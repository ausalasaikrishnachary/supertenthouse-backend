const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mobile = path.resolve(__dirname, '..', '..', 'supertenthouse-mobileapp');
const read = file => fs.readFileSync(path.join(mobile, file), 'utf8');

test('customer product mapping preserves real zero stock and cards display it', () => {
  const api = read('services/api.ts');
  assert.match(api, /Number\(apiProduct\.available_stock \?\? apiProduct\.stock_count \?\? apiProduct\.stockCount \?\? 0\)/);
  assert.doesNotMatch(api.slice(api.lastIndexOf('const mapProduct')), /available_stock\) \|\|[^\n]*10/);
  for (const file of ['components/ProductCard.tsx', 'app/category/[id].tsx', 'app/(tabs)/index.tsx', 'app/product/[id].tsx']) {
    assert.match(read(file), /Available Stock:/, `${file} should display available stock`);
  }
});
