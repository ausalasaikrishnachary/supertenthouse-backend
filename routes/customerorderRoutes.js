const invoiceRoutes = require("./invoiceRoutes");
// backend/routes/customerOrderRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const { adminOnly } = require("../middleware/auth");
const orderReader = require('../middleware/orderReader');
const { ensureStaffOrderSnapshotColumns, enrichStaffOrderItems } = require('../services/staffOrderPresentation');
const { attachSelectedColors } = require('../services/colorCatalog');
const orderPayments = require('../services/orderPayments');
const deliveryDateService = require('../services/deliveryDate');

// Orders created before the colour snapshot existed store only the colour value.
// Fill in the display name and image for those rows without ever changing which
// colour the order actually recorded. Order items are camelCase JSON, so the
// resolved fields use the same keys checkout.js snapshots.
const withResolvedOrderColors = async (items) => {
  const list = Array.isArray(items) ? items : [];
  const hasName = item => Boolean(item && (item.selectedColorName || item.selected_color_name));
  const colorValue = item => item && (item.selectedColor || item.selected_color);

  const missing = list.filter(item => colorValue(item) && !hasName(item));
  let colorImagesByProduct = new Map();
  if (missing.length > 0) {
    const productIds = [...new Set(missing
      .map(item => item.product_id ?? item.productId)
      .filter(id => id != null && String(id) !== '')
      .map(String))];
    if (productIds.length > 0) {
      try {
        const [rows] = await db.promise().query(
          `SELECT id, color_images FROM products WHERE CAST(id AS CHAR) IN (${productIds.map(() => '?').join(',')})`,
          productIds
        );
        colorImagesByProduct = new Map(rows.map(row => [String(row.id), row.color_images]));
      } catch (err) {
        console.error('Failed to resolve order colour names:', err);
      }
    }
  }

  return list.map(item => {
    if (!colorValue(item)) return item;
    if (!hasName(item)) {
      const colorImages = colorImagesByProduct.get(String(item.product_id ?? item.productId ?? ''));
      if (colorImages) {
        return { ...item, available_color_images: colorImages };
      }
    }
    return item;
  }).map(item => {
    if (!colorValue(item)) return item;
    const described = attachSelectedColors([item])[0];
    if (!described) return item;
    if (hasName(described) && (described.selectedColorName || described.selected_color_name)) {
      return {
        ...item,
        selectedColorName: described.selected_color_name ?? item.selectedColorName ?? null,
        selectedColorImage: described.selected_color_image ?? item.selectedColorImage ?? null,
      };
    }
    return item;
  });
};

// Admin and salesman orders do not persist checkout address fields. Resolve the
// customer's preferred address at read time, retaining the customer-profile
// address as a fallback for older installations and records.
async function attachCustomerDeliveryAddress(order) {
  // New staff orders carry an immutable delivery snapshot. Historical records
  // fall through to the current default/profile address below.
  if (order.address_line1 || order.address_city || order.address_pincode) {
    return {
      ...order,
      address_full_name: order.address_full_name || order.customer_name || '',
      address_phone: order.address_phone || order.customer_phone || '',
      address_country: order.address_country || 'India',
    };
  }
  let address = null;
  try {
    const [addresses] = await db.promise().query(
      `SELECT id, label, full_name, phone, line1, line2, city, state, pincode, country
       FROM customer_addresses
       WHERE customer_id = ?
       ORDER BY is_default DESC, created_at DESC
       LIMIT 1`,
      [order.customer_id]
    );
    address = addresses[0] || null;
  } catch (error) {
    // customer_addresses is created lazily by checkout. Do not make historical
    // admin/salesman orders unavailable on deployments without that table.
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
  }

  return {
    ...order,
    address_id: address?.id ?? null,
    address_label: address?.label ?? null,
    address_full_name: address?.full_name || order.customer_name || '',
    address_phone: address?.phone || order.customer_phone || '',
    address_line1: address?.line1 || order.customer_address_line1 || '',
    address_line2: address?.line2 || order.customer_address_line2 || '',
    address_city: address?.city || order.customer_address_city || '',
    address_state: address?.state || order.customer_address_state || '',
    address_pincode: address?.pincode || order.customer_address_pincode || '',
    address_country: address?.country || order.customer_address_country || 'India',
  };
}

