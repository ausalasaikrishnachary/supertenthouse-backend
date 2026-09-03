// // routes/checkout.js
// const express = require("express");
// const router = express.Router();
// const db = require("../db");

// // ✅ Promise wrapper
// const query = (sql, values) => {
//   return new Promise((resolve, reject) => {
//     db.query(sql, values, (err, results) => {
//       if (err) return reject(err);
//       resolve(results);
//     });
//   });
// };

// // ─── Ensure customer_addresses table exists ──────────────────────────────────
// const ensureAddressTable = async () => {
//   try {
//     const tableCheck = await query(
//       "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'customer_addresses'"
//     );
    
//     if (tableCheck[0].count === 0) {
//       await query(`
//         CREATE TABLE IF NOT EXISTS customer_addresses (
//           id INT AUTO_INCREMENT PRIMARY KEY,
//           customer_id VARCHAR(255) NOT NULL,
//           label VARCHAR(100) NOT NULL,
//           full_name VARCHAR(255) NOT NULL,
//           phone VARCHAR(20) NOT NULL,
//           line1 VARCHAR(255) NOT NULL,
//           line2 VARCHAR(255),
//           city VARCHAR(100) NOT NULL,
//           state VARCHAR(100) NOT NULL,
//           pincode VARCHAR(20) NOT NULL,
//           country VARCHAR(100) DEFAULT 'India',
//           type ENUM('home', 'office', 'other') DEFAULT 'other',
//           is_default BOOLEAN DEFAULT FALSE,
//           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//           INDEX idx_customer_id (customer_id),
//           INDEX idx_is_default (is_default)
//         )
//       `);
//       console.log("📦 Created customer_addresses table");
//     }
//     return true;
//   } catch (error) {
//     console.error("Error ensuring address table:", error);
//     return false;
//   }
// };

// // ─── Ensure orders table exists and has correct columns ──────────────────────
// const ensureOrdersTable = async () => {
//   try {
//     // First check if table exists
//     const tableCheck = await query(
//       "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'orders'"
//     );
    
//     if (tableCheck[0].count === 0) {
//       console.log("📦 Creating orders table...");
//       await query(`
//         CREATE TABLE orders (
//           id INT AUTO_INCREMENT PRIMARY KEY,
//           order_number VARCHAR(50) NOT NULL UNIQUE,
//           customer_id VARCHAR(255) NOT NULL,
//           customer_name VARCHAR(255),
//           customer_email VARCHAR(255),
//           customer_phone VARCHAR(20),
//           address_id INT,
//           address_label VARCHAR(100),
//           address_full_name VARCHAR(255),
//           address_phone VARCHAR(20),
//           address_line1 VARCHAR(255),
//           address_line2 VARCHAR(255),
//           address_city VARCHAR(100),
//           address_state VARCHAR(100),
//           address_pincode VARCHAR(20),
//           address_country VARCHAR(100),
//           event_date DATE,
//           event_time VARCHAR(20),
//           event_type VARCHAR(100),
//           venue VARCHAR(255),
//           guest_count INT,
//           special_instructions TEXT,
//           items JSON,
//           subtotal DECIMAL(10, 2),
//           delivery_charge DECIMAL(10, 2),
//           gst DECIMAL(10, 2),
//           coupon_discount DECIMAL(10, 2),
//           coupon_code VARCHAR(50),
//           grand_total DECIMAL(10, 2),
//           payment_method VARCHAR(50),
//           payment_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
//           order_status ENUM('pending', 'confirmed', 'team_assigned', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
//           notes TEXT,
//           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//           INDEX idx_customer_id (customer_id),
//           INDEX idx_order_number (order_number),
//           INDEX idx_order_status (order_status),
//           INDEX idx_payment_status (payment_status),
//           INDEX idx_event_date (event_date)
//         )
//       `);
//       console.log("✅ Created orders table");
//     } else {
//       console.log("📦 Orders table exists, checking columns...");
      
//       // Check if customer_id column exists
//       const columnCheck = await query(
//         "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'customer_id'"
//       );
      
//       if (columnCheck.length === 0) {
//         console.log("📦 Adding customer_id column...");
//         await query(`
//           ALTER TABLE orders ADD COLUMN customer_id VARCHAR(255) NOT NULL
//         `);
//         console.log("✅ Added customer_id column");
//       } else {
//         console.log("✅ customer_id column already exists");
//       }
      
