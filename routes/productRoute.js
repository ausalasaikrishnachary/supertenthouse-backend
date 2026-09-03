// const express = require("express");
// const router = express.Router();
// const db = require("../db");
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// // ====================================
// // CREATE UPLOAD FOLDER
// // ====================================
// const uploadDir = path.join(__dirname, '..', 'uploads', 'products');

// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir, { recursive: true });
// }

// // ====================================
// // MULTER STORAGE CONFIGURATION
// // ====================================
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadDir);
//   },
//   filename: (req, file, cb) => {
//     const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
//     cb(null, unique + path.extname(file.originalname));
//   },
// });

// // ====================================
// // MULTER INSTANCE
// // ====================================
// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024,
//   },
//   fileFilter: (req, file, cb) => {
//     const allowed = /jpeg|jpg|png|webp|gif/;
//     const ext = path.extname(file.originalname).toLowerCase();
//     if (allowed.test(ext) && allowed.test(file.mimetype)) {
//       return cb(null, true);
//     }
//     cb(new Error("Only image files are allowed"));
//   },
// });

// // ====================================
// // SAVE PRODUCT IMAGES
// // ====================================
// function saveImages(productId, files, callback) {
//   if (!files || files.length === 0) {
//     return callback(null);
//   }

//   db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
//     const hasSortOrder = columns && columns.length > 0;
    
//     if (hasSortOrder) {
//       const values = files.map((file, index) => [
//         productId,
//         `uploads/products/${file.filename}`,
//         index,
//       ]);

//       db.query(
//         `INSERT INTO product_images (product_id, image_url, sort_order) VALUES ?`,
//         [values],
//         callback
//       );
//     } else {
//       const values = files.map((file) => [
//         productId,
//         `uploads/products/${file.filename}`,
//       ]);

//       db.query(
//         `INSERT INTO product_images (product_id, image_url) VALUES ?`,
//         [values],
//         callback
//       );
//     }
//   });
// }

// // ====================================
// // HELPER: GET PRODUCT IMAGES
// // ====================================
// function getProductImages(productId, callback) {
//   db.query(
//     `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC`,
//     [productId],
//     (err, results) => {
//       if (err) {
//         if (err.code === 'ER_BAD_FIELD_ERROR') {
//           db.query(
//             `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY id ASC`,
//             [productId],
//             (err2, results2) => {
//               if (err2) {
//                 console.error("Error fetching images (fallback):", err2);
//                 return callback(err2, null);
//               }
//               const images = results2.map(row => row.image_url);
//               callback(null, images);
//             }
//           );
//         } else {
//           console.error("Error fetching images:", err);
//           callback(err, null);
//         }
//         return;
//       }
//       const images = results.map(row => row.image_url);
//       callback(null, images);
//     }
//   );
// }

// // ====================================
// // HELPER: GET PRODUCTS WITH IMAGES
// // ====================================
// function getProductsWithImages(sql, params, callback) {
//   db.query(sql, params, (err, products) => {
//     if (err) {
//       console.error("Error fetching products:", err);
//       return callback(err, null);
//     }

//     if (!products || products.length === 0) {
//       return callback(null, []);
//     }

//     let completed = 0;
//     const results = [];

//     products.forEach((product, index) => {
//       if (product.product_images && typeof product.product_images === 'string') {
//         try {
//           product.images = JSON.parse(product.product_images);
//         } catch (e) {
//           product.images = [];
//         }
//       } else if (product.product_images && Array.isArray(product.product_images)) {
//         product.images = product.product_images;
//       } else {
//         product.images = [];
//       }

//       if (!product.images || product.images.length === 0) {
//         getProductImages(product.id, (imgErr, images) => {
//           if (imgErr) {
//             console.error("Error fetching images for product:", product.id, imgErr.message);
//           }
//           product.images = images || [];
//           results[index] = product;
//           completed++;

//           if (completed === products.length) {
//             callback(null, results);
//           }
//         });
//       } else {
//         results[index] = product;
//         completed++;
//         if (completed === products.length) {
//           callback(null, results);
//         }
//       }
//     });
//   });
// }

// // ====================================
// // CREATE PRODUCT
// // ====================================
// router.post("/", upload.array("images", 10), (req, res) => {
//   try {
//     const {
//       product_category_id,
//       product_name,
//       product_code,
//       product_brand,
//       price,
//       available_stock,
//       dimensions,
//       specifications,
//       weight,
//       color,
//       discount,
//       product_description,
//       warranty,
//       material,
//       care_instructions,
//       is_active,
//     } = req.body;

//     if (!product_category_id) {
//       return res.status(400).json({ error: "Category is required" });
//     }
//     if (!product_name || product_name.trim() === '') {
//       return res.status(400).json({ error: "Product name is required" });
//     }

//     const sql = `
//       INSERT INTO products (
//         product_category_id, product_name, product_code, product_brand,
//         price, available_stock, dimensions, specifications,
//         weight, color, discount, product_description,
//         warranty, material, care_instructions, is_active
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     db.query(
//       sql,
//       [
//         product_category_id || null,
//         product_name.trim(),
//         product_code || null,
//         product_brand || null,
//         parseFloat(price) || 0,
//         parseInt(available_stock) || 0,
//         dimensions || null,
//         specifications || null,
//         weight || null,
//         color || null,
//         parseFloat(discount) || 0,
//         product_description || null,
//         warranty || null,
//         material || null,
//         care_instructions || null,
//         is_active || 1,
//       ],
//       (err, result) => {
//         if (err) {
//           console.error("Error creating product:", err);
//           return res.status(500).json({ error: err.message });
//         }

//         saveImages(result.insertId, req.files, (imgErr) => {
//           if (imgErr) {
//             console.error("Error saving images:", imgErr);
//             return res.status(500).json({ error: imgErr.message });
//           }

//           res.json({
//             message: "Product created successfully",
//             id: result.insertId,
//           });
//         });
//       }
//     );
//   } catch (error) {
//     console.error("Error in product creation:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // ====================================
// // GET ALL PRODUCTS
// // ====================================
// router.get("/", (req, res) => {
//   console.log("GET /api/products - Fetching all products");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.id DESC
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching products:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`Found ${results.length} products`);
//     res.json(results);
//   });
// });

// // ====================================
// // GET PRODUCTS BY CATEGORY
// // IMPORTANT: This MUST come before /:id route
// // ====================================
// router.get("/category/:categoryId", (req, res) => {
//   const { categoryId } = req.params;
//   console.log(`GET /api/products/category/${categoryId} - Fetching products by category`);

//   // Validate categoryId
//   if (!categoryId) {
//     return res.status(400).json({ error: "Category ID is required" });
//   }

//   // Check if it's a number
//   if (isNaN(categoryId)) {
//     console.log("Invalid category ID:", categoryId);
//     return res.status(400).json({ error: "Invalid category ID" });
//   }

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_category_id = ?
//     ORDER BY p.id DESC
//   `;

//   console.log("SQL Query:", sql);
//   console.log("SQL Params:", [categoryId]);

//   getProductsWithImages(sql, [categoryId], (err, results) => {
//     if (err) {
//       console.error("Error fetching products by category:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`Found ${results.length} products for category ${categoryId}`);
//     res.json(results);
//   });
// });

// // ====================================
// // GET TRENDING PRODUCTS
// // ====================================
// router.get("/trending", (req, res) => {
//   console.log("GET /api/products/trending - Fetching trending products");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.rating DESC, p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching trending products:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // GET BEST SELLERS
// // ====================================
// router.get("/best-sellers", (req, res) => {
//   console.log("GET /api/products/best-sellers - Fetching best sellers");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.rating DESC, p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching best sellers:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // GET NEW ARRIVALS
// // ====================================
// router.get("/new-arrivals", (req, res) => {
//   console.log("GET /api/products/new-arrivals - Fetching new arrivals");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching new arrivals:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // SEARCH PRODUCTS
// // ====================================
// router.get("/search", (req, res) => {
//   const { q } = req.query;
//   console.log(`GET /api/products/search?q=${q} - Searching products`);

//   if (!q || q.trim() === "") {
//     return res.json([]);
//   }

//   const searchTerm = `%${q.trim()}%`;

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_name LIKE ? 
//     OR p.product_description LIKE ?
//     OR c.category_name LIKE ?
//     OR p.product_brand LIKE ?
//     OR p.material LIKE ?
//     ORDER BY p.id DESC
//   `;

//   getProductsWithImages(
//     sql,
//     [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm],
//     (err, results) => {
//       if (err) {
//         console.error("Error searching products:", err);
//         return res.status(500).json({ error: err.message });
//       }
//       res.json(results);
//     }
//   );
// });

// // ====================================
// // GET SINGLE PRODUCT
// // IMPORTANT: This MUST come AFTER /category/:categoryId route
// // ====================================
// router.get("/:id", (req, res) => {
//   const productId = req.params.id;
//   console.log(`GET /api/products/${productId} - Fetching single product`);

//   // Check if the ID is a number
//   if (!productId || isNaN(productId)) {
//     console.log("Invalid product ID:", productId);
//     return res.status(400).json({ error: "Invalid product ID" });
//   }

//   db.query(
//     `
//       SELECT 
//         p.*,
//         c.category_name,
//         c.id as category_id
//       FROM products p
//       LEFT JOIN product_categories c ON p.product_category_id = c.id
//       WHERE p.id = ?
//     `,
//     [productId],
//     (err, productResult) => {
//       if (err) {
//         console.error("Error fetching product:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (productResult.length === 0) {
//         return res.status(404).json({ message: "Product not found" });
//       }

//       const product = productResult[0];

//       if (product.product_images && typeof product.product_images === 'string') {
//         try {
//           product.images = JSON.parse(product.product_images);
//         } catch (e) {
//           product.images = [];
//         }
//       } else if (product.product_images && Array.isArray(product.product_images)) {
//         product.images = product.product_images;
//       } else {
//         product.images = [];
//       }

//       if (!product.images || product.images.length === 0) {
//         getProductImages(productId, (imgErr, images) => {
//           if (imgErr) {
//             console.error("Error fetching product images:", imgErr);
//             product.images = [];
//           } else {
//             product.images = images || [];
//           }
//           res.json(product);
//         });
//       } else {
//         res.json(product);
//       }
//     }
//   );
// });

// // ====================================
// // UPDATE PRODUCT
// // ====================================
// router.put("/:id", (req, res) => {
//   const id = req.params.id;

//   const {
//     product_category_id,
//     product_name,
//     product_code,
//     product_brand,
//     price,
//     available_stock,
//     dimensions,
//     specifications,
//     weight,
//     color,
//     discount,
//     product_description,
//     warranty,
//     material,
//     care_instructions,
//     is_active,
//   } = req.body;

//   if (!product_category_id) {
//     return res.status(400).json({ error: "Category is required" });
//   }
//   if (!product_name || product_name.trim() === '') {
//     return res.status(400).json({ error: "Product name is required" });
//   }

//   const sql = `
//     UPDATE products
//     SET
//       product_category_id = ?,
//       product_name = ?,
//       product_code = ?,
//       product_brand = ?,
//       price = ?,
//       available_stock = ?,
//       dimensions = ?,
//       specifications = ?,
//       weight = ?,
//       color = ?,
//       discount = ?,
//       product_description = ?,
//       warranty = ?,
//       material = ?,
//       care_instructions = ?,
//       is_active = ?
//     WHERE id = ?
//   `;

//   db.query(
//     sql,
//     [
//       product_category_id || null,
//       product_name.trim(),
//       product_code || null,
//       product_brand || null,
//       parseFloat(price) || 0,
//       parseInt(available_stock) || 0,
//       dimensions || null,
//       specifications || null,
//       weight || null,
//       color || null,
//       parseFloat(discount) || 0,
//       product_description || null,
//       warranty || null,
//       material || null,
//       care_instructions || null,
//       is_active || 1,
//       id,
//     ],
//     (err) => {
//       if (err) {
//         console.error("Error updating product:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       res.json({
//         message: "Product updated successfully",
//       });
//     }
//   );
// });

// // ====================================
// // DELETE PRODUCT
// // ====================================
// router.delete("/:id", (req, res) => {
//   const productId = req.params.id;

//   db.query(
//     "SELECT image_url FROM product_images WHERE product_id = ?",
//     [productId],
//     (err, images) => {
//       if (err) {
//         console.error("Error fetching images for deletion:", err);
//       }

//       db.query(
//         `DELETE FROM product_images WHERE product_id = ?`,
//         [productId],
//         (err) => {
//           if (err) {
//             console.error("Error deleting product images:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           db.query(
//             `DELETE FROM products WHERE id = ?`,
//             [productId],
//             (err) => {
//               if (err) {
//                 console.error("Error deleting product:", err);
//                 return res.status(500).json({ error: err.message });
//               }

//               if (images && images.length > 0) {
//                 images.forEach((img) => {
//                   const filePath = path.join(__dirname, "..", img.image_url);
//                   if (fs.existsSync(filePath)) {
//                     fs.unlink(filePath, (unlinkErr) => {
//                       if (unlinkErr) {
//                         console.error("Error deleting file:", unlinkErr);
//                       }
//                     });
//                   }
//                 });
//               }

//               res.json({
//                 message: "Product deleted successfully",
//               });
//             }
//           );
//         }
//       );
//     }
//   );
// });

// // ====================================
// // UPLOAD PRODUCT IMAGES
// // ====================================
// router.post("/:id/images", upload.array("images", 10), (req, res) => {
//   const productId = req.params.id;

//   db.query(
//     "SELECT id FROM products WHERE id = ?",
//     [productId],
//     (err, result) => {
//       if (err) {
//         console.error("Error checking product:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (result.length === 0) {
//         return res.status(404).json({ message: "Product not found" });
//       }

//       db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
//         const hasSortOrder = columns && columns.length > 0;
        
//         if (hasSortOrder) {
//           db.query(
//             "SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?",
//             [productId],
//             (orderErr, orderResult) => {
//               if (orderErr) {
//                 console.error("Error getting sort order:", orderErr);
//                 return res.status(500).json({ error: orderErr.message });
//               }
//               const startOrder = (orderResult[0].max_order || -1) + 1;
              
//               const values = req.files.map((file, index) => [
//                 productId,
//                 `uploads/products/${file.filename}`,
//                 startOrder + index,
//               ]);

//               const insertSql = `
//                 INSERT INTO product_images
//                 (product_id, image_url, sort_order)
//                 VALUES ?
//               `;

//               db.query(insertSql, [values], (err) => {
//                 if (err) {
//                   console.error("Error saving images:", err);
//                   return res.status(500).json({ error: err.message });
//                 }
//                 res.json({
//                   message: "Images uploaded successfully",
//                 });
//               });
//             }
//           );
//         } else {
//           const values = req.files.map((file) => [
//             productId,
//             `uploads/products/${file.filename}`,
//           ]);

//           const insertSql = `
//             INSERT INTO product_images
//             (product_id, image_url)
//             VALUES ?
//           `;

//           db.query(insertSql, [values], (err) => {
//             if (err) {
//               console.error("Error saving images:", err);
//               return res.status(500).json({ error: err.message });
//             }
//             res.json({
//               message: "Images uploaded successfully",
//             });
//           });
//         }
//       });
//     }
//   );
// });

// // ====================================
// // DELETE PRODUCT IMAGE
// // ====================================
// router.delete("/:productId/images/:imageId", (req, res) => {
//   const { productId, imageId } = req.params;

//   db.query(
//     "SELECT image_url FROM product_images WHERE id = ? AND product_id = ?",
//     [imageId, productId],
//     (err, result) => {
//       if (err) {
//         console.error("Error fetching image:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (result.length === 0) {
//         return res.status(404).json({ message: "Image not found" });
//       }

//       db.query(
//         "DELETE FROM product_images WHERE id = ?",
//         [imageId],
//         (err) => {
//           if (err) {
//             console.error("Error deleting image:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           const filePath = path.join(__dirname, "..", result[0].image_url);
//           if (fs.existsSync(filePath)) {
//             fs.unlink(filePath, (unlinkErr) => {
//               if (unlinkErr) {
//                 console.error("Error deleting file:", unlinkErr);
//               }
//             });
//           }

//           res.json({
//             message: "Image deleted successfully",
//           });
//         }
//       );
//     }
//   );
// });