// ─── Create Notification Helper ──────────────────────────────────────────────
const createNotification = async (userId, title, message, type, icon, data = null) => {
  try {
    const query = `
      INSERT INTO notifications (user_id, title, message, type, icon, data, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, NOW())
    `;
    
    const values = [userId, title, message, type, icon, data ? JSON.stringify(data) : null];
    
    const [result] = await db.promise().query(query, values);
    return result.insertId;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// ==============================
// GET ALL ORDERS
// ==============================
router.get("/", async (req, res) => {
  try {
    console.log('Fetching all orders');
    
    const sql = `
      SELECT 
        o.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      ORDER BY o.id DESC
    `;

    const [orders] = await db.promise().query(sql);

    for (let order of orders) {
      if (order.items && typeof order.items === 'string') {
        try {
          order.items = JSON.parse(order.items);
        } catch (e) {
          order.items = [];
        }
      }
      if (!order.items) {
        order.items = [];
      }
      order.items = await withResolvedOrderColors(order.items);
      try {
        order.invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: order.id, orderSource: 'customer' });
      } catch (err) {
        console.error("Failed to generate/fetch invoice for user order in all-list:", order.id, err);
      }
    }

    await orderPayments.attachPaymentSummaries(db.promise(), 'customer', orders);

    res.json({
      success: true,
      message: "Orders fetched successfully",
      count: orders.length,
      // A delivery date leaves as a bare YYYY-MM-DD day whatever the driver
      // produced. See services/deliveryDate.js.
      data: deliveryDateService.presentOrders(orders)
    });

  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch orders",
      message: err.message
    });
  }
});

