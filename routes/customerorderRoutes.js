// // backend/routes/customerOrderRoutes.js
// const express = require("express");
// const router = express.Router();
// const db = require("../db");

// // ==============================
// // GET ALL ORDERS
// // ==============================
// router.get("/", async (req, res) => {
//   try {
//     console.log('📦 Fetching all orders');
    
//     const sql = `
//       SELECT 
//         o.*,
//         c.name as customer_name,
//         c.email as customer_email,
//         c.phone as customer_phone
//       FROM orders o
//       LEFT JOIN customers c ON o.customer_id = c.id
//       ORDER BY o.id DESC
//     `;

//     const [orders] = await db.promise().query(sql);

//     // Parse items JSON for each order
//     for (let order of orders) {
//       if (order.items && typeof order.items === 'string') {
//         try {
//           order.items = JSON.parse(order.items);
//         } catch (e) {
//           order.items = [];
//         }
//       }
//       if (!order.items) {
//         order.items = [];
//       }
//     }

//     res.json({
//       success: true,
//       message: "Orders fetched successfully",
//       count: orders.length,
//       data: orders
//     });

//   } catch (err) {
//     console.error("Error fetching orders:", err);
//     res.status(500).json({
//       success: false,
//       error: "Failed to fetch orders",
//       message: err.message
//     });
//   }
// });

// // ==============================
// // GET ORDERS BY CUSTOMER ID
// // ==============================
// router.get("/customer/:customerId", async (req, res) => {
//   try {
//     const { customerId } = req.params;
    
//     console.log('📦 Fetching orders for customer:', customerId);
    
//     const sql = `
//       SELECT 
//         o.*,
//         c.name as customer_name,
//         c.email as customer_email,
//         c.phone as customer_phone
//       FROM orders o
//       LEFT JOIN customers c ON o.customer_id = c.id
//       WHERE o.customer_id = ?
//       ORDER BY o.id DESC
//     `;

//     const [orders] = await db.promise().query(sql, [customerId]);

//     // Parse items JSON for each order
//     for (let order of orders) {
//       if (order.items && typeof order.items === 'string') {
//         try {
//           order.items = JSON.parse(order.items);
//         } catch (e) {
//           order.items = [];
//         }
//       }
//       if (!order.items) {
//         order.items = [];
//       }
//     }

//     res.json({
//       success: true,
//       message: "Customer orders fetched successfully",
//       count: orders.length,
//       data: orders
//     });

//   } catch (err) {
//     console.error("Error fetching customer orders:", err);
//     res.status(500).json({
//       success: false,
//       error: "Failed to fetch orders",
//       message: err.message
//     });
//   }
// });

// // ==============================
// // GET SINGLE ORDER BY ID
// // ==============================
// router.get("/:id", async (req, res) => {
//   try {
//     const orderId = req.params.id;
//     console.log('📦 Fetching order details for ID:', orderId);
    
//     const sql = `
//       SELECT 
//         o.*,
//         c.name as customer_name,
//         c.email as customer_email,
//         c.phone as customer_phone
//       FROM orders o
//       LEFT JOIN customers c ON o.customer_id = c.id
//       WHERE o.id = ?
//     `;

//     const [orders] = await db.promise().query(sql, [orderId]);

//     if (orders.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found"
//       });
//     }

//     const order = orders[0];
    
//     if (order.items && typeof order.items === 'string') {
//       try {
//         order.items = JSON.parse(order.items);
//       } catch (e) {
//         order.items = [];
//       }
//     }
//     if (!order.items) {
//       order.items = [];
//     }

//     res.json({
//       success: true,
//       message: "Order details fetched successfully",
//       data: order
//     });

//   } catch (err) {
//     console.error("Error fetching order details:", err);
//     res.status(500).json({
//       success: false,
//       error: "Failed to fetch order details",
//       message: err.message
//     });
//   }
// });

// // ==============================
// // UPDATE ORDER STATUS (APPROVE/REJECT)
// // ==============================
// // backend/routes/customerOrderRoutes.js - Update the status update route

