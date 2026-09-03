// // routes/packages.js
// const express = require("express");
// const router = express.Router();
// const db = require("../db");
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// // ====================================
// // CREATE UPLOAD FOLDER
// // ====================================
// const uploadDir = path.join(__dirname, '..', 'uploads', 'packages');

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

// const upload = multer({
//   storage: storage,
//   limits: { fileSize: 5 * 1024 * 1024 },
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
// // HELPER: SAFE PARSE NUMBER
// // ====================================
// function safeParseNumber(value, defaultValue = 0) {
//   if (value === undefined || value === null || value === '') {
//     return defaultValue;
//   }
//   const num = Number(value);
//   return isNaN(num) ? defaultValue : num;
// }

// // ====================================
// // HELPER: SAFE PARSE BOOLEAN
// // ====================================
// function safeParseBoolean(value) {
//   if (value === undefined || value === null) {
//     return 0;
//   }
//   if (typeof value === 'boolean') {
//     return value ? 1 : 0;
//   }
//   if (typeof value === 'string') {
//     return (value === 'true' || value === '1') ? 1 : 0;
//   }
//   return value ? 1 : 0;
// }

// // ====================================
// // GET ALL PACKAGES
// // ====================================
// router.get("/", (req, res) => {
//   const sql = `
//     SELECT 
//       p.*,
//       (SELECT COUNT(*) FROM package_images WHERE package_id = p.id) as image_count
//     FROM packages p
//     ORDER BY p.id DESC
//   `;

//   db.query(sql, (err, results) => {
//     if (err) {
//       console.error("Error fetching packages:", err);
//       return res.status(500).json({ error: err.message });
//     }

//     // Parse JSON fields
//     const packages = results.map(pkg => {
//       if (pkg.includes && typeof pkg.includes === 'string') {
//         try {
//           pkg.includes = JSON.parse(pkg.includes);
//         } catch (e) {
//           pkg.includes = [];
//         }
//       }
//       if (pkg.images && typeof pkg.images === 'string') {
//         try {
//           pkg.images = JSON.parse(pkg.images);
//         } catch (e) {
//           pkg.images = [];
//         }
//       }
//       ['catering', 'stage_decoration', 'flower_decoration', 'lighting', 'photography', 'videography', 'sound_system'].forEach(field => {
//         if (pkg[field] && typeof pkg[field] === 'string') {
//           try {
//             pkg[field] = JSON.parse(pkg[field]);
//           } catch (e) {
//             pkg[field] = false;
//           }
//         }
//       });
//       return pkg;
//     });

//     res.json(packages);
//   });
// });

// // ====================================
// // GET SINGLE PACKAGE
// // ====================================
// router.get("/:id", (req, res) => {
//   const sql = `
//     SELECT * FROM packages WHERE id = ?
//   `;

//   db.query(sql, [req.params.id], (err, results) => {
//     if (err) {
//       console.error("Error fetching package:", err);
//       return res.status(500).json({ error: err.message });
//     }

//     if (results.length === 0) {
//       return res.status(404).json({ message: "Package not found" });
//     }

//     const pkg = results[0];

//     // Parse JSON fields
//     if (pkg.includes && typeof pkg.includes === 'string') {
//       try {
//         pkg.includes = JSON.parse(pkg.includes);
//       } catch (e) {
//         pkg.includes = [];
//       }
//     }
//     if (pkg.images && typeof pkg.images === 'string') {
//       try {
//         pkg.images = JSON.parse(pkg.images);
//       } catch (e) {
//         pkg.images = [];
//       }
//     }
//     ['catering', 'stage_decoration', 'flower_decoration', 'lighting', 'photography', 'videography', 'sound_system'].forEach(field => {
//       if (pkg[field] && typeof pkg[field] === 'string') {
//         try {
//           pkg[field] = JSON.parse(pkg[field]);
//         } catch (e) {
//           pkg[field] = false;
//         }
//       }
//     });

//     res.json(pkg);
//   });
// });

// // ====================================
// // GET PACKAGES BY TIER
// // ====================================
// router.get("/tier/:tier", (req, res) => {
//   const tier = req.params.tier;
//   const sql = `
//     SELECT * FROM packages WHERE tier = ? AND is_active = 1
//   `;

//   db.query(sql, [tier], (err, results) => {
//     if (err) {
//       console.error("Error fetching packages by tier:", err);
//       return res.status(500).json({ error: err.message });
//     }

//     const packages = results.map(pkg => {
//       if (pkg.includes && typeof pkg.includes === 'string') {
//         try {
//           pkg.includes = JSON.parse(pkg.includes);
//         } catch (e) {
//           pkg.includes = [];
//         }
//       }
//       if (pkg.images && typeof pkg.images === 'string') {
//         try {
//           pkg.images = JSON.parse(pkg.images);
//         } catch (e) {
//           pkg.images = [];
//         }
//       }
//       return pkg;
//     });

//     res.json(packages);
//   });
// });

// // ====================================
// // CREATE PACKAGE - FIXED
// // ====================================
// router.post("/", upload.array("images", 10), (req, res) => {
//   try {
//     const {
//       package_name,
//       tier,
//       price,
//       original_price,
//       discount,
//       rating,
//       review_count,
//       guest_capacity,
//       description,
//       includes,
//       catering,
//       stage_decoration,
//       flower_decoration,
//       lighting,
//       photography,
//       videography,
//       sound_system,
//       dj_setup,
//       is_active
//     } = req.body;

//     console.log("📦 Creating package with:", { 
//       package_name, 
//       tier, 
//       price, 
//       original_price,
//       discount,
//       rating,
//       review_count,
//       guest_capacity,
//       description,
//       includes,
//       dj_setup,
//       is_active 
//     });

//     if (!package_name || !tier || !price) {
//       return res.status(400).json({ error: "Package name, tier, and price are required" });
//     }

//     // Parse JSON fields with safe handling
//     const parsedIncludes = includes ? parseJSONField(includes) : [];
//     const parsedCatering = catering ? parseJSONField(catering) : false;
//     const parsedStageDecoration = stage_decoration ? parseJSONField(stage_decoration) : false;
//     const parsedFlowerDecoration = flower_decoration ? parseJSONField(flower_decoration) : false;
//     const parsedLighting = lighting ? parseJSONField(lighting) : false;
//     const parsedPhotography = photography ? parseJSONField(photography) : false;
//     const parsedVideography = videography ? parseJSONField(videography) : false;
//     const parsedSoundSystem = sound_system ? parseJSONField(sound_system) : false;

//     // Process images
//     let imageUrls = [];
//     if (req.files && req.files.length > 0) {
//       imageUrls = req.files.map(file => `uploads/packages/${file.filename}`);
//     }