// ==============================
// GET ORDERS BY CUSTOMER ID - FIXED (Combines customer, admin, and salesman-created orders)
// ==============================
router.get("/customer/:customerId", orderReader, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (req.orderCustomerId && String(req.orderCustomerId) !== String(customerId)) {
      return res.status(403).json({ message: 'You cannot view another customer’s orders' });
    }
    await ensureStaffOrderSnapshotColumns(db.promise());
    
    console.log('Fetching merged orders for customer:', customerId);
    
    // 1. Fetch user-initiated orders (from 'orders' table)
    const sqlUserOrders = `
      SELECT 
        o.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.customer_id = ?
      ORDER BY o.id DESC
    `;
    const [userOrders] = await db.promise().query(sqlUserOrders, [customerId]);

    for (let order of userOrders) {
      order.orderSource = 'customer';
      if (order.items && typeof order.items === 'string') {
        try {
          order.items = JSON.parse(order.items);
        } catch (e) {
          order.items = [];
        }
      }
      if (!order.items) {
        order.items = [];
      }
      order.items = await withResolvedOrderColors(order.items);
      try {
        order.invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: order.id, orderSource: 'customer' });
      } catch (err) {
        console.error("Failed to generate/fetch invoice for user order:", order.id, err);
      }
    }

    // 2. Fetch admin-created orders (from 'admin_orders' table) for this customer
    const sqlAdminOrders = `
      SELECT 
        o.id,
        o.order_number,
        o.customer_id,
        o.total_amount AS total,
        o.total_amount AS subtotal,
        o.grand_total,
        o.order_date AS created_at,
        o.delivery_date,
        o.status,
        o.payment_status,
        o.payment_method,
        o.notes,
        o.invoice_number,
        o.address_id, o.address_label, o.address_full_name, o.address_phone,
        o.address_line1, o.address_line2, o.address_city, o.address_state,
        o.address_pincode, o.address_country,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address_line1 AS customer_address_line1,
        c.address_line2 AS customer_address_line2,
        c.city AS customer_address_city,
        c.state AS customer_address_state,
        c.pincode AS customer_address_pincode,
        c.country AS customer_address_country
      FROM admin_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.customer_id = ?
      ORDER BY o.id DESC
    `;
    const [adminOrders] = await db.promise().query(sqlAdminOrders, [customerId]);

    for (let order of adminOrders) {
      order.orderSource = 'admin';
      Object.assign(order, await attachCustomerDeliveryAddress(order));
      // Fetch admin order items
      const [items] = await db.promise().query(
        `
        SELECT 
          oi.product_id,
          oi.product_name AS name,
          oi.quantity,
          oi.price,
          oi.discount,
          oi.subtotal,
          oi.image_url AS image
        FROM admin_order_items oi
        WHERE oi.order_id = ?
        `,
        [order.id]
      );
      order.items = await enrichStaffOrderItems(db.promise(), 'admin_order_items', order.id, items);
      try {
        order.invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: order.id, orderSource: 'admin' });
      } catch (err) {
        console.error("Failed to generate/fetch invoice for admin order:", order.id, err);
      }
    }

    // 3. Fetch salesman-created orders for this customer. They remain linked to
    // the salesman, while customer_id makes them part of the selected customer's history.
    const sqlSalesmanOrders = `
      SELECT
        o.id,
        o.order_number,
        o.customer_id,
        o.total_amount AS total,
        o.total_amount AS subtotal,
        o.grand_total,
        o.order_date AS created_at,
        o.delivery_date,
        o.updated_at,
        o.status,
        o.payment_status,
        o.payment_method,
        o.notes,
        o.invoice_number,
        o.address_id, o.address_label, o.address_full_name, o.address_phone,
        o.address_line1, o.address_line2, o.address_city, o.address_state,
        o.address_pincode, o.address_country,
        o.salesman_id,
        o.salesman_name,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address_line1 AS customer_address_line1,
        c.address_line2 AS customer_address_line2,
        c.city AS customer_address_city,
        c.state AS customer_address_state,
        c.pincode AS customer_address_pincode,
        c.country AS customer_address_country
      FROM salesman_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.customer_id = ?
      ORDER BY o.id DESC
    `;
    const [salesmanOrders] = await db.promise().query(sqlSalesmanOrders, [customerId]);

    for (let order of salesmanOrders) {
      order.orderSource = 'salesman';
      Object.assign(order, await attachCustomerDeliveryAddress(order));
      const [items] = await db.promise().query(
        `
        SELECT oi.product_id, oi.product_name AS name, oi.quantity, oi.price,
               oi.discount, oi.subtotal, oi.image_url AS image
        FROM salesman_order_items oi
        WHERE oi.order_id = ?
        `,
        [order.id]
      );
      order.items = await enrichStaffOrderItems(db.promise(), 'salesman_order_items', order.id, items);
      try {
        order.invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: order.id, orderSource: 'salesman' });
      } catch (err) {
        console.error("Failed to generate/fetch invoice for salesman order:", order.id, err);
      }
    }

    // Combine all order sources.
    const combinedOrders = [...userOrders, ...adminOrders, ...salesmanOrders];
    
    // Sort combined orders by date descending
    combinedOrders.sort((a, b) => {
      const dateA = new Date(a.created_at || a.order_date || 0);
      const dateB = new Date(b.created_at || b.order_date || 0);
      return dateB.getTime() - dateA.getTime();
    });

    // Each source is summarised against its own ledger, so a customer sees the
    // same paid/balance figures for their own order as admin and salesman do.
    await orderPayments.attachPaymentSummaries(db.promise(), 'customer', userOrders);
    await orderPayments.attachPaymentSummaries(db.promise(), 'admin', adminOrders);
    await orderPayments.attachPaymentSummaries(db.promise(), 'salesman', salesmanOrders);

    res.json({
      success: true,
      message: "Customer orders fetched successfully",
      count: combinedOrders.length,
      data: deliveryDateService.presentOrders(combinedOrders)
    });

  } catch (err) {
    console.error("Error fetching customer orders:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch orders",
      message: err.message
    });
  }
});

