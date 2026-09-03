// // routes/CartRoute.js
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

// // ✅ ADD TO CART - FIXED
// // routes/CartRoute.js - FIXED POST /cart endpoint

// // routes/CartRoute.js - COMPLETE FIX for POST /cart

// router.post("/cart", async (req, res) => {
//   try {
//     const { customerId, product } = req.body;

//     console.log("📦 Adding to cart:", { customerId, product });

//     if (!customerId || !product) {
//       return res.status(400).json({ success: false, message: "Missing data" });
//     }

//     // Check if table exists
//     const tableCheck = await query(
//       "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cart_items'"
//     );
    
//     if (tableCheck[0].count === 0) {
//       // Create the table if it doesn't exist
//       await query(`
//         CREATE TABLE IF NOT EXISTS cart_items (
//           id INT AUTO_INCREMENT PRIMARY KEY,
//           customer_id VARCHAR(255) NOT NULL,
//           product_id VARCHAR(255) NOT NULL,
//           product_name VARCHAR(255),
//           price DECIMAL(10, 2),
//           quantity INT DEFAULT 1,
//           image VARCHAR(500),
//           saved_for_later BOOLEAN DEFAULT FALSE,
//           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//           UNIQUE KEY unique_cart_item (customer_id, product_id)
//         )
//       `);
//       console.log("📦 Created cart_items table");
//     }

//     // Get product data - handle both 'id' and 'productId'
//     const productId = String(product.id || product.productId || '');
//     const productName = product.name || '';
//     const productPrice = parseFloat(product.price) || 0;
//     const productImage = product.image || '';
//     const productQuantity = parseInt(product.quantity) || 1;

//     console.log("📦 Product data:", { 
//       productId, 
//       productName, 
//       productPrice, 
//       productImage, 
//       productQuantity 
//     });

//     if (!productId) {
//       return res.status(400).json({ 
//         success: false, 
//         message: "Product ID is required" 
//       });
//     }

//     // Check if item already exists
//     const existingItem = await query(
//       `SELECT * FROM cart_items 
//        WHERE customer_id = ? AND product_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
//       [customerId, productId]
//     );

//     console.log("📦 Existing item:", existingItem);

//     let result;
//     if (existingItem.length > 0) {
//       // Update existing item - add the new quantity to existing
//       const newQuantity = existingItem[0].quantity + productQuantity;
//       result = await query(
//         `UPDATE cart_items 
//          SET quantity = ?, 
//              product_name = ?, 
//              price = ?, 
//              image = ?,
//              updated_at = NOW()
//          WHERE customer_id = ? AND product_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
//         [
//           newQuantity,
//           productName,
//           productPrice,
//           productImage || "",
//           customerId,
//           productId
//         ]
//       );
//       console.log("📦 Updated existing item, quantity now:", newQuantity);
//     } else {
//       // Insert new item
//       result = await query(
//         `INSERT INTO cart_items 
//         (customer_id, product_id, product_name, price, quantity, image, created_at, updated_at)
//         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
//         [
//           customerId,
//           productId,
//           productName,
//           productPrice,
//           productQuantity,
//           productImage || ""
//         ]
//       );
//       console.log("📦 Inserted new item with ID:", result.insertId);
//     }

//     // Get the updated cart items
//     const items = await query(
//       `SELECT * FROM cart_items 
//        WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)
//        ORDER BY updated_at DESC`,
//       [customerId]
//     );

//     console.log("📦 Cart items after update:", items.length);

//     res.json({ 
//       success: true, 
//       message: "Item added to cart",
//       data: items 
//     });

//   } catch (err) {
//     console.error("Error adding to cart:", err);
//     res.status(500).json({ 
//       success: false, 
//       message: "Error adding to cart",
//       error: err.message 
//     });
//   }
// });
// // ✅ GET CART - FIXED
// // routes/CartRoute.js - Add this debug code in the GET endpoint

// // ✅ GET CART - FIXED with better debugging
// router.get("/cart/:customerId", async (req, res) => {
//   try {
//     const { customerId } = req.params;

//     console.log("📦 Fetching cart for customer:", customerId);

//     // Check if table exists
//     const tableCheck = await query(
//       "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cart_items'"
//     );
    
//     if (tableCheck[0].count === 0) {
//       return res.json({ success: true, data: [] });
//     }

//     // Get ALL items for this customer to debug
//     const allItems = await query(
//       `SELECT * FROM cart_items WHERE customer_id = ?`,
//       [customerId]
//     );
//     console.log("📦 ALL items for customer:", JSON.stringify(allItems, null, 2));