// // Add this test endpoint at the top of your productRoute.js
// router.get("/test-category/:categoryId", (req, res) => {
//   const { categoryId } = req.params;
//   console.log(`TEST: Fetching products for category ${categoryId}`);
  
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_category_id = ?
//     ORDER BY p.id DESC
//   `;

//   db.query(sql, [categoryId], (err, results) => {
//     if (err) {
//       console.error("Error:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json({
//       success: true,
//       categoryId: categoryId,
//       count: results.length,
//       products: results
//     });
//   });
// });

// module.exports = router;




// const express = require("express");
// const router = express.Router();
// const db = require("../db");
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// // ====================================
// // CREATE UPLOAD FOLDER
// // ====================================
// const uploadDir = path.join(__dirname, '..', 'uploads', 'products');

// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir, { recursive: true });
// }

// // ====================================
// // MULTER STORAGE CONFIGURATION
// // ====================================
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadDir);
//   },
//   filename: (req, file, cb) => {
//     const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
//     cb(null, unique + path.extname(file.originalname));
//   },
// });

// // ====================================
// // MULTER INSTANCE
// // ====================================
// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024,
//   },
//   fileFilter: (req, file, cb) => {
//     const allowed = /jpeg|jpg|png|webp|gif/;
//     const ext = path.extname(file.originalname).toLowerCase();
//     if (allowed.test(ext) && allowed.test(file.mimetype)) {
//       return cb(null, true);
//     }
//     cb(new Error("Only image files are allowed"));
//   },
// });

// // ====================================
// // SAVE PRODUCT IMAGES
// // ====================================
// function saveImages(productId, files, callback) {
//   if (!files || files.length === 0) {
//     return callback(null);
//   }

//   db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
//     const hasSortOrder = columns && columns.length > 0;
    
//     if (hasSortOrder) {
//       const values = files.map((file, index) => [
//         productId,
//         `uploads/products/${file.filename}`,
//         index,
//       ]);

//       db.query(
//         `INSERT INTO product_images (product_id, image_url, sort_order) VALUES ?`,
//         [values],
//         callback
//       );
//     } else {
//       const values = files.map((file) => [
//         productId,
//         `uploads/products/${file.filename}`,
//       ]);

//       db.query(
//         `INSERT INTO product_images (product_id, image_url) VALUES ?`,
//         [values],
//         callback
//       );
//     }
//   });
// }

// // ====================================
// // HELPER: GET PRODUCT IMAGES
// // ====================================
// function getProductImages(productId, callback) {
//   db.query(
//     `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC`,
//     [productId],
//     (err, results) => {
//       if (err) {
//         if (err.code === 'ER_BAD_FIELD_ERROR') {
//           db.query(
//             `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY id ASC`,
//             [productId],
//             (err2, results2) => {
//               if (err2) {
//                 console.error("Error fetching images (fallback):", err2);
//                 return callback(err2, null);
//               }
//               const images = results2.map(row => row.image_url);
//               callback(null, images);
//             }
//           );
//         } else {
//           console.error("Error fetching images:", err);
//           callback(err, null);
//         }
//         return;
//       }
//       const images = results.map(row => row.image_url);
//       callback(null, images);
//     }
//   );
// }

// // ====================================
// // HELPER: GET PRODUCTS WITH IMAGES
// // ====================================
// function getProductsWithImages(sql, params, callback) {
//   db.query(sql, params, (err, products) => {
//     if (err) {
//       console.error("Error fetching products:", err);
//       return callback(err, null);
//     }

//     if (!products || products.length === 0) {
//       return callback(null, []);
//     }

//     let completed = 0;
//     const results = [];

//     products.forEach((product, index) => {
//       if (product.product_images && typeof product.product_images === 'string') {
//         try {
//           product.images = JSON.parse(product.product_images);
//         } catch (e) {
//           product.images = [];
//         }
//       } else if (product.product_images && Array.isArray(product.product_images)) {
//         product.images = product.product_images;
//       } else {
//         product.images = [];
//       }

//       if (!product.images || product.images.length === 0) {
//         getProductImages(product.id, (imgErr, images) => {
//           if (imgErr) {
//             console.error("Error fetching images for product:", product.id, imgErr.message);
//           }
//           product.images = images || [];
//           results[index] = product;
//           completed++;

//           if (completed === products.length) {
//             callback(null, results);
//           }
//         });
//       } else {
//         results[index] = product;
//         completed++;
//         if (completed === products.length) {
//           callback(null, results);
//         }
//       }
//     });
//   });
// }

// // ====================================
// // TEST ENDPOINT - ADD THIS
// // ====================================
// router.get("/test-category/:categoryId", (req, res) => {
//   const { categoryId } = req.params;
//   console.log(`TEST: Fetching products for category ${categoryId}`);
  
//   if (!categoryId || isNaN(categoryId)) {
//     return res.status(400).json({ error: "Invalid category ID" });
//   }

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_category_id = ?
//     ORDER BY p.id DESC
//   `;

//   db.query(sql, [categoryId], (err, results) => {
//     if (err) {
//       console.error("Error:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`TEST: Found ${results.length} products for category ${categoryId}`);
//     res.json({
//       success: true,
//       categoryId: categoryId,
//       count: results.length,
//       products: results
//     });
//   });
// });

// // ====================================
// // GET PRODUCTS BY CATEGORY
// // ====================================
// router.get("/category/:categoryId", (req, res) => {
//   const { categoryId } = req.params;
//   console.log(`GET /api/products/category/${categoryId} - Fetching products by category`);

//   if (!categoryId) {
//     return res.status(400).json({ error: "Category ID is required" });
//   }

//   if (isNaN(categoryId)) {
//     console.log("Invalid category ID:", categoryId);
//     return res.status(400).json({ error: "Invalid category ID" });
//   }

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_category_id = ?
//     ORDER BY p.id DESC
//   `;

//   console.log("SQL Query:", sql);
//   console.log("SQL Params:", [categoryId]);

//   getProductsWithImages(sql, [categoryId], (err, results) => {
//     if (err) {
//       console.error("Error fetching products by category:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`Found ${results.length} products for category ${categoryId}`);
//     res.json(results);
//   });
// });

// // ====================================
// // GET ALL PRODUCTS
// // ====================================
// router.get("/", (req, res) => {
//   console.log("GET /api/products - Fetching all products");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.id DESC
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching products:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`Found ${results.length} products`);
//     res.json(results);
//   });
// });

// // ====================================
// // GET SINGLE PRODUCT
// // ====================================
// router.get("/:id", (req, res) => {
//   const productId = req.params.id;
//   console.log(`GET /api/products/${productId} - Fetching single product`);

//   if (!productId || isNaN(productId)) {
//     console.log("Invalid product ID:", productId);
//     return res.status(400).json({ error: "Invalid product ID" });
//   }

//   db.query(
//     `
//       SELECT 
//         p.*,
//         c.category_name,
//         c.id as category_id
//       FROM products p
//       LEFT JOIN product_categories c ON p.product_category_id = c.id
//       WHERE p.id = ?
//     `,
//     [productId],
//     (err, productResult) => {
//       if (err) {
//         console.error("Error fetching product:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (productResult.length === 0) {
//         return res.status(404).json({ message: "Product not found" });
//       }

//       const product = productResult[0];

//       if (product.product_images && typeof product.product_images === 'string') {
//         try {
//           product.images = JSON.parse(product.product_images);
//         } catch (e) {
//           product.images = [];
//         }
//       } else if (product.product_images && Array.isArray(product.product_images)) {
//         product.images = product.product_images;
//       } else {
//         product.images = [];
//       }

//       if (!product.images || product.images.length === 0) {
//         getProductImages(productId, (imgErr, images) => {
//           if (imgErr) {
//             console.error("Error fetching product images:", imgErr);
//             product.images = [];
//           } else {
//             product.images = images || [];
//           }
//           res.json(product);
//         });
//       } else {
//         res.json(product);
//       }
//     }
//   );
// });

// // ====================================
// // CREATE PRODUCT
// // ====================================
// router.post("/", upload.array("images", 10), (req, res) => {
//   try {
//     const {
//       product_category_id,
//       product_name,
//       product_code,
//       product_brand,
//       price,
//       available_stock,
//       dimensions,
//       specifications,
//       weight,
//       color,
//       discount,
//       product_description,
//       warranty,
//       material,
//       care_instructions,
//       is_active,
//     } = req.body;

//     if (!product_category_id) {
//       return res.status(400).json({ error: "Category is required" });
//     }
//     if (!product_name || product_name.trim() === '') {
//       return res.status(400).json({ error: "Product name is required" });
//     }

//     const sql = `
//       INSERT INTO products (
//         product_category_id, product_name, product_code, product_brand,
//         price, available_stock, dimensions, specifications,
//         weight, color, discount, product_description,
//         warranty, material, care_instructions, is_active
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     db.query(
//       sql,
//       [
//         product_category_id || null,
//         product_name.trim(),
//         product_code || null,
//         product_brand || null,
//         parseFloat(price) || 0,
//         parseInt(available_stock) || 0,
//         dimensions || null,
//         specifications || null,
//         weight || null,
//         color || null,
//         parseFloat(discount) || 0,
//         product_description || null,
//         warranty || null,
//         material || null,
//         care_instructions || null,
//         is_active || 1,
//       ],
//       (err, result) => {
//         if (err) {
//           console.error("Error creating product:", err);
//           return res.status(500).json({ error: err.message });
//         }

//         saveImages(result.insertId, req.files, (imgErr) => {
//           if (imgErr) {
//             console.error("Error saving images:", imgErr);
//             return res.status(500).json({ error: imgErr.message });
//           }

//           res.json({
//             message: "Product created successfully",
//             id: result.insertId,
//           });
//         });
//       }
//     );
//   } catch (error) {
//     console.error("Error in product creation:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // ====================================
// // GET ALL PRODUCTS
// // ====================================
// router.get("/", (req, res) => {
//   console.log("GET /api/products - Fetching all products");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.id DESC
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching products:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`Found ${results.length} products`);
//     res.json(results);
//   });
// });

// // ====================================
// // GET PRODUCTS BY CATEGORY
// // IMPORTANT: This MUST come before /:id route
// // ====================================
// router.get("/category/:categoryId", (req, res) => {
//   const { categoryId } = req.params;
//   console.log(`GET /api/products/category/${categoryId} - Fetching products by category`);

//   if (!categoryId) {
//     return res.status(400).json({ error: "Category ID is required" });
//   }

//   if (isNaN(categoryId)) {
//     console.log("Invalid category ID:", categoryId);
//     return res.status(400).json({ error: "Invalid category ID" });
//   }

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_category_id = ?
//     ORDER BY p.id DESC
//   `;

//   console.log("SQL Query:", sql);
//   console.log("SQL Params:", [categoryId]);

//   getProductsWithImages(sql, [categoryId], (err, results) => {
//     if (err) {
//       console.error("Error fetching products by category:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`Found ${results.length} products for category ${categoryId}`);
//     res.json(results);
//   });
// });

// // ====================================
// // GET TRENDING PRODUCTS
// // ====================================
// router.get("/trending", (req, res) => {
//   console.log("GET /api/products/trending - Fetching trending products");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.rating DESC, p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching trending products:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // GET BEST SELLERS
// // ====================================
// router.get("/best-sellers", (req, res) => {
//   console.log("GET /api/products/best-sellers - Fetching best sellers");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.rating DESC, p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching best sellers:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // GET NEW ARRIVALS
// // ====================================
// router.get("/new-arrivals", (req, res) => {
//   console.log("GET /api/products/new-arrivals - Fetching new arrivals");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching new arrivals:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // SEARCH PRODUCTS
// // ====================================
// router.get("/search", (req, res) => {
//   const { q } = req.query;
//   console.log(`GET /api/products/search?q=${q} - Searching products`);

//   if (!q || q.trim() === "") {
//     return res.json([]);
//   }

//   const searchTerm = `%${q.trim()}%`;

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_name LIKE ? 
//     OR p.product_description LIKE ?
//     OR c.category_name LIKE ?
//     OR p.product_brand LIKE ?
//     OR p.material LIKE ?
//     ORDER BY p.id DESC
//   `;

//   getProductsWithImages(
//     sql,
//     [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm],
//     (err, results) => {
//       if (err) {
//         console.error("Error searching products:", err);
//         return res.status(500).json({ error: err.message });
//       }
//       res.json(results);
//     }
//   );
// });

// // ====================================
// // GET SINGLE PRODUCT
// // IMPORTANT: This MUST come AFTER /category/:categoryId route
// // ====================================
// router.get("/:id", (req, res) => {
//   const productId = req.params.id;
//   console.log(`GET /api/products/${productId} - Fetching single product`);

//   if (!productId || isNaN(productId)) {
//     console.log("Invalid product ID:", productId);
//     return res.status(400).json({ error: "Invalid product ID" });
//   }

//   db.query(
//     `
//       SELECT 
//         p.*,
//         c.category_name,
//         c.id as category_id
//       FROM products p
//       LEFT JOIN product_categories c ON p.product_category_id = c.id
//       WHERE p.id = ?
//     `,
//     [productId],
//     (err, productResult) => {
//       if (err) {
//         console.error("Error fetching product:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (productResult.length === 0) {
//         return res.status(404).json({ message: "Product not found" });
//       }

//       const product = productResult[0];

//       if (product.product_images && typeof product.product_images === 'string') {
//         try {
//           product.images = JSON.parse(product.product_images);
//         } catch (e) {
//           product.images = [];
//         }
//       } else if (product.product_images && Array.isArray(product.product_images)) {
//         product.images = product.product_images;
//       } else {
//         product.images = [];
//       }

//       if (!product.images || product.images.length === 0) {
//         getProductImages(productId, (imgErr, images) => {
//           if (imgErr) {
//             console.error("Error fetching product images:", imgErr);
//             product.images = [];
//           } else {
//             product.images = images || [];
//           }
//           res.json(product);
//         });
//       } else {
//         res.json(product);
//       }
//     }
//   );
// });

// // ====================================
// // UPDATE PRODUCT
// // ====================================
// router.put("/:id", upload.array("images", 10), (req, res) => {
//   const id = req.params.id;

//   const {
//     product_category_id,
//     product_name,
//     product_code,
//     product_brand,
//     price,
//     available_stock,
//     dimensions,
//     specifications,
//     weight,
//     color,
//     discount,
//     product_description,
//     warranty,
//     material,
//     care_instructions,
//     is_active,
//     existing_images,
//   } = req.body;

//   if (!product_category_id) {
//     return res.status(400).json({ error: "Category is required" });
//   }
//   if (!product_name || product_name.trim() === '') {
//     return res.status(400).json({ error: "Product name is required" });
//   }

//   // Begin transaction
//   db.beginTransaction((err) => {
//     if (err) {
//       console.error("Error starting transaction:", err);
//       return res.status(500).json({ error: err.message });
//     }

//     // Update product details
//     const sql = `
//       UPDATE products
//       SET
//         product_category_id = ?,
//         product_name = ?,
//         product_code = ?,
//         product_brand = ?,
//         price = ?,
//         available_stock = ?,
//         dimensions = ?,
//         specifications = ?,
//         weight = ?,
//         color = ?,
//         discount = ?,
//         product_description = ?,
//         warranty = ?,
//         material = ?,
//         care_instructions = ?,
//         is_active = ?
//       WHERE id = ?
//     `;

//     db.query(
//       sql,
//       [
//         product_category_id || null,
//         product_name.trim(),
//         product_code || null,
//         product_brand || null,
//         parseFloat(price) || 0,
//         parseInt(available_stock) || 0,
//         dimensions || null,
//         specifications || null,
//         weight || null,
//         color || null,
//         parseFloat(discount) || 0,
//         product_description || null,
//         warranty || null,
//         material || null,
//         care_instructions || null,
//         is_active || 1,
//         id,
//       ],
//       (err) => {
//         if (err) {
//           console.error("Error updating product:", err);
//           return db.rollback(() => {
//             res.status(500).json({ error: err.message });
//           });
//         }

//         // Handle images
//         let existingImagesArray = [];
//         if (existing_images) {
//           existingImagesArray = Array.isArray(existing_images) ? existing_images : [existing_images];
//         }

//         // If we have new images, add them
//         if (req.files && req.files.length > 0) {
//           // Check if sort_order column exists
//           db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
//             const hasSortOrder = columns && columns.length > 0;
            