//       // Check if other required columns exist
//       const requiredColumns = [
//         'order_number', 'customer_name', 'customer_email', 'customer_phone',
//         'address_id', 'address_label', 'address_full_name', 'address_phone',
//         'address_line1', 'address_line2', 'address_city', 'address_state',
//         'address_pincode', 'address_country', 'event_date', 'event_time',
//         'event_type', 'venue', 'guest_count', 'special_instructions',
//         'items', 'subtotal', 'delivery_charge', 'gst', 'coupon_discount',
//         'coupon_code', 'grand_total', 'payment_method', 'payment_status',
//         'order_status', 'notes'
//       ];
      
//       for (const col of requiredColumns) {
//         const colCheck = await query(
//           `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = ?`,
//           [col]
//         );
        
//         if (colCheck.length === 0) {
//           console.log(`⚠️ Column ${col} is missing, adding...`);
//           // Determine column type based on name
//           let colType = 'VARCHAR(255)';
//           if (col === 'guest_count') colType = 'INT';
//           else if (col === 'address_id') colType = 'INT';
//           else if (col === 'subtotal' || col === 'delivery_charge' || col === 'gst' || 
//                    col === 'coupon_discount' || col === 'grand_total') colType = 'DECIMAL(10, 2)';
//           else if (col === 'items' || col === 'special_instructions' || col === 'notes') colType = 'TEXT';
//           else if (col === 'event_date') colType = 'DATE';
//           else if (col === 'payment_status') colType = "ENUM('pending', 'paid', 'failed') DEFAULT 'pending'";
//           else if (col === 'order_status') colType = "ENUM('pending', 'confirmed', 'team_assigned', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending'";
//           else if (col === 'order_number') colType = "VARCHAR(50) NOT NULL UNIQUE";
          
//           await query(`ALTER TABLE orders ADD COLUMN ${col} ${colType}`);
//           console.log(`✅ Added ${col} column`);
//         }
//       }
//     }
//     return true;
//   } catch (error) {
//     console.error("Error ensuring orders table:", error);
//     return false;
//   }
// };

// // ─── GET ALL ADDRESSES FOR A CUSTOMER ──────────────────────────────────────
// router.get("/addresses/:customerId", async (req, res) => {
//   try {
//     const { customerId } = req.params;

//     console.log("📦 Fetching addresses for customer:", customerId);

//     await ensureAddressTable();

//     const addresses = await query(
//       `SELECT * FROM customer_addresses 
//        WHERE customer_id = ? 
//        ORDER BY is_default DESC, created_at DESC`,
//       [customerId]
//     );

//     console.log("📦 Addresses found:", addresses.length);

//     res.json({
//       success: true,
//       data: addresses
//     });

//   } catch (error) {
//     console.error("❌ GET ADDRESSES ERROR:", error);
//     res.status(500).json({ 
//       success: false, 
//       message: "Server error",
//       error: error.message 
//     });
//   }
// });

// // ─── ADD NEW ADDRESS ──────────────────────────────────────────────────────────
// router.post("/address", async (req, res) => {
//   try {
//     const { 
//       customerId, 
//       label, 
//       fullName, 
//       phone, 
//       line1, 
//       line2, 
//       city, 
//       state, 
//       pincode, 
//       country,
//       type,
//       isDefault 
//     } = req.body;

//     console.log("📦 Adding address for customer:", customerId);

//     if (!customerId) {
//       return res.status(400).json({ 
//         success: false, 
//         message: "Customer ID is required" 
//       });
//     }

//     if (!label || !fullName || !phone || !line1 || !city || !state || !pincode) {
//       return res.status(400).json({ 
//         success: false, 
//         message: "Missing required fields" 
//       });
//     }

//     await ensureAddressTable();

//     if (isDefault) {
//       await query(
//         `UPDATE customer_addresses 
//          SET is_default = false 
//          WHERE customer_id = ?`,
//         [customerId]
//       );
//     }

//     const result = await query(
//       `INSERT INTO customer_addresses 
//        (customer_id, label, full_name, phone, line1, line2, city, state, pincode, country, type, is_default)
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//       [
//         customerId,
//         label,
//         fullName,
//         phone,
//         line1,
//         line2 || null,
//         city,
//         state,
//         pincode,
//         country || 'India',
//         type || 'other',
//         isDefault || false
//       ]
//     );

