const jwt = require('jsonwebtoken');

// Customer login and staff login currently use different default signing keys.
module.exports = function orderReader(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ message: 'Authentication required' });
  for (const identity of [
    { secret: process.env.JWT_SECRET || 'my_super_secret_key', customer: true },
    { secret: process.env.JWT_SECRET || 'your_secret_key_here', customer: false },
  ]) {
    try {
      const user = jwt.verify(token, identity.secret);
      if (!user.id) continue;
      if (identity.customer && (!user.role || user.role === 'customer')) {
        req.orderCustomerId = user.id;
        return next();
      }
      if (!identity.customer && user.role === 'admin') return next();
    } catch {}
  }
  return res.status(401).json({ message: 'Invalid or unauthorized token' });
};