//             // Delete existing images that are not in the keep list
//             db.query(
//               "SELECT image_url FROM product_images WHERE product_id = ?",
//               [id],
//               (selectErr, images) => {
//                 if (selectErr) {
//                   console.error("Error fetching images:", selectErr);
//                   return db.rollback(() => {
//                     res.status(500).json({ error: selectErr.message });
//                   });
//                 }

//                 // Delete images not in keep list
//                 const imagesToDelete = images.filter(function(img) {
//                   return !existingImagesArray.includes(img.image_url);
//                 });

//                 if (imagesToDelete.length > 0) {
//                   const deleteValues = imagesToDelete.map(function(img) {
//                     return img.image_url;
//                   });
                  
//                   // Create placeholders for the IN clause
//                   const placeholders = deleteValues.map(function() {
//                     return '?';
//                   }).join(',');
                  
//                   const deleteSql = `
//                     DELETE FROM product_images 
//                     WHERE product_id = ? AND image_url IN (${placeholders})
//                   `;
                  
//                   db.query(
//                     deleteSql,
//                     [id].concat(deleteValues),
//                     function(deleteErr) {
//                       if (deleteErr) {
//                         console.error("Error deleting images:", deleteErr);
//                         return db.rollback(function() {
//                           res.status(500).json({ error: deleteErr.message });
//                         });
//                       }
//                     }
//                   );
//                 }

//                 // Add new images
//                 if (hasSortOrder) {
//                   db.query(
//                     "SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?",
//                     [id],
//                     (orderErr, orderResult) => {
//                       if (orderErr) {
//                         console.error("Error getting sort order:", orderErr);
//                         return db.rollback(() => {
//                           res.status(500).json({ error: orderErr.message });
//                         });
//                       }
//                       const startOrder = (orderResult[0].max_order || -1) + 1;
                      
//                       const values = req.files.map((file, index) => [
//                         id,
//                         `uploads/products/${file.filename}`,
//                         startOrder + index,
//                       ]);

//                       const insertSql = `
//                         INSERT INTO product_images
//                         (product_id, image_url, sort_order)
//                         VALUES ?
//                       `;

//                       db.query(insertSql, [values], (insertErr) => {
//                         if (insertErr) {
//                           console.error("Error saving images:", insertErr);
//                           return db.rollback(() => {
//                             res.status(500).json({ error: insertErr.message });
//                           });
//                         }
                        
//                         db.commit((commitErr) => {
//                           if (commitErr) {
//                             console.error("Error committing transaction:", commitErr);
//                             return db.rollback(() => {
//                               res.status(500).json({ error: commitErr.message });
//                             });
//                           }
//                           res.json({
//                             message: "Product updated successfully",
//                           });
//                         });
//                       });
//                     }
//                   );
//                 } else {
//                   const values = req.files.map((file) => [
//                     id,
//                     `uploads/products/${file.filename}`,
//                   ]);

//                   const insertSql = `
//                     INSERT INTO product_images
//                     (product_id, image_url)
//                     VALUES ?
//                   `;

//                   db.query(insertSql, [values], (insertErr) => {
//                     if (insertErr) {
//                       console.error("Error saving images:", insertErr);
//                       return db.rollback(() => {
//                         res.status(500).json({ error: insertErr.message });
//                       });
//                     }
                    
//                     db.commit((commitErr) => {
//                       if (commitErr) {
//                         console.error("Error committing transaction:", commitErr);
//                         return db.rollback(() => {
//                           res.status(500).json({ error: commitErr.message });
//                         });
//                       }
//                       res.json({
//                         message: "Product updated successfully",
//                       });
//                     });
//                   });
//                 }
//               }
//             );
//           });
//         } else {
//           // No new images, just update existing images if any need to be removed
//           if (existingImagesArray.length === 0) {
//             // Delete all images if no images are kept
//             db.query(
//               "DELETE FROM product_images WHERE product_id = ?",
//               [id],
//               (deleteErr) => {
//                 if (deleteErr) {
//                   console.error("Error deleting images:", deleteErr);
//                   return db.rollback(() => {
//                     res.status(500).json({ error: deleteErr.message });
//                   });
//                 }
                
//                 db.commit((commitErr) => {
//                   if (commitErr) {
//                     console.error("Error committing transaction:", commitErr);
//                     return db.rollback(() => {
//                       res.status(500).json({ error: commitErr.message });
//                     });
//                   }
//                   res.json({
//                     message: "Product updated successfully",
//                   });
//                 });
//               }
//             );
//           } else {
//             // Delete images not in keep list
//             db.query(
//               "SELECT image_url FROM product_images WHERE product_id = ?",
//               [id],
//               (selectErr, images) => {
//                 if (selectErr) {
//                   console.error("Error fetching images:", selectErr);
//                   return db.rollback(() => {
//                     res.status(500).json({ error: selectErr.message });
//                   });
//                 }

//                 const imagesToDelete = images.filter(function(img) {
//                   return !existingImagesArray.includes(img.image_url);
//                 });

//                 if (imagesToDelete.length > 0) {
//                   const deleteValues = imagesToDelete.map(function(img) {
//                     return img.image_url;
//                   });
                  
//                   const placeholders = deleteValues.map(function() {
//                     return '?';
//                   }).join(',');
                  
//                   const deleteSql = `
//                     DELETE FROM product_images 
//                     WHERE product_id = ? AND image_url IN (${placeholders})
//                   `;
                  
//                   db.query(
//                     deleteSql,
//                     [id].concat(deleteValues),
//                     (deleteErr) => {
//                       if (deleteErr) {
//                         console.error("Error deleting images:", deleteErr);
//                         return db.rollback(() => {
//                           res.status(500).json({ error: deleteErr.message });
//                         });
//                       }
                      
//                       db.commit((commitErr) => {
//                         if (commitErr) {
//                           console.error("Error committing transaction:", commitErr);
//                           return db.rollback(() => {
//                             res.status(500).json({ error: commitErr.message });
//                           });
//                         }
//                         res.json({
//                           message: "Product updated successfully",
//                         });
//                       });
//                     }
//                   );
//                 } else {
//                   db.commit((commitErr) => {
//                     if (commitErr) {
//                       console.error("Error committing transaction:", commitErr);
//                       return db.rollback(() => {
//                         res.status(500).json({ error: commitErr.message });
//                       });
//                     }
//                     res.json({
//                       message: "Product updated successfully",
//                     });
//                   });
//                 }
//               }
//             );
//           }
//         }
//       }
//     );
//   });
// });

// // ====================================
// // DELETE PRODUCT
// // ====================================
// router.delete("/:id", (req, res) => {
//   const productId = req.params.id;

//   db.query(
//     "SELECT image_url FROM product_images WHERE product_id = ?",
//     [productId],
//     (err, images) => {
//       if (err) {
//         console.error("Error fetching images for deletion:", err);
//       }

//       db.query(
//         `DELETE FROM product_images WHERE product_id = ?`,
//         [productId],
//         (err) => {
//           if (err) {
//             console.error("Error deleting product images:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           db.query(
//             `DELETE FROM products WHERE id = ?`,
//             [productId],
//             (err) => {
//               if (err) {
//                 console.error("Error deleting product:", err);
//                 return res.status(500).json({ error: err.message });
//               }

//               if (images && images.length > 0) {
//                 images.forEach((img) => {
//                   const filePath = path.join(__dirname, "..", img.image_url);
//                   if (fs.existsSync(filePath)) {
//                     fs.unlink(filePath, (unlinkErr) => {
//                       if (unlinkErr) {
//                         console.error("Error deleting file:", unlinkErr);
//                       }
//                     });
//                   }
//                 });
//               }

//               res.json({
//                 message: "Product deleted successfully",
//               });
//             }
//           );
//         }
//       );
//     }
//   );
// });

// // ====================================
// // UPLOAD PRODUCT IMAGES
// // ====================================
// router.post("/:id/images", upload.array("images", 10), (req, res) => {
//   const productId = req.params.id;

//   db.query(
//     "SELECT id FROM products WHERE id = ?",
//     [productId],
//     (err, result) => {
//       if (err) {
//         console.error("Error checking product:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (result.length === 0) {
//         return res.status(404).json({ message: "Product not found" });
//       }

//       db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
//         const hasSortOrder = columns && columns.length > 0;
        
//         if (hasSortOrder) {
//           db.query(
//             "SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?",
//             [productId],
//             (orderErr, orderResult) => {
//               if (orderErr) {
//                 console.error("Error getting sort order:", orderErr);
//                 return res.status(500).json({ error: orderErr.message });
//               }
//               const startOrder = (orderResult[0].max_order || -1) + 1;
              
//               const values = req.files.map((file, index) => [
//                 productId,
//                 `uploads/products/${file.filename}`,
//                 startOrder + index,
//               ]);

//               const insertSql = `
//                 INSERT INTO product_images
//                 (product_id, image_url, sort_order)
//                 VALUES ?
//               `;

//               db.query(insertSql, [values], (err) => {
//                 if (err) {
//                   console.error("Error saving images:", err);
//                   return res.status(500).json({ error: err.message });
//                 }
//                 res.json({
//                   message: "Images uploaded successfully",
//                 });
//               });
//             }
//           );
//         } else {
//           const values = req.files.map((file) => [
//             productId,
//             `uploads/products/${file.filename}`,
//           ]);

//           const insertSql = `
//             INSERT INTO product_images
//             (product_id, image_url)
//             VALUES ?
//           `;

//           db.query(insertSql, [values], (err) => {
//             if (err) {
//               console.error("Error saving images:", err);
//               return res.status(500).json({ error: err.message });
//             }
//             res.json({
//               message: "Images uploaded successfully",
//             });
//           });
//         }
//       });
//     }
//   );
// });

// // ====================================
// // DELETE PRODUCT IMAGE
// // ====================================
// router.delete("/:productId/images/:imageId", (req, res) => {
//   const { productId, imageId } = req.params;

//   db.query(
//     "SELECT image_url FROM product_images WHERE id = ? AND product_id = ?",
//     [imageId, productId],
//     (err, result) => {
//       if (err) {
//         console.error("Error fetching image:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (result.length === 0) {
//         return res.status(404).json({ message: "Image not found" });
//       }

//       db.query(
//         "DELETE FROM product_images WHERE id = ?",
//         [imageId],
//         (err) => {
//           if (err) {
//             console.error("Error deleting image:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           const filePath = path.join(__dirname, "..", result[0].image_url);
//           if (fs.existsSync(filePath)) {
//             fs.unlink(filePath, (unlinkErr) => {
//               if (unlinkErr) {
//                 console.error("Error deleting file:", unlinkErr);
//               }
//             });
//           }

//           res.json({
//             message: "Image deleted successfully",
//           });
//         }
//       );
//     }
//   );
// });

// module.exports = router;



// const express = require("express");
// const router = express.Router();
// const db = require("../db");
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// // ====================================
// // CREATE UPLOAD FOLDER
// // ====================================
// const uploadDir = path.join(__dirname, '..', 'uploads', 'products');

// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir, { recursive: true });
// }

// // ====================================
// // MULTER STORAGE CONFIGURATION
// // ====================================
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadDir);
//   },
//   filename: (req, file, cb) => {
//     const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
//     cb(null, unique + path.extname(file.originalname));
//   },
// });

// // ====================================
// // MULTER INSTANCE
// // ====================================
// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024,
//   },
//   fileFilter: (req, file, cb) => {
//     const allowed = /jpeg|jpg|png|webp|gif/;
//     const ext = path.extname(file.originalname).toLowerCase();
//     if (allowed.test(ext) && allowed.test(file.mimetype)) {
//       return cb(null, true);
//     }
//     cb(new Error("Only image files are allowed"));
//   },
// });

// // ====================================
// // HELPER: PARSE JSON FIELDS
// // ====================================
// function parseJSONField(value) {
//   if (!value) return null;
//   if (typeof value === 'string') {
//     try {
//       return JSON.parse(value);
//     } catch (e) {
//       return value;
//     }
//   }
//   return value;
// }

// // ====================================
// // HELPER: STRINGIFY FOR DATABASE
// // ====================================
// function stringifyForDB(value) {
//   if (!value) return null;
//   if (typeof value === 'object') {
//     return JSON.stringify(value);
//   }
//   return value;
// }

// // ====================================
// // SAVE PRODUCT IMAGES
// // ====================================
// function saveImages(productId, files, callback) {
//   if (!files || files.length === 0) {
//     return callback(null);
//   }

//   db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
//     const hasSortOrder = columns && columns.length > 0;
    
//     if (hasSortOrder) {
//       const values = files.map((file, index) => [
//         productId,
//         `uploads/products/${file.filename}`,
//         index,
//       ]);

//       db.query(
//         `INSERT INTO product_images (product_id, image_url, sort_order) VALUES ?`,
//         [values],
//         callback
//       );
//     } else {
//       const values = files.map((file) => [
//         productId,
//         `uploads/products/${file.filename}`,
//       ]);

//       db.query(
//         `INSERT INTO product_images (product_id, image_url) VALUES ?`,
//         [values],
//         callback
//       );
//     }
//   });
// }

// // ====================================
// // HELPER: GET PRODUCT IMAGES
// // ====================================
// function getProductImages(productId, callback) {
//   db.query(
//     `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC`,
//     [productId],
//     (err, results) => {
//       if (err) {
//         if (err.code === 'ER_BAD_FIELD_ERROR') {
//           db.query(
//             `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY id ASC`,
//             [productId],
//             (err2, results2) => {
//               if (err2) {
//                 console.error("Error fetching images (fallback):", err2);
//                 return callback(err2, null);
//               }
//               const images = results2.map(row => row.image_url);
//               callback(null, images);
//             }
//           );
//         } else {
//           console.error("Error fetching images:", err);
//           callback(err, null);
//         }
//         return;
//       }
//       const images = results.map(row => row.image_url);
//       callback(null, images);
//     }
//   );
// }

// // ====================================
// // HELPER: GET PRODUCTS WITH IMAGES
// // ====================================
// function getProductsWithImages(sql, params, callback) {
//   db.query(sql, params, (err, products) => {
//     if (err) {
//       console.error("Error fetching products:", err);
//       return callback(err, null);
//     }

//     if (!products || products.length === 0) {
//       return callback(null, []);
//     }

//     let completed = 0;
//     const results = [];

//     products.forEach((product, index) => {
//       // Parse images from product_images field
//       if (product.product_images && typeof product.product_images === 'string') {
//         try {
//           product.images = JSON.parse(product.product_images);
//         } catch (e) {
//           product.images = [];
//         }
//       } else if (product.product_images && Array.isArray(product.product_images)) {
//         product.images = product.product_images;
//       } else {
//         product.images = [];
//       }

//       // Parse colors from colors field
//       if (product.colors && typeof product.colors === 'string') {
//         try {
//           product.colors = JSON.parse(product.colors);
//         } catch (e) {
//           product.colors = [];
//         }
//       } else if (product.colors && Array.isArray(product.colors)) {
//         // Already an array
//       } else {
//         product.colors = [];
//       }

//       // Parse sizes from sizes field
//       if (product.sizes && typeof product.sizes === 'string') {
//         try {
//           product.sizes = JSON.parse(product.sizes);
//         } catch (e) {
//           product.sizes = [];
//         }
//       } else if (product.sizes && Array.isArray(product.sizes)) {
//         // Already an array
//       } else {
//         product.sizes = [];
//       }

//       // Parse specifications from specifications field
//       if (product.specifications && typeof product.specifications === 'string') {
//         try {
//           product.specifications = JSON.parse(product.specifications);
//         } catch (e) {
//           product.specifications = {};
//         }
//       } else if (product.specifications && typeof product.specifications === 'object') {
//         // Already an object
//       } else {
//         product.specifications = {};
//       }

//       if (!product.images || product.images.length === 0) {
//         getProductImages(product.id, (imgErr, images) => {
//           if (imgErr) {
//             console.error("Error fetching images for product:", product.id, imgErr.message);
//           }
//           product.images = images || [];
//           results[index] = product;
//           completed++;

//           if (completed === products.length) {
//             callback(null, results);
//           }
//         });
//       } else {
//         results[index] = product;
//         completed++;
//         if (completed === products.length) {
//           callback(null, results);
//         }
//       }
//     });
//   });
// }

// // ====================================
// // TEST ENDPOINT
// // ====================================
// router.get("/test-category/:categoryId", (req, res) => {
//   const { categoryId } = req.params;
//   console.log(`TEST: Fetching products for category ${categoryId}`);
  
