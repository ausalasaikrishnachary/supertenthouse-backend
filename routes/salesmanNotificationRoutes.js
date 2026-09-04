const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticate, requireRole } = require("../middleware/auth");
const { ensureSalesmanNotificationsTable } = require("../services/salesmanNotificationService");

router.use(authenticate, requireRole("salesman"));

router.get('/admin-orders/:id', async (req, res) => {
  try {
    const [orders] = await db.promise().query(`SELECT o.*, c.name AS customer_name,
      c.email AS customer_email, c.phone AS customer_phone,
      c.address_line1, c.address_line2, c.city AS address_city, c.state AS address_state,
      c.pincode AS address_pincode, c.country AS address_country,
      o.tax_amount AS gst, o.total_amount AS subtotal
      FROM admin_orders o LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.id = ? AND EXISTS (SELECT 1 FROM salesman_notifications n
        JOIN customers s ON s.id = n.salesman_id AND s.is_salesman = 1
        WHERE n.order_id = o.id AND n.order_source = 'admin' AND n.salesman_id = ?)`, [req.params.id, req.user.id]);
    if (!orders.length) return res.status(404).json({ message: 'Order not found or not available to you' });
    const [items] = await db.promise().query('SELECT *, product_name AS name FROM admin_order_items WHERE order_id = ?', [req.params.id]);
    res.json({ success: true, data: { ...orders[0], items, order_source: 'admin' } });
  } catch { res.status(500).json({ message: 'Failed to load order' }); }
});

router.get("/", async (req, res) => {
  try {
    await ensureSalesmanNotificationsTable();
    const [notifications] = await db.promise().query(
      `SELECT id, order_id, order_source, order_number, previous_status,
              new_status, title, message, is_read, created_at
       FROM salesman_notifications
       WHERE salesman_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error("Error fetching salesman notifications:", error);
    res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
});

router.get("/unread-count", async (req, res) => {
  try {
    await ensureSalesmanNotificationsTable();
    const [rows] = await db.promise().query(
      "SELECT COUNT(*) AS count FROM salesman_notifications WHERE salesman_id = ? AND is_read = 0",
      [req.user.id]
    );
    res.json({ success: true, count: rows[0]?.count || 0 });
  } catch (error) {
    console.error("Error fetching salesman notification count:", error);
    res.status(500).json({ success: false, message: "Failed to fetch unread count" });
  }
});

router.put("/read-all", async (req, res) => {
  try {
    await ensureSalesmanNotificationsTable();
    await db.promise().query(
      "UPDATE salesman_notifications SET is_read = 1 WHERE salesman_id = ? AND is_read = 0",
      [req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking salesman notifications as read:", error);
    res.status(500).json({ success: false, message: "Failed to mark notifications as read" });
  }
});

router.put("/:id/read", async (req, res) => {
  try {
    await ensureSalesmanNotificationsTable();
    const [result] = await db.promise().query(
      "UPDATE salesman_notifications SET is_read = 1 WHERE id = ? AND salesman_id = ?",
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking salesman notification as read:", error);
    res.status(500).json({ success: false, message: "Failed to mark notification as read" });
  }
});

module.exports = router;