//     console.log("✅ Address added, ID:", result.insertId);

//     const newAddress = await query(
//       `SELECT * FROM customer_addresses WHERE id = ?`,
//       [result.insertId]
//     );

//     res.json({
//       success: true,
//       message: "Address added successfully",
//       data: newAddress[0] || { id: result.insertId }
//     });

//   } catch (error) {
//     console.error("❌ ADD ADDRESS ERROR:", error);
//     res.status(500).json({ 
//       success: false, 
//       message: "Server error",
//       error: error.message 
//     });
//   }
// });

// // ─── UPDATE ADDRESS ──────────────────────────────────────────────────────────
// router.put("/address/:addressId", async (req, res) => {
//   try {
//     const { addressId } = req.params;
//     const { 
//       label, 
//       fullName, 
//       phone, 
//       line1, 
//       line2, 
//       city, 
//       state, 
//       pincode, 
//       country,
//       type,
//       isDefault 
//     } = req.body;

//     console.log("📦 Updating address:", addressId);

//     await ensureAddressTable();

//     const existingAddress = await query(
//       `SELECT customer_id FROM customer_addresses WHERE id = ?`,
//       [addressId]
//     );

//     if (existingAddress.length === 0) {
//       return res.status(404).json({ 
//         success: false, 
//         message: "Address not found" 
//       });
//     }

//     const customerId = existingAddress[0].customer_id;

//     if (isDefault) {
//       await query(
//         `UPDATE customer_addresses 
//          SET is_default = false 
//          WHERE customer_id = ? AND id != ?`,
//         [customerId, addressId]
//       );
//     }

//     await query(
//       `UPDATE customer_addresses 
//        SET label = ?, full_name = ?, phone = ?, line1 = ?, line2 = ?, 
//            city = ?, state = ?, pincode = ?, country = ?, type = ?, is_default = ?
//        WHERE id = ?`,
//       [
//         label,
//         fullName,
//         phone,
//         line1,
//         line2 || null,
//         city,
//         state,
//         pincode,
//         country || 'India',
//         type || 'other',
//         isDefault || false,
//         addressId
//       ]
//     );

//     console.log("✅ Address updated:", addressId);

//     const updatedAddress = await query(
//       `SELECT * FROM customer_addresses WHERE id = ?`,
//       [addressId]
//     );

//     res.json({
//       success: true,
//       message: "Address updated successfully",
//       data: updatedAddress[0]
//     });

//   } catch (error) {
//     console.error("❌ UPDATE ADDRESS ERROR:", error);
//     res.status(500).json({ 
//       success: false, 
//       message: "Server error",
//       error: error.message 
//     });
//   }
// });

// // ─── DELETE ADDRESS ──────────────────────────────────────────────────────────
// router.delete("/address/:addressId", async (req, res) => {
//   try {
//     const { addressId } = req.params;

//     console.log("🗑️ Deleting address:", addressId);

//     await ensureAddressTable();

//     const result = await query(
//       `DELETE FROM customer_addresses WHERE id = ?`,
//       [addressId]
//     );

//     if (result.affectedRows === 0) {
//       return res.status(404).json({ 
//         success: false, 
//         message: "Address not found" 
//       });
//     }

//     console.log("✅ Address deleted:", addressId);

//     res.json({
//       success: true,
//       message: "Address deleted successfully"
//     });

//   } catch (error) {
//     console.error("❌ DELETE ADDRESS ERROR:", error);
//     res.status(500).json({ 
//       success: false, 
//       message: "Server error",
//       error: error.message 
//     });
//   }
// });

// // ─── SET DEFAULT ADDRESS ─────────────────────────────────────────────────────
// router.put("/address/default/:addressId", async (req, res) => {
//   try {
//     const { addressId } = req.params;

//     console.log("📦 Setting default address:", addressId);

//     await ensureAddressTable();

//     const existingAddress = await query(
//       `SELECT customer_id FROM customer_addresses WHERE id = ?`,
//       [addressId]
//     );

//     if (existingAddress.length === 0) {
//       return res.status(404).json({ 
//         success: false, 
//         message: "Address not found" 
//       });
//     }