//     // Safely parse all numeric values
//     const safePrice = safeParseNumber(price, 0);
//     const safeOriginalPrice = safeParseNumber(original_price, safePrice);
//     const safeDiscount = safeParseNumber(discount, 0);
//     const safeRating = safeParseNumber(rating, 0);
//     const safeReviewCount = safeParseNumber(review_count, 0);
//     const safeGuestCapacity = safeParseNumber(guest_capacity, 0);
//     const safeDjSetup = safeParseBoolean(dj_setup);
//     const safeIsActive = safeParseBoolean(is_active);

//     const sql = `
//       INSERT INTO packages (
//         package_name, tier, price, original_price, discount,
//         rating, review_count, guest_capacity, description,
//         includes, images, catering, stage_decoration,
//         flower_decoration, lighting, photography,
//         videography, sound_system, dj_setup, is_active
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     const values = [
//       package_name.trim(),
//       tier,
//       safePrice,
//       safeOriginalPrice,
//       safeDiscount,
//       safeRating,
//       safeReviewCount,
//       safeGuestCapacity,
//       description || null,
//       JSON.stringify(parsedIncludes),
//       JSON.stringify(imageUrls),
//       JSON.stringify(parsedCatering),
//       JSON.stringify(parsedStageDecoration),
//       JSON.stringify(parsedFlowerDecoration),
//       JSON.stringify(parsedLighting),
//       JSON.stringify(parsedPhotography),
//       JSON.stringify(parsedVideography),
//       JSON.stringify(parsedSoundSystem),
//       safeDjSetup,
//       safeIsActive,
//     ];

//     console.log("📦 SQL Values:", values);

//     db.query(sql, values, (err, result) => {
//       if (err) {
//         console.error("Error creating package:", err);
//         return res.status(500).json({ error: err.message, sql: sql, values: values });
//       }

//       res.json({
//         message: "Package created successfully",
//         id: result.insertId,
//       });
//     });
//   } catch (error) {
//     console.error("Error in package creation:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // ====================================
// // UPDATE PACKAGE - FIXED
// // ====================================
// router.put("/:id", upload.array("images", 10), (req, res) => {
//   try {
//     const id = req.params.id;
//     const {
//       package_name,
//       tier,
//       price,
//       original_price,
//       discount,
//       rating,
//       review_count,
//       guest_capacity,
//       description,
//       includes,
//       catering,
//       stage_decoration,
//       flower_decoration,
//       lighting,
//       photography,
//       videography,
//       sound_system,
//       dj_setup,
//       is_active,
//       existing_images
//     } = req.body;

//     console.log("📦 Updating package:", { id, package_name, tier, price });

//     if (!package_name || !tier || !price) {
//       return res.status(400).json({ error: "Package name, tier, and price are required" });
//     }

//     // Parse JSON fields
//     const parsedIncludes = includes ? parseJSONField(includes) : [];
//     const parsedCatering = catering ? parseJSONField(catering) : false;
//     const parsedStageDecoration = stage_decoration ? parseJSONField(stage_decoration) : false;
//     const parsedFlowerDecoration = flower_decoration ? parseJSONField(flower_decoration) : false;
//     const parsedLighting = lighting ? parseJSONField(lighting) : false;
//     const parsedPhotography = photography ? parseJSONField(photography) : false;
//     const parsedVideography = videography ? parseJSONField(videography) : false;
//     const parsedSoundSystem = sound_system ? parseJSONField(sound_system) : false;

//     // Safely parse all numeric values
//     const safePrice = safeParseNumber(price, 0);
//     const safeOriginalPrice = safeParseNumber(original_price, safePrice);
//     const safeDiscount = safeParseNumber(discount, 0);
//     const safeRating = safeParseNumber(rating, 0);
//     const safeReviewCount = safeParseNumber(review_count, 0);
//     const safeGuestCapacity = safeParseNumber(guest_capacity, 0);
//     const safeDjSetup = safeParseBoolean(dj_setup);
//     const safeIsActive = safeParseBoolean(is_active);

//     // Handle existing images
//     let existingImagesArray = [];
//     if (existing_images) {
//       existingImagesArray = Array.isArray(existing_images) ? existing_images : [existing_images];
//     }

//     // Get current images
//     db.query(
//       "SELECT images FROM packages WHERE id = ?",
//       [id],
//       (err, results) => {
//         if (err) {
//           console.error("Error fetching package:", err);
//           return res.status(500).json({ error: err.message });
//         }

//         let currentImages = [];
//         if (results.length > 0 && results[0].images) {
//           try {
//             currentImages = JSON.parse(results[0].images);
//           } catch (e) {
//             currentImages = [];
//           }
//         }

//         // Keep images that are in existing_images
//         const keptImages = currentImages.filter(img => existingImagesArray.includes(img));

//         // Add new images
//         let newImageUrls = [];
//         if (req.files && req.files.length > 0) {
//           newImageUrls = req.files.map(file => `uploads/packages/${file.filename}`);
//         }

//         const allImages = [...keptImages, ...newImageUrls];

//         const sql = `
//           UPDATE packages
//           SET
//             package_name = ?,
//             tier = ?,
//             price = ?,
//             original_price = ?,
//             discount = ?,
//             rating = ?,
//             review_count = ?,
//             guest_capacity = ?,
//             description = ?,
//             includes = ?,
//             images = ?,
//             catering = ?,
//             stage_decoration = ?,
//             flower_decoration = ?,
//             lighting = ?,
//             photography = ?,
//             videography = ?,
//             sound_system = ?,
//             dj_setup = ?,
//             is_active = ?
//           WHERE id = ?
//         `;

//         const values = [
//           package_name.trim(),
//           tier,
//           safePrice,
//           safeOriginalPrice,
//           safeDiscount,
//           safeRating,
//           safeReviewCount,
//           safeGuestCapacity,
//           description || null,
//           JSON.stringify(parsedIncludes),
//           JSON.stringify(allImages),
//           JSON.stringify(parsedCatering),
//           JSON.stringify(parsedStageDecoration),
//           JSON.stringify(parsedFlowerDecoration),
//           JSON.stringify(parsedLighting),
//           JSON.stringify(parsedPhotography),
//           JSON.stringify(parsedVideography),
//           JSON.stringify(parsedSoundSystem),
//           safeDjSetup,
//           safeIsActive,
//           id,
//         ];

//         db.query(sql, values, (err) => {
//           if (err) {
//             console.error("Error updating package:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           res.json({
//             message: "Package updated successfully",
//           });
//         });
//       }
//     );
//   } catch (error) {
//     console.error("Error in package update:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // ====================================
// // DELETE PACKAGE
// // ====================================
// router.delete("/:id", (req, res) => {
//   const id = req.params.id;

//   db.query(
//     "SELECT images FROM packages WHERE id = ?",
//     [id],
//     (err, results) => {
//       if (err) {
//         console.error("Error fetching package for deletion:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (results.length === 0) {
//         return res.status(404).json({ message: "Package not found" });
//       }

//       let images = [];
//       if (results[0].images) {
//         try {
//           images = JSON.parse(results[0].images);
//         } catch (e) {}
//       }

//       db.query(
//         "DELETE FROM packages WHERE id = ?",
//         [id],
//         (err) => {
//           if (err) {
//             console.error("Error deleting package:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           images.forEach(img => {
//             const filePath = path.join(__dirname, "..", img);
//             if (fs.existsSync(filePath)) {
//               fs.unlink(filePath, (unlinkErr) => {
//                 if (unlinkErr) {
//                   console.error("Error deleting file:", unlinkErr);
//                 }
//               });
//             }
//           });

//           res.json({
//             message: "Package deleted successfully",
//           });
//         }
//       );
//     }
//   );
// });

// module.exports = router;



// // routes/packages.js
// const express = require("express");
// const router = express.Router();
// const db = require("../db");
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// // ====================================
// // CREATE UPLOAD FOLDER
// // ====================================
// const uploadDir = path.join(__dirname, '..', 'uploads', 'packages');

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

// const upload = multer({
//   storage: storage,
//   limits: { fileSize: 5 * 1024 * 1024 },
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
// // HELPER: SAFE PARSE NUMBER
// // ====================================
// function safeParseNumber(value, defaultValue = 0) {
//   if (value === undefined || value === null || value === '') {
//     return defaultValue;
//   }
//   const num = Number(value);
//   return isNaN(num) ? defaultValue : num;
// }

// // ====================================
// // HELPER: SAFE PARSE BOOLEAN
// // ====================================
// function safeParseBoolean(value) {
//   if (value === undefined || value === null) {
//     return 0;
//   }
//   if (typeof value === 'boolean') {
//     return value ? 1 : 0;
//   }
//   if (typeof value === 'string') {
//     return (value === 'true' || value === '1') ? 1 : 0;
//   }
//   return value ? 1 : 0;
// }

// // ====================================
// // GET ALL PACKAGES
// // ====================================
// router.get("/", (req, res) => {
//   const sql = `
//     SELECT 
//       p.*,
//       (SELECT COUNT(*) FROM package_images WHERE package_id = p.id) as image_count,
//       (SELECT COUNT(*) FROM package_addons WHERE package_id = p.id) as addon_count
//     FROM packages p
//     ORDER BY p.id DESC
//   `;

//   db.query(sql, (err, results) => {
//     if (err) {
//       console.error("Error fetching packages:", err);
//       return res.status(500).json({ error: err.message });
//     }

//     const packages = results.map(pkg => {
//       if (pkg.includes && typeof pkg.includes === 'string') {
//         try {
//           pkg.includes = JSON.parse(pkg.includes);
//         } catch (e) {
//           pkg.includes = [];
//         }
//       }
//       if (pkg.images && typeof pkg.images === 'string') {
//         try {
//           pkg.images = JSON.parse(pkg.images);
//         } catch (e) {
//           pkg.images = [];
//         }
//       }
//       ['catering', 'stage_decoration', 'flower_decoration', 'lighting', 'photography', 'videography', 'sound_system'].forEach(field => {
//         if (pkg[field] && typeof pkg[field] === 'string') {
//           try {
//             pkg[field] = JSON.parse(pkg[field]);
//           } catch (e) {
//             pkg[field] = false;
//           }
//         }
//       });
//       return pkg;
//     });

//     res.json(packages);
//   });
// });

// // ====================================
// // GET SINGLE PACKAGE
// // ====================================
// router.get("/:id", (req, res) => {
//   const sql = `
//     SELECT * FROM packages WHERE id = ?
//   `;

//   db.query(sql, [req.params.id], (err, results) => {
//     if (err) {
//       console.error("Error fetching package:", err);
//       return res.status(500).json({ error: err.message });
//     }

//     if (results.length === 0) {
//       return res.status(404).json({ message: "Package not found" });
//     }

//     const pkg = results[0];

//     if (pkg.includes && typeof pkg.includes === 'string') {
//       try {
//         pkg.includes = JSON.parse(pkg.includes);
//       } catch (e) {
//         pkg.includes = [];
//       }
//     }
//     if (pkg.images && typeof pkg.images === 'string') {
//       try {
//         pkg.images = JSON.parse(pkg.images);
//       } catch (e) {
//         pkg.images = [];
//       }
//     }
//     ['catering', 'stage_decoration', 'flower_decoration', 'lighting', 'photography', 'videography', 'sound_system'].forEach(field => {
//       if (pkg[field] && typeof pkg[field] === 'string') {
//         try {
//           pkg[field] = JSON.parse(pkg[field]);
//         } catch (e) {
//           pkg[field] = false;
//         }
//       }
//     });

//     res.json(pkg);
//   });
// });

// // ====================================
// // GET PACKAGES BY TIER
// // ====================================
// router.get("/tier/:tier", (req, res) => {
//   const tier = req.params.tier;
//   const sql = `
//     SELECT * FROM packages WHERE tier = ? AND is_active = 1
//   `;

//   db.query(sql, [tier], (err, results) => {
//     if (err) {
//       console.error("Error fetching packages by tier:", err);
//       return res.status(500).json({ error: err.message });
//     }

//     const packages = results.map(pkg => {
//       if (pkg.includes && typeof pkg.includes === 'string') {
//         try {
//           pkg.includes = JSON.parse(pkg.includes);
//         } catch (e) {
//           pkg.includes = [];
//         }
//       }
//       if (pkg.images && typeof pkg.images === 'string') {
//         try {
//           pkg.images = JSON.parse(pkg.images);
//         } catch (e) {
//           pkg.images = [];
//         }
//       }
//       return pkg;
//     });

//     res.json(packages);
//   });
// });

// // ====================================
// // GET ADD-ONS FOR A PACKAGE
// // ====================================
// router.get("/:id/addons", (req, res) => {
//   const packageId = req.params.id;

//   const sql = `
//     SELECT 
//       a.*,
//       pa.is_default
//     FROM addons a
//     INNER JOIN package_addons pa ON a.id = pa.addon_id
//     WHERE pa.package_id = ? AND a.is_active = 1
//     ORDER BY pa.is_default DESC, a.category, a.name
//   `;

//   db.query(sql, [packageId], (err, results) => {
//     if (err) {
//       console.error("Error fetching package add-ons:", err);
//       return res.status(500).json({ error: err.message });
//     }
//     res.json(results);
//   });
// });

// // ====================================
// // UPDATE PACKAGE ADD-ONS
// // ====================================
// router.post("/:id/addons", (req, res) => {
//   const packageId = req.params.id;
//   const { addon_ids } = req.body;

//   if (!addon_ids || !Array.isArray(addon_ids)) {
//     return res.status(400).json({ error: "addon_ids array is required" });
//   }

//   db.beginTransaction((err) => {
//     if (err) {
//       console.error("Error starting transaction:", err);
//       return res.status(500).json({ error: err.message });
//     }

//     db.query(
//       "DELETE FROM package_addons WHERE package_id = ?",
//       [packageId],
//       (err) => {
//         if (err) {
//           console.error("Error deleting package add-ons:", err);
//           return db.rollback(() => {
//             res.status(500).json({ error: err.message });
//           });
//         }

//         if (addon_ids.length > 0) {
//           const values = addon_ids.map(addonId => [packageId, addonId, 0]);
//           const sql = `
//             INSERT INTO package_addons (package_id, addon_id, is_default)
//             VALUES ?
//           `;

//           db.query(sql, [values], (err) => {
//             if (err) {
//               console.error("Error inserting package add-ons:", err);
//               return db.rollback(() => {
//                 res.status(500).json({ error: err.message });
//               });
//             }

//             db.commit((err) => {
//               if (err) {
//                 console.error("Error committing transaction:", err);
//                 return db.rollback(() => {
//                   res.status(500).json({ error: err.message });
//                 });
//               }
//               res.json({
//                 message: "Package add-ons updated successfully",
//               });
//             });
//           });
//         } else {
//           db.commit((err) => {
//             if (err) {
//               console.error("Error committing transaction:", err);
//               return db.rollback(() => {
//                 res.status(500).json({ error: err.message });
//               });
//             }
//             res.json({
//               message: "Package add-ons updated successfully",
//             });
//           });
//         }
//       }
//     );
//   });
// });

// // ====================================
// // TOGGLE DEFAULT ADD-ON
// // ====================================
// router.patch("/:packageId/addons/:addonId/default", (req, res) => {
//   const { packageId, addonId } = req.params;
//   const { is_default } = req.body;

//   db.query(
//     "UPDATE package_addons SET is_default = ? WHERE package_id = ? AND addon_id = ?",
//     [is_default ? 1 : 0, packageId, addonId],
//     (err) => {
//       if (err) {
//         console.error("Error updating default add-on:", err);
//         return res.status(500).json({ error: err.message });
//       }
//       res.json({
//         message: "Default add-on updated successfully",
//       });
//     }
//   );
// });

// // ====================================
// // CREATE PACKAGE
// // ====================================
// router.post("/", upload.array("images", 10), (req, res) => {
//   try {
//     const {
//       package_name,
//       tier,
//       price,
//       original_price,
//       discount,
//       rating,
//       review_count,
//       guest_capacity,
//       description,
//       includes,
//       catering,
//       stage_decoration,
//       flower_decoration,
//       lighting,
//       photography,
//       videography,
//       sound_system,
//       dj_setup,
//       is_active,
//       addon_ids
//     } = req.body;

//     console.log("📦 Creating package with:", { 
//       package_name, 
//       tier, 
//       price, 
//       original_price,
//       discount,
//       rating,
//       review_count,
//       guest_capacity,
//       description,
//       includes,
//       dj_setup,
//       is_active,
//       addon_ids
//     });

//     if (!package_name || !tier || !price) {
//       return res.status(400).json({ error: "Package name, tier, and price are required" });
//     }

//     const parsedIncludes = includes ? parseJSONField(includes) : [];
//     const parsedCatering = catering ? parseJSONField(catering) : false;
//     const parsedStageDecoration = stage_decoration ? parseJSONField(stage_decoration) : false;
//     const parsedFlowerDecoration = flower_decoration ? parseJSONField(flower_decoration) : false;
//     const parsedLighting = lighting ? parseJSONField(lighting) : false;
//     const parsedPhotography = photography ? parseJSONField(photography) : false;
//     const parsedVideography = videography ? parseJSONField(videography) : false;
//     const parsedSoundSystem = sound_system ? parseJSONField(sound_system) : false;

//     let imageUrls = [];
//     if (req.files && req.files.length > 0) {
//       imageUrls = req.files.map(file => `uploads/packages/${file.filename}`);
//     }

//     const safePrice = safeParseNumber(price, 0);
//     const safeOriginalPrice = safeParseNumber(original_price, safePrice);
//     const safeDiscount = safeParseNumber(discount, 0);
//     const safeRating = safeParseNumber(rating, 0);
//     const safeReviewCount = safeParseNumber(review_count, 0);
//     const safeGuestCapacity = safeParseNumber(guest_capacity, 0);
//     const safeDjSetup = safeParseBoolean(dj_setup);
//     const safeIsActive = safeParseBoolean(is_active);

//     const sql = `
//       INSERT INTO packages (
//         package_name, tier, price, original_price, discount,
//         rating, review_count, guest_capacity, description,
//         includes, images, catering, stage_decoration,
//         flower_decoration, lighting, photography,
//         videography, sound_system, dj_setup, is_active
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     const values = [
//       package_name.trim(),
//       tier,
//       safePrice,
//       safeOriginalPrice,
//       safeDiscount,
//       safeRating,
//       safeReviewCount,
//       safeGuestCapacity,
//       description || null,
//       JSON.stringify(parsedIncludes),
//       JSON.stringify(imageUrls),
//       JSON.stringify(parsedCatering),
//       JSON.stringify(parsedStageDecoration),
//       JSON.stringify(parsedFlowerDecoration),
//       JSON.stringify(parsedLighting),
//       JSON.stringify(parsedPhotography),
//       JSON.stringify(parsedVideography),
//       JSON.stringify(parsedSoundSystem),
//       safeDjSetup,
//       safeIsActive,
//     ];

//     console.log("📦 SQL Values:", values);

//     db.query(sql, values, (err, result) => {
//       if (err) {
//         console.error("Error creating package:", err);
//         return res.status(500).json({ error: err.message, sql: sql, values: values });
//       }

//       // ─── Handle add-ons ──────────────────────────────────────────────
//       let parsedAddonIds = [];
//       if (addon_ids) {
//         try {
//           parsedAddonIds = typeof addon_ids === 'string' ? JSON.parse(addon_ids) : addon_ids;
//         } catch (e) {
//           parsedAddonIds = [];
//         }
//       }

//       if (parsedAddonIds && parsedAddonIds.length > 0) {
//         const addonValues = parsedAddonIds.map(addonId => [result.insertId, addonId, 0]);
//         db.query(
//           "INSERT INTO package_addons (package_id, addon_id, is_default) VALUES ?",
//           [addonValues],
//           (addonErr) => {
//             if (addonErr) {
//               console.error("Error adding package add-ons:", addonErr);
//               // Don't fail the whole request, just log the error
//             }
//             res.json({
//               message: "Package created successfully",
//               id: result.insertId,
//             });
//           }
//         );
//       } else {
//         res.json({
//           message: "Package created successfully",
//           id: result.insertId,
//         });
//       }
//     });
//   } catch (error) {
//     console.error("Error in package creation:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // ====================================
// // UPDATE PACKAGE
// // ====================================
// router.put("/:id", upload.array("images", 10), (req, res) => {
//   try {
//     const id = req.params.id;
//     const {
//       package_name,
//       tier,
//       price,
//       original_price,
//       discount,
//       rating,
//       review_count,
//       guest_capacity,
//       description,
//       includes,
//       catering,
//       stage_decoration,
//       flower_decoration,
//       lighting,
//       photography,
//       videography,
//       sound_system,
//       dj_setup,
//       is_active,
//       existing_images,
//       addon_ids
//     } = req.body;

//     console.log("📦 Updating package:", { id, package_name, tier, price, addon_ids });

//     if (!package_name || !tier || !price) {
//       return res.status(400).json({ error: "Package name, tier, and price are required" });
//     }

//     const parsedIncludes = includes ? parseJSONField(includes) : [];
//     const parsedCatering = catering ? parseJSONField(catering) : false;
//     const parsedStageDecoration = stage_decoration ? parseJSONField(stage_decoration) : false;
//     const parsedFlowerDecoration = flower_decoration ? parseJSONField(flower_decoration) : false;
//     const parsedLighting = lighting ? parseJSONField(lighting) : false;
//     const parsedPhotography = photography ? parseJSONField(photography) : false;
//     const parsedVideography = videography ? parseJSONField(videography) : false;
//     const parsedSoundSystem = sound_system ? parseJSONField(sound_system) : false;

//     const safePrice = safeParseNumber(price, 0);
//     const safeOriginalPrice = safeParseNumber(original_price, safePrice);
//     const safeDiscount = safeParseNumber(discount, 0);
//     const safeRating = safeParseNumber(rating, 0);
//     const safeReviewCount = safeParseNumber(review_count, 0);
//     const safeGuestCapacity = safeParseNumber(guest_capacity, 0);
//     const safeDjSetup = safeParseBoolean(dj_setup);
//     const safeIsActive = safeParseBoolean(is_active);

//     let existingImagesArray = [];
//     if (existing_images) {
//       existingImagesArray = Array.isArray(existing_images) ? existing_images : [existing_images];
//     }

//     db.query(
//       "SELECT images FROM packages WHERE id = ?",
//       [id],
//       (err, results) => {
//         if (err) {
//           console.error("Error fetching package:", err);
//           return res.status(500).json({ error: err.message });
//         }

//         let currentImages = [];
//         if (results.length > 0 && results[0].images) {
//           try {
//             currentImages = JSON.parse(results[0].images);
//           } catch (e) {
//             currentImages = [];
//           }
//         }

//         const keptImages = currentImages.filter(img => existingImagesArray.includes(img));

//         let newImageUrls = [];
//         if (req.files && req.files.length > 0) {
//           newImageUrls = req.files.map(file => `uploads/packages/${file.filename}`);
//         }

//         const allImages = [...keptImages, ...newImageUrls];

//         const sql = `
//           UPDATE packages
//           SET
//             package_name = ?,
//             tier = ?,
//             price = ?,
//             original_price = ?,
//             discount = ?,
//             rating = ?,
//             review_count = ?,
//             guest_capacity = ?,
//             description = ?,
//             includes = ?,
//             images = ?,
//             catering = ?,
//             stage_decoration = ?,
//             flower_decoration = ?,
//             lighting = ?,
//             photography = ?,
//             videography = ?,
//             sound_system = ?,
//             dj_setup = ?,
//             is_active = ?
//           WHERE id = ?
//         `;

//         const values = [
//           package_name.trim(),
//           tier,
//           safePrice,
//           safeOriginalPrice,
//           safeDiscount,
//           safeRating,
//           safeReviewCount,
//           safeGuestCapacity,
//           description || null,
//           JSON.stringify(parsedIncludes),
//           JSON.stringify(allImages),
//           JSON.stringify(parsedCatering),
//           JSON.stringify(parsedStageDecoration),
//           JSON.stringify(parsedFlowerDecoration),
//           JSON.stringify(parsedLighting),
//           JSON.stringify(parsedPhotography),
//           JSON.stringify(parsedVideography),
//           JSON.stringify(parsedSoundSystem),
//           safeDjSetup,
//           safeIsActive,
//           id,
//         ];

//         db.query(sql, values, (err) => {
//           if (err) {
//             console.error("Error updating package:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           // ─── Handle add-ons update ──────────────────────────────────────
//           let parsedAddonIds = [];
//           if (addon_ids) {
//             try {
//               parsedAddonIds = typeof addon_ids === 'string' ? JSON.parse(addon_ids) : addon_ids;
//             } catch (e) {
//               parsedAddonIds = [];
//             }
//           }

//           // Delete existing add-ons
//           db.query(
//             "DELETE FROM package_addons WHERE package_id = ?",
//             [id],
//             (deleteErr) => {
//               if (deleteErr) {
//                 console.error("Error deleting package add-ons:", deleteErr);
//                 // Continue anyway
//               }

//               // Insert new add-ons
//               if (parsedAddonIds && parsedAddonIds.length > 0) {
//                 const addonValues = parsedAddonIds.map(addonId => [id, addonId, 0]);
//                 db.query(
//                   "INSERT INTO package_addons (package_id, addon_id, is_default) VALUES ?",
//                   [addonValues],
//                   (addonErr) => {
//                     if (addonErr) {
//                       console.error("Error adding package add-ons:", addonErr);
//                     }
//                     res.json({
//                       message: "Package updated successfully",
//                     });
//                   }
//                 );
//               } else {
//                 res.json({
//                   message: "Package updated successfully",
//                 });
//               }
//             }
//           );
//         });
//       }
//     );
//   } catch (error) {
//     console.error("Error in package update:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // ====================================
// // DELETE PACKAGE
// // ====================================
// router.delete("/:id", (req, res) => {
//   const id = req.params.id;

//   db.query(
//     "SELECT images FROM packages WHERE id = ?",
//     [id],
//     (err, results) => {
//       if (err) {
//         console.error("Error fetching package for deletion:", err);
//         return res.status(500).json({ error: err.message });
//       }

//       if (results.length === 0) {
//         return res.status(404).json({ message: "Package not found" });
//       }

//       let images = [];
//       if (results[0].images) {
//         try {
//           images = JSON.parse(results[0].images);
//         } catch (e) {}
//       }

//       // Delete package add-ons first (foreign key constraint)
//       db.query(
//         "DELETE FROM package_addons WHERE package_id = ?",
//         [id],
//         (err) => {
//           if (err) {
//             console.error("Error deleting package add-ons:", err);
//             return res.status(500).json({ error: err.message });
//           }

//           // Delete package
//           db.query(
//             "DELETE FROM packages WHERE id = ?",
//             [id],
//             (err) => {
//               if (err) {
//                 console.error("Error deleting package:", err);
//                 return res.status(500).json({ error: err.message });
//               }

//               // Delete image files
//               images.forEach(img => {
//                 const filePath = path.join(__dirname, "..", img);
//                 if (fs.existsSync(filePath)) {
//                   fs.unlink(filePath, (unlinkErr) => {
//                     if (unlinkErr) {
//                       console.error("Error deleting file:", unlinkErr);
//                     }
//                   });
//                 }
//               });

//               res.json({
//                 message: "Package deleted successfully",
//               });
//             }
//           );
//         }
//       );
//     }
//   );
// });

// module.exports = router;




// routes/packages.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ====================================
// CREATE UPLOAD FOLDER
// ====================================
const uploadDir = path.join(__dirname, '..', 'uploads', 'packages');

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

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
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
// HELPER: SAFE PARSE NUMBER
// ====================================
function safeParseNumber(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

// ====================================
// HELPER: SAFE PARSE BOOLEAN
// ====================================
function safeParseBoolean(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'string') {
    return (value === 'true' || value === '1') ? 1 : 0;
  }
  return value ? 1 : 0;
}

// ====================================
// GET ALL PACKAGES
// ====================================
router.get("/", (req, res) => {
  const sql = `
    SELECT 
      p.*,
      (SELECT COUNT(*) FROM package_images WHERE package_id = p.id) as image_count,
      (SELECT COUNT(*) FROM package_addons WHERE package_id = p.id) as addon_count
    FROM packages p
    ORDER BY p.id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching packages:", err);
      return res.status(500).json({ error: err.message });
    }

    const packages = results.map(pkg => {
      if (pkg.includes && typeof pkg.includes === 'string') {
        try {
          pkg.includes = JSON.parse(pkg.includes);
        } catch (e) {
          pkg.includes = [];
        }
      }
      if (pkg.images && typeof pkg.images === 'string') {
        try {
          pkg.images = JSON.parse(pkg.images);
        } catch (e) {
          pkg.images = [];
        }
      }
      ['catering', 'stage_decoration', 'flower_decoration', 'lighting', 'photography', 'videography', 'sound_system'].forEach(field => {
        if (pkg[field] && typeof pkg[field] === 'string') {
          try {
            pkg[field] = JSON.parse(pkg[field]);
          } catch (e) {
            pkg[field] = false;
          }
        }
      });
      return pkg;
    });

    res.json(packages);
  });
});

// ====================================
// GET SINGLE PACKAGE
// ====================================
router.get("/:id", (req, res) => {
  const sql = `
    SELECT * FROM packages WHERE id = ?
  `;

  db.query(sql, [req.params.id], (err, results) => {
    if (err) {
      console.error("Error fetching package:", err);
      return res.status(500).json({ error: err.message });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Package not found" });
    }

    const pkg = results[0];

    if (pkg.includes && typeof pkg.includes === 'string') {
      try {
        pkg.includes = JSON.parse(pkg.includes);
      } catch (e) {
        pkg.includes = [];
      }
    }
    if (pkg.images && typeof pkg.images === 'string') {
      try {
        pkg.images = JSON.parse(pkg.images);
      } catch (e) {
        pkg.images = [];
      }
    }
    ['catering', 'stage_decoration', 'flower_decoration', 'lighting', 'photography', 'videography', 'sound_system'].forEach(field => {
      if (pkg[field] && typeof pkg[field] === 'string') {
        try {
          pkg[field] = JSON.parse(pkg[field]);
        } catch (e) {
          pkg[field] = false;
        }
      }
    });

    res.json(pkg);
  });
});

// ====================================
// GET PACKAGES BY TIER
// ====================================
router.get("/tier/:tier", (req, res) => {
  const tier = req.params.tier;
  const sql = `
    SELECT * FROM packages WHERE tier = ? AND is_active = 1
  `;

  db.query(sql, [tier], (err, results) => {
    if (err) {
      console.error("Error fetching packages by tier:", err);
      return res.status(500).json({ error: err.message });
    }

    const packages = results.map(pkg => {
      if (pkg.includes && typeof pkg.includes === 'string') {
        try {
          pkg.includes = JSON.parse(pkg.includes);
        } catch (e) {
          pkg.includes = [];
        }
      }
      if (pkg.images && typeof pkg.images === 'string') {
        try {
          pkg.images = JSON.parse(pkg.images);
        } catch (e) {
          pkg.images = [];
        }
      }
      return pkg;
    });

    res.json(packages);
  });
});

// ====================================
// GET ADD-ONS FOR A PACKAGE - FIXED
// ====================================
router.get("/:id/addons", (req, res) => {
  const packageId = req.params.id;

  // First check if category column exists
  db.query("SHOW COLUMNS FROM addons LIKE 'category'", (colErr, columns) => {
    const hasCategory = columns && columns.length > 0;
    
    let sql = `
      SELECT 
        a.*,
        pa.is_default
      FROM addons a
      INNER JOIN package_addons pa ON a.id = pa.addon_id
      WHERE pa.package_id = ? AND a.is_active = 1
    `;
    
    if (hasCategory) {
      sql += ' ORDER BY pa.is_default DESC, a.category, a.name';
    } else {
      sql += ' ORDER BY pa.is_default DESC, a.name';
    }

    db.query(sql, [packageId], (err, results) => {
      if (err) {
        console.error("Error fetching package add-ons:", err);
        return res.status(500).json({ error: err.message });
      }
      res.json(results);
    });
  });
});

// ====================================
// UPDATE PACKAGE ADD-ONS
// ====================================
router.post("/:id/addons", (req, res) => {
  const packageId = req.params.id;
  const { addon_ids } = req.body;

  if (!addon_ids || !Array.isArray(addon_ids)) {
    return res.status(400).json({ error: "addon_ids array is required" });
  }

  db.beginTransaction((err) => {
    if (err) {
      console.error("Error starting transaction:", err);
      return res.status(500).json({ error: err.message });
    }

    db.query(
      "DELETE FROM package_addons WHERE package_id = ?",
      [packageId],
      (err) => {
        if (err) {
          console.error("Error deleting package add-ons:", err);
          return db.rollback(() => {
            res.status(500).json({ error: err.message });
          });
        }

        if (addon_ids.length > 0) {
          const values = addon_ids.map(addonId => [packageId, addonId, 0]);
          const sql = `
            INSERT INTO package_addons (package_id, addon_id, is_default)
            VALUES ?
          `;

          db.query(sql, [values], (err) => {
            if (err) {
              console.error("Error inserting package add-ons:", err);
              return db.rollback(() => {
                res.status(500).json({ error: err.message });
              });
            }

            db.commit((err) => {
              if (err) {
                console.error("Error committing transaction:", err);
                return db.rollback(() => {
                  res.status(500).json({ error: err.message });
                });
              }
              res.json({
                message: "Package add-ons updated successfully",
              });
            });
          });
        } else {
          db.commit((err) => {
            if (err) {
              console.error("Error committing transaction:", err);
              return db.rollback(() => {
                res.status(500).json({ error: err.message });
              });
            }
            res.json({
              message: "Package add-ons updated successfully",
            });
          });
        }
      }
    );
  });
});

// ====================================
// TOGGLE DEFAULT ADD-ON
// ====================================
router.patch("/:packageId/addons/:addonId/default", (req, res) => {
  const { packageId, addonId } = req.params;
  const { is_default } = req.body;

  db.query(
    "UPDATE package_addons SET is_default = ? WHERE package_id = ? AND addon_id = ?",
    [is_default ? 1 : 0, packageId, addonId],
    (err) => {
      if (err) {
        console.error("Error updating default add-on:", err);
        return res.status(500).json({ error: err.message });
      }
      res.json({
        message: "Default add-on updated successfully",
      });
    }
  );
});

// ====================================
// CREATE PACKAGE
// ====================================
router.post("/", upload.array("images", 10), (req, res) => {
  try {
    const {
      package_name,
      tier,
      price,
      original_price,
      discount,
      rating,
      review_count,
      guest_capacity,
      description,
      includes,
      catering,
      stage_decoration,
      flower_decoration,
      lighting,
      photography,
      videography,
      sound_system,
      dj_setup,
      is_active,
      addon_ids
    } = req.body;

    console.log("📦 Creating package with:", { 
      package_name, 
      tier, 
      price, 
      original_price,
      discount,
      rating,
      review_count,
      guest_capacity,
      description,
      includes,
      dj_setup,
      is_active,
      addon_ids
    });

    if (!package_name || !tier || !price) {
      return res.status(400).json({ error: "Package name, tier, and price are required" });
    }

    const parsedIncludes = includes ? parseJSONField(includes) : [];
    const parsedCatering = catering ? parseJSONField(catering) : false;
    const parsedStageDecoration = stage_decoration ? parseJSONField(stage_decoration) : false;
    const parsedFlowerDecoration = flower_decoration ? parseJSONField(flower_decoration) : false;
    const parsedLighting = lighting ? parseJSONField(lighting) : false;
    const parsedPhotography = photography ? parseJSONField(photography) : false;
    const parsedVideography = videography ? parseJSONField(videography) : false;
    const parsedSoundSystem = sound_system ? parseJSONField(sound_system) : false;

    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = req.files.map(file => `uploads/packages/${file.filename}`);
    }

    const safePrice = safeParseNumber(price, 0);
    const safeOriginalPrice = safeParseNumber(original_price, safePrice);
    const safeDiscount = safeParseNumber(discount, 0);
    const safeRating = safeParseNumber(rating, 0);
    const safeReviewCount = safeParseNumber(review_count, 0);
    const safeGuestCapacity = safeParseNumber(guest_capacity, 0);
    const safeDjSetup = safeParseBoolean(dj_setup);
    const safeIsActive = safeParseBoolean(is_active);

    const sql = `
      INSERT INTO packages (
        package_name, tier, price, original_price, discount,
        rating, review_count, guest_capacity, description,
        includes, images, catering, stage_decoration,
        flower_decoration, lighting, photography,
        videography, sound_system, dj_setup, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      package_name.trim(),
      tier,
      safePrice,
      safeOriginalPrice,
      safeDiscount,
      safeRating,
      safeReviewCount,
      safeGuestCapacity,
      description || null,
      JSON.stringify(parsedIncludes),
      JSON.stringify(imageUrls),
      JSON.stringify(parsedCatering),
      JSON.stringify(parsedStageDecoration),
      JSON.stringify(parsedFlowerDecoration),
      JSON.stringify(parsedLighting),
      JSON.stringify(parsedPhotography),
      JSON.stringify(parsedVideography),
      JSON.stringify(parsedSoundSystem),
      safeDjSetup,
      safeIsActive,
    ];

    console.log("📦 SQL Values:", values);

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error creating package:", err);
        return res.status(500).json({ error: err.message, sql: sql, values: values });
      }

      // ─── Handle add-ons ──────────────────────────────────────────────
      let parsedAddonIds = [];
      if (addon_ids) {
        try {
          parsedAddonIds = typeof addon_ids === 'string' ? JSON.parse(addon_ids) : addon_ids;
        } catch (e) {
          parsedAddonIds = [];
        }
      }

      if (parsedAddonIds && parsedAddonIds.length > 0) {
        const addonValues = parsedAddonIds.map(addonId => [result.insertId, addonId, 0]);
        db.query(
          "INSERT INTO package_addons (package_id, addon_id, is_default) VALUES ?",
          [addonValues],
          (addonErr) => {
            if (addonErr) {
              console.error("Error adding package add-ons:", addonErr);
              // Don't fail the whole request, just log the error
            }
            res.json({
              message: "Package created successfully",
              id: result.insertId,
            });
          }
        );
      } else {
        res.json({
          message: "Package created successfully",
          id: result.insertId,
        });
      }
    });
  } catch (error) {
    console.error("Error in package creation:", error);
    res.status(500).json({ error: error.message });
  }
});

