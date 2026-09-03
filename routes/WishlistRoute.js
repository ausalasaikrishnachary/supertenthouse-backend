// routes/WishlistRoute.js
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

// ✅ Ensure table exists
const ensureTable = async () => {
  try {
    const tableCheck = await query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'wishlist_items'"
    );
    
    if (tableCheck[0].count === 0) {
      await query(`
        CREATE TABLE IF NOT EXISTS wishlist_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customer_id VARCHAR(255) NOT NULL,
          product_id VARCHAR(255) NOT NULL,
          product_name VARCHAR(255),
          price DECIMAL(10, 2),
          image VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_wishlist_item (customer_id, product_id)
        )
      `);
      console.log("📦 Created wishlist_items table");
    }
    return true;
  } catch (error) {
    console.error("Error ensuring wishlist table:", error);
    return false;
  }
};

// ✅ ADD TO WISHLIST
router.post("/add", async (req, res) => {
  try {
    const { customerId, productId, productName, price, image } = req.body;

    console.log("📦 Adding to wishlist:", { customerId, productId, productName, price });

    if (!customerId || !productId) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    await ensureTable();

    const existingItem = await query(
      `SELECT * FROM wishlist_items WHERE customer_id = ? AND product_id = ?`,
      [customerId, productId]
    );

    if (existingItem.length > 0) {
      console.log("📦 Item already in wishlist");
      return res.json({ 
        success: true, 
        message: "Item already in wishlist",
        exists: true
      });
    }

    const insertResult = await query(
      `INSERT INTO wishlist_items 
      (customer_id, product_id, product_name, price, image)
      VALUES (?, ?, ?, ?, ?)`,
      [
        customerId,
        productId,
        productName || '',
        price || 0,
        image || ''
      ]
    );

    console.log("📦 Added to wishlist successfully, ID:", insertResult.insertId);

    res.json({ 
      success: true, 
      message: "Added to wishlist",
      data: { id: insertResult.insertId }
    });

  } catch (err) {
    console.error("Error adding to wishlist:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error adding to wishlist",
      error: err.message 
    });
  }
});

// ✅ REMOVE FROM WISHLIST - FIXED
router.delete("/remove", async (req, res) => {
  try {
    console.log("🗑️ DELETE request received:");
    console.log("📦 Query params:", req.query);
    console.log("📦 Body:", req.body);
    
    // Get customerId and productId from query params
    const customerId = req.query.customerId;
    const productId = req.query.productId;
    
    // Also check body if query params are not present (fallback)
    const finalCustomerId = customerId || req.body.customerId;
    const finalProductId = productId || req.body.productId;

    console.log("🗑️ Final values:", { finalCustomerId, finalProductId });

    if (!finalCustomerId || !finalProductId) {
      console.log("❌ Missing customerId or productId");
      return res.status(400).json({ 
        success: false, 
        message: "Missing customerId or productId" 
      });
    }

    // Ensure table exists
    await ensureTable();

    // First check if item exists
    const existingItem = await query(
      `SELECT * FROM wishlist_items WHERE customer_id = ? AND product_id = ?`,
      [finalCustomerId, finalProductId]
    );

    console.log("📦 Existing item:", existingItem);

    if (existingItem.length === 0) {
      return res.json({ 
        success: true, 
        message: "Item not found in wishlist",
        exists: false
      });
    }

    // Delete the item
    const result = await query(
      `DELETE FROM wishlist_items WHERE customer_id = ? AND product_id = ?`,
      [finalCustomerId, finalProductId]
    );

    console.log("🗑️ Removed from wishlist successfully, affected rows:", result.affectedRows);

    res.json({ 
      success: true, 
      message: "Removed from wishlist",
      affectedRows: result.affectedRows
    });

  } catch (err) {
    console.error("❌ Error removing from wishlist:", err);
    console.error("Error details:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error removing from wishlist",
      error: err.message 
    });
  }
});

// ✅ GET WISHLIST
router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    console.log("📦 Fetching wishlist for customer:", customerId);

    await ensureTable();

    const items = await query(
      `SELECT * FROM wishlist_items WHERE customer_id = ? ORDER BY created_at DESC`,
      [customerId]
    );

    console.log("📦 Wishlist items found:", items.length);

    res.json({ 
      success: true, 
      data: items 
    });

  } catch (err) {
    console.error("Error fetching wishlist:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching wishlist" 
    });
  }
});

// ✅ CHECK IF IN WISHLIST
router.get("/check/:customerId/:productId", async (req, res) => {
  try {
    const { customerId, productId } = req.params;

    await ensureTable();

    const item = await query(
      `SELECT * FROM wishlist_items WHERE customer_id = ? AND product_id = ?`,
      [customerId, productId]
    );

    res.json({ 
      success: true, 
      exists: item.length > 0 
    });

  } catch (err) {
    console.error("Error checking wishlist:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error checking wishlist" 
    });
  }
});

module.exports = router;