//     const customerId = existingAddress[0].customer_id;

//     await query(
//       `UPDATE customer_addresses 
//        SET is_default = false 
//        WHERE customer_id = ?`,
//       [customerId]
//     );

//     await query(
//       `UPDATE customer_addresses 
//        SET is_default = true 
//        WHERE id = ?`,
//       [addressId]
//     );

//     console.log("✅ Default address set:", addressId);

//     const updatedAddress = await query(
//       `SELECT * FROM customer_addresses WHERE id = ?`,
//       [addressId]
//     );

//     res.json({
//       success: true,
//       message: "Default address set successfully",
//       data: updatedAddress[0]
//     });

//   } catch (error) {
//     console.error("❌ SET DEFAULT ADDRESS ERROR:", error);
//     res.status(500).json({ 
//       success: false, 
//       message: "Server error",
//       error: error.message 
//     });
//   }
// });

// // ─── CREATE ORDER ──────────────────────────────────────────────────────────────
// router.post("/order", async (req, res) => {
//   try {
//     const {
//       customerId,
//       customerName,
//       customerEmail,
//       customerPhone,
//       address,
//       eventDate,
//       eventTime,
//       eventType,
//       venue,
//       guestCount,
//       specialInstructions,
//       items,
//       subtotal,
//       deliveryCharge,
//       gst,
//       couponDiscount,
//       couponCode,
//       grandTotal,
//       paymentMethod,
//       notes
//     } = req.body;

//     console.log("📦 Creating order for customer:", customerId);

//     if (!customerId || !address || !eventDate || !items || !grandTotal) {
//       console.error("❌ Missing required fields:", { customerId, address, eventDate, items, grandTotal });
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields"
//       });
//     }

//     // Ensure orders table exists with correct columns
//     await ensureOrdersTable();

//     // Generate unique order number
//     const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

//     console.log("📦 Address object:", JSON.stringify(address, null, 2));

//     // Insert order using the SET syntax with proper column names
//     const result = await query(
//       `INSERT INTO orders SET ?`,
//       {
//         order_number: orderNumber,
//         customer_id: customerId,
//         customer_name: customerName || null,
//         customer_email: customerEmail || null,
//         customer_phone: customerPhone || null,
//         address_id: address.id ? parseInt(address.id) : null,
//         address_label: address.label || null,
//         address_full_name: address.fullName || null,
//         address_phone: address.phone || null,
//         address_line1: address.line1 || null,
//         address_line2: address.line2 || null,
//         address_city: address.city || null,
//         address_state: address.state || null,
//         address_pincode: address.pincode || null,
//         address_country: address.country || null,
//         event_date: eventDate || null,
//         event_time: eventTime || null,
//         event_type: eventType || null,
//         venue: venue || null,
//         guest_count: guestCount ? parseInt(guestCount) : null,
//         special_instructions: specialInstructions || null,
//         items: JSON.stringify(items),
//         subtotal: parseFloat(subtotal) || 0,
//         delivery_charge: parseFloat(deliveryCharge) || 0,
//         gst: parseFloat(gst) || 0,
//         coupon_discount: parseFloat(couponDiscount) || 0,
//         coupon_code: couponCode || null,
//         grand_total: parseFloat(grandTotal) || 0,
//         payment_method: paymentMethod || null,
//         payment_status: 'pending',
//         order_status: 'pending',
//         notes: notes || null
//       }
//     );

//     console.log("✅ Order created, ID:", result.insertId, "Order Number:", orderNumber);

//     const order = await query(
//       `SELECT * FROM orders WHERE id = ?`,
//       [result.insertId]
//     );

//     res.json({
//       success: true,
//       message: "Order created successfully",
//       data: {
//         id: result.insertId,
//         orderNumber: orderNumber,
//         order: order[0]
//       }
//     });

//   } catch (error) {
//     console.error("❌ CREATE ORDER ERROR:", error);
//     console.error("Error details:", {
//       message: error.message,
//       sql: error.sql,
//       code: error.code,
//       errno: error.errno
//     });
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message
//     });
//   }
// });

// // ─── GET ORDERS BY CUSTOMER ──────────────────────────────────────────────────
// router.get("/orders/:customerId", async (req, res) => {
//   try {
//     const { customerId } = req.params;