// ==============================
// GET SINGLE ORDER BY ID - FIXED (Searches customer, admin, and salesman orders)
// ==============================
router.get("/:id", orderReader, async (req, res) => {
  try {
    const orderId = req.params.id;
    const source = req.query.source || 'customer';
    if (!['customer', 'admin', 'salesman'].includes(source) || !/^\d+$/.test(orderId)) {
      return res.status(400).json({ message: 'Invalid order ID or source' });
    }
    await ensureStaffOrderSnapshotColumns(db.promise());
    console.log('Fetching merged order details for ID:', orderId);
    
    // First, try searching in 'orders' (customer orders)
    const sqlUser = `
      SELECT 
        o.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `;
    const [userOrders] = source === 'customer'
      ? await db.promise().query(sqlUser + (req.orderCustomerId ? ' AND o.customer_id = ?' : ''), req.orderCustomerId ? [orderId, req.orderCustomerId] : [orderId])
      : [[]];

    if (userOrders.length > 0) {
      const order = userOrders[0];
      order.orderSource = 'customer';
      if (order.items && typeof order.items === 'string') {
        try {
          order.items = JSON.parse(order.items);
        } catch (e) {
          order.items = [];
        }
      }
      if (!order.items) {
        order.items = [];
      }
      order.items = await withResolvedOrderColors(order.items);
      try {
        order.invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: order.id, orderSource: 'customer' });
      } catch (err) {
        console.error("Failed to generate/fetch invoice for user order detail:", order.id, err);
      }
      await orderPayments.attachPaymentSummaries(db.promise(), 'customer', [order]);
      return res.json({
        success: true,
        message: "Order details fetched successfully",
        data: deliveryDateService.presentOrder(order)
      });
    }

    // If not found, try searching in 'admin_orders' (Admin panel created orders)
    const sqlAdmin = `
      SELECT 
        o.id,
        o.order_number,
        o.customer_id,
        o.total_amount AS total,
        o.total_amount AS subtotal,
        o.grand_total,
        o.order_date AS created_at,
        o.delivery_date,
        o.status,
        o.payment_status,
        o.payment_method,
        o.notes,
        o.invoice_number,
        o.address_id, o.address_label, o.address_full_name, o.address_phone,
        o.address_line1, o.address_line2, o.address_city, o.address_state,
        o.address_pincode, o.address_country,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address_line1 AS customer_address_line1,
        c.address_line2 AS customer_address_line2,
        c.city AS customer_address_city,
        c.state AS customer_address_state,
        c.pincode AS customer_address_pincode,
        c.country AS customer_address_country
      FROM admin_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `;
    const [adminOrders] = source === 'admin'
      ? await db.promise().query(sqlAdmin + (req.orderCustomerId ? ' AND o.customer_id = ?' : ''), req.orderCustomerId ? [orderId, req.orderCustomerId] : [orderId])
      : [[]];

    if (adminOrders.length > 0) {
      const order = adminOrders[0];
      order.orderSource = 'admin';
      Object.assign(order, await attachCustomerDeliveryAddress(order));
      
      // Fetch admin order items
      const [items] = await db.promise().query(
        `
        SELECT 
          oi.product_id,
          oi.product_name AS name,
          oi.quantity,
          oi.price,
          oi.discount,
          oi.subtotal,
          oi.image_url AS image
        FROM admin_order_items oi
        WHERE oi.order_id = ?
        `,
        [order.id]
      );
      order.items = await enrichStaffOrderItems(db.promise(), 'admin_order_items', order.id, items);

      try {
        order.invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: order.id, orderSource: 'admin' });
      } catch (err) {
        console.error("Failed to generate/fetch invoice for admin order detail:", order.id, err);
      }

      await orderPayments.attachPaymentSummaries(db.promise(), 'admin', [order]);

      return res.json({
        success: true,
        message: "Order details fetched successfully (Admin Order)",
        data: deliveryDateService.presentOrder(order)
      });
    }

    const sqlSalesman = `
      SELECT
        o.id,
        o.order_number,
        o.customer_id,
        o.total_amount AS total,
        o.total_amount AS subtotal,
        o.grand_total,
        o.order_date AS created_at,
        o.delivery_date,
        o.updated_at,
        o.status,
        o.payment_status,
        o.payment_method,
        o.notes,
        o.invoice_number,
        o.address_id, o.address_label, o.address_full_name, o.address_phone,
        o.address_line1, o.address_line2, o.address_city, o.address_state,
        o.address_pincode, o.address_country,
        o.salesman_id,
        o.salesman_name,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address_line1 AS customer_address_line1,
        c.address_line2 AS customer_address_line2,
        c.city AS customer_address_city,
        c.state AS customer_address_state,
        c.pincode AS customer_address_pincode,
        c.country AS customer_address_country
      FROM salesman_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `;
    const [salesmanOrders] = source === 'salesman'
      ? await db.promise().query(sqlSalesman + (req.orderCustomerId ? ' AND o.customer_id = ?' : ''), req.orderCustomerId ? [orderId, req.orderCustomerId] : [orderId])
      : [[]];

    if (salesmanOrders.length > 0) {
      const order = salesmanOrders[0];
      order.orderSource = 'salesman';
      Object.assign(order, await attachCustomerDeliveryAddress(order));
      const [items] = await db.promise().query(
        `
        SELECT oi.product_id, oi.product_name AS name, oi.quantity, oi.price,
               oi.discount, oi.subtotal, oi.image_url AS image
        FROM salesman_order_items oi
        WHERE oi.order_id = ?
        `,
        [order.id]
      );
      order.items = await enrichStaffOrderItems(db.promise(), 'salesman_order_items', order.id, items);

      try {
        order.invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: order.id, orderSource: 'salesman' });
      } catch (err) {
        console.error("Failed to generate/fetch invoice for salesman order detail:", order.id, err);
      }

      await orderPayments.attachPaymentSummaries(db.promise(), 'salesman', [order]);

      return res.json({
        success: true,
        message: "Order details fetched successfully (Salesman Order)",
        data: deliveryDateService.presentOrder(order)
      });
    }

    res.status(404).json({
      success: false,
      message: "Order not found"
    });

  } catch (err) {
    console.error("Error fetching order details:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch order details",
      message: err.message
    });
  }
});