// ====================================
// UPDATE PACKAGE
// ====================================
router.put("/:id", upload.array("images", 10), (req, res) => {
  try {
    const id = req.params.id;
    const {
      package_name,
      tier,
      price,
      original_price,
      discount,
      rating,
      review_count,
      guest_capacity,
      description,
      includes,
      catering,
      stage_decoration,
      flower_decoration,
      lighting,
      photography,
      videography,
      sound_system,
      dj_setup,
      is_active,
      existing_images,
      addon_ids
    } = req.body;

    console.log("📦 Updating package:", { id, package_name, tier, price, addon_ids });

    if (!package_name || !tier || !price) {
      return res.status(400).json({ error: "Package name, tier, and price are required" });
    }

    const parsedIncludes = includes ? parseJSONField(includes) : [];
    const parsedCatering = catering ? parseJSONField(catering) : false;
    const parsedStageDecoration = stage_decoration ? parseJSONField(stage_decoration) : false;
    const parsedFlowerDecoration = flower_decoration ? parseJSONField(flower_decoration) : false;
    const parsedLighting = lighting ? parseJSONField(lighting) : false;
    const parsedPhotography = photography ? parseJSONField(photography) : false;
    const parsedVideography = videography ? parseJSONField(videography) : false;
    const parsedSoundSystem = sound_system ? parseJSONField(sound_system) : false;

    const safePrice = safeParseNumber(price, 0);
    const safeOriginalPrice = safeParseNumber(original_price, safePrice);
    const safeDiscount = safeParseNumber(discount, 0);
    const safeRating = safeParseNumber(rating, 0);
    const safeReviewCount = safeParseNumber(review_count, 0);
    const safeGuestCapacity = safeParseNumber(guest_capacity, 0);
    const safeDjSetup = safeParseBoolean(dj_setup);
    const safeIsActive = safeParseBoolean(is_active);

    let existingImagesArray = [];
    if (existing_images) {
      existingImagesArray = Array.isArray(existing_images) ? existing_images : [existing_images];
    }

    db.query(
      "SELECT images FROM packages WHERE id = ?",
      [id],
      (err, results) => {
        if (err) {
          console.error("Error fetching package:", err);
          return res.status(500).json({ error: err.message });
        }

        let currentImages = [];
        if (results.length > 0 && results[0].images) {
          try {
            currentImages = JSON.parse(results[0].images);
          } catch (e) {
            currentImages = [];
          }
        }

        const keptImages = currentImages.filter(img => existingImagesArray.includes(img));

        let newImageUrls = [];
        if (req.files && req.files.length > 0) {
          newImageUrls = req.files.map(file => `uploads/packages/${file.filename}`);
        }

        const allImages = [...keptImages, ...newImageUrls];

        const sql = `
          UPDATE packages
          SET
            package_name = ?,
            tier = ?,
            price = ?,
            original_price = ?,
            discount = ?,
            rating = ?,
            review_count = ?,
            guest_capacity = ?,
            description = ?,
            includes = ?,
            images = ?,
            catering = ?,
            stage_decoration = ?,
            flower_decoration = ?,
            lighting = ?,
            photography = ?,
            videography = ?,
            sound_system = ?,
            dj_setup = ?,
            is_active = ?
          WHERE id = ?
        `;

        const values = [
          package_name.trim(),
          tier,
          safePrice,
          safeOriginalPrice,
          safeDiscount,
          safeRating,
          safeReviewCount,
          safeGuestCapacity,
          description || null,
          JSON.stringify(parsedIncludes),
          JSON.stringify(allImages),
          JSON.stringify(parsedCatering),
          JSON.stringify(parsedStageDecoration),
          JSON.stringify(parsedFlowerDecoration),
          JSON.stringify(parsedLighting),
          JSON.stringify(parsedPhotography),
          JSON.stringify(parsedVideography),
          JSON.stringify(parsedSoundSystem),
          safeDjSetup,
          safeIsActive,
          id,
        ];

        db.query(sql, values, (err) => {
          if (err) {
            console.error("Error updating package:", err);
            return res.status(500).json({ error: err.message });
          }

          // ─── Handle add-ons update ──────────────────────────────────────
          let parsedAddonIds = [];
          if (addon_ids) {
            try {
              parsedAddonIds = typeof addon_ids === 'string' ? JSON.parse(addon_ids) : addon_ids;
            } catch (e) {
              parsedAddonIds = [];
            }
          }

          // Delete existing add-ons
          db.query(
            "DELETE FROM package_addons WHERE package_id = ?",
            [id],
            (deleteErr) => {
              if (deleteErr) {
                console.error("Error deleting package add-ons:", deleteErr);
                // Continue anyway
              }

              // Insert new add-ons
              if (parsedAddonIds && parsedAddonIds.length > 0) {
                const addonValues = parsedAddonIds.map(addonId => [id, addonId, 0]);
                db.query(
                  "INSERT INTO package_addons (package_id, addon_id, is_default) VALUES ?",
                  [addonValues],
                  (addonErr) => {
                    if (addonErr) {
                      console.error("Error adding package add-ons:", addonErr);
                    }
                    res.json({
                      message: "Package updated successfully",
                    });
                  }
                );
              } else {
                res.json({
                  message: "Package updated successfully",
                });
              }
            }
          );
        });
      }
    );
  } catch (error) {
    console.error("Error in package update:", error);
    res.status(500).json({ error: error.message });
  }
});

