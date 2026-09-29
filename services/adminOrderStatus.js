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
  const allowed = { status: ['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'] };
  for (const field of Object.keys(allowed)) {
    if (req.body[field] !== undefined) {
      const value = String(req.body[field]).toLowerCase();
      if (!allowed[field].includes(value)) return res.status(400).json({ message: `Invalid ${field}` });
      changes[field] = value;
    }
  }
  // An order can be approved or completed without a rupee changing hands, so the
  // payment status is never written from here. It stays accepted and ignored so
  // an older client can still change the order status, and the response says so.
  const paymentStatusIgnored = req.body.payment_status !== undefined && req.body.payment_status !== null;
  if (!Object.keys(changes).length) {
    return res.status(400).json({ message: paymentStatusIgnored ? 'Payment status is derived from recorded payments and cannot be set directly. Order status is required.' : 'Status is required' });
  }
  let connection;
  try {
    await ensureSalesmanNotificationsTable();
    const { host, user, password, database, port } = db.config;
    connection = await mysql.createConnection({ host, user, password, database, port });
    const data = await updateAdminOrder(connection, req.params.id, changes, req.user);
    res.json({
      success: true,
      message: 'Order updated successfully',
      status: data.status,
      warning: paymentStatusIgnored ? 'Payment status is calculated from recorded payments and was not changed. Record a payment to update it.' : undefined,
      data
    });
  } catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Failed to update order; please retry' }); }
  finally { if (connection) await connection.end(); }
}
module.exports = { handler, updateAdminOrder };
