const sources = { customer: ['orders', 'CUS'], admin: ['admin_orders', 'ADM'], salesman: ['salesman_orders', 'SAL'] };
async function allocate(connection, orderData) {
  const source = orderData.orderSource || 'customer';
  const id = Number(orderData.orderId ?? orderData.id);
  if (!Object.hasOwn(sources, source) || !Number.isSafeInteger(id) || id <= 0) throw new Error('Valid order source and ID required');
  const [table, prefix] = sources[source];
  const lock = 'tenthouse_invoice_numbers';
  const [[result]] = await connection.query('SELECT GET_LOCK(?, 15) AS acquired', [lock]);
  if (Number(result.acquired) !== 1) throw new Error('Invoice allocation busy; retry later');
  try {
    const [[order]] = await connection.query(`SELECT invoice_number FROM ${table} WHERE id = ?`, [id]);
    if (!order) throw new Error('Order not found for invoice');
    if (order.invoice_number?.trim()) return order.invoice_number;
    const year = new Date().getFullYear();
    let maximum = 0;
    for (const [orderTable] of Object.values(sources)) {
      const [rows] = await connection.query(`SELECT invoice_number FROM ${orderTable} WHERE invoice_number LIKE ?`, [`INV-%-${year}-%`]);
      for (const row of rows) {
        const match = String(row.invoice_number).match(/^INV-(?:CUS|ADM|SAL)-\d{4}-(\d+)$/);
        if (match) maximum = Math.max(maximum, Number(match[1]));
      }
    }
    const number = `INV-${prefix}-${year}-${String(maximum + 1).padStart(6, '0')}`;
    const [updated] = await connection.query(`UPDATE ${table} SET invoice_number = ? WHERE id = ? AND (invoice_number IS NULL OR TRIM(invoice_number) = '')`, [number, id]);
    if (updated.affectedRows !== 1) throw new Error('Invoice could not be stored');
    return number;
  } finally { await connection.query('SELECT RELEASE_LOCK(?)', [lock]); }
}
async function getOrCreateInvoiceNumber(orderData) {
  const db = require('../db');
  const { host, user, password, database, port } = db.config;
  const connection = await require('mysql2/promise').createConnection({ host, user, password, database, port });
  try { return await allocate(connection, orderData); } finally { await connection.end(); }
}
module.exports = { allocate, getOrCreateInvoiceNumber };