// // ─── UPDATE ORDER STATUS ─────────────────────────────────────────────────────
// // router.put("/:id/status", async (req, res) => {
// //   const { status } = req.body;
// //   const orderId = req.params.id;

// //   console.log('📦 Updating order status:', { orderId, status });

// //   // Valid statuses: pending, approved, rejected, processing, completed, cancelled
// //   const validStatuses = ['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'];
  
// //   if (!validStatuses.includes(status.toLowerCase())) {
// //     return res.status(400).json({
// //       success: false,
// //       message: `Invalid status. Valid values: ${validStatuses.join(', ')}`
// //     });
// //   }

// //   try {
// //     const query = `UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?`;
// //     const [result] = await db.promise().query(query, [status.toLowerCase(), orderId]);

// //     if (result.affectedRows === 0) {
// //       return res.status(404).json({
// //         success: false,
// //         message: "Order not found"
// //       });
// //     }

// //     // Fetch the updated order
// //     const [updatedOrder] = await db.promise().query(
// //       `SELECT * FROM orders WHERE id = ?`,
// //       [orderId]
// //     );

// //     if (updatedOrder[0].items && typeof updatedOrder[0].items === 'string') {
// //       try {
// //         updatedOrder[0].items = JSON.parse(updatedOrder[0].items);
// //       } catch (e) {
// //         updatedOrder[0].items = [];
// //       }
// //     }

// //     res.json({
// //       success: true,
// //       message: `Order ${status.toLowerCase()} successfully`,
// //       data: updatedOrder[0]
// //     });

// //   } catch (err) {
// //     console.error("Error updating order status:", err);
// //     res.status(500).json({
// //       success: false,
// //       error: "Failed to update order status",
// //       message: err.message
// //     });
// //   }
// // });


// // backend/routes/customerOrderRoutes.js - Add notification trigger

// // ─── UPDATE ORDER STATUS ─────────────────────────────────────────────────────
// // backend/routes/customerOrderRoutes.js - Add this to the updateOrderStatus function

// // ─── UPDATE ORDER STATUS ─────────────────────────────────────────────────────
// router.put("/:id/status", async (req, res) => {
//   const { status } = req.body;
//   const orderId = req.params.id;

//   console.log('📦 Updating order status:', { orderId, status });

//   const validStatuses = ['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'];
  
//   if (!validStatuses.includes(status.toLowerCase())) {
//     return res.status(400).json({
//       success: false,
//       message: `Invalid status. Valid values: ${validStatuses.join(', ')}`
//     });
//   }

//   try {
//     const query = `UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?`;
//     const [result] = await db.promise().query(query, [status.toLowerCase(), orderId]);

//     if (result.affectedRows === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found"
//       });
//     }

//     // Fetch the updated order
//     const [updatedOrder] = await db.promise().query(
//       `SELECT * FROM orders WHERE id = ?`,
//       [orderId]
//     );

//     if (updatedOrder[0].items && typeof updatedOrder[0].items === 'string') {
//       try {
//         updatedOrder[0].items = JSON.parse(updatedOrder[0].items);
//       } catch (e) {
//         updatedOrder[0].items = [];
//       }
//     }

//     // ─── CREATE NOTIFICATION FOR CUSTOMER ──────────────────────────────────
//     const order = updatedOrder[0];
//     const customerId = order.customer_id;
    
//     if (customerId) {
//       let title, message, icon, type;
      
