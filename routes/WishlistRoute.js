// routes/WishlistRoute.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const ITEM_TYPES = new Set(["product", "package"]);
const normalizeItemType = value => ITEM_TYPES.has(String(value || "product").toLowerCase())
  ? String(value || "product").toLowerCase()
  : null;

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
const ensureTableWork = async () => {
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
          item_type VARCHAR(20) NOT NULL DEFAULT 'product',
          product_name VARCHAR(255),
          price DECIMAL(10, 2),
          image VARCHAR(500),
          quantity INT NOT NULL DEFAULT 1,
          selected_color VARCHAR(100) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_wishlist_typed (customer_id, item_type, product_id)
        )
      `);
      console.log("📦 Created wishlist_items table");
    }
    const typeColumn = await query("SHOW COLUMNS FROM wishlist_items LIKE 'item_type'");
    if (typeColumn.length === 0) {
      await query("ALTER TABLE wishlist_items ADD COLUMN item_type VARCHAR(20) NOT NULL DEFAULT 'product' AFTER product_id");
      await query(`UPDATE wishlist_items wi
        INNER JOIN packages p ON CAST(p.id AS CHAR) = wi.product_id
          AND LOWER(TRIM(p.package_name)) = LOWER(TRIM(wi.product_name))
        SET wi.item_type = 'package'
        WHERE wi.item_type = 'product'`);
    }
    const quantityColumn = await query("SHOW COLUMNS FROM wishlist_items LIKE 'quantity'");
    if (quantityColumn.length === 0) await query("ALTER TABLE wishlist_items ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER image");
    const colorColumn = await query("SHOW COLUMNS FROM wishlist_items LIKE 'selected_color'");
    if (colorColumn.length === 0) await query("ALTER TABLE wishlist_items ADD COLUMN selected_color VARCHAR(100) NULL AFTER quantity");
    const oldIndex = await query("SHOW INDEX FROM wishlist_items WHERE Key_name = 'unique_wishlist_item'");
    if (oldIndex.length > 0) await query("ALTER TABLE wishlist_items DROP INDEX unique_wishlist_item");
    const typedIndex = await query("SHOW INDEX FROM wishlist_items WHERE Key_name = 'unique_wishlist_typed'");
    if (typedIndex.length === 0) {
      await query("ALTER TABLE wishlist_items ADD UNIQUE KEY unique_wishlist_typed (customer_id, item_type, product_id)");
    }
    return true;
  } catch (error) {
    console.error("Error ensuring wishlist table:", error);
    return false;
  }
};
let tableReady;
const ensureTable = () => {
  if (!tableReady) tableReady = ensureTableWork().then(ok => {
    if (!ok) tableReady = null;
    return ok;
  });
  return tableReady;
};

// ✅ ADD TO WISHLIST
router.post("/add", async (req, res) => {
  try {
    const { customerId, productId, productName, price, image } = req.body;
    const itemType = normalizeItemType(req.body.itemType || req.body.item_type);
    const quantity = Math.max(1, Number.parseInt(req.body.quantity, 10) || 1);
    const selectedColor = String(req.body.selectedColor || req.body.selected_color || '').trim() || null;

    console.log("📦 Adding to wishlist:", { customerId, productId, productName, price });

    if (!customerId || !productId || !itemType) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    await ensureTable();

    const sourceTable = itemType === "package" ? "packages" : "products";
    const sourceItem = await query(`SELECT id FROM ${sourceTable} WHERE id = ? LIMIT 1`, [productId]);
    if (sourceItem.length === 0) {
      return res.status(404).json({ success: false, message: `${itemType === "package" ? "Package" : "Product"} not found` });
    }

    const existingItem = await query(
      `SELECT * FROM wishlist_items WHERE customer_id = ? AND item_type = ? AND product_id = ?`,
      [customerId, itemType, productId]
    );

    if (existingItem.length > 0) {
      console.log("📦 Item already in wishlist");
      await query(`UPDATE wishlist_items SET product_name = ?, price = ?, image = ?, quantity = ?, selected_color = ? WHERE id = ?`,
        [productName || existingItem[0].product_name || '', price || existingItem[0].price || 0, image || existingItem[0].image || '', quantity, selectedColor, existingItem[0].id]);
      return res.json({ 
        success: true, 
        message: "Item already in wishlist",
        exists: true
      });
    }

    const insertResult = await query(
      `INSERT INTO wishlist_items 
      (customer_id, product_id, item_type, product_name, price, image, quantity, selected_color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        productId,
        itemType,
        productName || '',
        price || 0,
        image || '',
        quantity,
        selectedColor
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
    const itemType = normalizeItemType(req.query.itemType || req.body.itemType || req.query.item_type || req.body.item_type);

    console.log("🗑️ Final values:", { finalCustomerId, finalProductId });

    if (!finalCustomerId || !finalProductId || !itemType) {
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
      `SELECT * FROM wishlist_items WHERE customer_id = ? AND item_type = ? AND product_id = ?`,
      [finalCustomerId, itemType, finalProductId]
    );

    console.log("📦 Existing item:", existingItem);

    if (existingItem.length === 0) {
      return res.json({ 
        success: true, 
        message: "Item not found in wishlist",
        exists: false,
        affectedRows: 0,
        itemId: String(finalProductId),
        itemType
      });
    }

    // Delete the item
    const result = await query(
      `DELETE FROM wishlist_items WHERE customer_id = ? AND item_type = ? AND product_id = ?`,
      [finalCustomerId, itemType, finalProductId]
    );

    console.log("🗑️ Removed from wishlist successfully, affected rows:", result.affectedRows);

    res.json({ 
      success: true, 
      message: "Removed from wishlist",
      affectedRows: result.affectedRows,
      itemId: String(finalProductId),
      itemType
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
      `SELECT id AS wishlist_id, product_id AS item_id, product_id, item_type,
              product_name, price, image, quantity, selected_color, created_at
       FROM wishlist_items WHERE customer_id = ? ORDER BY created_at DESC`,
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
    const itemType = normalizeItemType(req.query.itemType);
    if (!itemType) return res.status(400).json({ success: false, message: "Invalid item type" });

    await ensureTable();

    const item = await query(
      `SELECT * FROM wishlist_items WHERE customer_id = ? AND item_type = ? AND product_id = ?`,
      [customerId, itemType, productId]
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