//     // Get only active cart items
//     const items = await query(
//       `SELECT * FROM cart_items 
//        WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)
//        ORDER BY updated_at DESC`,
//       [customerId]
//     );

//     console.log("📦 Active cart items found:", items.length);
//     console.log("📦 Active cart items:", JSON.stringify(items, null, 2));

//     res.json({ success: true, data: items });

//   } catch (err) {
//     console.error("Error fetching cart:", err);
//     res.status(500).json({ 
//       success: false, 
//       message: "Error fetching cart" 
//     });
//   }
// });

// // ✅ UPDATE QUANTITY - FIXED
// // routes/CartRoute.js - Fixed UPDATE endpoint

// // ✅ UPDATE QUANTITY - COMPLETELY FIXED
// router.put("/cart", async (req, res) => {
//   try {
//     const { customerId, productId, quantity } = req.body;

//     console.log("📦 Update quantity:", { customerId, productId, quantity });

//     if (!customerId || !productId || quantity == null) {
//       return res.status(400).json({ success: false, message: "Missing data" });
//     }

//     // First, get ALL items for this customer to see what's there
//     const allItems = await query(
//       `SELECT * FROM cart_items WHERE customer_id = ?`,
//       [customerId]
//     );
//     console.log("📦 ALL items in DB:", JSON.stringify(allItems, null, 2));

//     // Handle composite ID if passed (e.g., '21_1785349027628')
//     let actualProductId = productId;
//     if (typeof productId === 'string' && productId.includes('_')) {
//       actualProductId = productId.split('_')[0];
//     }

//     console.log("📦 Looking for productId:", actualProductId);

//     // Try to find the item with the actual product ID
//     let existingItem = await query(
//       `SELECT * FROM cart_items 
//        WHERE customer_id = ? AND product_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
//       [customerId, actualProductId]
//     );

//     console.log("📦 Existing item found:", existingItem);

//     // If not found, try string comparison
//     if (existingItem.length === 0) {
//       const stringMatch = await query(
//         `SELECT * FROM cart_items 
//          WHERE customer_id = ? AND CAST(product_id AS CHAR) = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
//         [customerId, String(actualProductId)]
//       );
      
//       console.log("📦 String comparison result:", stringMatch);
      
//       if (stringMatch.length > 0) {
//         existingItem = stringMatch;
//       }
//     }

//     // If still not found, try to find by checking if the product_id CONTAINS the ID
//     if (existingItem.length === 0) {
//       const containsMatch = await query(
//         `SELECT * FROM cart_items 
//          WHERE customer_id = ? AND product_id LIKE ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
//         [customerId, `%${actualProductId}%`]
//       );
      
//       console.log("📦 Contains match result:", containsMatch);
      
//       if (containsMatch.length > 0) {
//         existingItem = containsMatch;
//       }
//     }

//     if (existingItem.length === 0) {
//       // Item not found - return success with current cart
//       const items = await query(
//         `SELECT * FROM cart_items 
//          WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)
//          ORDER BY updated_at DESC`,
//         [customerId]
//       );
      
//       console.log("📦 Item not found, returning current cart");
      
//       return res.json({ 
//         success: true, 
//         message: "Item not found in cart",
//         data: items 
//       });
//     }

//     // Use the actual product_id from the database
//     const dbProductId = existingItem[0].product_id;
//     console.log("📦 Using DB product_id:", dbProductId);

//     // Update or delete
//     if (quantity <= 0) {
//       await query(
//         `DELETE FROM cart_items 
//          WHERE customer_id = ? AND product_id = ?`,
//         [customerId, dbProductId]
//       );
//       console.log("📦 Item deleted");
//     } else {
//       await query(
//         `UPDATE cart_items 
//          SET quantity = ?, updated_at = NOW()
//          WHERE customer_id = ? AND product_id = ?`,
//         [quantity, customerId, dbProductId]
//       );
//       console.log("📦 Item updated to quantity:", quantity);
//     }

//     // Get updated cart
//     const items = await query(
//       `SELECT * FROM cart_items 
//        WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)
//        ORDER BY updated_at DESC`,
//       [customerId]
//     );

//     console.log("📦 Cart items after update:", items.length);

//     res.json({ 
//       success: true, 
//       message: "Quantity updated",
//       data: items 
//     });

//   } catch (err) {
//     console.error("Error updating cart:", err);
//     res.status(500).json({ 
//       success: false, 
//       message: "Error updating cart" 
//     });
//   }
// });