//   if (!categoryId || isNaN(categoryId)) {
//     return res.status(400).json({ error: "Invalid category ID" });
//   }

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_category_id = ?
//     ORDER BY p.id DESC
//   `;

//   db.query(sql, [categoryId], (err, results) => {
//     if (err) {
//       console.error("Error:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`TEST: Found ${results.length} products for category ${categoryId}`);
//     res.json({
//       success: true,
//       categoryId: categoryId,
//       count: results.length,
//       products: results
//     });
//   });
// });

// // ====================================
// // GET ALL PRODUCTS
// // ====================================
// router.get("/", (req, res) => {
//   console.log("GET /api/products - Fetching all products");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.id DESC
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching products:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`Found ${results.length} products`);
//     res.json(results);
//   });
// });

// // ====================================
// // GET PRODUCTS BY CATEGORY
// // ====================================
// router.get("/category/:categoryId", (req, res) => {
//   const { categoryId } = req.params;
//   console.log(`GET /api/products/category/${categoryId} - Fetching products by category`);

//   if (!categoryId) {
//     return res.status(400).json({ error: "Category ID is required" });
//   }

//   if (isNaN(categoryId)) {
//     console.log("Invalid category ID:", categoryId);
//     return res.status(400).json({ error: "Invalid category ID" });
//   }

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_category_id = ?
//     ORDER BY p.id DESC
//   `;

//   console.log("SQL Query:", sql);
//   console.log("SQL Params:", [categoryId]);

//   getProductsWithImages(sql, [categoryId], (err, results) => {
//     if (err) {
//       console.error("Error fetching products by category:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`Found ${results.length} products for category ${categoryId}`);
//     res.json(results);
//   });
// });

// // ====================================
// // GET SINGLE PRODUCT
// // ====================================
// router.get("/:id", (req, res) => {
//   const productId = req.params.id;
//   console.log(`GET /api/products/${productId} - Fetching single product`);

//   if (!productId || isNaN(productId)) {
//     console.log("Invalid product ID:", productId);
//     return res.status(400).json({ error: "Invalid product ID" });
//   }

//   db.query(
//     `
//       SELECT 
//         p.*,
//         c.category_name,
//         c.id as category_id
//       FROM products p
//       LEFT JOIN product_categories c ON p.product_category_id = c.id
//       WHERE p.id = ?
//     `,
//     [productId],
//     (err, productResult) => {
//       if (err) {
//         console.error("Error fetching product:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (productResult.length === 0) {
//         return res.status(404).json({ message: "Product not found" });
//       }

//       const product = productResult[0];

//       // Parse images
//       if (product.product_images && typeof product.product_images === 'string') {
//         try {
//           product.images = JSON.parse(product.product_images);
//         } catch (e) {
//           product.images = [];
//         }
//       } else if (product.product_images && Array.isArray(product.product_images)) {
//         product.images = product.product_images;
//       } else {
//         product.images = [];
//       }

//       // Parse colors
//       if (product.colors && typeof product.colors === 'string') {
//         try {
//           product.colors = JSON.parse(product.colors);
//         } catch (e) {
//           product.colors = [];
//         }
//       } else if (product.colors && Array.isArray(product.colors)) {
//         // Already an array
//       } else {
//         product.colors = [];
//       }

//       // Parse sizes
//       if (product.sizes && typeof product.sizes === 'string') {
//         try {
//           product.sizes = JSON.parse(product.sizes);
//         } catch (e) {
//           product.sizes = [];
//         }
//       } else if (product.sizes && Array.isArray(product.sizes)) {
//         // Already an array
//       } else {
//         product.sizes = [];
//       }

//       // Parse specifications
//       if (product.specifications && typeof product.specifications === 'string') {
//         try {
//           product.specifications = JSON.parse(product.specifications);
//         } catch (e) {
//           product.specifications = {};
//         }
//       } else if (product.specifications && typeof product.specifications === 'object') {
//         // Already an object
//       } else {
//         product.specifications = {};
//       }

//       // If no images found in product_images field, fetch from product_images table
//       if (!product.images || product.images.length === 0) {
//         getProductImages(productId, (imgErr, images) => {
//           if (imgErr) {
//             console.error("Error fetching product images:", imgErr);
//             product.images = [];
//           } else {
//             product.images = images || [];
//           }
//           res.json(product);
//         });
//       } else {
//         res.json(product);
//       }
//     }
//   );
// });

// // ====================================
// // CREATE PRODUCT
// // ====================================
// router.post("/", upload.array("images", 10), (req, res) => {
//   try {
//     const {
//       product_category_id,
//       product_name,
//       product_code,
//       product_brand,
//       price,
//       available_stock,
//       dimensions,
//       specifications,
//       weight,
//       color,
//       discount,
//       product_description,
//       warranty,
//       material,
//       care_instructions,
//       is_active,
//       // New fields for colors and sizes
//       colors,
//       sizes,
//     } = req.body;

//     if (!product_category_id) {
//       return res.status(400).json({ error: "Category is required" });
//     }
//     if (!product_name || product_name.trim() === '') {
//       return res.status(400).json({ error: "Product name is required" });
//     }

//     // Parse JSON fields
//     const parsedSpecifications = specifications ? parseJSONField(specifications) : null;
//     const parsedColors = colors ? parseJSONField(colors) : null;
//     const parsedSizes = sizes ? parseJSONField(sizes) : null;

//     const sql = `
//       INSERT INTO products (
//         product_category_id, product_name, product_code, product_brand,
//         price, available_stock, dimensions, specifications,
//         weight, color, discount, product_description,
//         warranty, material, care_instructions, is_active,
//         colors, sizes
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     db.query(
//       sql,
//       [
//         product_category_id || null,
//         product_name.trim(),
//         product_code || null,
//         product_brand || null,
//         parseFloat(price) || 0,
//         parseInt(available_stock) || 0,
//         dimensions || null,
//         parsedSpecifications ? JSON.stringify(parsedSpecifications) : null,
//         weight || null,
//         color || null,
//         parseFloat(discount) || 0,
//         product_description || null,
//         warranty || null,
//         material || null,
//         care_instructions || null,
//         is_active || 1,
//         parsedColors ? JSON.stringify(parsedColors) : null,
//         parsedSizes ? JSON.stringify(parsedSizes) : null,
//       ],
//       (err, result) => {
//         if (err) {
//           console.error("Error creating product:", err);
//           return res.status(500).json({ error: err.message });
//         }

//         saveImages(result.insertId, req.files, (imgErr) => {
//           if (imgErr) {
//             console.error("Error saving images:", imgErr);
//             return res.status(500).json({ error: imgErr.message });
//           }

//           res.json({
//             message: "Product created successfully",
//             id: result.insertId,
//           });
//         });
//       }
//     );
//   } catch (error) {
//     console.error("Error in product creation:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // ====================================
// // GET TRENDING PRODUCTS
// // ====================================
// router.get("/trending", (req, res) => {
//   console.log("GET /api/products/trending - Fetching trending products");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.rating DESC, p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching trending products:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // GET BEST SELLERS
// // ====================================
// router.get("/best-sellers", (req, res) => {
//   console.log("GET /api/products/best-sellers - Fetching best sellers");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.rating DESC, p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching best sellers:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // GET NEW ARRIVALS
// // ====================================
// router.get("/new-arrivals", (req, res) => {
//   console.log("GET /api/products/new-arrivals - Fetching new arrivals");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching new arrivals:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // SEARCH PRODUCTS
// // ====================================
// router.get("/search", (req, res) => {
//   const { q } = req.query;
//   console.log(`GET /api/products/search?q=${q} - Searching products`);

//   if (!q || q.trim() === "") {
//     return res.json([]);
//   }

//   const searchTerm = `%${q.trim()}%`;

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_name LIKE ? 
//     OR p.product_description LIKE ?
//     OR c.category_name LIKE ?
//     OR p.product_brand LIKE ?
//     OR p.material LIKE ?
//     ORDER BY p.id DESC
//   `;

//   getProductsWithImages(
//     sql,
//     [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm],
//     (err, results) => {
//       if (err) {
//         console.error("Error searching products:", err);
//         return res.status(500).json({ error: err.message });
//       }
//       res.json(results);
//     }
//   );
// });

// // ====================================
// // UPDATE PRODUCT
// // ====================================
// router.put("/:id", upload.array("images", 10), (req, res) => {
//   const id = req.params.id;

//   const {
//     product_category_id,
//     product_name,
//     product_code,
//     product_brand,
//     price,
//     available_stock,
//     dimensions,
//     specifications,
//     weight,
//     color,
//     discount,
//     product_description,
//     warranty,
//     material,
//     care_instructions,
//     is_active,
//     existing_images,
//     // New fields
//     colors,
//     sizes,
//   } = req.body;

//   if (!product_category_id) {
//     return res.status(400).json({ error: "Category is required" });
//   }
//   if (!product_name || product_name.trim() === '') {
//     return res.status(400).json({ error: "Product name is required" });
//   }

//   // Parse JSON fields
//   const parsedSpecifications = specifications ? parseJSONField(specifications) : null;
//   const parsedColors = colors ? parseJSONField(colors) : null;
//   const parsedSizes = sizes ? parseJSONField(sizes) : null;

//   // Begin transaction
//   db.beginTransaction((err) => {
//     if (err) {
//       console.error("Error starting transaction:", err);
//       return res.status(500).json({ error: err.message });
//     }

//     // Update product details
//     const sql = `
//       UPDATE products
//       SET
//         product_category_id = ?,
//         product_name = ?,
//         product_code = ?,
//         product_brand = ?,
//         price = ?,
//         available_stock = ?,
//         dimensions = ?,
//         specifications = ?,
//         weight = ?,
//         color = ?,
//         discount = ?,
//         product_description = ?,
//         warranty = ?,
//         material = ?,
//         care_instructions = ?,
//         is_active = ?,
//         colors = ?,
//         sizes = ?
//       WHERE id = ?
//     `;

//     db.query(
//       sql,
//       [
//         product_category_id || null,
//         product_name.trim(),
//         product_code || null,
//         product_brand || null,
//         parseFloat(price) || 0,
//         parseInt(available_stock) || 0,
//         dimensions || null,
//         parsedSpecifications ? JSON.stringify(parsedSpecifications) : null,
//         weight || null,
//         color || null,
//         parseFloat(discount) || 0,
//         product_description || null,
//         warranty || null,
//         material || null,
//         care_instructions || null,
//         is_active || 1,
//         parsedColors ? JSON.stringify(parsedColors) : null,
//         parsedSizes ? JSON.stringify(parsedSizes) : null,
//         id,
//       ],
//       (err) => {
//         if (err) {
//           console.error("Error updating product:", err);
//           return db.rollback(() => {
//             res.status(500).json({ error: err.message });
//           });
//         }

//         // Handle images
//         let existingImagesArray = [];
//         if (existing_images) {
//           existingImagesArray = Array.isArray(existing_images) ? existing_images : [existing_images];
//         }

//         // If we have new images, add them
//         if (req.files && req.files.length > 0) {
//           // Check if sort_order column exists
//           db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
//             const hasSortOrder = columns && columns.length > 0;
            
//             // Delete existing images that are not in the keep list
//             db.query(
//               "SELECT image_url FROM product_images WHERE product_id = ?",
//               [id],
//               (selectErr, images) => {
//                 if (selectErr) {
//                   console.error("Error fetching images:", selectErr);
//                   return db.rollback(() => {
//                     res.status(500).json({ error: selectErr.message });
//                   });
//                 }

//                 // Delete images not in keep list
//                 const imagesToDelete = images.filter(function(img) {
//                   return !existingImagesArray.includes(img.image_url);
//                 });

//                 if (imagesToDelete.length > 0) {
//                   const deleteValues = imagesToDelete.map(function(img) {
//                     return img.image_url;
//                   });
                  
//                   // Create placeholders for the IN clause
//                   const placeholders = deleteValues.map(function() {
//                     return '?';
//                   }).join(',');
                  
//                   const deleteSql = `
//                     DELETE FROM product_images 
//                     WHERE product_id = ? AND image_url IN (${placeholders})
//                   `;
                  
//                   db.query(
//                     deleteSql,
//                     [id].concat(deleteValues),
//                     function(deleteErr) {
//                       if (deleteErr) {
//                         console.error("Error deleting images:", deleteErr);
//                         return db.rollback(function() {
//                           res.status(500).json({ error: deleteErr.message });
//                         });
//                       }
//                     }
//                   );
//                 }

//                 // Add new images
//                 if (hasSortOrder) {
//                   db.query(
//                     "SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?",
//                     [id],
//                     (orderErr, orderResult) => {
//                       if (orderErr) {
//                         console.error("Error getting sort order:", orderErr);
//                         return db.rollback(() => {
//                           res.status(500).json({ error: orderErr.message });
//                         });
//                       }
//                       const startOrder = (orderResult[0].max_order || -1) + 1;
                      
//                       const values = req.files.map((file, index) => [
//                         id,
//                         `uploads/products/${file.filename}`,
//                         startOrder + index,
//                       ]);

//                       const insertSql = `
//                         INSERT INTO product_images
//                         (product_id, image_url, sort_order)
//                         VALUES ?
//                       `;

//                       db.query(insertSql, [values], (insertErr) => {
//                         if (insertErr) {
//                           console.error("Error saving images:", insertErr);
//                           return db.rollback(() => {
//                             res.status(500).json({ error: insertErr.message });
//                           });
//                         }
                        
//                         db.commit((commitErr) => {
//                           if (commitErr) {
//                             console.error("Error committing transaction:", commitErr);
//                             return db.rollback(() => {
//                               res.status(500).json({ error: commitErr.message });
//                             });
//                           }
//                           res.json({
//                             message: "Product updated successfully",
//                           });
//                         });
//                       });
//                     }
//                   );
//                 } else {
//                   const values = req.files.map((file) => [
//                     id,
//                     `uploads/products/${file.filename}`,
//                   ]);

//                   const insertSql = `
//                     INSERT INTO product_images
//                     (product_id, image_url)
//                     VALUES ?
//                   `;

//                   db.query(insertSql, [values], (insertErr) => {
//                     if (insertErr) {
//                       console.error("Error saving images:", insertErr);
//                       return db.rollback(() => {
//                         res.status(500).json({ error: insertErr.message });
//                       });
//                     }
                    
//                     db.commit((commitErr) => {
//                       if (commitErr) {
//                         console.error("Error committing transaction:", commitErr);
//                         return db.rollback(() => {
//                           res.status(500).json({ error: commitErr.message });
//                         });
//                       }
//                       res.json({
//                         message: "Product updated successfully",
//                       });
//                     });
//                   });
//                 }
//               }
//             );
//           });
//         } else {
//           // No new images, just update existing images if any need to be removed
//           if (existingImagesArray.length === 0) {
//             // Delete all images if no images are kept
//             db.query(
//               "DELETE FROM product_images WHERE product_id = ?",
//               [id],
//               (deleteErr) => {
//                 if (deleteErr) {
//                   console.error("Error deleting images:", deleteErr);
//                   return db.rollback(() => {
//                     res.status(500).json({ error: deleteErr.message });
//                   });
//                 }
                
//                 db.commit((commitErr) => {
//                   if (commitErr) {
//                     console.error("Error committing transaction:", commitErr);
//                     return db.rollback(() => {
//                       res.status(500).json({ error: commitErr.message });
//                     });
//                   }
//                   res.json({
//                     message: "Product updated successfully",
//                   });
//                 });
//               }
//             );
//           } else {
//             // Delete images not in keep list
//             db.query(
//               "SELECT image_url FROM product_images WHERE product_id = ?",
//               [id],
//               (selectErr, images) => {
//                 if (selectErr) {
//                   console.error("Error fetching images:", selectErr);
//                   return db.rollback(() => {
//                     res.status(500).json({ error: selectErr.message });
//                   });
//                 }

//                 const imagesToDelete = images.filter(function(img) {
//                   return !existingImagesArray.includes(img.image_url);
//                 });

//                 if (imagesToDelete.length > 0) {
//                   const deleteValues = imagesToDelete.map(function(img) {
//                     return img.image_url;
//                   });
                  
//                   const placeholders = deleteValues.map(function() {
//                     return '?';
//                   }).join(',');
                  
//                   const deleteSql = `
//                     DELETE FROM product_images 
//                     WHERE product_id = ? AND image_url IN (${placeholders})
//                   `;
                  
//                   db.query(
//                     deleteSql,
//                     [id].concat(deleteValues),
//                     (deleteErr) => {
//                       if (deleteErr) {
//                         console.error("Error deleting images:", deleteErr);
//                         return db.rollback(() => {
//                           res.status(500).json({ error: deleteErr.message });
//                         });
//                       }
                      
//                       db.commit((commitErr) => {
//                         if (commitErr) {
//                           console.error("Error committing transaction:", commitErr);
//                           return db.rollback(() => {
//                             res.status(500).json({ error: commitErr.message });
//                           });
//                         }
//                         res.json({
//                           message: "Product updated successfully",
//                         });
//                       });
//                     }
//                   );
//                 } else {
//                   db.commit((commitErr) => {
//                     if (commitErr) {
//                       console.error("Error committing transaction:", commitErr);
//                       return db.rollback(() => {
//                         res.status(500).json({ error: commitErr.message });
//                       });
//                     }
//                     res.json({
//                       message: "Product updated successfully",
//                     });
//                   });
//                 }
//               }
//             );
//           }
//         }
//       }
//     );
//   });
// });

// // ====================================
// // DELETE PRODUCT
// // ====================================
// router.delete("/:id", (req, res) => {
//   const productId = req.params.id;

//   db.query(
//     "SELECT image_url FROM product_images WHERE product_id = ?",
//     [productId],
//     (err, images) => {
//       if (err) {
//         console.error("Error fetching images for deletion:", err);
//       }

//       db.query(
//         `DELETE FROM product_images WHERE product_id = ?`,
//         [productId],
//         (err) => {
//           if (err) {
//             console.error("Error deleting product images:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           db.query(
//             `DELETE FROM products WHERE id = ?`,
//             [productId],
//             (err) => {
//               if (err) {
//                 console.error("Error deleting product:", err);
//                 return res.status(500).json({ error: err.message });
//               }

//               if (images && images.length > 0) {
//                 images.forEach((img) => {
//                   const filePath = path.join(__dirname, "..", img.image_url);
//                   if (fs.existsSync(filePath)) {
//                     fs.unlink(filePath, (unlinkErr) => {
//                       if (unlinkErr) {
//                         console.error("Error deleting file:", unlinkErr);
//                       }
//                     });
//                   }
//                 });
//               }

//               res.json({
//                 message: "Product deleted successfully",
//               });
//             }
//           );
//         }
//       );
//     }
//   );
// });

// // ====================================
// // UPLOAD PRODUCT IMAGES
// // ====================================
// router.post("/:id/images", upload.array("images", 10), (req, res) => {
//   const productId = req.params.id;

//   db.query(
//     "SELECT id FROM products WHERE id = ?",
//     [productId],
//     (err, result) => {
//       if (err) {
//         console.error("Error checking product:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (result.length === 0) {
//         return res.status(404).json({ message: "Product not found" });
//       }

//       db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
//         const hasSortOrder = columns && columns.length > 0;
        
//         if (hasSortOrder) {
//           db.query(
//             "SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?",
//             [productId],
//             (orderErr, orderResult) => {
//               if (orderErr) {
//                 console.error("Error getting sort order:", orderErr);
//                 return res.status(500).json({ error: orderErr.message });
//               }
//               const startOrder = (orderResult[0].max_order || -1) + 1;
              
//               const values = req.files.map((file, index) => [
//                 productId,
//                 `uploads/products/${file.filename}`,
//                 startOrder + index,
//               ]);

//               const insertSql = `
//                 INSERT INTO product_images
//                 (product_id, image_url, sort_order)
//                 VALUES ?
//               `;

//               db.query(insertSql, [values], (err) => {
//                 if (err) {
//                   console.error("Error saving images:", err);
//                   return res.status(500).json({ error: err.message });
//                 }
//                 res.json({
//                   message: "Images uploaded successfully",
//                 });
//               });
//             }
//           );
//         } else {
//           const values = req.files.map((file) => [
//             productId,
//             `uploads/products/${file.filename}`,
//           ]);

//           const insertSql = `
//             INSERT INTO product_images
//             (product_id, image_url)
//             VALUES ?
//           `;

//           db.query(insertSql, [values], (err) => {
//             if (err) {
//               console.error("Error saving images:", err);
//               return res.status(500).json({ error: err.message });
//             }
//             res.json({
//               message: "Images uploaded successfully",
//             });
//           });
//         }
//       });
//     }
//   );
// });

// // ====================================
// // DELETE PRODUCT IMAGE
// // ====================================
// router.delete("/:productId/images/:imageId", (req, res) => {
//   const { productId, imageId } = req.params;

//   db.query(
//     "SELECT image_url FROM product_images WHERE id = ? AND product_id = ?",
//     [imageId, productId],
//     (err, result) => {
//       if (err) {
//         console.error("Error fetching image:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (result.length === 0) {
//         return res.status(404).json({ message: "Image not found" });
//       }

//       db.query(
//         "DELETE FROM product_images WHERE id = ?",
//         [imageId],
//         (err) => {
//           if (err) {
//             console.error("Error deleting image:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           const filePath = path.join(__dirname, "..", result[0].image_url);
//           if (fs.existsSync(filePath)) {
//             fs.unlink(filePath, (unlinkErr) => {
//               if (unlinkErr) {
//                 console.error("Error deleting file:", unlinkErr);
//               }
//             });
//           }

//           res.json({
//             message: "Image deleted successfully",
//           });
//         }
//       );
//     }
//   );
// });

// module.exports = router;




// const express = require("express");
// const router = express.Router();
// const db = require("../db");
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// // ====================================
// // CREATE UPLOAD FOLDER
// // ====================================
// const uploadDir = path.join(__dirname, '..', 'uploads', 'products');

// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir, { recursive: true });
// }

// // ====================================
// // MULTER STORAGE CONFIGURATION
// // ====================================
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadDir);
//   },
//   filename: (req, file, cb) => {
//     const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
//     cb(null, unique + path.extname(file.originalname));
//   },
// });

