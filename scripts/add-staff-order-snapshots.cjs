// Idempotent migration. Adds nullable delivery snapshots; existing orders remain untouched.
const db = require('../db');
const tables = ['admin_orders', 'salesman_orders'];
const columns = {
  address_id: 'INT NULL', address_label: 'VARCHAR(100) NULL', address_full_name: 'VARCHAR(255) NULL',
  address_phone: 'VARCHAR(50) NULL', address_line1: 'VARCHAR(500) NULL', address_line2: 'VARCHAR(500) NULL',
  address_city: 'VARCHAR(150) NULL', address_state: 'VARCHAR(150) NULL', address_pincode: 'VARCHAR(30) NULL',
  address_country: 'VARCHAR(100) NULL'
};
(async () => {
  for (const table of tables) {
    const [existing] = await db.promise().query(`SHOW COLUMNS FROM ${table}`);
    const names = new Set(existing.map(column => column.Field));
    for (const [name, definition] of Object.entries(columns)) {
      if (!names.has(name)) await db.promise().query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
    console.log(`${table}: delivery snapshot columns ready`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
