const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createSalesmanLogin } = require('../services/salesmanLogin');
function fixture(users) {
  const queries = [];
  const db = { promise: () => ({ query: async (sql, args) => { queries.push(sql); return [users.filter(user => user.email === args[0] && user.is_salesman === 1 && user.is_active === 1)]; } }) };
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  return { handler: createSalesmanLogin(db), res, queries };
}
test('enabled customer receives a salesman token with the same customer ID', async () => {
  const f = fixture([{ id: 5, email: 'fixture@example.invalid', password: await bcrypt.hash('fixture-password', 4), is_salesman: 1, is_active: 1 }]);
  await f.handler({ body: { email: 'fixture@example.invalid', password: 'fixture-password' } }, f.res);
  assert.equal(f.res.code, 200);
  const token = jwt.verify(f.res.body.token, process.env.JWT_SECRET || 'your_secret_key_here');
  assert.equal(token.id, 5); assert.equal(token.role, 'salesman');
  assert.equal(f.res.body.user.password, undefined);
  assert.match(f.queries[0], /FROM customers WHERE email = \? AND is_salesman = 1 AND is_active = 1/);
});
test('ordinary, inactive, wrong-password and missing-password accounts cannot log in as salesmen', async () => {
  for (const [permission, active, saved, supplied] of [[0, 1, 'correct', 'correct'], [1, 0, 'correct', 'correct'], [1, 1, 'correct', 'wrong'], [1, 1, null, 'anything']]) {
    const f = fixture([{ id: 5, email: 'fixture@example.invalid', password: saved, is_salesman: permission, is_active: active }]);
    await f.handler({ body: { email: 'fixture@example.invalid', password: supplied } }, f.res);
    assert.equal(f.res.code, 401); assert.equal(f.res.body.token, undefined);
  }
});
test('legacy password works without rewriting the customer record', async () => {
  const f = fixture([{ id: 5, email: 'fixture@example.invalid', password: 'fixture', is_salesman: 1, is_active: 1 }]);
  await f.handler({ body: { email: 'fixture@example.invalid', password: 'fixture' } }, f.res);
  assert.equal(f.res.code, 200); assert.equal(f.queries.length, 1);
  assert.ok(f.queries.every(sql => sql.startsWith('SELECT')));
});