// // ✅ REMOVE SINGLE ITEM - FIXED
// router.delete("/cart/item", async (req, res) => {
//   try {
//     const { customerId, productId } = req.body;

//     console.log("📦 Removing item:", { customerId, productId });

//     if (!customerId || !productId) {
//       return res.status(400).json({ success: false, message: "Missing data" });
//     }

//     // Handle composite ID if passed
//     let actualProductId = productId;
//     if (typeof productId === 'string' && productId.includes('_')) {
//       actualProductId = productId.split('_')[0];
//     }

//     await query(
//       `DELETE FROM cart_items 
//        WHERE customer_id = ? AND product_id = ?`,
//       [customerId, actualProductId]
//     );

//     // Get updated cart
//     const items = await query(
//       `SELECT * FROM cart_items 
//        WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)
//        ORDER BY updated_at DESC`,
//       [customerId]
//     );

//     res.json({ 
//       success: true, 
//       message: "Item removed",
//       data: items 
//     });

//   } catch (err) {
//     console.error("Error removing item:", err);
//     res.status(500).json({ 
//       success: false, 
//       message: "Error removing item" 
//     });
//   }
// });

// // ✅ CLEAR CART
// router.delete("/cart/:customerId", async (req, res) => {
//   try {
//     const { customerId } = req.params;

//     console.log("📦 Clearing cart for customer:", customerId);

//     await query(
//       `DELETE FROM cart_items WHERE customer_id = ?`,
//       [customerId]
//     );

//     res.json({ success: true, message: "Cart cleared" });

//   } catch (err) {
//     console.error("Error clearing cart:", err);
//     res.status(500).json({ 
//       success: false, 
//       message: "Error clearing cart" 
//     });
//   }
// });

// // ✅ GET CART COUNT
// router.get("/cart/count/:customerId", async (req, res) => {
//   try {
//     const { customerId } = req.params;

//     const result = await query(
//       `SELECT SUM(quantity) as total FROM cart_items 
//        WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
//       [customerId]
//     );

//     res.json({ 
//       success: true, 
//       count: result[0]?.total || 0 
//     });

//   } catch (err) {
//     console.error("Error getting cart count:", err);
//     res.status(500).json({ 
//       success: false, 
//       message: "Error getting cart count" 
//     });
//   }
// });


// // routes/CartRoute.js - Add this debug endpoint

// // ✅ DEBUG - Check all cart items
// router.get("/cart/debug/:customerId", async (req, res) => {
//   try {
//     const { customerId } = req.params;
    
//     console.log("🔍 Debug - Fetching ALL cart items for customer:", customerId);
    
//     const items = await query(
//       `SELECT * FROM cart_items WHERE customer_id = ? ORDER BY created_at DESC`,
//       [customerId]
//     );
    
//     console.log("🔍 Found items:", items.length);
    
//     res.json({ 
//       success: true, 
//       count: items.length,
//       items: items 
//     });
    
//   } catch (err) {
//     console.error("Debug error:", err);
//     res.status(500).json({ 
//       success: false, 
//       error: err.message 
//     });
//   }
// });

// module.exports = router;






// routes/CartRoute.js
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