//       switch (status.toLowerCase()) {
//         case 'approved':
//           title = '✅ Order Approved!';
//           message = `Your order #${order.order_number} has been approved and is being processed.`;
//           icon = 'check-circle';
//           type = 'order_approved';
//           break;
//         case 'rejected':
//           title = '❌ Order Rejected';
//           message = `Your order #${order.order_number} has been rejected. Please contact support for more information.`;
//           icon = 'x-circle';
//           type = 'order_rejected';
//           break;
//         case 'processing':
//           title = '⏳ Order Processing';
//           message = `Your order #${order.order_number} is now being processed.`;
//           icon = 'clock';
//           type = 'order_processing';
//           break;
//         case 'completed':
//           title = '🎉 Order Completed!';
//           message = `Your order #${order.order_number} has been completed successfully. Thank you for your business!`;
//           icon = 'check-circle';
//           type = 'order_completed';
//           break;
//         case 'cancelled':
//           title = '❌ Order Cancelled';
//           message = `Your order #${order.order_number} has been cancelled.`;
//           icon = 'x-circle';
//           type = 'order_cancelled';
//           break;
//         default:
//           title = `📋 Order ${status}`;
//           message = `Your order #${order.order_number} status has been updated to ${status}.`;
//           icon = 'bell';
//           type = 'order_updated';
//       }

//       const notifQuery = `
//         INSERT INTO notifications (user_id, title, message, type, icon, data, created_at)
//         VALUES (?, ?, ?, ?, ?, ?, NOW())
//       `;
      
//       const notifData = JSON.stringify({ 
//         orderId: order.id, 
//         orderNumber: order.order_number,
//         status: status.toLowerCase()
//       });
      
//       await db.promise().query(notifQuery, [
//         customerId,
//         title,
//         message,
//         type,
//         icon,
//         notifData
//       ]);
      
//       console.log(`📧 Notification created for customer ${customerId}: ${title}`);
//     }

//     res.json({
//       success: true,
//       message: `Order ${status.toLowerCase()} successfully`,
//       data: updatedOrder[0]
//     });

//   } catch (err) {
//     console.error("Error updating order status:", err);
//     res.status(500).json({
//       success: false,
//       error: "Failed to update order status",
//       message: err.message
//     });
//   }
// });


// // ==============================
// // UPDATE ORDER STATUS AND PAYMENT
// // ==============================
// router.put("/:id/status-payment", async (req, res) => {
//   const { status, payment_status } = req.body;
//   const orderId = req.params.id;

//   console.log('📦 Updating order status and payment:', { orderId, status, payment_status });

//   const validStatuses = ['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'];
//   const validPaymentStatuses = ['pending', 'paid', 'failed', 'blocked'];

//   let updates = [];
//   let params = [];

//   if (status && validStatuses.includes(status.toLowerCase())) {
//     updates.push("status = ?");
//     params.push(status.toLowerCase());
//   } else if (status) {
//     return res.status(400).json({
//       success: false,
//       error: `Invalid status. Valid values: ${validStatuses.join(', ')}`
//     });
//   }

//   if (payment_status && validPaymentStatuses.includes(payment_status.toLowerCase())) {
//     updates.push("payment_status = ?");
//     params.push(payment_status.toLowerCase());
//   } else if (payment_status) {
//     return res.status(400).json({
//       success: false,
//       error: `Invalid payment_status. Valid values: ${validPaymentStatuses.join(', ')}`
//     });
//   }

//   if (updates.length === 0) {
//     return res.status(400).json({
//       success: false,
//       error: "At least one field (status or payment_status) is required"
//     });
//   }

//   updates.push("updated_at = NOW()");

//   try {
//     const query = `UPDATE orders SET ${updates.join(", ")} WHERE id = ?`;
//     const values = [...params, orderId];
    
//     const [result] = await db.promise().query(query, values);

//     if (result.affectedRows === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found"
//       });
//     }

//     const [updatedOrder] = await db.promise().query(
//       `SELECT 
//         o.*,
//         c.name as customer_name,
//         c.email as customer_email,
//         c.phone as customer_phone
//       FROM orders o
//       LEFT JOIN customers c ON o.customer_id = c.id
//       WHERE o.id = ?`,
//       [orderId]
//     );

//     if (updatedOrder[0].items && typeof updatedOrder[0].items === 'string') {
//       try {
//         updatedOrder[0].items = JSON.parse(updatedOrder[0].items);
//       } catch (e) {
//         updatedOrder[0].items = [];
//       }
//     }

//     res.json({
//       success: true,
//       message: "Order updated successfully",
//       data: updatedOrder[0]
//     });

