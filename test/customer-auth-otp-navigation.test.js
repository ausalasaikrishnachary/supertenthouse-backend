const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const mobileRoot = path.resolve(backendRoot, '..', 'supertenthouse-mobileapp');
const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');

test('customer password reset uses purpose-scoped OTP and one-time reset token', () => {
  const source = read(backendRoot, 'routes/Customerlogin.js');
  assert.match(source, /router\.post\("\/forgot-password"/);
  assert.match(source, /purpose:\s*"password-reset"/);
  assert.match(source, /router\.post\("\/verify-reset-otp"/);
  assert.match(source, /crypto\.randomBytes\(32\)/);
  assert.match(source, /router\.post\("\/reset-password"/);
  assert.match(source, /UPDATE customers SET password = \?/);
});

test('all three mobile entry points navigate with an explicit OTP challenge', () => {
  const login = read(mobileRoot, 'app/(auth)/login.tsx');
  const register = read(mobileRoot, 'app/(auth)/register.tsx');
  const forgot = read(mobileRoot, 'app/(auth)/forgot.tsx');
  assert.match(login, /result\.requiresOTP/);
  assert.match(login, /purpose:\s*'email-verification'/);
  assert.match(register, /purpose:\s*'email-verification'/);
  assert.match(forgot, /await beginPasswordReset/);
  assert.match(forgot, /purpose:\s*'password-reset'/);
});

test('OTP screen separates verification from password reset', () => {
  const otp = read(mobileRoot, 'app/(auth)/otp.tsx');
  assert.match(otp, /purpose === 'password-reset'/);
  assert.match(otp, /await verifyPasswordResetOTP/);
  assert.match(otp, /router\.replace\('\/\(auth\)\/reset-password'\)/);
  assert.match(otp, /await verifyOTP/);
  assert.doesNotMatch(otp, /router\.replace\('\/\(auth\)\/register'\)/);
});