// ✅ ADD TO CART - FIXED
router.post("/cart", async (req, res) => {
  try {
    const { customerId, product } = req.body;

    console.log("📦 Adding to cart:", { customerId, product });

    if (!customerId || !product) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    // Check if table exists
    const tableCheck = await query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cart_items'"
    );
    
    if (tableCheck[0].count === 0) {
      await query(`
        CREATE TABLE IF NOT EXISTS cart_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customer_id VARCHAR(255) NOT NULL,
          product_id VARCHAR(255) NOT NULL,
          product_name VARCHAR(255),
          price DECIMAL(10, 2),
          quantity INT DEFAULT 1,
          image VARCHAR(500),
          saved_for_later BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_cart_item (customer_id, product_id)
        )
      `);
      console.log("📦 Created cart_items table");
    }

    const productId = String(product.id || product.productId || '');
    const productName = product.name || '';
    const productPrice = parseFloat(product.price) || 0;
    const productImage = product.image || '';
    const productQuantity = parseInt(product.quantity) || 1;

    console.log("📦 Product data:", { 
      productId, 
      productName, 
      productPrice, 
      productImage, 
      productQuantity 
    });

    if (!productId) {
      return res.status(400).json({ 
        success: false, 
        message: "Product ID is required" 
      });
    }

    // Check if item already exists
    const existingItem = await query(
      `SELECT * FROM cart_items 
       WHERE customer_id = ? AND product_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
      [customerId, productId]
    );

    console.log("📦 Existing item:", existingItem);

    let result;
    if (existingItem.length > 0) {
      const newQuantity = existingItem[0].quantity + productQuantity;
      result = await query(
        `UPDATE cart_items 
         SET quantity = ?, 
             product_name = ?, 
             price = ?, 
             image = ?,
             updated_at = NOW()
         WHERE customer_id = ? AND product_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
        [
          newQuantity,
          productName,
          productPrice,
          productImage || "",
          customerId,
          productId
        ]
      );
      console.log("📦 Updated existing item, quantity now:", newQuantity);
    } else {
      result = await query(
        `INSERT INTO cart_items 
        (customer_id, product_id, product_name, price, quantity, image, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          customerId,
          productId,
          productName,
          productPrice,
          productQuantity,
          productImage || ""
        ]
      );
      console.log("📦 Inserted new item with ID:", result.insertId);
    }

    const items = await query(
      `SELECT * FROM cart_items 
       WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)
       ORDER BY updated_at DESC`,
      [customerId]
    );

    console.log("📦 Cart items after update:", items.length);

    res.json({ 
      success: true, 
      message: "Item added to cart",
      data: items 
    });

  } catch (err) {
    console.error("Error adding to cart:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error adding to cart",
      error: err.message 
    });
  }
});

// ✅ GET CART
router.get("/cart/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    console.log("📦 Fetching cart for customer:", customerId);

    const tableCheck = await query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cart_items'"
    );
    
    if (tableCheck[0].count === 0) {
      return res.json({ success: true, data: [] });
    }

    const items = await query(
      `SELECT * FROM cart_items 
       WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)
       ORDER BY updated_at DESC`,
      [customerId]
    );

    console.log("📦 Active cart items found:", items.length);

    res.json({ success: true, data: items });

  } catch (err) {
    console.error("Error fetching cart:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching cart" 
    });
  }
});

// ✅ UPDATE QUANTITY
router.put("/cart", async (req, res) => {
  try {
    const { customerId, productId, quantity } = req.body;

    console.log("📦 Update quantity:", { customerId, productId, quantity });

    if (!customerId || !productId || quantity == null) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    let actualProductId = productId;
    if (typeof productId === 'string' && productId.includes('_')) {
      actualProductId = productId.split('_')[0];
    }

    console.log("📦 Looking for productId:", actualProductId);

    let existingItem = await query(
      `SELECT * FROM cart_items 
       WHERE customer_id = ? AND product_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
      [customerId, actualProductId]
    );

    if (existingItem.length === 0) {
      const stringMatch = await query(
        `SELECT * FROM cart_items 
         WHERE customer_id = ? AND CAST(product_id AS CHAR) = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
        [customerId, String(actualProductId)]
      );
      
      if (stringMatch.length > 0) {
        existingItem = stringMatch;
      }
    }

    if (existingItem.length === 0) {
      const items = await query(
        `SELECT * FROM cart_items 
         WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)
         ORDER BY updated_at DESC`,
        [customerId]
      );
      
      return res.json({ 
        success: true, 
        message: "Item not found in cart",
        data: items 
      });
    }

    const dbProductId = existingItem[0].product_id;

    if (quantity <= 0) {
      await query(
        `DELETE FROM cart_items 
         WHERE customer_id = ? AND product_id = ?`,
        [customerId, dbProductId]
      );
      console.log("📦 Item deleted");
    } else {
      await query(
        `UPDATE cart_items 
         SET quantity = ?, updated_at = NOW()
         WHERE customer_id = ? AND product_id = ?`,
        [quantity, customerId, dbProductId]
      );
      console.log("📦 Item updated to quantity:", quantity);
    }

    const items = await query(
      `SELECT * FROM cart_items 
       WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)
       ORDER BY updated_at DESC`,
      [customerId]
    );

    res.json({ 
      success: true, 
      message: "Quantity updated",
      data: items 
    });

  } catch (err) {
    console.error("Error updating cart:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error updating cart" 
    });
  }
});

// ✅ REMOVE SINGLE ITEM - FIXED WITH BETTER HANDLING
// routes/CartRoute.js - Verify the DELETE endpoint

// ✅ REMOVE SINGLE ITEM - FIXED WITH BETTER DEBUGGING
// routes/CartRoute.js - Updated DELETE endpoint with more logging

// ✅ REMOVE SINGLE ITEM - WITH EXTRA DEBUGGING
router.delete("/cart/item", async (req, res) => {
  try {
    console.log("📦 ========== DELETE REQUEST RECEIVED ==========");
    console.log("📦 Request body:", req.body);
    console.log("📦 Request headers:", req.headers);
    
    const { customerId, productId } = req.body;

    console.log("📦 DELETE Request:", { customerId, productId });

    if (!customerId || !productId) {
      console.log("❌ Missing customerId or productId");
      return res.status(400).json({ 
        success: false, 
        message: "Missing customerId or productId" 
      });
    }

    // Handle composite ID if passed
    let actualProductId = productId;
    if (typeof productId === 'string' && productId.includes('_')) {
      actualProductId = productId.split('_')[0];
    }

    console.log("📦 Actual productId to delete:", actualProductId);

    // First check if the item exists
    const existingItem = await query(
      `SELECT * FROM cart_items 
       WHERE customer_id = ? AND product_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
      [customerId, actualProductId]
    );

    console.log("📦 Existing item found:", existingItem);

    if (existingItem.length === 0) {
      console.log("❌ Item not found in cart with exact match, trying string comparison...");
      // Try with string comparison
      const stringMatch = await query(
        `SELECT * FROM cart_items 
         WHERE customer_id = ? AND CAST(product_id AS CHAR) = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
        [customerId, String(actualProductId)]
      );
      
      console.log("📦 String match result:", stringMatch);
      
      if (stringMatch.length > 0) {
        console.log("✅ Found via string comparison, deleting...");
        await query(
          `DELETE FROM cart_items 
           WHERE customer_id = ? AND product_id = ?`,
          [customerId, stringMatch[0].product_id]
        );
        console.log("📦 Item deleted via string match");
      } else {
        console.log("❌ Item not found in cart, returning current cart");
        const items = await query(
          `SELECT * FROM cart_items 
           WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)
           ORDER BY updated_at DESC`,
          [customerId]
        );
        
        return res.json({ 
          success: true, 
          message: "Item not found in cart",
          data: items 
        });
      }
    } else {
      // Delete the item
      console.log("✅ Found item, deleting...");
      const deleteResult = await query(
        `DELETE FROM cart_items 
         WHERE customer_id = ? AND product_id = ?`,
        [customerId, actualProductId]
      );
      console.log("📦 Delete result:", deleteResult);
      console.log("📦 Item deleted successfully");
    }

    // Get updated cart
    const items = await query(
      `SELECT * FROM cart_items 
       WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)
       ORDER BY updated_at DESC`,
      [customerId]
    );

    console.log("📦 Cart items after deletion:", items.length);
    console.log("📦 ========== DELETE COMPLETED ==========");

    res.json({ 
      success: true, 
      message: "Item removed successfully",
      data: items 
    });

  } catch (err) {
    console.error("❌ Error removing item:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error removing item",
      error: err.message 
    });
  }
});

// ✅ CLEAR CART - FIXED
router.delete("/cart/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    console.log("📦 Clearing cart for customer:", customerId);

    if (!customerId) {
      return res.status(400).json({ 
        success: false, 
        message: "Customer ID is required" 
      });
    }

    // Delete all items for this customer
    const result = await query(
      `DELETE FROM cart_items WHERE customer_id = ?`,
      [customerId]
    );

    console.log("📦 Deleted", result.affectedRows, "items from cart");

    res.json({ 
      success: true, 
      message: "Cart cleared successfully",
      deletedCount: result.affectedRows 
    });

  } catch (err) {
    console.error("Error clearing cart:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error clearing cart",
      error: err.message 
    });
  }
});

// ✅ GET CART COUNT
router.get("/cart/count/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    const result = await query(
      `SELECT SUM(quantity) as total FROM cart_items 
       WHERE customer_id = ? AND (saved_for_later IS NULL OR saved_for_later = 0)`,
      [customerId]
    );

    res.json({ 
      success: true, 
      count: result[0]?.total || 0 
    });

  } catch (err) {
    console.error("Error getting cart count:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error getting cart count" 
    });
  }
});

// ✅ DEBUG - Get all cart items for a customer
router.get("/cart/debug/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    
    console.log("🔍 Debug - Fetching ALL cart items for customer:", customerId);
    
    const items = await query(
      `SELECT * FROM cart_items WHERE customer_id = ? ORDER BY created_at DESC`,
      [customerId]
    );
    
    console.log("🔍 Found items:", items.length);
    
    res.json({ 
      success: true, 
      count: items.length,
      items: items 
    });
    
  } catch (err) {
    console.error("Debug error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

module.exports = router;