//   } catch (err) {
//     console.error("Error updating order:", err);
//     res.status(500).json({
//       success: false,
//       error: "Failed to update order",
//       message: err.message
//     });
//   }
// });

// module.exports = router;





// backend/routes/customerOrderRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../db");

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
    console.log('📦 Fetching all orders');
    
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
    }

    res.json({
      success: true,
      message: "Orders fetched successfully",
      count: orders.length,
      data: orders
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
// GET ORDERS BY CUSTOMER ID
// ==============================
router.get("/customer/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    
    console.log('📦 Fetching orders for customer:', customerId);
    
    const sql = `
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

    const [orders] = await db.promise().query(sql, [customerId]);

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
    }

    res.json({
      success: true,
      message: "Customer orders fetched successfully",
      count: orders.length,
      data: orders
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
// GET SINGLE ORDER BY ID
// ==============================
router.get("/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log('📦 Fetching order details for ID:', orderId);
    
    const sql = `
      SELECT 
        o.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `;

    const [orders] = await db.promise().query(sql, [orderId]);

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const order = orders[0];
    
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

    res.json({
      success: true,
      message: "Order details fetched successfully",
      data: order
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
// UPDATE ORDER STATUS
// ==============================
router.put("/:id/status", async (req, res) => {
  const { status } = req.body;
  const orderId = req.params.id;

  console.log('📦 Updating order status:', { orderId, status });

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

    // ─── Create Notification ──────────────────────────────────────────────────
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
router.put("/:id/status-payment", async (req, res) => {
  const { status, payment_status } = req.body;
  const orderId = req.params.id;

  console.log('📦 Updating order status and payment:', { orderId, status, payment_status });

  const validStatuses = ['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'];
  const validPaymentStatuses = ['pending', 'paid', 'failed', 'blocked'];

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

  if (payment_status && validPaymentStatuses.includes(payment_status.toLowerCase())) {
    updates.push("payment_status = ?");
    params.push(payment_status.toLowerCase());
  } else if (payment_status) {
    return res.status(400).json({
      success: false,
      error: `Invalid payment_status. Valid values: ${validPaymentStatuses.join(', ')}`
    });
  }

  if (updates.length === 0) {
    return res.status(400).json({
      success: false,
      error: "At least one field (status or payment_status) is required"
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

    // ─── CREATE NOTIFICATION ──────────────────────────────────────────────────
    if (status) {
      await createOrderNotification(updatedOrder[0], status.toLowerCase());
    }

    res.json({
      success: true,
      message: "Order updated successfully",
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
    console.log('⚠️ No customer ID found, skipping notification');
    return;
  }

  let title, message, icon, type;
  
  switch (status) {
    case 'approved':
      title = '✅ Order Approved!';
      message = `Your order #${order.order_number} has been approved and is being processed.`;
      icon = 'check-circle';
      type = 'order_approved';
      break;
    case 'rejected':
      title = '❌ Order Rejected';
      message = `Your order #${order.order_number} has been rejected. Please contact support for more information.`;
      icon = 'x-circle';
      type = 'order_rejected';
      break;
    case 'processing':
      title = '⏳ Order Processing';
      message = `Your order #${order.order_number} is now being processed.`;
      icon = 'clock';
      type = 'order_processing';
      break;
    case 'completed':
      title = '🎉 Order Completed!';
      message = `Your order #${order.order_number} has been completed successfully. Thank you for your business!`;
      icon = 'check-circle';
      type = 'order_completed';
      break;
    case 'cancelled':
      title = '❌ Order Cancelled';
      message = `Your order #${order.order_number} has been cancelled.`;
      icon = 'x-circle';
      type = 'order_cancelled';
      break;
    default:
      title = `📋 Order ${status}`;
      message = `Your order #${order.order_number} status has been updated to ${status}.`;
      icon = 'bell';
      type = 'order_updated';
  }

  const data = {
    orderId: order.id,
    orderNumber: order.order_number,
    status: status
  };

  console.log(`📧 Creating notification for customer ${customerId}:`, { title, message });

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