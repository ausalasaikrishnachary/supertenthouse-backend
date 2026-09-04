const db = require('../db');
(async () => {
  const tables = ['orders', 'admin_orders', 'salesman_orders'];
  const seen = new Set();
  for (const table of tables) {
    const [rows] = await db.promise().query(`SELECT id, invoice_number FROM ${table}`);
    for (const row of rows) {
      if (Number(row.id) <= 0) throw new Error(`Invalid ID in ${table}; migration stopped`);
      const number = row.invoice_number?.trim();
      if (number && seen.has(number)) throw new Error('Duplicate invoice number; resolve before adding indexes');
      if (number) seen.add(number);
    }
  }
  for (const table of tables) {
    const [indexes] = await db.promise().query(`SHOW INDEX FROM ${table}`);
    if (!indexes.some(index => index.Column_name === 'invoice_number' && Number(index.Non_unique) === 0 && indexes.filter(other => other.Key_name === index.Key_name).length === 1)) {
      await db.promise().query(`ALTER TABLE ${table} ADD UNIQUE INDEX uq_invoice_number (invoice_number)`);
    }
    const [missing] = await db.promise().query(`SELECT id FROM ${table} WHERE invoice_number IS NULL OR TRIM(invoice_number) = ''`);
    const source = { orders: 'customer', admin_orders: 'admin', salesman_orders: 'salesman' }[table];
    for (const row of missing) await require('../services/invoiceNumbers').getOrCreateInvoiceNumber({ orderId: row.id, orderSource: source });
  }
  console.log(`Invoice uniqueness checked across ${seen.size} existing numbers; indexes ready and missing invoices allocated.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