// ==============================
// SET DELIVERY DATE
// ==============================
// A customer can place an order themselves, and until staff say when it will be
// delivered the customer has no promised day at all. This is how they get one.
// Admin only: the customer app reads the date but has no way to write it.
router.put("/:id/delivery-date", ...adminOnly, deliveryDateService.createHandler('orders'));

// ==============================
// UPDATE ORDER STATUS
// ==============================
router.put("/:id/status", ...adminOnly, async (req, res) => {
  const { status } = req.body;
  const orderId = req.params.id;

  console.log('Updating order status:', { orderId, status });

  const validStatuses = ['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'];
  
  if (!validStatuses.includes(status.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Valid values: ${validStatuses.join(', ')}`
    });
  }

  try {
    const query = `UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?`;
    const [result] = await db.promise().query(query, [status.toLowerCase(), orderId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const [updatedOrder] = await db.promise().query(
      `SELECT * FROM orders WHERE id = ?`,
      [orderId]
    );

    if (updatedOrder[0].items && typeof updatedOrder[0].items === 'string') {
      try {
        updatedOrder[0].items = JSON.parse(updatedOrder[0].items);
      } catch (e) {
        updatedOrder[0].items = [];
      }
    }

    // Create Notification
    await createOrderNotification(updatedOrder[0], status.toLowerCase());

    res.json({
      success: true,
      message: `Order ${status.toLowerCase()} successfully`,
      data: updatedOrder[0]
    });

  } catch (err) {
    console.error("Error updating order status:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update order status",
      message: err.message
    });
  }
});

// ==============================
// UPDATE ORDER STATUS AND PAYMENT - WITH NOTIFICATION
// ==============================
router.put("/:id/status-payment", ...adminOnly, async (req, res) => {
  const { status, payment_status } = req.body;
  const orderId = req.params.id;

  console.log('Updating order status and payment:', { orderId, status, payment_status });

  const validStatuses = ['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'];

  // payment_status is derived from recorded payments and is never written here.
  // It stays accepted so an older client can still change the order status.
  const paymentStatusIgnored = payment_status !== undefined && payment_status !== null;

  let updates = [];
  let params = [];

  if (status && validStatuses.includes(status.toLowerCase())) {
    updates.push("status = ?");
    params.push(status.toLowerCase());
  } else if (status) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Valid values: ${validStatuses.join(', ')}`
    });
  }

  if (updates.length === 0) {
    return res.status(400).json({
      success: false,
      error: paymentStatusIgnored
        ? "Payment status is derived from recorded payments and cannot be set directly. Order status is required."
        : "Order status is required"
    });
  }

  updates.push("updated_at = NOW()");

  try {
    const query = `UPDATE orders SET ${updates.join(", ")} WHERE id = ?`;
    const values = [...params, orderId];
    
    const [result] = await db.promise().query(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const [updatedOrder] = await db.promise().query(
      `SELECT 
        o.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?`,
      [orderId]
    );

    if (updatedOrder[0].items && typeof updatedOrder[0].items === 'string') {
      try {
        updatedOrder[0].items = JSON.parse(updatedOrder[0].items);
      } catch (e) {
        updatedOrder[0].items = [];
      }
    }

    // CREATE NOTIFICATION
    if (status) {
      await createOrderNotification(updatedOrder[0], status.toLowerCase());
    }

    await orderPayments.attachPaymentSummaries(db.promise(), 'customer', updatedOrder);

    res.json({
      success: true,
      message: "Order updated successfully",
      warning: paymentStatusIgnored
        ? "Payment status is calculated from recorded payments and was not changed. Record a payment to update it."
        : undefined,
      data: updatedOrder[0]
    });

  } catch (err) {
    console.error("Error updating order:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update order",
      message: err.message
    });
  }
});

