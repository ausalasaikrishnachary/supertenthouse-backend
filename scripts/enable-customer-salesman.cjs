// Explicit, repeatable local migration. Does not modify customer passwords/login.
const db = require('../db');
(async () => {
  const email = 'rajeshyanamadala2000@gmail.com';
  const [users] = await db.promise().query('SELECT id FROM customers WHERE email = ?', [email]);
  if (users.length !== 1 || users[0].id !== 5) throw new Error('Expected unique customer ID 5; refusing permission change');
  const [columns] = await db.promise().query("SHOW COLUMNS FROM customers LIKE 'is_salesman'");
  if (!columns.length) await db.promise().query('ALTER TABLE customers ADD COLUMN is_salesman TINYINT(1) NOT NULL DEFAULT 0');
  await db.promise().query('UPDATE customers SET is_salesman = 1 WHERE id = ? AND email = ?', [5, email]);
  const [enabled] = await db.promise().query('SELECT id, is_salesman FROM customers WHERE id = ?', [5]);
  console.log('Salesman permission enabled:', enabled);
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
