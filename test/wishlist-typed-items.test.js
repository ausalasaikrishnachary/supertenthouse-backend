const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const mobileRoot = path.resolve(backendRoot, '..', 'supertenthouse-mobileapp');
const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');

test('wishlist persistence uses a composite customer/type/item identity', () => {
  const route = read(backendRoot, 'routes/WishlistRoute.js');
  assert.match(route, /item_type VARCHAR\(20\) NOT NULL DEFAULT 'product'/);
  assert.match(route, /unique_wishlist_typed \(customer_id, item_type, product_id\)/);
  assert.match(route, /WHERE customer_id = \? AND item_type = \? AND product_id = \?/);
  assert.match(route, /DELETE FROM wishlist_items WHERE customer_id = \? AND item_type = \? AND product_id = \?/);
  assert.match(route, /id AS wishlist_id, product_id AS item_id/);
  assert.match(route, /INNER JOIN packages p/);
  assert.match(route, /quantity INT NOT NULL DEFAULT 1/);
  assert.match(route, /selected_color VARCHAR\(100\)/);
  assert.match(route, /product_name, price, image, quantity, selected_color/);
});

test('mobile state distinguishes colliding product and package IDs', () => {
  const store = read(mobileRoot, 'store/wishlist.tsx');
  assert.match(store, /`\$\{entry\.type\}:\$\{entry\.id\}`/);
  assert.match(store, /itemType:\s*WishlistItemType = 'product'/);
  assert.match(store, /params: \{ customerId, productId: entry\.id, itemType \}/);
  assert.ok(store.indexOf('row.item_id') < store.indexOf('row.id;'));
  assert.doesNotMatch(store, /dispatch\(\{ type: 'SET', payload: \[\] \}\).*catch/s);
});

test('package adds and Wishlist rendering retain package type', () => {
  const detail = read(mobileRoot, 'app/package/[id].tsx');
  const wishlist = read(mobileRoot, 'app/wishlist.tsx');
  assert.match(detail, /has\(pkg\.id, 'package'\)/);
  assert.match(detail, /toggle\(pkg\.id, customerId, productData, 'package'\)/);
  assert.match(wishlist, /mockApi\.getPackages\(\)/);
  assert.match(wishlist, /item\.itemType === 'package' \? `\/package\/\$\{item\.id\}`/);
  assert.match(wishlist, /keyExtractor=\{\(item\) => `\$\{item\.itemType\}:\$\{item\.id\}`\}/);
  assert.match(wishlist, /params: \{ customerId, productId, itemType \}/);
  assert.match(wishlist, /Number\(response\.data\.affectedRows\) > 0/);
  assert.match(wishlist, /remove\(productId, itemType\)/);
  assert.match(wishlist, /Quantity: \{item\.quantity\}/);
  assert.match(wishlist, /Colour: \{item\.selectedColor\}/);
  assert.match(wishlist, /p\.id === productId && p\.itemType === itemType/);
});

test('home header shows and refreshes the complete wishlist count', () => {
  const home = read(mobileRoot, 'app/(tabs)/index.tsx');
  assert.match(home, /state: wishState, fetchWishlist/);
  assert.match(home, /await fetchWishlist\(String\(customerId\)\)/);
  assert.match(home, /wishState\.entries\.length > 99 \? '99\+' : wishState\.entries\.length/);
  assert.match(home, /Wishlist, \$\{wishState\.entries\.length\}/);

  const activeHome = home.slice(home.lastIndexOf('export default function HomeScreen'));
  assert.doesNotMatch(activeHome, /wishState\.entries\.length > 0 && <View style=\{styles\.notifDot\}/);
});
