const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCustomServices, validateCustomServices } = require('../services/packageCustomServices');
test('preserves custom names including commas and special characters', () => {
  assert.deepEqual(parseCustomServices('[" Valet, Parking ","Kids & Games"]'), ['Valet, Parking', 'Kids & Games']);
});
test('rejects invalid, blank, oversized and duplicate services', () => {
  for (const value of ['invalid', {}, [''], ['Catering'], ['Valet', 'valet'], ['x'.repeat(101)]]) assert.throws(() => parseCustomServices(value));
});
test('distinguishes clearing custom services from an older client omitting the field', () => {
  const req = { body: {} }; validateCustomServices(req, {}, () => {}); assert.equal(req.customServicesJSON, null);
  req.body.custom_services = '[]'; validateCustomServices(req, {}, () => {}); assert.equal(req.customServicesJSON, '[]');
});
