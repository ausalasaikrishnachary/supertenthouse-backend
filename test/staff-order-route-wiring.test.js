const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const file of ['orderRoutes.js', 'salesmanorderRoutes.js']) {
  test(`${file} prepares schema and snapshots the selected customer's address`, () => {
    const source = fs.readFileSync(path.join(__dirname, '../routes', file), 'utf8');
    const ensureAt = source.indexOf('await ensureStaffOrderSnapshotColumns');
    const transactionAt = source.indexOf('query("START TRANSACTION")');
    const addressAt = source.indexOf('await getCustomerDeliveryAddress');
    assert.ok(ensureAt >= 0 && ensureAt < transactionAt);
    assert.ok(addressAt > transactionAt);
    assert.match(source, /\$\{addressFields\.join\(', '\)\}/);
    assert.match(source, /\.\.\.addressValues\(deliveryAddress\)/);
  });
}