// ====================================
// DELETE PACKAGE
// ====================================
router.delete("/:id", (req, res) => {
  const id = req.params.id;

  db.query(
    "SELECT images FROM packages WHERE id = ?",
    [id],
    (err, results) => {
      if (err) {
        console.error("Error fetching package for deletion:", err);
        return res.status(500).json({ error: err.message });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "Package not found" });
      }

      let images = [];
      if (results[0].images) {
        try {
          images = JSON.parse(results[0].images);
        } catch (e) {}
      }

      // Delete package add-ons first (foreign key constraint)
      db.query(
        "DELETE FROM package_addons WHERE package_id = ?",
        [id],
        (err) => {
          if (err) {
            console.error("Error deleting package add-ons:", err);
            return res.status(500).json({ error: err.message });
          }

          // Delete package
          db.query(
            "DELETE FROM packages WHERE id = ?",
            [id],
            (err) => {
              if (err) {
                console.error("Error deleting package:", err);
                return res.status(500).json({ error: err.message });
              }

              // Delete image files
              images.forEach(img => {
                const filePath = path.join(__dirname, "..", img);
                if (fs.existsSync(filePath)) {
                  fs.unlink(filePath, (unlinkErr) => {
                    if (unlinkErr) {
                      console.error("Error deleting file:", unlinkErr);
                    }
                  });
                }
              });

              res.json({
                message: "Package deleted successfully",
              });
            }
          );
        }
      );
    }
  );
});

module.exports = router;