// // ====================================
// // MULTER INSTANCE
// // ====================================
// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024,
//   },
//   fileFilter: (req, file, cb) => {
//     const allowed = /jpeg|jpg|png|webp|gif/;
//     const ext = path.extname(file.originalname).toLowerCase();
//     if (allowed.test(ext) && allowed.test(file.mimetype)) {
//       return cb(null, true);
//     }
//     cb(new Error("Only image files are allowed"));
//   },
// });

// // ====================================
// // HELPER: PARSE JSON FIELDS
// // ====================================
// function parseJSONField(value) {
//   if (!value) return null;
//   if (typeof value === 'string') {
//     try {
//       return JSON.parse(value);
//     } catch (e) {
//       return value;
//     }
//   }
//   return value;
// }

// // ====================================
// // HELPER: STRINGIFY FOR DATABASE
// // ====================================
// function stringifyForDB(value) {
//   if (!value) return null;
//   if (typeof value === 'object') {
//     return JSON.stringify(value);
//   }
//   return value;
// }

// // ====================================
// // SAVE PRODUCT IMAGES
// // ====================================
// function saveImages(productId, files, callback) {
//   if (!files || files.length === 0) {
//     return callback(null);
//   }

//   db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
//     const hasSortOrder = columns && columns.length > 0;
    
//     if (hasSortOrder) {
//       const values = files.map((file, index) => [
//         productId,
//         `uploads/products/${file.filename}`,
//         index,
//       ]);

//       db.query(
//         `INSERT INTO product_images (product_id, image_url, sort_order) VALUES ?`,
//         [values],
//         callback
//       );
//     } else {
//       const values = files.map((file) => [
//         productId,
//         `uploads/products/${file.filename}`,
//       ]);

//       db.query(
//         `INSERT INTO product_images (product_id, image_url) VALUES ?`,
//         [values],
//         callback
//       );
//     }
//   });
// }

// // ====================================
// // HELPER: GET PRODUCT IMAGES
// // ====================================
// function getProductImages(productId, callback) {
//   db.query(
//     `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC`,
//     [productId],
//     (err, results) => {
//       if (err) {
//         if (err.code === 'ER_BAD_FIELD_ERROR') {
//           db.query(
//             `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY id ASC`,
//             [productId],
//             (err2, results2) => {
//               if (err2) {
//                 console.error("Error fetching images (fallback):", err2);
//                 return callback(err2, null);
//               }
//               const images = results2.map(row => row.image_url);
//               callback(null, images);
//             }
//           );
//         } else {
//           console.error("Error fetching images:", err);
//           callback(err, null);
//         }
//         return;
//       }
//       const images = results.map(row => row.image_url);
//       callback(null, images);
//     }
//   );
// }

// // ====================================
// // HELPER: GET PRODUCTS WITH IMAGES
// // ====================================
// function getProductsWithImages(sql, params, callback) {
//   db.query(sql, params, (err, products) => {
//     if (err) {
//       console.error("Error fetching products:", err);
//       return callback(err, null);
//     }

//     if (!products || products.length === 0) {
//       return callback(null, []);
//     }

//     let completed = 0;
//     const results = [];

//     products.forEach((product, index) => {
//       // Parse images from product_images field
//       if (product.product_images && typeof product.product_images === 'string') {
//         try {
//           product.images = JSON.parse(product.product_images);
//         } catch (e) {
//           product.images = [];
//         }
//       } else if (product.product_images && Array.isArray(product.product_images)) {
//         product.images = product.product_images;
//       } else {
//         product.images = [];
//       }

//       // Parse colors from colors field
//       if (product.colors && typeof product.colors === 'string') {
//         try {
//           product.colors = JSON.parse(product.colors);
//         } catch (e) {
//           product.colors = [];
//         }
//       } else if (product.colors && Array.isArray(product.colors)) {
//         // Already an array
//       } else {
//         product.colors = [];
//       }

//       // Parse sizes from sizes field
//       if (product.sizes && typeof product.sizes === 'string') {
//         try {
//           product.sizes = JSON.parse(product.sizes);
//         } catch (e) {
//           product.sizes = [];
//         }
//       } else if (product.sizes && Array.isArray(product.sizes)) {
//         // Already an array
//       } else {
//         product.sizes = [];
//       }

//       // Parse specifications from specifications field
//       if (product.specifications && typeof product.specifications === 'string') {
//         try {
//           product.specifications = JSON.parse(product.specifications);
//         } catch (e) {
//           product.specifications = {};
//         }
//       } else if (product.specifications && typeof product.specifications === 'object') {
//         // Already an object
//       } else {
//         product.specifications = {};
//       }

//       // Parse color_images from color_images field
//       if (product.color_images && typeof product.color_images === 'string') {
//         try {
//           product.color_images = JSON.parse(product.color_images);
//         } catch (e) {
//           product.color_images = {};
//         }
//       } else if (product.color_images && typeof product.color_images === 'object') {
//         // Already an object
//       } else {
//         product.color_images = {};
//       }

//       if (!product.images || product.images.length === 0) {
//         getProductImages(product.id, (imgErr, images) => {
//           if (imgErr) {
//             console.error("Error fetching images for product:", product.id, imgErr.message);
//           }
//           product.images = images || [];
//           results[index] = product;
//           completed++;

//           if (completed === products.length) {
//             callback(null, results);
//           }
//         });
//       } else {
//         results[index] = product;
//         completed++;
//         if (completed === products.length) {
//           callback(null, results);
//         }
//       }
//     });
//   });
// }

// // ====================================
// // TEST ENDPOINT
// // ====================================
// router.get("/test-category/:categoryId", (req, res) => {
//   const { categoryId } = req.params;
//   console.log(`TEST: Fetching products for category ${categoryId}`);
  
//   if (!categoryId || isNaN(categoryId)) {
//     return res.status(400).json({ error: "Invalid category ID" });
//   }

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_category_id = ?
//     ORDER BY p.id DESC
//   `;

//   db.query(sql, [categoryId], (err, results) => {
//     if (err) {
//       console.error("Error:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`TEST: Found ${results.length} products for category ${categoryId}`);
//     res.json({
//       success: true,
//       categoryId: categoryId,
//       count: results.length,
//       products: results
//     });
//   });
// });

// // ====================================
// // GET ALL PRODUCTS
// // ====================================
// router.get("/", (req, res) => {
//   console.log("GET /api/products - Fetching all products");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.id DESC
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching products:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`Found ${results.length} products`);
//     res.json(results);
//   });
// });

// // ====================================
// // GET PRODUCTS BY CATEGORY
// // ====================================
// router.get("/category/:categoryId", (req, res) => {
//   const { categoryId } = req.params;
//   console.log(`GET /api/products/category/${categoryId} - Fetching products by category`);

//   if (!categoryId) {
//     return res.status(400).json({ error: "Category ID is required" });
//   }

//   if (isNaN(categoryId)) {
//     console.log("Invalid category ID:", categoryId);
//     return res.status(400).json({ error: "Invalid category ID" });
//   }

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_category_id = ?
//     ORDER BY p.id DESC
//   `;

//   console.log("SQL Query:", sql);
//   console.log("SQL Params:", [categoryId]);

//   getProductsWithImages(sql, [categoryId], (err, results) => {
//     if (err) {
//       console.error("Error fetching products by category:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     console.log(`Found ${results.length} products for category ${categoryId}`);
//     res.json(results);
//   });
// });

// // ====================================
// // GET SINGLE PRODUCT
// // ====================================
// router.get("/:id", (req, res) => {
//   const productId = req.params.id;
//   console.log(`GET /api/products/${productId} - Fetching single product`);

//   if (!productId || isNaN(productId)) {
//     console.log("Invalid product ID:", productId);
//     return res.status(400).json({ error: "Invalid product ID" });
//   }

//   db.query(
//     `
//       SELECT 
//         p.*,
//         c.category_name,
//         c.id as category_id
//       FROM products p
//       LEFT JOIN product_categories c ON p.product_category_id = c.id
//       WHERE p.id = ?
//     `,
//     [productId],
//     (err, productResult) => {
//       if (err) {
//         console.error("Error fetching product:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (productResult.length === 0) {
//         return res.status(404).json({ message: "Product not found" });
//       }

//       const product = productResult[0];

//       // Parse images
//       if (product.product_images && typeof product.product_images === 'string') {
//         try {
//           product.images = JSON.parse(product.product_images);
//         } catch (e) {
//           product.images = [];
//         }
//       } else if (product.product_images && Array.isArray(product.product_images)) {
//         product.images = product.product_images;
//       } else {
//         product.images = [];
//       }

//       // Parse colors
//       if (product.colors && typeof product.colors === 'string') {
//         try {
//           product.colors = JSON.parse(product.colors);
//         } catch (e) {
//           product.colors = [];
//         }
//       } else if (product.colors && Array.isArray(product.colors)) {
//         // Already an array
//       } else {
//         product.colors = [];
//       }

//       // Parse sizes
//       if (product.sizes && typeof product.sizes === 'string') {
//         try {
//           product.sizes = JSON.parse(product.sizes);
//         } catch (e) {
//           product.sizes = [];
//         }
//       } else if (product.sizes && Array.isArray(product.sizes)) {
//         // Already an array
//       } else {
//         product.sizes = [];
//       }

//       // Parse specifications
//       if (product.specifications && typeof product.specifications === 'string') {
//         try {
//           product.specifications = JSON.parse(product.specifications);
//         } catch (e) {
//           product.specifications = {};
//         }
//       } else if (product.specifications && typeof product.specifications === 'object') {
//         // Already an object
//       } else {
//         product.specifications = {};
//       }

//       // Parse color_images
//       if (product.color_images && typeof product.color_images === 'string') {
//         try {
//           product.color_images = JSON.parse(product.color_images);
//         } catch (e) {
//           product.color_images = {};
//         }
//       } else if (product.color_images && typeof product.color_images === 'object') {
//         // Already an object
//       } else {
//         product.color_images = {};
//       }

//       // If no images found in product_images field, fetch from product_images table
//       if (!product.images || product.images.length === 0) {
//         getProductImages(productId, (imgErr, images) => {
//           if (imgErr) {
//             console.error("Error fetching product images:", imgErr);
//             product.images = [];
//           } else {
//             product.images = images || [];
//           }
//           res.json(product);
//         });
//       } else {
//         res.json(product);
//       }
//     }
//   );
// });

