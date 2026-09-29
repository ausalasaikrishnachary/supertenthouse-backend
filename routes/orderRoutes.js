const invoiceRoutes = require("./invoiceRoutes");
const express = require("express");
const router = express.Router();
const db = require("../db");
const { adminOnly } = require("../middleware/auth");
const { ensureSalesmanNotificationsTable, notifyAdminOrderCreated } = require('../services/salesmanNotificationService');
const { addressFields, addressValues, ensureStaffOrderSnapshotColumns, getCustomerDeliveryAddress } = require('../services/staffOrderPresentation');
const { resolveOrderItemVariant } = require('../services/productVariants');
const deliveryDateRoutes = require('../services/deliveryDate');
const { resolveOrderItemImage } = require('../services/orderItemMedia');
const orderPayments = require('../services/orderPayments');

// ==============================
// CREATE NEW ORDER
// ==============================
router.post("/", async (req, res) => {
  const { customer_id, items, total_amount, order_date, advance, payment_method } = req.body;
  // An order can be booked with no promised delivery day. The value is validated
  // here rather than trusted, so a malformed date is refused with a clear message
  // instead of being stored as a day nobody chose. This runs before the
  // transaction opens, so a bad date never leaves a rollback to unwind.
  let deliveryDate;
  try {
    deliveryDate = deliveryDateRoutes.normalizeDeliveryDate(req.body.delivery_date ?? req.body.deliveryDate);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  if (!customer_id) {
    return res.status(400).json({ error: "Customer ID is required" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "At least one product is required" });
  }

  if (items.some(item => !item || !Number.isInteger(Number(item.product_id)) || Number(item.product_id) <= 0 || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
    return res.status(400).json({ message: 'Each item requires a valid product, positive quantity and non-negative price' });
  }
  try {
    await ensureSalesmanNotificationsTable();
    await ensureStaffOrderSnapshotColumns(db.promise());
    await db.promise().query("START TRANSACTION");
    const deliveryAddress = await getCustomerDeliveryAddress(db.promise(), customer_id);

    const resolvedItems = [];
    for (const item of items) resolvedItems.push({ ...item, ...(await resolveOrderItemVariant(db.promise(), item)) });
    const subtotal = Math.round(resolvedItems.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0) * 100) / 100;
    // There is no tax on this order. The business does not charge GST, so the
    // figure the order form quotes is the figure stored. A tax_amount sent by
    // any client is ignored on purpose: it must never be able to raise the
    // total above the price the customer was shown.
    const tax = 0;
    const grandTotal = subtotal;
    if (grandTotal < 0) {
      await db.promise().query("ROLLBACK");
      return res.status(400).json({ message: 'Order total cannot be negative' });
    }

    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const orderNumber = `ORD-${year}${month}${day}-${random}`;

    // A new order has collected no money yet. The old columns stay at their
    // pending defaults and the authoritative status is derived from recorded
    // payments, so an order can no longer claim to be fully paid on creation.
    const orderSql = `
      INSERT INTO admin_orders (
        customer_id, order_number, total_amount, tax_amount, grand_total, 
        order_date, status, payment_status, payment_method, delivery_date, ${addressFields.join(', ')}
      )
      VALUES (?, ?, ?, ?, ?, ?, 'approved', 'pending', ?, ?, ${addressFields.map(() => '?').join(', ')})
    `;

    const [orderResult] = await db.promise().query(orderSql, [
      customer_id,
      orderNumber,
      subtotal,
      tax,
      grandTotal,
      order_date || new Date(),
      payment_method || 'cash',
      deliveryDate ?? null,
      ...addressValues(deliveryAddress)
    ]);

    const orderId = orderResult.insertId;

    // Insert order items
    for (const item of resolvedItems) {
      // Get product details
      const [product] = await db.promise().query(
        "SELECT product_name, product_code, discount FROM products WHERE id = ?",
        [item.product_id]
      );

      const productName = product.length > 0 ? product[0].product_name : 'Unknown Product';
      const productCode = product.length > 0 ? product[0].product_code : '';
      const discount = product.length > 0 ? product[0].discount : 0;
      
      // Store the image of the colour that was ordered so this line keeps showing
      // it even after the product's images change.
      const imageUrl = await resolveOrderItemImage(db.promise(), item);

      const subtotalItem = item.price * item.quantity;

      const itemSql = `
        INSERT INTO admin_order_items (
          order_id, product_id, product_name, product_code, 
          quantity, price, discount, subtotal, image_url, selected_size, selected_color
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await db.promise().query(itemSql, [
        orderId,
        item.product_id,
        productName,
        productCode,
        item.quantity,
        item.price,
        discount,
        subtotalItem,
        imageUrl,
        item.selected_size,
        item.selected_color
      ]);

      // Update product stock
      await db.promise().query(
        "UPDATE products SET available_stock = available_stock - ? WHERE id = ?",
        [item.quantity, item.product_id]
      );
    }

    const [newOrder] = await db.promise().query(
      "SELECT * FROM admin_orders WHERE id = ?",
      [orderId]
    );

    const [orderItems] = await db.promise().query(
      "SELECT * FROM admin_order_items WHERE order_id = ?",
      [orderId]
    );

    // Read the response before committing: a read failure must not leave a saved
    // order behind while telling the client that creation failed.
    await notifyAdminOrderCreated(db.promise(), { id: orderId, order_number: orderNumber, status: 'approved' });
    // Rejected before the commit so a bad advance rolls the whole order back
    // rather than saving an order whose advance was never applied.
    if (advance !== undefined && advance !== null && String(advance).trim() !== '') {
      await orderPayments.recordPayment(db.promise(), {
        source: 'admin',
        orderId,
        amount: advance,
        mode: payment_method || 'cash',
        remarks: 'Advance at order creation',
        actor: req.user
      });
    }
    await db.promise().query("COMMIT");

    const payment = orderPayments.summarise(newOrder[0], orderPayments.parseAmount(advance ?? 0, 'Advance amount'));

    let createdInvoiceNum = null;
    try {
      createdInvoiceNum = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: orderId, orderSource: 'admin' });
    } catch (err) {
      console.error("Failed to generate invoice during order creation:", err);
    }

    res.status(201).json({
      warning: createdInvoiceNum ? undefined : 'Order saved. Invoice generation is pending; do not place the order again.',
      message: "Order placed successfully",
      order_id: orderId,
      order_number: orderNumber,
      order: {
        id: orderId,
        ...newOrder[0],
        invoice_number: createdInvoiceNum,
        items: orderItems,
        payment,
        order_total: payment.order_total,
        total_paid: payment.total_paid,
        balance_amount: payment.balance_amount,
        payment_status: payment.payment_status
      }
    });

  } catch (err) {
    try { await db.promise().query("ROLLBACK"); } catch (rollbackError) {
      console.error('Order rollback failed:', rollbackError);
    }
    console.error("Error creating order:", err);
    res.status(500).json({
      error: "Failed to create order",
      message: err.message
    });
  }
});

// ==============================
// GET ALL ORDERS
// ==============================
router.get("/", async (req, res) => {
  try {
    const sql = `
      SELECT 
        o.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM admin_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      ORDER BY o.id DESC
    `;

    const [orders] = await db.promise().query(sql);

    for (let order of orders) {
      const [items] = await db.promise().query(
        `
        SELECT 
          oi.*
        FROM admin_order_items oi
        WHERE oi.order_id = ?
        `,
        [order.id]
      );
      order.items = items;
      try {
        order.invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: order.id, orderSource: 'admin' });
      } catch (err) {
        console.error("Failed to generate/fetch invoice for admin order:", order.id, err);
      }
    }

    await orderPayments.attachPaymentSummaries(db.promise(), 'admin', orders);

    res.json({
      message: "Orders fetched successfully",
      count: orders.length,
      // Guarantees a delivery date leaves as a bare YYYY-MM-DD day rather than
      // whatever the driver produced. See services/deliveryDate.js.
      data: deliveryDateRoutes.presentOrders(orders)
    });

  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({
      error: "Failed to fetch orders",
      message: err.message
    });
  }
});

// ==============================
// GET SINGLE ORDER
// ==============================
router.get("/:id", async (req, res) => {
  try {
    const [order] = await db.promise().query(
      `
      SELECT 
        o.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM admin_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
      `,
      [req.params.id]
    );

    if (order.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    const [items] = await db.promise().query(
      `
      SELECT * FROM admin_order_items
      WHERE order_id = ?
      `,
      [req.params.id]
    );

    order[0].items = items;

    try {
      order[0].invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: order[0].id, orderSource: 'admin' });
    } catch (err) {
      console.error("Failed to generate/fetch invoice for admin order details:", order[0].id, err);
    }

    await orderPayments.attachPaymentSummaries(db.promise(), 'admin', order);

    res.json({
      message: "Order fetched successfully",
      data: deliveryDateRoutes.presentOrder(order[0])
    });

  } catch (err) {
    console.error("Error fetching order:", err);
    res.status(500).json({
      error: "Failed to fetch order",
      message: err.message
    });
  }
});

// ==============================
// UPDATE ORDER STATUS
// ==============================
router.put("/:id/status", ...adminOnly, require('../services/adminOrderStatus').handler);

// ==============================
// SET DELIVERY DATE
// ==============================
// The day the customer is promised the goods, which is a separate decision from
// the order status and can change at any time before the order is fulfilled.
// Admin only, like every other write on this table.
router.put("/:id/delivery-date", ...adminOnly, deliveryDateRoutes.createHandler('admin_orders'));

// ==============================
// UPDATE PAYMENT STATUS
// ==============================
// Legacy payment endpoint, kept only so an old client does not get a 404.
// It no longer writes the payment_status column directly, because a status with
// no money behind it cannot be represented in the ledger. Marking an order paid
// now records a payment for the outstanding balance instead.
router.put("/:id/payment", ...adminOnly, async (req, res) => {
  const { payment_status, payment_method } = req.body;

  if (payment_status === 'paid') {
    try {
      const result = await orderPayments.withTransaction(async connection => {
        await orderPayments.lockOrderRow(connection, 'admin', Number(req.params.id));
        const { payment } = await orderPayments.getPaymentSummary(connection, 'admin', Number(req.params.id));
        const due = orderPayments.parseAmount(payment.balance_amount, 'Balance');
        if (due <= 0) {
          const error = new Error('This order is already fully paid');
          error.status = 400;
          throw error;
        }
        return orderPayments.recordPayment(connection, {
          source: 'admin',
          orderId: Number(req.params.id),
          amount: due,
          mode: payment_method || 'cash',
          remarks: 'Balance settled',
          actor: req.user
        });
      });
      return res.json({ message: "Payment recorded successfully", data: result.payment });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message, message: err.message });
      console.error("Error recording payment:", err);
      return res.status(500).json({ error: "Failed to record payment", message: err.message });
    }
  }

  if (payment_status !== undefined && payment_status !== null && payment_status !== 'pending') {
    return res.status(400).json({
      error: "Payment status is derived from recorded payments",
      message: "Record a payment to mark an order paid, or void a payment to reopen the balance. Only 'pending' can be set without an amount."
    });
  }

  try {
    if (payment_method) {
      await db.promise().query("UPDATE admin_orders SET payment_method = ? WHERE id = ?", [payment_method, req.params.id]);
    }
    res.json({
      message: "Payment method updated successfully",
      payment_status: 'pending',
      payment_method: payment_method || undefined
    });
  } catch (err) {
    console.error("Error updating payment method:", err);
    res.status(500).json({ error: "Failed to update payment method", message: err.message });
  }
});

// ==============================
// DELETE ORDER
// ==============================
router.delete("/:id", ...adminOnly, async (req, res) => {
  try {
    await db.promise().query("START TRANSACTION");

    const [items] = await db.promise().query(
      "SELECT product_id, quantity FROM admin_order_items WHERE order_id = ?",
      [req.params.id]
    );

    for (const item of items) {
      await db.promise().query(
        "UPDATE products SET available_stock = available_stock + ? WHERE id = ?",
        [item.quantity, item.product_id]
      );
    }

    await db.promise().query(
      "DELETE FROM admin_order_items WHERE order_id = ?",
      [req.params.id]
    );

    const [result] = await db.promise().query(
      "DELETE FROM admin_orders WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      await db.promise().query("ROLLBACK");
      return res.status(404).json({ message: "Order not found" });
    }

    await db.promise().query("COMMIT");

    res.json({
      message: "Order deleted successfully"
    });

  } catch (err) {
    await db.promise().query("ROLLBACK");
    console.error("Error deleting order:", err);
    res.status(500).json({
      error: "Failed to delete order",
      message: err.message
    });
  }
});

// ==============================
// GET ORDERS BY CUSTOMER
// ==============================
router.get("/customer/:customerId", async (req, res) => {
  try {
    const [orders] = await db.promise().query(
      `
      SELECT * FROM admin_orders 
      WHERE customer_id = ?
      ORDER BY id DESC
      `,
      [req.params.customerId]
    );

    for (let order of orders) {
      const [items] = await db.promise().query(
        "SELECT * FROM admin_order_items WHERE order_id = ?",
        [order.id]
      );
      order.items = items;
    }

    await orderPayments.attachPaymentSummaries(db.promise(), 'admin', orders);

    res.json({
      message: "Customer orders fetched successfully",
      count: orders.length,
      data: orders
    });

  } catch (err) {
    console.error("Error fetching customer orders:", err);
    res.status(500).json({
      error: "Failed to fetch customer orders",
      message: err.message
    });
  }
});

// ==============================
// GET ORDER STATISTICS
// ==============================
router.get("/stats/summary", async (req, res) => {
  try {
    const [totalOrders] = await db.promise().query(
      "SELECT COUNT(*) as total FROM admin_orders"
    );

    const [pendingOrders] = await db.promise().query(
      "SELECT COUNT(*) as pending FROM admin_orders WHERE status = 'pending'"
    );

    const [completedOrders] = await db.promise().query(
      "SELECT COUNT(*) as completed FROM admin_orders WHERE status = 'completed'"
    );

    const [totalRevenue] = await db.promise().query(
      "SELECT SUM(grand_total) as revenue FROM admin_orders WHERE status != 'cancelled'"
    );

    // Collected and outstanding come from the payment ledger rather than the
    // legacy column, so a dashboard can never report revenue nobody paid.
    let collected = 0;
    let outstanding = 0;
    try {
      await orderPayments.ensureOrderPaymentsTable(db.promise());
      const [paid] = await db.promise().query(
        `SELECT COALESCE(SUM(p.amount), 0) AS collected
         FROM order_payments p
         INNER JOIN admin_orders o ON o.id = p.order_id
         WHERE p.order_source = 'admin' AND p.voided_at IS NULL AND o.status != 'cancelled'`
      );
      collected = Number(paid[0]?.collected || 0);
      const [live] = await db.promise().query(
        "SELECT COALESCE(SUM(grand_total), 0) AS due FROM admin_orders WHERE status != 'cancelled'"
      );
      outstanding = Math.max(0, Number(live[0]?.due || 0) - collected);
    } catch (err) {
      console.error("Failed to summarise admin payments:", err);
    }

    res.json({
      total_orders: totalOrders[0].total || 0,
      pending_orders: pendingOrders[0].pending || 0,
      completed_orders: completedOrders[0].completed || 0,
      total_revenue: totalRevenue[0].revenue || 0,
      total_collected: collected,
      total_outstanding: outstanding
    });

  } catch (err) {
    console.error("Error fetching order statistics:", err);
    res.status(500).json({
      error: "Failed to fetch order statistics",
      message: err.message
    });
  }
});



// ==============================
// UPDATE ADMIN ORDER STATUS AND PAYMENT STATUS
// ==============================
router.put("/:id/status-payment", ...adminOnly, require('../services/adminOrderStatus').handler);


module.exports = router;
