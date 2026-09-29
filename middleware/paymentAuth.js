const jwt = require('jsonwebtoken');

// Customer login and staff login sign with different default secrets, and
// customer tokens carry no `role` at all. Order access spans both, so payments
// resolve the caller against both identities and normalise the result into a
// single req.user shape.
module.exports = function paymentAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  for (const { secret, isCustomer } of [
    { secret: process.env.JWT_SECRET || 'my_super_secret_key', isCustomer: true },
    { secret: process.env.JWT_SECRET || 'your_secret_key_here', isCustomer: false },
  ]) {
    let claims;
    try {
      claims = jwt.verify(token, secret);
    } catch {
      continue;
    }
    if (!claims || !claims.id) continue;
    if (isCustomer) {
      if (claims.role && claims.role !== 'customer') continue;
      req.user = { id: claims.id, email: claims.email || null, role: 'customer' };
      return next();
    }
    req.user = { id: claims.id, email: claims.email || null, role: claims.role || 'admin' };
    return next();
  }

  return res.status(401).json({ success: false, message: 'Invalid or unauthorized token' });
};
