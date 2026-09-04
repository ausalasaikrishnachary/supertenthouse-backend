const mysql = require('mysql2/promise');
const db = require('../db');
const { ensureSalesmanNotificationsTable, createOrderStatusNotification } = require('./salesmanNotificationService');

async function updateAdminOrder(connection, id, changes, actor) {
  await connection.beginTransaction();
  try {
    const [orders] = await connection.query('SELECT * FROM admin_orders WHERE id = ? FOR UPDATE', [id]);
    if (!orders.length) { const error = new Error('Order not found'); error.status = 404; throw error; }
    const order = orders[0];
    const fields = Object.keys(changes);
    await connection.query(`UPDATE admin_orders SET ${fields.map(key => `${key} = ?`).join(', ')}, updated_at = NOW() WHERE id = ?`, [...fields.map(key => changes[key]), id]);
    if (changes.status && changes.status !== order.status) {
      const [recipients] = await connection.query('SELECT id FROM customers WHERE is_salesman = 1');
      for (const recipient of recipients) await createOrderStatusNotification(connection, { ...order, salesman_id: recipient.id, order_source: 'admin' }, order.status, changes.status, actor);
    }
    await connection.commit();
    return { ...order, ...changes };
  } catch (error) { await connection.rollback(); throw error; }
}

async function handler(req, res) {
  const changes = {};
  const allowed = { status: ['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'], payment_status: ['pending', 'completed', 'failed', 'blocked', 'paid'] };
  for (const field of Object.keys(allowed)) {
    if (req.body[field] !== undefined) {
      const value = String(req.body[field]).toLowerCase();
      if (!allowed[field].includes(value)) return res.status(400).json({ message: `Invalid ${field}` });
      changes[field] = value;
    }
  }
  if (!Object.keys(changes).length) return res.status(400).json({ message: 'Status or payment status is required' });
  let connection;
  try {
    await ensureSalesmanNotificationsTable();
    const { host, user, password, database, port } = db.config;
    connection = await mysql.createConnection({ host, user, password, database, port });
    const data = await updateAdminOrder(connection, req.params.id, changes, req.user);
    res.json({ success: true, message: 'Order updated successfully', status: data.status, data });
  } catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Failed to update order; please retry' }); }
  finally { if (connection) await connection.end(); }
}
module.exports = { handler, updateAdminOrder };