// // ====================================
// // CREATE PRODUCT - FIXED
// // ====================================
// router.post("/", upload.array("images", 10), (req, res) => {
//   try {
//     const {
//       product_category_id,
//       product_name,
//       product_code,
//       product_brand,
//       price,
//       available_stock,
//       dimensions,
//       specifications,
//       weight,
//       color,
//       discount,
//       product_description,
//       warranty,
//       material,
//       care_instructions,
//       is_active,
//       colors,
//       sizes,
//       color_images,
//     } = req.body;

//     if (!product_category_id) {
//       return res.status(400).json({ error: "Category is required" });
//     }
//     if (!product_name || product_name.trim() === '') {
//       return res.status(400).json({ error: "Product name is required" });
//     }

//     // Parse JSON fields
//     const parsedSpecifications = specifications ? parseJSONField(specifications) : null;
//     const parsedColors = colors ? parseJSONField(colors) : null;
//     const parsedSizes = sizes ? parseJSONField(sizes) : null;
    
//     // ─── FIX: Process color_images to use full paths ──────────────────────────
//     let parsedColorImages = null;
//     if (color_images) {
//       const rawColorImages = parseJSONField(color_images);
//       if (rawColorImages && typeof rawColorImages === 'object') {
//         parsedColorImages = {};
//         Object.keys(rawColorImages).forEach(color => {
//           const images = rawColorImages[color];
//           if (Array.isArray(images)) {
//             parsedColorImages[color] = images.map(img => {
//               if (img && typeof img === 'string') {
//                 if (img.includes('uploads/products/')) {
//                   return img;
//                 }
//                 return `uploads/products/${img}`;
//               }
//               return img;
//             });
//           }
//         });
//       }
//     }

//     console.log("Creating product with:", {
//       colors: parsedColors,
//       sizes: parsedSizes,
//       color_images: parsedColorImages
//     });

//     const sql = `
//       INSERT INTO products (
//         product_category_id, product_name, product_code, product_brand,
//         price, available_stock, dimensions, specifications,
//         weight, color, discount, product_description,
//         warranty, material, care_instructions, is_active,
//         colors, sizes, color_images
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     db.query(
//       sql,
//       [
//         product_category_id || null,
//         product_name.trim(),
//         product_code || null,
//         product_brand || null,
//         parseFloat(price) || 0,
//         parseInt(available_stock) || 0,
//         dimensions || null,
//         parsedSpecifications ? JSON.stringify(parsedSpecifications) : null,
//         weight || null,
//         color || null,
//         parseFloat(discount) || 0,
//         product_description || null,
//         warranty || null,
//         material || null,
//         care_instructions || null,
//         is_active || 1,
//         parsedColors ? JSON.stringify(parsedColors) : null,
//         parsedSizes ? JSON.stringify(parsedSizes) : null,
//         parsedColorImages ? JSON.stringify(parsedColorImages) : null,
//       ],
//       (err, result) => {
//         if (err) {
//           console.error("Error creating product:", err);
//           return res.status(500).json({ error: err.message });
//         }

//         saveImages(result.insertId, req.files, (imgErr) => {
//           if (imgErr) {
//             console.error("Error saving images:", imgErr);
//             return res.status(500).json({ error: imgErr.message });
//           }

//           res.json({
//             message: "Product created successfully",
//             id: result.insertId,
//           });
//         });
//       }
//     );
//   } catch (error) {
//     console.error("Error in product creation:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // ====================================
// // GET TRENDING PRODUCTS
// // ====================================
// router.get("/trending", (req, res) => {
//   console.log("GET /api/products/trending - Fetching trending products");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.rating DESC, p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching trending products:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // GET BEST SELLERS
// // ====================================
// router.get("/best-sellers", (req, res) => {
//   console.log("GET /api/products/best-sellers - Fetching best sellers");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.rating DESC, p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching best sellers:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // GET NEW ARRIVALS
// // ====================================
// router.get("/new-arrivals", (req, res) => {
//   console.log("GET /api/products/new-arrivals - Fetching new arrivals");
//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     ORDER BY p.id DESC
//     LIMIT 10
//   `;

//   getProductsWithImages(sql, [], (err, results) => {
//     if (err) {
//       console.error("Error fetching new arrivals:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // SEARCH PRODUCTS
// // ====================================
// router.get("/search", (req, res) => {
//   const { q } = req.query;
//   console.log(`GET /api/products/search?q=${q} - Searching products`);

//   if (!q || q.trim() === "") {
//     return res.json([]);
//   }

//   const searchTerm = `%${q.trim()}%`;

//   const sql = `
//     SELECT 
//       p.*,
//       c.category_name,
//       c.id as category_id
//     FROM products p
//     LEFT JOIN product_categories c ON p.product_category_id = c.id
//     WHERE p.product_name LIKE ? 
//     OR p.product_description LIKE ?
//     OR c.category_name LIKE ?
//     OR p.product_brand LIKE ?
//     OR p.material LIKE ?
//     ORDER BY p.id DESC
//   `;

//   getProductsWithImages(
//     sql,
//     [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm],
//     (err, results) => {
//       if (err) {
//         console.error("Error searching products:", err);
//         return res.status(500).json({ error: err.message });
//       }
//       res.json(results);
//     }
//   );
// });

// // ====================================
// // UPDATE PRODUCT - FIXED
// // ====================================
// router.put("/:id", upload.array("images", 10), (req, res) => {
//   const id = req.params.id;

//   const {
//     product_category_id,
//     product_name,
//     product_code,
//     product_brand,
//     price,
//     available_stock,
//     dimensions,
//     specifications,
//     weight,
//     color,
//     discount,
//     product_description,
//     warranty,
//     material,
//     care_instructions,
//     is_active,
//     existing_images,
//     colors,
//     sizes,
//     color_images,
//   } = req.body;

//   if (!product_category_id) {
//     return res.status(400).json({ error: "Category is required" });
//   }
//   if (!product_name || product_name.trim() === '') {
//     return res.status(400).json({ error: "Product name is required" });
//   }

//   // Parse JSON fields
//   const parsedSpecifications = specifications ? parseJSONField(specifications) : null;
//   const parsedColors = colors ? parseJSONField(colors) : null;
//   const parsedSizes = sizes ? parseJSONField(sizes) : null;
  
//   // ─── FIX: Process color_images to use full paths ──────────────────────────
//   let parsedColorImages = null;
//   if (color_images) {
//     const rawColorImages = parseJSONField(color_images);
//     if (rawColorImages && typeof rawColorImages === 'object') {
//       parsedColorImages = {};
//       Object.keys(rawColorImages).forEach(color => {
//         const images = rawColorImages[color];
//         if (Array.isArray(images)) {
//           parsedColorImages[color] = images.map(img => {
//             if (img && typeof img === 'string') {
//               if (img.includes('uploads/products/')) {
//                 return img;
//               }
//               return `uploads/products/${img}`;
//             }
//             return img;
//           });
//         }
//       });
//     }
//   }

//   console.log("Updating product with:", {
//     colors: parsedColors,
//     sizes: parsedSizes,
//     color_images: parsedColorImages
//   });

//   // Begin transaction
//   db.beginTransaction((err) => {
//     if (err) {
//       console.error("Error starting transaction:", err);
//       return res.status(500).json({ error: err.message });
//     }

//     // Update product details
//     const sql = `
//       UPDATE products
//       SET
//         product_category_id = ?,
//         product_name = ?,
//         product_code = ?,
//         product_brand = ?,
//         price = ?,
//         available_stock = ?,
//         dimensions = ?,
//         specifications = ?,
//         weight = ?,
//         color = ?,
//         discount = ?,
//         product_description = ?,
//         warranty = ?,
//         material = ?,
//         care_instructions = ?,
//         is_active = ?,
//         colors = ?,
//         sizes = ?,
//         color_images = ?
//       WHERE id = ?
//     `;

//     db.query(
//       sql,
//       [
//         product_category_id || null,
//         product_name.trim(),
//         product_code || null,
//         product_brand || null,
//         parseFloat(price) || 0,
//         parseInt(available_stock) || 0,
//         dimensions || null,
//         parsedSpecifications ? JSON.stringify(parsedSpecifications) : null,
//         weight || null,
//         color || null,
//         parseFloat(discount) || 0,
//         product_description || null,
//         warranty || null,
//         material || null,
//         care_instructions || null,
//         is_active || 1,
//         parsedColors ? JSON.stringify(parsedColors) : null,
//         parsedSizes ? JSON.stringify(parsedSizes) : null,
//         parsedColorImages ? JSON.stringify(parsedColorImages) : null,
//         id,
//       ],
//       (err) => {
//         if (err) {
//           console.error("Error updating product:", err);
//           return db.rollback(() => {
//             res.status(500).json({ error: err.message });
//           });
//         }

//         // Handle images
//         let existingImagesArray = [];
//         if (existing_images) {
//           existingImagesArray = Array.isArray(existing_images) ? existing_images : [existing_images];
//         }

//         // If we have new images, add them
//         if (req.files && req.files.length > 0) {
//           db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
//             const hasSortOrder = columns && columns.length > 0;
            
//             db.query(
//               "SELECT image_url FROM product_images WHERE product_id = ?",
//               [id],
//               (selectErr, images) => {
//                 if (selectErr) {
//                   console.error("Error fetching images:", selectErr);
//                   return db.rollback(() => {
//                     res.status(500).json({ error: selectErr.message });
//                   });
//                 }

//                 const imagesToDelete = images.filter(function(img) {
//                   return !existingImagesArray.includes(img.image_url);
//                 });

//                 if (imagesToDelete.length > 0) {
//                   const deleteValues = imagesToDelete.map(function(img) {
//                     return img.image_url;
//                   });
                  
//                   const placeholders = deleteValues.map(function() {
//                     return '?';
//                   }).join(',');
                  
//                   const deleteSql = `
//                     DELETE FROM product_images 
//                     WHERE product_id = ? AND image_url IN (${placeholders})
//                   `;
                  
//                   db.query(
//                     deleteSql,
//                     [id].concat(deleteValues),
//                     function(deleteErr) {
//                       if (deleteErr) {
//                         console.error("Error deleting images:", deleteErr);
//                         return db.rollback(function() {
//                           res.status(500).json({ error: deleteErr.message });
//                         });
//                       }
//                     }
//                   );
//                 }

//                 if (hasSortOrder) {
//                   db.query(
//                     "SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?",
//                     [id],
//                     (orderErr, orderResult) => {
//                       if (orderErr) {
//                         console.error("Error getting sort order:", orderErr);
//                         return db.rollback(() => {
//                           res.status(500).json({ error: orderErr.message });
//                         });
//                       }
//                       const startOrder = (orderResult[0].max_order || -1) + 1;
                      
//                       const values = req.files.map((file, index) => [
//                         id,
//                         `uploads/products/${file.filename}`,
//                         startOrder + index,
//                       ]);

//                       const insertSql = `
//                         INSERT INTO product_images
//                         (product_id, image_url, sort_order)
//                         VALUES ?
//                       `;

//                       db.query(insertSql, [values], (insertErr) => {
//                         if (insertErr) {
//                           console.error("Error saving images:", insertErr);
//                           return db.rollback(() => {
//                             res.status(500).json({ error: insertErr.message });
//                           });
//                         }
                        
//                         db.commit((commitErr) => {
//                           if (commitErr) {
//                             console.error("Error committing transaction:", commitErr);
//                             return db.rollback(() => {
//                               res.status(500).json({ error: commitErr.message });
//                             });
//                           }
//                           res.json({
//                             message: "Product updated successfully",
//                           });
//                         });
//                       });
//                     }
//                   );
//                 } else {
//                   const values = req.files.map((file) => [
//                     id,
//                     `uploads/products/${file.filename}`,
//                   ]);

//                   const insertSql = `
//                     INSERT INTO product_images
//                     (product_id, image_url)
//                     VALUES ?
//                   `;

//                   db.query(insertSql, [values], (insertErr) => {
//                     if (insertErr) {
//                       console.error("Error saving images:", insertErr);
//                       return db.rollback(() => {
//                         res.status(500).json({ error: insertErr.message });
//                       });
//                     }
                    
//                     db.commit((commitErr) => {
//                       if (commitErr) {
//                         console.error("Error committing transaction:", commitErr);
//                         return db.rollback(() => {
//                           res.status(500).json({ error: commitErr.message });
//                         });
//                       }
//                       res.json({
//                         message: "Product updated successfully",
//                       });
//                     });
//                   });
//                 }
//               }
//             );
//           });
//         } else {
//           if (existingImagesArray.length === 0) {
//             db.query(
//               "DELETE FROM product_images WHERE product_id = ?",
//               [id],
//               (deleteErr) => {
//                 if (deleteErr) {
//                   console.error("Error deleting images:", deleteErr);
//                   return db.rollback(() => {
//                     res.status(500).json({ error: deleteErr.message });
//                   });
//                 }
                
//                 db.commit((commitErr) => {
//                   if (commitErr) {
//                     console.error("Error committing transaction:", commitErr);
//                     return db.rollback(() => {
//                       res.status(500).json({ error: commitErr.message });
//                     });
//                   }
//                   res.json({
//                     message: "Product updated successfully",
//                   });
//                 });
//               }
//             );
//           } else {
//             db.query(
//               "SELECT image_url FROM product_images WHERE product_id = ?",
//               [id],
//               (selectErr, images) => {
//                 if (selectErr) {
//                   console.error("Error fetching images:", selectErr);
//                   return db.rollback(() => {
//                     res.status(500).json({ error: selectErr.message });
//                   });
//                 }

//                 const imagesToDelete = images.filter(function(img) {
//                   return !existingImagesArray.includes(img.image_url);
//                 });

//                 if (imagesToDelete.length > 0) {
//                   const deleteValues = imagesToDelete.map(function(img) {
//                     return img.image_url;
//                   });
                  
//                   const placeholders = deleteValues.map(function() {
//                     return '?';
//                   }).join(',');
                  
//                   const deleteSql = `
//                     DELETE FROM product_images 
//                     WHERE product_id = ? AND image_url IN (${placeholders})
//                   `;
                  
//                   db.query(
//                     deleteSql,
//                     [id].concat(deleteValues),
//                     (deleteErr) => {
//                       if (deleteErr) {
//                         console.error("Error deleting images:", deleteErr);
//                         return db.rollback(() => {
//                           res.status(500).json({ error: deleteErr.message });
//                         });
//                       }
                      
//                       db.commit((commitErr) => {
//                         if (commitErr) {
//                           console.error("Error committing transaction:", commitErr);
//                           return db.rollback(() => {
//                             res.status(500).json({ error: commitErr.message });
//                           });
//                         }
//                         res.json({
//                           message: "Product updated successfully",
//                         });
//                       });
//                     }
//                   );
//                 } else {
//                   db.commit((commitErr) => {
//                     if (commitErr) {
//                       console.error("Error committing transaction:", commitErr);
//                       return db.rollback(() => {
//                         res.status(500).json({ error: commitErr.message });
//                       });
//                     }
//                     res.json({
//                       message: "Product updated successfully",
//                     });
//                   });
//                 }
//               }
//             );
//           }
//         }
//       }
//     );
//   });
// });

// // ====================================
// // DELETE PRODUCT
// // ====================================
// router.delete("/:id", (req, res) => {
//   const productId = req.params.id;

//   db.query(
//     "SELECT image_url FROM product_images WHERE product_id = ?",
//     [productId],
//     (err, images) => {
//       if (err) {
//         console.error("Error fetching images for deletion:", err);
//       }

//       db.query(
//         `DELETE FROM product_images WHERE product_id = ?`,
//         [productId],
//         (err) => {
//           if (err) {
//             console.error("Error deleting product images:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           db.query(
//             `DELETE FROM products WHERE id = ?`,
//             [productId],
//             (err) => {
//               if (err) {
//                 console.error("Error deleting product:", err);
//                 return res.status(500).json({ error: err.message });
//               }

//               if (images && images.length > 0) {
//                 images.forEach((img) => {
//                   const filePath = path.join(__dirname, "..", img.image_url);
//                   if (fs.existsSync(filePath)) {
//                     fs.unlink(filePath, (unlinkErr) => {
//                       if (unlinkErr) {
//                         console.error("Error deleting file:", unlinkErr);
//                       }
//                     });
//                   }
//                 });
//               }

//               res.json({
//                 message: "Product deleted successfully",
//               });
//             }
//           );
//         }
//       );
//     }
//   );
// });

// // ====================================
// // UPLOAD PRODUCT IMAGES
// // ====================================
// router.post("/:id/images", upload.array("images", 10), (req, res) => {
//   const productId = req.params.id;

//   db.query(
//     "SELECT id FROM products WHERE id = ?",
//     [productId],
//     (err, result) => {
//       if (err) {
//         console.error("Error checking product:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (result.length === 0) {
//         return res.status(404).json({ message: "Product not found" });
//       }

//       db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
//         const hasSortOrder = columns && columns.length > 0;
        
//         if (hasSortOrder) {
//           db.query(
//             "SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?",
//             [productId],
//             (orderErr, orderResult) => {
//               if (orderErr) {
//                 console.error("Error getting sort order:", orderErr);
//                 return res.status(500).json({ error: orderErr.message });
//               }
//               const startOrder = (orderResult[0].max_order || -1) + 1;
              
//               const values = req.files.map((file, index) => [
//                 productId,
//                 `uploads/products/${file.filename}`,
//                 startOrder + index,
//               ]);

//               const insertSql = `
//                 INSERT INTO product_images
//                 (product_id, image_url, sort_order)
//                 VALUES ?
//               `;

//               db.query(insertSql, [values], (err) => {
//                 if (err) {
//                   console.error("Error saving images:", err);
//                   return res.status(500).json({ error: err.message });
//                 }
//                 res.json({
//                   message: "Images uploaded successfully",
//                 });
//               });
//             }
//           );
//         } else {
//           const values = req.files.map((file) => [
//             productId,
//             `uploads/products/${file.filename}`,
//           ]);

//           const insertSql = `
//             INSERT INTO product_images
//             (product_id, image_url)
//             VALUES ?
//           `;

//           db.query(insertSql, [values], (err) => {
//             if (err) {
//               console.error("Error saving images:", err);
//               return res.status(500).json({ error: err.message });
//             }
//             res.json({
//               message: "Images uploaded successfully",
//             });
//           });
//         }
//       });
//     }
//   );
// });

// // ====================================
// // DELETE PRODUCT IMAGE
// // ====================================
// router.delete("/:productId/images/:imageId", (req, res) => {
//   const { productId, imageId } = req.params;

//   db.query(
//     "SELECT image_url FROM product_images WHERE id = ? AND product_id = ?",
//     [imageId, productId],
//     (err, result) => {
//       if (err) {
//         console.error("Error fetching image:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (result.length === 0) {
//         return res.status(404).json({ message: "Image not found" });
//       }

//       db.query(
//         "DELETE FROM product_images WHERE id = ?",
//         [imageId],
//         (err) => {
//           if (err) {
//             console.error("Error deleting image:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           const filePath = path.join(__dirname, "..", result[0].image_url);
//           if (fs.existsSync(filePath)) {
//             fs.unlink(filePath, (unlinkErr) => {
//               if (unlinkErr) {
//                 console.error("Error deleting file:", unlinkErr);
//               }
//             });
//           }

//           res.json({
//             message: "Image deleted successfully",
//           });
//         }
//       );
//     }
//   );
// });

// module.exports = router;




const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ====================================
// CREATE UPLOAD FOLDER
// ====================================
const uploadDir = path.join(__dirname, '..', 'uploads', 'products');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ====================================
// MULTER STORAGE CONFIGURATION
// ====================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

// ====================================
// MULTER INSTANCE
// ====================================
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext) && allowed.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed"));
  },
});

