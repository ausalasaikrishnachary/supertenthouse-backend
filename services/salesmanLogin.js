const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function createSalesmanLogin(db) {
  return async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    try {
      const [rows] = await db.promise().query(
        'SELECT id, name, email, phone, password FROM customers WHERE email = ? AND is_salesman = 1 AND is_active = 1',
        [email.trim()]
      );
      const user = rows.length === 1 ? rows[0] : null;
      let valid = false;
      if (user && typeof user.password === 'string' && user.password) {
        valid = /^\$2[aby]\$/.test(user.password)
          ? await bcrypt.compare(password, user.password)
          : password === user.password; // Preserve legacy credentials without changing customer login.
      }
      if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials or Salesman access not enabled' });
      const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: 'salesman' }, process.env.JWT_SECRET || 'your_secret_key_here', { expiresIn: '1d' });
      return res.json({ success: true, message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: 'salesman' } });
    } catch (error) {
      console.error('Salesman login failed:', error.code || error.name);
      return res.status(500).json({ success: false, message: 'Unable to sign in. Please contact the administrator.' });
    }
  };
}
module.exports = { createSalesmanLogin };