//     console.log("📦 Fetching orders for customer:", customerId);

//     await ensureOrdersTable();

//     const orders = await query(
//       `SELECT * FROM orders 
//        WHERE customer_id = ? 
//        ORDER BY created_at DESC`,
//       [customerId]
//     );

//     console.log("📦 Orders found:", orders.length);

//     const parsedOrders = orders.map(order => ({
//       ...order,
//       items: JSON.parse(order.items || '[]')
//     }));

//     res.json({
//       success: true,
//       data: parsedOrders
//     });

//   } catch (error) {
//     console.error("❌ GET ORDERS ERROR:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message
//     });
//   }
// });

// // ─── GET ORDER BY ORDER NUMBER ──────────────────────────────────────────────
// router.get("/order/:orderNumber", async (req, res) => {
//   try {
//     const { orderNumber } = req.params;

//     console.log("📦 Fetching order by number:", orderNumber);

//     await ensureOrdersTable();

//     const order = await query(
//       `SELECT * FROM orders WHERE order_number = ?`,
//       [orderNumber]
//     );

//     if (order.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found"
//       });
//     }

//     const parsedOrder = {
//       ...order[0],
//       items: JSON.parse(order[0].items || '[]')
//     };

//     res.json({
//       success: true,
//       data: parsedOrder
//     });

//   } catch (error) {
//     console.error("❌ GET ORDER ERROR:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message
//     });
//   }
// });

// // ─── UPDATE ORDER STATUS ─────────────────────────────────────────────────────
// router.put("/order/:orderId/status", async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const { orderStatus, paymentStatus } = req.body;

//     console.log("📦 Updating order status:", orderId);

//     await ensureOrdersTable();

//     const updates = {};
//     if (orderStatus) updates.order_status = orderStatus;
//     if (paymentStatus) updates.payment_status = paymentStatus;

//     if (Object.keys(updates).length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "No updates provided"
//       });
//     }

//     await query(
//       `UPDATE orders SET ? WHERE id = ?`,
//       [updates, orderId]
//     );

//     console.log("✅ Order status updated:", orderId);

//     res.json({
//       success: true,
//       message: "Order status updated successfully"
//     });

//   } catch (error) {
//     console.error("❌ UPDATE ORDER STATUS ERROR:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message
//     });
//   }
// });

// // ─── GET ALL ORDERS (ADMIN) ──────────────────────────────────────────────────
// router.get("/orders/all", async (req, res) => {
//   try {
//     console.log("📦 Fetching all orders for admin");

//     await ensureOrdersTable();

//     const orders = await query(
//       `SELECT * FROM orders 
//        ORDER BY created_at DESC`
//     );

//     console.log("📦 Total orders found:", orders.length);

//     const parsedOrders = orders.map(order => ({
//       ...order,
//       items: JSON.parse(order.items || '[]')
//     }));

//     res.json({
//       success: true,
//       data: parsedOrders
//     });

//   } catch (error) {
//     console.error("❌ GET ALL ORDERS ERROR:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message
//     });
//   }
// });


// module.exports = router;





// routes/checkout.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// ✅ Promise wrapper
const query = (sql, values) => {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
};

// ─── Ensure customer_addresses table exists ──────────────────────────────────
const ensureAddressTable = async () => {
  try {
    const tableCheck = await query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'customer_addresses'"
    );
    
    if (tableCheck[0].count === 0) {
      await query(`
        CREATE TABLE IF NOT EXISTS customer_addresses (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customer_id VARCHAR(255) NOT NULL,
          label VARCHAR(100) NOT NULL,
          full_name VARCHAR(255) NOT NULL,
          phone VARCHAR(20) NOT NULL,
          line1 VARCHAR(255) NOT NULL,
          line2 VARCHAR(255),
          city VARCHAR(100) NOT NULL,
          state VARCHAR(100) NOT NULL,
          pincode VARCHAR(20) NOT NULL,
          country VARCHAR(100) DEFAULT 'India',
          type ENUM('home', 'office', 'other') DEFAULT 'other',
          is_default BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_customer_id (customer_id),
          INDEX idx_is_default (is_default)
        )
      `);
      console.log("📦 Created customer_addresses table");
    }
    return true;
  } catch (error) {
    console.error("Error ensuring address table:", error);
    return false;
  }
};

