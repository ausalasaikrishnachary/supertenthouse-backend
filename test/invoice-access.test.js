const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const reader = require('../middleware/orderReader');
const { loadInvoice, escapeInvoice } = require('../services/invoiceData');
function fixture(invoice = 'INV-CUS-2026-000001') {
  const queries = [];
  return { queries, query: async (sql, params) => {
    queries.push(sql);
    assert.ok(sql.startsWith('SELECT'));
    if (sql.includes('FROM customers')) return [[{ name: 'Customer' }]];
    if (sql.includes('_order_items')) return [[{ product_name: 'Tent', price: 100, quantity: 2, subtotal: 190 }]];
    if (params.length === 2 && params[1] !== 5) return [[]];
    return [[{ customer_id: 5, invoice_number: invoice, status: 'approved', items: JSON.stringify([{ name: 'Tent', price: 100, quantity: 2 }]), subtotal: 200, gst: 36, grand_total: 236 }]];
  } };
}
test('all sources use stored invoice data, ignore tampering and permit approved orders', async () => {
  for (const orderSource of ['customer', 'admin', 'salesman']) {
    const result = await loadInvoice(fixture(), { orderId: 1, orderSource, grandTotal: 1, invoiceNumber: 'FAKE' }, 5);
    assert.equal(result.grandTotal, 236);
    assert.equal(result.invoiceNumber, 'INV-CUS-2026-000001');
    assert.equal(result.items[0].name, 'Tent');
  }
});
test('wrong owner, missing invoice and invalid source fail without writes', async () => {
  await assert.rejects(loadInvoice(fixture(), { orderId: 1 }, 99), { status: 404 });
  await assert.rejects(loadInvoice(fixture(''), { orderId: 1 }, 5), { status: 409 });
  await assert.rejects(loadInvoice(fixture(), { orderId: 1, orderSource: 'constructor' }, 5), { status: 400 });
});
test('authentication accepts Admin/customer, rejects missing, expired and salesman tokens', () => {
  for (const [role, secret, allowed] of [['admin', process.env.JWT_SECRET || 'your_secret_key_here', true], ['customer', process.env.JWT_SECRET || 'my_super_secret_key', true], ['salesman', process.env.JWT_SECRET || 'your_secret_key_here', false]]) {
    const req = { headers: { authorization: `Bearer ${jwt.sign({ id: 5, role }, secret)}` } };
    let passed = false; let status;
    reader(req, { status: code => { status = code; return { json() {} }; } }, () => { passed = true; });
    assert.equal(passed, allowed);
    if (role === 'customer') assert.equal(req.orderCustomerId, 5);
    if (!allowed) assert.equal(status, 401);
  }
  for (const token of ['', jwt.sign({ id: 5 }, process.env.JWT_SECRET || 'my_super_secret_key', { expiresIn: -1 })]) {
    let status;
    reader({ headers: { authorization: token ? `Bearer ${token}` : '' } }, { status: code => { status = code; return { json() {} }; } }, () => assert.fail('Unauthorized'));
    assert.equal(status, 401);
  }
});
test('stored HTML is escaped before rendering', () => {
  assert.equal(escapeInvoice({ items: [{ name: '<script>alert(1)</script>' }] }).items[0].name, '&lt;script&gt;alert(1)&lt;/script&gt;');
});
