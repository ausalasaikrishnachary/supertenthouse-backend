const db = require('../db');
(async () => {
  const [columns] = await db.promise().query("SHOW COLUMNS FROM packages LIKE 'custom_services'");
  if (!columns.length) await db.promise().query('ALTER TABLE packages ADD COLUMN custom_services TEXT NULL');
  console.log('Package custom_services column ready; existing package fields unchanged.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