// ─── GET ALL ADDRESSES FOR A CUSTOMER ──────────────────────────────────────
router.get("/addresses/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    console.log("📦 Fetching addresses for customer:", customerId);

    await ensureAddressTable();

    const addresses = await query(
      `SELECT * FROM customer_addresses 
       WHERE customer_id = ? 
       ORDER BY is_default DESC, created_at DESC`,
      [customerId]
    );

    console.log("📦 Addresses found:", addresses.length);

    res.json({
      success: true,
      data: addresses
    });

  } catch (error) {
    console.error("❌ GET ADDRESSES ERROR:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: error.message 
    });
  }
});

// ─── ADD NEW ADDRESS ──────────────────────────────────────────────────────────
router.post("/address", async (req, res) => {
  try {
    const { 
      customerId, 
      label, 
      fullName, 
      phone, 
      line1, 
      line2, 
      city, 
      state, 
      pincode, 
      country,
      type,
      isDefault 
    } = req.body;

    console.log("📦 Adding address for customer:", customerId);

    if (!customerId) {
      return res.status(400).json({ 
        success: false, 
        message: "Customer ID is required" 
      });
    }

    if (!label || !fullName || !phone || !line1 || !city || !state || !pincode) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields" 
      });
    }

    await ensureAddressTable();

    if (isDefault) {
      await query(
        `UPDATE customer_addresses 
         SET is_default = false 
         WHERE customer_id = ?`,
        [customerId]
      );
    }

    const result = await query(
      `INSERT INTO customer_addresses 
       (customer_id, label, full_name, phone, line1, line2, city, state, pincode, country, type, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        label,
        fullName,
        phone,
        line1,
        line2 || null,
        city,
        state,
        pincode,
        country || 'India',
        type || 'other',
        isDefault || false
      ]
    );

    console.log("✅ Address added, ID:", result.insertId);

    const newAddress = await query(
      `SELECT * FROM customer_addresses WHERE id = ?`,
      [result.insertId]
    );

    res.json({
      success: true,
      message: "Address added successfully",
      data: newAddress[0] || { id: result.insertId }
    });

  } catch (error) {
    console.error("❌ ADD ADDRESS ERROR:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: error.message 
    });
  }
});

// ─── UPDATE ADDRESS ──────────────────────────────────────────────────────────
router.put("/address/:addressId", async (req, res) => {
  try {
    const { addressId } = req.params;
    const { 
      label, 
      fullName, 
      phone, 
      line1, 
      line2, 
      city, 
      state, 
      pincode, 
      country,
      type,
      isDefault 
    } = req.body;

    console.log("📦 Updating address:", addressId);

    await ensureAddressTable();

    const existingAddress = await query(
      `SELECT customer_id FROM customer_addresses WHERE id = ?`,
      [addressId]
    );

    if (existingAddress.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Address not found" 
      });
    }

    const customerId = existingAddress[0].customer_id;

    if (isDefault) {
      await query(
        `UPDATE customer_addresses 
         SET is_default = false 
         WHERE customer_id = ? AND id != ?`,
        [customerId, addressId]
      );
    }

    await query(
      `UPDATE customer_addresses 
       SET label = ?, full_name = ?, phone = ?, line1 = ?, line2 = ?, 
           city = ?, state = ?, pincode = ?, country = ?, type = ?, is_default = ?
       WHERE id = ?`,
      [
        label,
        fullName,
        phone,
        line1,
        line2 || null,
        city,
        state,
        pincode,
        country || 'India',
        type || 'other',
        isDefault || false,
        addressId
      ]
    );

    console.log("✅ Address updated:", addressId);

    const updatedAddress = await query(
      `SELECT * FROM customer_addresses WHERE id = ?`,
      [addressId]
    );

    res.json({
      success: true,
      message: "Address updated successfully",
      data: updatedAddress[0]
    });

  } catch (error) {
    console.error("❌ UPDATE ADDRESS ERROR:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: error.message 
    });
  }
});

// ─── DELETE ADDRESS ──────────────────────────────────────────────────────────
router.delete("/address/:addressId", async (req, res) => {
  try {
    const { addressId } = req.params;

    console.log("🗑️ Deleting address:", addressId);

    await ensureAddressTable();

    const result = await query(
      `DELETE FROM customer_addresses WHERE id = ?`,
      [addressId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Address not found" 
      });
    }

    console.log("✅ Address deleted:", addressId);

    res.json({
      success: true,
      message: "Address deleted successfully"
    });

  } catch (error) {
    console.error("❌ DELETE ADDRESS ERROR:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: error.message 
    });
  }
});

// ─── SET DEFAULT ADDRESS ─────────────────────────────────────────────────────
router.put("/address/default/:addressId", async (req, res) => {
  try {
    const { addressId } = req.params;

    console.log("📦 Setting default address:", addressId);

    await ensureAddressTable();

    const existingAddress = await query(
      `SELECT customer_id FROM customer_addresses WHERE id = ?`,
      [addressId]
    );

    if (existingAddress.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Address not found" 
      });
    }

    const customerId = existingAddress[0].customer_id;

    await query(
      `UPDATE customer_addresses 
       SET is_default = false 
       WHERE customer_id = ?`,
      [customerId]
    );

    await query(
      `UPDATE customer_addresses 
       SET is_default = true 
       WHERE id = ?`,
      [addressId]
    );

    console.log("✅ Default address set:", addressId);

    const updatedAddress = await query(
      `SELECT * FROM customer_addresses WHERE id = ?`,
      [addressId]
    );

    res.json({
      success: true,
      message: "Default address set successfully",
      data: updatedAddress[0]
    });

  } catch (error) {
    console.error("❌ SET DEFAULT ADDRESS ERROR:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: error.message 
    });
  }
});

// ─── CREATE ORDER ──────────────────────────────────────────────────────────────
// routes/checkout.js - Update the CREATE ORDER endpoint

router.post("/order", async (req, res) => {
  try {
    const {
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      address,
      eventDate,
      eventTime,
      eventType,
      venue,
      guestCount,
      specialInstructions,
      items,
      subtotal,
      deliveryCharge,
      gst,
      couponDiscount,
      couponCode,
      grandTotal,
      total, // ✅ Add this - the total field from frontend
      advanceAmount, // ✅ Add this
      paymentMethod,
      notes
    } = req.body;

    console.log("📦 Creating order for customer:", customerId);
    console.log("📦 Total received:", total);
    console.log("📦 Grand Total received:", grandTotal);
    console.log("📦 Advance Amount received:", advanceAmount);

    if (!customerId || !address || !eventDate || !items || !grandTotal) {
      console.error("❌ Missing required fields:", { customerId, address, eventDate, items, grandTotal });
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Generate unique order number
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    console.log("📦 Address object:", JSON.stringify(address, null, 2));

    // Insert order with ALL fields including total
    const result = await query(
      `INSERT INTO orders (
        order_number, customer_id, customer_name, customer_email, customer_phone,
        address_id, address_label, address_full_name, address_phone,
        address_line1, address_line2, address_city, address_state,
        address_pincode, address_country, event_date, event_time,
        event_type, venue, guest_count, special_instructions,
        items, subtotal, delivery_charge, gst, coupon_discount,
        coupon_code, grand_total, total, advance_amount, payment_method, payment_status,
        status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        customerId,
        customerName || null,
        customerEmail || null,
        customerPhone || null,
        address.id ? parseInt(address.id) : null,
        address.label || null,
        address.fullName || null,
        address.phone || null,
        address.line1 || null,
        address.line2 || null,
        address.city || null,
        address.state || null,
        address.pincode || null,
        address.country || null,
        eventDate || null,
        eventTime || null,
        eventType || null,
        venue || null,
        guestCount ? parseInt(guestCount) : null,
        specialInstructions || null,
        JSON.stringify(items),
        parseFloat(subtotal) || 0,
        parseFloat(deliveryCharge) || 0,
        parseFloat(gst) || 0,
        parseFloat(couponDiscount) || 0,
        couponCode || null,
        parseFloat(grandTotal) || 0,
        parseFloat(total) || parseFloat(grandTotal) || 0, // ✅ Add total field
        parseFloat(advanceAmount) || 0, // ✅ Add advance_amount field
        paymentMethod || null,
        'pending',
        'pending',
        notes || null
      ]
    );

    console.log("✅ Order created, ID:", result.insertId, "Order Number:", orderNumber);

    const order = await query(
      `SELECT * FROM orders WHERE id = ?`,
      [result.insertId]
    );

    res.json({
      success: true,
      message: "Order created successfully",
      data: {
        id: result.insertId,
        orderNumber: orderNumber,
        order: order[0]
      }
    });

  } catch (error) {
    console.error("❌ CREATE ORDER ERROR:", error);
    console.error("Error details:", {
      message: error.message,
      sql: error.sql,
      code: error.code,
      errno: error.errno
    });
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// ─── GET ORDERS BY CUSTOMER ──────────────────────────────────────────────────
// routes/checkout.js - Update GET orders endpoints

router.get("/orders/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    console.log("📦 Fetching orders for customer:", customerId);

    const orders = await query(
      `SELECT * FROM orders 
       WHERE customer_id = ? 
       ORDER BY created_at DESC`,
      [customerId]
    );

    console.log("📦 Orders found:", orders.length);

    const parsedOrders = orders.map(order => ({
      ...order,
      items: JSON.parse(order.items || '[]'),
      total: order.total || order.grand_total || 0,
      advance_amount: order.advance_amount || 0,
    }));

    res.json({
      success: true,
      data: parsedOrders
    });

  } catch (error) {
    console.error("❌ GET ORDERS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

router.get("/order/:orderNumber", async (req, res) => {
  try {
    const { orderNumber } = req.params;

    console.log("📦 Fetching order by number:", orderNumber);

    const order = await query(
      `SELECT * FROM orders WHERE order_number = ?`,
      [orderNumber]
    );

    if (order.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const parsedOrder = {
      ...order[0],
      items: JSON.parse(order[0].items || '[]'),
      total: order[0].total || order[0].grand_total || 0,
      advance_amount: order[0].advance_amount || 0,
    };

    res.json({
      success: true,
      data: parsedOrder
    });

  } catch (error) {
    console.error("❌ GET ORDER ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// ─── GET ORDER BY ORDER NUMBER ──────────────────────────────────────────────
router.get("/order/:orderNumber", async (req, res) => {
  try {
    const { orderNumber } = req.params;

    console.log("📦 Fetching order by number:", orderNumber);

    const order = await query(
      `SELECT * FROM orders WHERE order_number = ?`,
      [orderNumber]
    );

    if (order.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const parsedOrder = {
      ...order[0],
      items: JSON.parse(order[0].items || '[]')
    };

    res.json({
      success: true,
      data: parsedOrder
    });

  } catch (error) {
    console.error("❌ GET ORDER ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// ─── UPDATE ORDER STATUS ─────────────────────────────────────────────────────
router.put("/order/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderStatus, paymentStatus } = req.body;

    console.log("📦 Updating order status:", orderId);
    console.log("📦 New status:", orderStatus);

    // Update both status and order_status columns for compatibility
    const updates = {};
    if (orderStatus) {
      updates.status = orderStatus;
      updates.order_status = orderStatus;
    }
    if (paymentStatus) updates.payment_status = paymentStatus;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No updates provided"
      });
    }

    await query(
      `UPDATE orders SET ? WHERE id = ?`,
      [updates, orderId]
    );

    console.log("✅ Order status updated:", orderId);

    res.json({
      success: true,
      message: "Order status updated successfully"
    });

  } catch (error) {
    console.error("❌ UPDATE ORDER STATUS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// ─── GET ALL ORDERS (ADMIN) ──────────────────────────────────────────────────
router.get("/orders/all", async (req, res) => {
  try {
    console.log("📦 Fetching all orders for admin");

    const orders = await query(
      `SELECT * FROM orders 
       ORDER BY created_at DESC`
    );

    console.log("📦 Total orders found:", orders.length);

    const parsedOrders = orders.map(order => {
      // Parse items if it's a string
      let parsedItems = [];
      try {
        parsedItems = JSON.parse(order.items || '[]');
      } catch (e) {
        parsedItems = [];
      }

      return {
        ...order,
        items: parsedItems,
        // Use order_status if available, otherwise use status, fallback to 'pending'
        order_status: order.order_status || order.status || 'pending'
      };
    });

    res.json({
      success: true,
      data: parsedOrders
    });

  } catch (error) {
    console.error("❌ GET ALL ORDERS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

module.exports = router;