// ====================================
// HELPER: PARSE JSON FIELDS
// ====================================
function parseJSONField(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

// ====================================
// HELPER: STRINGIFY FOR DATABASE
// ====================================
function stringifyForDB(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

// ====================================
// SAVE PRODUCT IMAGES
// ====================================
function saveImages(productId, files, callback) {
  if (!files || files.length === 0) {
    return callback(null);
  }

  db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
    const hasSortOrder = columns && columns.length > 0;
    
    if (hasSortOrder) {
      const values = files.map((file, index) => [
        productId,
        `uploads/products/${file.filename}`,
        index,
      ]);

      db.query(
        `INSERT INTO product_images (product_id, image_url, sort_order) VALUES ?`,
        [values],
        callback
      );
    } else {
      const values = files.map((file) => [
        productId,
        `uploads/products/${file.filename}`,
      ]);

      db.query(
        `INSERT INTO product_images (product_id, image_url) VALUES ?`,
        [values],
        callback
      );
    }
  });
}

// ====================================
// HELPER: GET PRODUCT IMAGES
// ====================================
function getProductImages(productId, callback) {
  db.query(
    `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC`,
    [productId],
    (err, results) => {
      if (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR') {
          db.query(
            `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY id ASC`,
            [productId],
            (err2, results2) => {
              if (err2) {
                console.error("Error fetching images (fallback):", err2);
                return callback(err2, null);
              }
              const images = results2.map(row => row.image_url);
              callback(null, images);
            }
          );
        } else {
          console.error("Error fetching images:", err);
          callback(err, null);
        }
        return;
      }
      const images = results.map(row => row.image_url);
      callback(null, images);
    }
  );
}

// ====================================
// HELPER: GET PRODUCTS WITH IMAGES
// ====================================
function getProductsWithImages(sql, params, callback) {
  db.query(sql, params, (err, products) => {
    if (err) {
      console.error("Error fetching products:", err);
      return callback(err, null);
    }

    if (!products || products.length === 0) {
      return callback(null, []);
    }

    let completed = 0;
    const results = [];

    products.forEach((product, index) => {
      // Parse images from product_images field
      if (product.product_images && typeof product.product_images === 'string') {
        try {
          product.images = JSON.parse(product.product_images);
        } catch (e) {
          product.images = [];
        }
      } else if (product.product_images && Array.isArray(product.product_images)) {
        product.images = product.product_images;
      } else {
        product.images = [];
      }

      // Parse colors from colors field
      if (product.colors && typeof product.colors === 'string') {
        try {
          product.colors = JSON.parse(product.colors);
        } catch (e) {
          product.colors = [];
        }
      } else if (product.colors && Array.isArray(product.colors)) {
        // Already an array
      } else {
        product.colors = [];
      }

      // Parse sizes from sizes field
      if (product.sizes && typeof product.sizes === 'string') {
        try {
          product.sizes = JSON.parse(product.sizes);
        } catch (e) {
          product.sizes = [];
        }
      } else if (product.sizes && Array.isArray(product.sizes)) {
        // Already an array
      } else {
        product.sizes = [];
      }

      // Parse specifications from specifications field
      if (product.specifications && typeof product.specifications === 'string') {
        try {
          product.specifications = JSON.parse(product.specifications);
        } catch (e) {
          product.specifications = {};
        }
      } else if (product.specifications && typeof product.specifications === 'object') {
        // Already an object
      } else {
        product.specifications = {};
      }

      // Parse color_images from color_images field
      if (product.color_images && typeof product.color_images === 'string') {
        try {
          product.color_images = JSON.parse(product.color_images);
        } catch (e) {
          product.color_images = {};
        }
      } else if (product.color_images && typeof product.color_images === 'object') {
        // Already an object
      } else {
        product.color_images = {};
      }

      if (!product.images || product.images.length === 0) {
        getProductImages(product.id, (imgErr, images) => {
          if (imgErr) {
            console.error("Error fetching images for product:", product.id, imgErr.message);
          }
          product.images = images || [];
          results[index] = product;
          completed++;

          if (completed === products.length) {
            callback(null, results);
          }
        });
      } else {
        results[index] = product;
        completed++;
        if (completed === products.length) {
          callback(null, results);
        }
      }
    });
  });
}

