let initializationPromise;

const ensureSalesmanNotificationsTable = () => {
  if (!initializationPromise) {
    const db = require("../db");
    initializationPromise = db.promise().query(`
      CREATE TABLE IF NOT EXISTS salesman_notifications (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        salesman_id INT NOT NULL,
        order_id INT NOT NULL,
        order_source VARCHAR(50) NOT NULL,
        order_number VARCHAR(100) NOT NULL,
        previous_status VARCHAR(50) NOT NULL,
        new_status VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        updated_by_id INT NULL,
        updated_by_role VARCHAR(50) NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_salesman_notifications_inbox (salesman_id, is_read, created_at),
        INDEX idx_salesman_notifications_order (order_source, order_id)
      )
    `).catch((error) => {
      initializationPromise = undefined;
      throw error;
    });
  }

  return initializationPromise;
};

const createOrderStatusNotification = async (
  connection,
  order,
  previousStatus,
  newStatus,
  updatedBy
) => {
  if (!order.salesman_id || !newStatus || previousStatus === newStatus) return null;

  const title = `Order ${order.order_number} status updated`;
  const message = `Order ${order.order_number} changed from ${previousStatus} to ${newStatus}.`;
  const [result] = await connection.query(
    `INSERT INTO salesman_notifications (
      salesman_id, order_id, order_source, order_number,
      previous_status, new_status, title, message,
      updated_by_id, updated_by_role, is_read, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
    [
      order.salesman_id,
      order.id,
      order.order_source || "salesman",
      order.order_number,
      previousStatus,
      newStatus,
      title,
      message,
      updatedBy?.id || null,
      updatedBy?.role || null,
    ]
  );

  return result.insertId;
};

const notifyAdminOrderCreated = async (connection, order) => {
  // Broadcast new Admin orders only to explicitly enabled Salesman accounts.
  return connection.query(`INSERT INTO salesman_notifications
    (salesman_id, order_id, order_source, order_number, previous_status, new_status, title, message)
    SELECT c.id, ?, 'admin', ?, '', ?, ?, ? FROM customers c
    WHERE c.is_salesman = 1 AND NOT EXISTS (
      SELECT 1 FROM salesman_notifications n WHERE n.salesman_id = c.id
      AND n.order_source = 'admin' AND n.order_id = ? AND n.previous_status = ''
    )`, [order.id, order.order_number, order.status || 'approved',
      `New Admin order ${order.order_number}`,
      `Admin created order ${order.order_number}. Current status: ${order.status || 'approved'}.`, order.id]);
};
module.exports = { ensureSalesmanNotificationsTable, createOrderStatusNotification, notifyAdminOrderCreated };