// ==============================
// CREATE ORDER NOTIFICATION
// ==============================
const createOrderNotification = async (order, status) => {
  const customerId = order.customer_id;
  
  if (!customerId) {
    console.log('No customer ID found, skipping notification');
    return;
  }

  let title, message, icon, type;
  
  switch (status) {
    case 'approved':
      title = 'Order Approved!';
      message = `Your order #${order.order_number} has been approved and is being processed.`;
      icon = 'check-circle';
      type = 'order_approved';
      break;
    case 'rejected':
      title = 'Order Rejected';
      message = `Your order #${order.order_number} has been rejected. Please contact support for more information.`;
      icon = 'x-circle';
      type = 'order_rejected';
      break;
    case 'processing':
      title = 'Order Processing';
      message = `Your order #${order.order_number} is now being processed.`;
      icon = 'clock';
      type = 'order_processing';
      break;
    case 'completed':
      title = 'Order Completed!';
      message = `Your order #${order.order_number} has been completed successfully. Thank you for your business!`;
      icon = 'check-circle';
      type = 'order_completed';
      break;
    case 'cancelled':
      title = 'Order Cancelled';
      message = `Your order #${order.order_number} has been cancelled.`;
      icon = 'x-circle';
      type = 'order_cancelled';
      break;
    default:
      title = `Order ${status}`;
      message = `Your order #${order.order_number} status has been updated to ${status}.`;
      icon = 'bell';
      type = 'order_updated';
  }

  const data = {
    orderId: order.id,
    orderNumber: order.order_number,
    status: status
  };

  console.log(`Creating notification for customer ${customerId}:`, { title, message });

  await createNotification(
    customerId,
    title,
    message,
    type,
    icon,
    data
  );
};

module.exports = router;