// ====================================
// TEST ENDPOINT
// ====================================
router.get("/test-category/:categoryId", (req, res) => {
  const { categoryId } = req.params;
  console.log(`TEST: Fetching products for category ${categoryId}`);
  
  if (!categoryId || isNaN(categoryId)) {
    return res.status(400).json({ error: "Invalid category ID" });
  }

  const sql = `
    SELECT 
      p.*,
      c.category_name,
      c.id as category_id
    FROM products p
    LEFT JOIN product_categories c ON p.product_category_id = c.id
    WHERE p.product_category_id = ?
    ORDER BY p.id DESC
  `;

  db.query(sql, [categoryId], (err, results) => {
    if (err) {
      console.error("Error:", err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`TEST: Found ${results.length} products for category ${categoryId}`);
    res.json({
      success: true,
      categoryId: categoryId,
      count: results.length,
      products: results
    });
  });
});

// ====================================
// GET ALL PRODUCTS
// ====================================
router.get("/", (req, res) => {
  console.log("GET /api/products - Fetching all products");
  const sql = `
    SELECT 
      p.*,
      c.category_name,
      c.id as category_id
    FROM products p
    LEFT JOIN product_categories c ON p.product_category_id = c.id
    ORDER BY p.id DESC
  `;

  getProductsWithImages(sql, [], (err, results) => {
    if (err) {
      console.error("Error fetching products:", err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`Found ${results.length} products`);
    res.json(results);
  });
});

// ====================================
// GET PRODUCTS BY CATEGORY
// ====================================
router.get("/category/:categoryId", (req, res) => {
  const { categoryId } = req.params;
  console.log(`GET /api/products/category/${categoryId} - Fetching products by category`);

  if (!categoryId) {
    return res.status(400).json({ error: "Category ID is required" });
  }

  if (isNaN(categoryId)) {
    console.log("Invalid category ID:", categoryId);
    return res.status(400).json({ error: "Invalid category ID" });
  }

  const sql = `
    SELECT 
      p.*,
      c.category_name,
      c.id as category_id
    FROM products p
    LEFT JOIN product_categories c ON p.product_category_id = c.id
    WHERE p.product_category_id = ?
    ORDER BY p.id DESC
  `;

  console.log("SQL Query:", sql);
  console.log("SQL Params:", [categoryId]);

  getProductsWithImages(sql, [categoryId], (err, results) => {
    if (err) {
      console.error("Error fetching products by category:", err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`Found ${results.length} products for category ${categoryId}`);
    res.json(results);
  });
});

// ====================================
// GET TRENDING PRODUCTS - MUST BE BEFORE /:id
// ====================================
router.get("/trending", (req, res) => {
  console.log("GET /api/products/trending - Fetching trending products");
  const sql = `
    SELECT 
      p.*,
      c.category_name,
      c.id as category_id
    FROM products p
    LEFT JOIN product_categories c ON p.product_category_id = c.id
    ORDER BY p.rating DESC, p.id DESC
    LIMIT 10
  `;

  getProductsWithImages(sql, [], (err, results) => {
    if (err) {
      console.error("Error fetching trending products:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// ====================================
// GET BEST SELLERS - MUST BE BEFORE /:id
// ====================================
router.get("/best-sellers", (req, res) => {
  console.log("GET /api/products/best-sellers - Fetching best sellers");
  const sql = `
    SELECT 
      p.*,
      c.category_name,
      c.id as category_id
    FROM products p
    LEFT JOIN product_categories c ON p.product_category_id = c.id
    ORDER BY p.rating DESC, p.id DESC
    LIMIT 10
  `;

  getProductsWithImages(sql, [], (err, results) => {
    if (err) {
      console.error("Error fetching best sellers:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// ====================================
// GET NEW ARRIVALS - MUST BE BEFORE /:id
// ====================================
router.get("/new-arrivals", (req, res) => {
  console.log("GET /api/products/new-arrivals - Fetching new arrivals");
  const sql = `
    SELECT 
      p.*,
      c.category_name,
      c.id as category_id
    FROM products p
    LEFT JOIN product_categories c ON p.product_category_id = c.id
    ORDER BY p.id DESC
    LIMIT 10
  `;

  getProductsWithImages(sql, [], (err, results) => {
    if (err) {
      console.error("Error fetching new arrivals:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// ====================================
// SEARCH PRODUCTS
// ====================================
router.get("/search", (req, res) => {
  const { q } = req.query;
  console.log(`GET /api/products/search?q=${q} - Searching products`);

  if (!q || q.trim() === "") {
    return res.json([]);
  }

  const searchTerm = `%${q.trim()}%`;

  const sql = `
    SELECT 
      p.*,
      c.category_name,
      c.id as category_id
    FROM products p
    LEFT JOIN product_categories c ON p.product_category_id = c.id
    WHERE p.product_name LIKE ? 
    OR p.product_description LIKE ?
    OR c.category_name LIKE ?
    OR p.product_brand LIKE ?
    OR p.material LIKE ?
    ORDER BY p.id DESC
  `;

  getProductsWithImages(
    sql,
    [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm],
    (err, results) => {
      if (err) {
        console.error("Error searching products:", err);
        return res.status(500).json({ error: err.message });
      }
      res.json(results);
    }
  );
});

// ====================================
// GET SINGLE PRODUCT - THIS MUST BE LAST
// ====================================
router.get("/:id", (req, res) => {
  const productId = req.params.id;
  console.log(`GET /api/products/${productId} - Fetching single product`);

  if (!productId || isNaN(productId)) {
    console.log("Invalid product ID:", productId);
    return res.status(400).json({ error: "Invalid product ID" });
  }

  db.query(
    `
      SELECT 
        p.*,
        c.category_name,
        c.id as category_id
      FROM products p
      LEFT JOIN product_categories c ON p.product_category_id = c.id
      WHERE p.id = ?
    `,
    [productId],
    (err, productResult) => {
      if (err) {
        console.error("Error fetching product:", err);
        return res.status(500).json({ error: err.message });
      }

      if (productResult.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      const product = productResult[0];

      // Parse images
      if (product.product_images && typeof product.product_images === 'string') {
        try {
          product.images = JSON.parse(product.product_images);
        } catch (e) {
          product.images = [];
        }
      } else if (product.product_images && Array.isArray(product.product_images)) {
        product.images = product.product_images;
      } else {
        product.images = [];
      }

      // Parse colors
      if (product.colors && typeof product.colors === 'string') {
        try {
          product.colors = JSON.parse(product.colors);
        } catch (e) {
          product.colors = [];
        }
      } else if (product.colors && Array.isArray(product.colors)) {
        // Already an array
      } else {
        product.colors = [];
      }

      // Parse sizes
      if (product.sizes && typeof product.sizes === 'string') {
        try {
          product.sizes = JSON.parse(product.sizes);
        } catch (e) {
          product.sizes = [];
        }
      } else if (product.sizes && Array.isArray(product.sizes)) {
        // Already an array
      } else {
        product.sizes = [];
      }

      // Parse specifications
      if (product.specifications && typeof product.specifications === 'string') {
        try {
          product.specifications = JSON.parse(product.specifications);
        } catch (e) {
          product.specifications = {};
        }
      } else if (product.specifications && typeof product.specifications === 'object') {
        // Already an object
      } else {
        product.specifications = {};
      }

      // Parse color_images
      if (product.color_images && typeof product.color_images === 'string') {
        try {
          product.color_images = JSON.parse(product.color_images);
        } catch (e) {
          product.color_images = {};
        }
      } else if (product.color_images && typeof product.color_images === 'object') {
        // Already an object
      } else {
        product.color_images = {};
      }

      // If no images found in product_images field, fetch from product_images table
      if (!product.images || product.images.length === 0) {
        getProductImages(productId, (imgErr, images) => {
          if (imgErr) {
            console.error("Error fetching product images:", imgErr);
            product.images = [];
          } else {
            product.images = images || [];
          }
          res.json(product);
        });
      } else {
        res.json(product);
      }
    }
  );
});

// ====================================
// CREATE PRODUCT - FIXED with proper color_images handling
// ====================================
router.post("/", upload.array("images", 10), (req, res) => {
  try {
    const {
      product_category_id,
      product_name,
      product_code,
      product_brand,
      price,
      available_stock,
      dimensions,
      specifications,
      weight,
      color,
      discount,
      product_description,
      warranty,
      material,
      care_instructions,
      is_active,
      colors,
      sizes,
      color_images,
    } = req.body;

    if (!product_category_id) {
      return res.status(400).json({ error: "Category is required" });
    }
    if (!product_name || product_name.trim() === '') {
      return res.status(400).json({ error: "Product name is required" });
    }

    // Parse JSON fields
    const parsedSpecifications = specifications ? parseJSONField(specifications) : null;
    const parsedColors = colors ? parseJSONField(colors) : null;
    const parsedSizes = sizes ? parseJSONField(sizes) : null;
    
    // ─── FIX: Process color_images with proper file mapping ──────────────────────────
    let parsedColorImages = null;
    if (color_images) {
      const rawColorImages = parseJSONField(color_images);
      if (rawColorImages && typeof rawColorImages === 'object') {
        parsedColorImages = {};
        Object.keys(rawColorImages).forEach(color => {
          const images = rawColorImages[color];
          if (Array.isArray(images)) {
            parsedColorImages[color] = images.map(img => {
              if (img && typeof img === 'string') {
                // Check if this file was uploaded
                const uploadedFile = req.files?.find(f => f.originalname === img);
                if (uploadedFile) {
                  return `uploads/products/${uploadedFile.filename}`;
                }
                if (img.includes('uploads/products/')) {
                  return img;
                }
                // If the file exists in the uploads folder with this name, use it
                const filePath = path.join(uploadDir, img);
                if (fs.existsSync(filePath)) {
                  return `uploads/products/${img}`;
                }
                // Otherwise, try to find a file that matches
                const filesOnDisk = fs.readdirSync(uploadDir);
                const matchingFile = filesOnDisk.find(f => f.includes(img.split('.')[0]));
                if (matchingFile) {
                  return `uploads/products/${matchingFile}`;
                }
                return `uploads/products/${img}`;
              }
              return img;
            });
          }
        });
      }
    }

    console.log("Creating product with color_images:", parsedColorImages);

    const sql = `
      INSERT INTO products (
        product_category_id, product_name, product_code, product_brand,
        price, available_stock, dimensions, specifications,
        weight, color, discount, product_description,
        warranty, material, care_instructions, is_active,
        colors, sizes, color_images
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [
        product_category_id || null,
        product_name.trim(),
        product_code || null,
        product_brand || null,
        parseFloat(price) || 0,
        parseInt(available_stock) || 0,
        dimensions || null,
        parsedSpecifications ? JSON.stringify(parsedSpecifications) : null,
        weight || null,
        color || null,
        parseFloat(discount) || 0,
        product_description || null,
        warranty || null,
        material || null,
        care_instructions || null,
        is_active || 1,
        parsedColors ? JSON.stringify(parsedColors) : null,
        parsedSizes ? JSON.stringify(parsedSizes) : null,
        parsedColorImages ? JSON.stringify(parsedColorImages) : null,
      ],
      (err, result) => {
        if (err) {
          console.error("Error creating product:", err);
          return res.status(500).json({ error: err.message });
        }

        saveImages(result.insertId, req.files, (imgErr) => {
          if (imgErr) {
            console.error("Error saving images:", imgErr);
            return res.status(500).json({ error: imgErr.message });
          }

          res.json({
            message: "Product created successfully",
            id: result.insertId,
          });
        });
      }
    );
  } catch (error) {
    console.error("Error in product creation:", error);
    res.status(500).json({ error: error.message });
  }
});

// ====================================
// UPDATE PRODUCT - FIXED with proper color_images handling
// ====================================
router.put("/:id", upload.array("images", 10), (req, res) => {
  const id = req.params.id;

  const {
    product_category_id,
    product_name,
    product_code,
    product_brand,
    price,
    available_stock,
    dimensions,
    specifications,
    weight,
    color,
    discount,
    product_description,
    warranty,
    material,
    care_instructions,
    is_active,
    existing_images,
    colors,
    sizes,
    color_images,
  } = req.body;

  if (!product_category_id) {
    return res.status(400).json({ error: "Category is required" });
  }
  if (!product_name || product_name.trim() === '') {
    return res.status(400).json({ error: "Product name is required" });
  }

  // Parse JSON fields
  const parsedSpecifications = specifications ? parseJSONField(specifications) : null;
  const parsedColors = colors ? parseJSONField(colors) : null;
  const parsedSizes = sizes ? parseJSONField(sizes) : null;
  
  // ─── FIX: Process color_images with proper file mapping ──────────────────────────
  let parsedColorImages = null;
  if (color_images) {
    const rawColorImages = parseJSONField(color_images);
    if (rawColorImages && typeof rawColorImages === 'object') {
      parsedColorImages = {};
      Object.keys(rawColorImages).forEach(color => {
        const images = rawColorImages[color];
        if (Array.isArray(images)) {
          parsedColorImages[color] = images.map(img => {
            if (img && typeof img === 'string') {
              // Check if this file was uploaded
              const uploadedFile = req.files?.find(f => f.originalname === img);
              if (uploadedFile) {
                return `uploads/products/${uploadedFile.filename}`;
              }
              if (img.includes('uploads/products/')) {
                return img;
              }
              // If the file exists in the uploads folder with this name, use it
              const filePath = path.join(uploadDir, img);
              if (fs.existsSync(filePath)) {
                return `uploads/products/${img}`;
              }
              // Otherwise, try to find a file that matches
              const filesOnDisk = fs.readdirSync(uploadDir);
              const matchingFile = filesOnDisk.find(f => f.includes(img.split('.')[0]));
              if (matchingFile) {
                return `uploads/products/${matchingFile}`;
              }
              return `uploads/products/${img}`;
            }
            return img;
          });
        }
      });
    }
  }

  console.log("Updating product with color_images:", parsedColorImages);

  // Begin transaction
  db.beginTransaction((err) => {
    if (err) {
      console.error("Error starting transaction:", err);
      return res.status(500).json({ error: err.message });
    }

    // Update product details
    const sql = `
      UPDATE products
      SET
        product_category_id = ?,
        product_name = ?,
        product_code = ?,
        product_brand = ?,
        price = ?,
        available_stock = ?,
        dimensions = ?,
        specifications = ?,
        weight = ?,
        color = ?,
        discount = ?,
        product_description = ?,
        warranty = ?,
        material = ?,
        care_instructions = ?,
        is_active = ?,
        colors = ?,
        sizes = ?,
        color_images = ?
      WHERE id = ?
    `;

    db.query(
      sql,
      [
        product_category_id || null,
        product_name.trim(),
        product_code || null,
        product_brand || null,
        parseFloat(price) || 0,
        parseInt(available_stock) || 0,
        dimensions || null,
        parsedSpecifications ? JSON.stringify(parsedSpecifications) : null,
        weight || null,
        color || null,
        parseFloat(discount) || 0,
        product_description || null,
        warranty || null,
        material || null,
        care_instructions || null,
        is_active || 1,
        parsedColors ? JSON.stringify(parsedColors) : null,
        parsedSizes ? JSON.stringify(parsedSizes) : null,
        parsedColorImages ? JSON.stringify(parsedColorImages) : null,
        id,
      ],
      (err) => {
        if (err) {
          console.error("Error updating product:", err);
          return db.rollback(() => {
            res.status(500).json({ error: err.message });
          });
        }

        // Handle images
        let existingImagesArray = [];
        if (existing_images) {
          existingImagesArray = Array.isArray(existing_images) ? existing_images : [existing_images];
        }

        // If we have new images, add them
        if (req.files && req.files.length > 0) {
          db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
            const hasSortOrder = columns && columns.length > 0;
            
            db.query(
              "SELECT image_url FROM product_images WHERE product_id = ?",
              [id],
              (selectErr, images) => {
                if (selectErr) {
                  console.error("Error fetching images:", selectErr);
                  return db.rollback(() => {
                    res.status(500).json({ error: selectErr.message });
                  });
                }

                const imagesToDelete = images.filter(function(img) {
                  return !existingImagesArray.includes(img.image_url);
                });

                if (imagesToDelete.length > 0) {
                  const deleteValues = imagesToDelete.map(function(img) {
                    return img.image_url;
                  });
                  
                  const placeholders = deleteValues.map(function() {
                    return '?';
                  }).join(',');
                  
                  const deleteSql = `
                    DELETE FROM product_images 
                    WHERE product_id = ? AND image_url IN (${placeholders})
                  `;
                  
                  db.query(
                    deleteSql,
                    [id].concat(deleteValues),
                    function(deleteErr) {
                      if (deleteErr) {
                        console.error("Error deleting images:", deleteErr);
                        return db.rollback(function() {
                          res.status(500).json({ error: deleteErr.message });
                        });
                      }
                    }
                  );
                }

                if (hasSortOrder) {
                  db.query(
                    "SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?",
                    [id],
                    (orderErr, orderResult) => {
                      if (orderErr) {
                        console.error("Error getting sort order:", orderErr);
                        return db.rollback(() => {
                          res.status(500).json({ error: orderErr.message });
                        });
                      }
                      const startOrder = (orderResult[0].max_order || -1) + 1;
                      
                      const values = req.files.map((file, index) => [
                        id,
                        `uploads/products/${file.filename}`,
                        startOrder + index,
                      ]);

                      const insertSql = `
                        INSERT INTO product_images
                        (product_id, image_url, sort_order)
                        VALUES ?
                      `;

                      db.query(insertSql, [values], (insertErr) => {
                        if (insertErr) {
                          console.error("Error saving images:", insertErr);
                          return db.rollback(() => {
                            res.status(500).json({ error: insertErr.message });
                          });
                        }
                        
                        db.commit((commitErr) => {
                          if (commitErr) {
                            console.error("Error committing transaction:", commitErr);
                            return db.rollback(() => {
                              res.status(500).json({ error: commitErr.message });
                            });
                          }
                          res.json({
                            message: "Product updated successfully",
                          });
                        });
                      });
                    }
                  );
                } else {
                  const values = req.files.map((file) => [
                    id,
                    `uploads/products/${file.filename}`,
                  ]);

                  const insertSql = `
                    INSERT INTO product_images
                    (product_id, image_url)
                    VALUES ?
                  `;

                  db.query(insertSql, [values], (insertErr) => {
                    if (insertErr) {
                      console.error("Error saving images:", insertErr);
                      return db.rollback(() => {
                        res.status(500).json({ error: insertErr.message });
                      });
                    }
                    
                    db.commit((commitErr) => {
                      if (commitErr) {
                        console.error("Error committing transaction:", commitErr);
                        return db.rollback(() => {
                          res.status(500).json({ error: commitErr.message });
                        });
                      }
                      res.json({
                        message: "Product updated successfully",
                      });
                    });
                  });
                }
              }
            );
          });
        } else {
          if (existingImagesArray.length === 0) {
            db.query(
              "DELETE FROM product_images WHERE product_id = ?",
              [id],
              (deleteErr) => {
                if (deleteErr) {
                  console.error("Error deleting images:", deleteErr);
                  return db.rollback(() => {
                    res.status(500).json({ error: deleteErr.message });
                  });
                }
                
                db.commit((commitErr) => {
                  if (commitErr) {
                    console.error("Error committing transaction:", commitErr);
                    return db.rollback(() => {
                      res.status(500).json({ error: commitErr.message });
                    });
                  }
                  res.json({
                    message: "Product updated successfully",
                  });
                });
              }
            );
          } else {
            db.query(
              "SELECT image_url FROM product_images WHERE product_id = ?",
              [id],
              (selectErr, images) => {
                if (selectErr) {
                  console.error("Error fetching images:", selectErr);
                  return db.rollback(() => {
                    res.status(500).json({ error: selectErr.message });
                  });
                }

                const imagesToDelete = images.filter(function(img) {
                  return !existingImagesArray.includes(img.image_url);
                });

                if (imagesToDelete.length > 0) {
                  const deleteValues = imagesToDelete.map(function(img) {
                    return img.image_url;
                  });
                  
                  const placeholders = deleteValues.map(function() {
                    return '?';
                  }).join(',');
                  
                  const deleteSql = `
                    DELETE FROM product_images 
                    WHERE product_id = ? AND image_url IN (${placeholders})
                  `;
                  
                  db.query(
                    deleteSql,
                    [id].concat(deleteValues),
                    (deleteErr) => {
                      if (deleteErr) {
                        console.error("Error deleting images:", deleteErr);
                        return db.rollback(() => {
                          res.status(500).json({ error: deleteErr.message });
                        });
                      }
                      
                      db.commit((commitErr) => {
                        if (commitErr) {
                          console.error("Error committing transaction:", commitErr);
                          return db.rollback(() => {
                            res.status(500).json({ error: commitErr.message });
                          });
                        }
                        res.json({
                          message: "Product updated successfully",
                        });
                      });
                    }
                  );
                } else {
                  db.commit((commitErr) => {
                    if (commitErr) {
                      console.error("Error committing transaction:", commitErr);
                      return db.rollback(() => {
                        res.status(500).json({ error: commitErr.message });
                      });
                    }
                    res.json({
                      message: "Product updated successfully",
                    });
                  });
                }
              }
            );
          }
        }
      }
    );
  });
});

// ====================================
// DELETE PRODUCT
// ====================================
router.delete("/:id", (req, res) => {
  const productId = req.params.id;

  db.query(
    "SELECT image_url FROM product_images WHERE product_id = ?",
    [productId],
    (err, images) => {
      if (err) {
        console.error("Error fetching images for deletion:", err);
      }

      db.query(
        `DELETE FROM product_images WHERE product_id = ?`,
        [productId],
        (err) => {
          if (err) {
            console.error("Error deleting product images:", err);
            return res.status(500).json({ error: err.message });
          }

          db.query(
            `DELETE FROM products WHERE id = ?`,
            [productId],
            (err) => {
              if (err) {
                console.error("Error deleting product:", err);
                return res.status(500).json({ error: err.message });
              }

              if (images && images.length > 0) {
                images.forEach((img) => {
                  const filePath = path.join(__dirname, "..", img.image_url);
                  if (fs.existsSync(filePath)) {
                    fs.unlink(filePath, (unlinkErr) => {
                      if (unlinkErr) {
                        console.error("Error deleting file:", unlinkErr);
                      }
                    });
                  }
                });
              }

              res.json({
                message: "Product deleted successfully",
              });
            }
          );
        }
      );
    }
  );
});

// ====================================
// UPLOAD PRODUCT IMAGES
// ====================================
router.post("/:id/images", upload.array("images", 10), (req, res) => {
  const productId = req.params.id;

  db.query(
    "SELECT id FROM products WHERE id = ?",
    [productId],
    (err, result) => {
      if (err) {
        console.error("Error checking product:", err);
        return res.status(500).json({ error: err.message });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      db.query("SHOW COLUMNS FROM product_images LIKE 'sort_order'", (colErr, columns) => {
        const hasSortOrder = columns && columns.length > 0;
        
        if (hasSortOrder) {
          db.query(
            "SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?",
            [productId],
            (orderErr, orderResult) => {
              if (orderErr) {
                console.error("Error getting sort order:", orderErr);
                return res.status(500).json({ error: orderErr.message });
              }
              const startOrder = (orderResult[0].max_order || -1) + 1;
              
              const values = req.files.map((file, index) => [
                productId,
                `uploads/products/${file.filename}`,
                startOrder + index,
              ]);

              const insertSql = `
                INSERT INTO product_images
                (product_id, image_url, sort_order)
                VALUES ?
              `;

              db.query(insertSql, [values], (err) => {
                if (err) {
                  console.error("Error saving images:", err);
                  return res.status(500).json({ error: err.message });
                }
                res.json({
                  message: "Images uploaded successfully",
                });
              });
            }
          );
        } else {
          const values = req.files.map((file) => [
            productId,
            `uploads/products/${file.filename}`,
          ]);

          const insertSql = `
            INSERT INTO product_images
            (product_id, image_url)
            VALUES ?
          `;

          db.query(insertSql, [values], (err) => {
            if (err) {
              console.error("Error saving images:", err);
              return res.status(500).json({ error: err.message });
            }
            res.json({
              message: "Images uploaded successfully",
            });
          });
        }
      });
    }
  );
});

// ====================================
// DELETE PRODUCT IMAGE
// ====================================
router.delete("/:productId/images/:imageId", (req, res) => {
  const { productId, imageId } = req.params;

  db.query(
    "SELECT image_url FROM product_images WHERE id = ? AND product_id = ?",
    [imageId, productId],
    (err, result) => {
      if (err) {
        console.error("Error fetching image:", err);
        return res.status(500).json({ error: err.message });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Image not found" });
      }

      db.query(
        "DELETE FROM product_images WHERE id = ?",
        [imageId],
        (err) => {
          if (err) {
            console.error("Error deleting image:", err);
            return res.status(500).json({ error: err.message });
          }

          const filePath = path.join(__dirname, "..", result[0].image_url);
          if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (unlinkErr) => {
              if (unlinkErr) {
                console.error("Error deleting file:", unlinkErr);
              }
            });
          }

          res.json({
            message: "Image deleted successfully",
          });
        }
      );
    }
  );
});

module.exports = router;