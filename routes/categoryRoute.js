// const express = require("express");
// const router = express.Router();
// const db = require("../db");

// // ==============================
// // CREATE CATEGORY
// // ==============================
// router.post("/", (req, res) => {
//   const { category_name } = req.body;

//   const sql = `
//     INSERT INTO product_categories (category_name)
//     VALUES (?)
//   `;

//   db.query(sql, [category_name], (err, result) => {
//     if (err) {
//       return res.status(500).json(err);
//     }

//     res.json({
//       message: "Category added successfully",
//       id: result.insertId,
//     });
//   });
// });

// // ==============================
// // GET ALL CATEGORIES
// // ==============================
// // router.get("/", (req, res) => {
// //   const sql = `
// //     SELECT * FROM product_categories
// //     ORDER BY id DESC
// //   `;

// //   db.query(sql, (err, result) => {
// //     if (err) {
// //       return res.status(500).json(err);
// //     }

// //     res.json(result);
// //   });
// // });


// // routes/categories.js - Add product count
// router.get("/", (req, res) => {
//   const sql = `
//     SELECT 
//       c.*,
//       COUNT(p.id) as product_count
//     FROM product_categories c
//     LEFT JOIN products p ON p.product_category_id = c.id
//     GROUP BY c.id
//     ORDER BY c.id DESC
//   `;

//   db.query(sql, (err, result) => {
//     if (err) {
//       return res.status(500).json(err);
//     }
//     res.json(result);
//   });
// });

// // ==============================
// // GET SINGLE CATEGORY
// // ==============================
// router.get("/:id", (req, res) => {
//   const sql = `
//     SELECT * FROM product_categories
//     WHERE id = ?
//   `;

//   db.query(sql, [req.params.id], (err, result) => {
//     if (err) {
//       return res.status(500).json(err);
//     }

//     res.json(result[0]);
//   });
// });

// // ==============================
// // UPDATE CATEGORY
// // ==============================
// router.put("/:id", (req, res) => {
//   const { category_name } = req.body;

//   const sql = `
//     UPDATE product_categories
//     SET category_name = ?
//     WHERE id = ?
//   `;

//   db.query(sql, [category_name, req.params.id], (err) => {
//     if (err) {
//       return res.status(500).json(err);
//     }

//     res.json({
//       message: "Category updated successfully",
//     });
//   });
// });

// // ==============================
// // DELETE CATEGORY
// // ==============================
// router.delete("/:id", (req, res) => {
//   const sql = `
//     DELETE FROM product_categories
//     WHERE id = ?
//   `;

//   db.query(sql, [req.params.id], (err) => {
//     if (err) {
//       return res.status(500).json(err);
//     }

//     res.json({
//       message: "Category deleted successfully",
//     });
//   });
// });

// module.exports = router;


const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'categories');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `category-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// ==============================
// CREATE CATEGORY
// ==============================
router.post("/", upload.single('image'), (req, res) => {
  try {
    const { category_name } = req.body;
    
    if (!category_name || category_name.trim() === '') {
      // Clean up uploaded file if exists
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(400).json({ error: 'Category name is required' });
    }

    let imagePath = null;
    if (req.file) {
      // Store path relative to uploads folder
      imagePath = `uploads/categories/${req.file.filename}`;
    }

    const sql = `
      INSERT INTO product_categories (category_name, image)
      VALUES (?, ?)
    `;

    db.query(sql, [category_name.trim(), imagePath], (err, result) => {
      if (err) {
        // If there's an error, delete the uploaded file
        if (req.file) {
          fs.unlink(req.file.path, (unlinkErr) => {
            if (unlinkErr) console.error('Error deleting file:', unlinkErr);
          });
        }
        console.error('Error creating category:', err);
        return res.status(500).json({ error: err.message });
      }

      res.json({
        message: "Category added successfully",
        id: result.insertId,
        image: imagePath
      });
    });
  } catch (error) {
    console.error('Error in category creation:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==============================
// GET ALL CATEGORIES
// ==============================
router.get("/", (req, res) => {
  const sql = `
    SELECT 
      c.*,
      COUNT(p.id) as product_count
    FROM product_categories c
    LEFT JOIN products p ON p.product_category_id = c.id
    GROUP BY c.id
    ORDER BY c.id DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error('Error fetching categories:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(result);
  });
});

// ==============================
// GET SINGLE CATEGORY
// ==============================
router.get("/:id", (req, res) => {
  const sql = `
    SELECT 
      c.*,
      COUNT(p.id) as product_count
    FROM product_categories c
    LEFT JOIN products p ON p.product_category_id = c.id
    WHERE c.id = ?
    GROUP BY c.id
  `;
  
  db.query(sql, [req.params.id], (err, result) => {
    if (err) {
      console.error('Error fetching category:', err);
      return res.status(500).json({ error: err.message });
    }
    if (result.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json(result[0]);
  });
});

// ==============================
// UPDATE CATEGORY
// ==============================
router.put("/:id", upload.single('image'), (req, res) => {
  try {
    const { category_name, image } = req.body;
    const categoryId = req.params.id;

    if (!category_name || category_name.trim() === '') {
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(400).json({ error: 'Category name is required' });
    }

    // Get current category data
    const getCurrentSql = `SELECT image FROM product_categories WHERE id = ?`;
    
    db.query(getCurrentSql, [categoryId], (err, results) => {
      if (err) {
        if (req.file) {
          fs.unlink(req.file.path, () => {});
        }
        console.error('Error fetching current category:', err);
        return res.status(500).json({ error: err.message });
      }

      if (results.length === 0) {
        if (req.file) {
          fs.unlink(req.file.path, () => {});
        }
        return res.status(404).json({ error: "Category not found" });
      }

      let currentImage = results[0]?.image || null;
      let newImagePath = currentImage;

      // Handle image update
      if (req.file) {
        // New image uploaded - delete old image if exists
        if (currentImage) {
          const oldImagePath = path.join(__dirname, '..', currentImage);
          if (fs.existsSync(oldImagePath)) {
            fs.unlink(oldImagePath, (unlinkErr) => {
              if (unlinkErr) console.error('Error deleting old image:', unlinkErr);
            });
          }
        }
        newImagePath = `uploads/categories/${req.file.filename}`;
      } else if (image === '') {
        // Image removed explicitly
        if (currentImage) {
          const oldImagePath = path.join(__dirname, '..', currentImage);
          if (fs.existsSync(oldImagePath)) {
            fs.unlink(oldImagePath, (unlinkErr) => {
              if (unlinkErr) console.error('Error deleting old image:', unlinkErr);
            });
          }
        }
        newImagePath = null;
      }
      // If image is undefined or has value, keep current image

      const updateSql = `
        UPDATE product_categories
        SET category_name = ?, image = ?
        WHERE id = ?
      `;

      db.query(updateSql, [category_name.trim(), newImagePath, categoryId], (err) => {
        if (err) {
          // If there's an error and new file was uploaded, delete it
          if (req.file) {
            fs.unlink(req.file.path, (unlinkErr) => {
              if (unlinkErr) console.error('Error deleting file:', unlinkErr);
            });
          }
          console.error('Error updating category:', err);
          return res.status(500).json({ error: err.message });
        }

        res.json({
          message: "Category updated successfully",
          image: newImagePath
        });
      });
    });
  } catch (error) {
    console.error('Error in category update:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==============================
// DELETE CATEGORY
// ==============================
router.delete("/:id", (req, res) => {
  const getImageSql = `SELECT image FROM product_categories WHERE id = ?`;
  
  db.query(getImageSql, [req.params.id], (err, results) => {
    if (err) {
      console.error('Error fetching category for deletion:', err);
      return res.status(500).json({ error: err.message });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    const imagePath = results[0]?.image;
    
    const deleteSql = `DELETE FROM product_categories WHERE id = ?`;
    
    db.query(deleteSql, [req.params.id], (err) => {
      if (err) {
        console.error('Error deleting category:', err);
        return res.status(500).json({ error: err.message });
      }

      // Delete image file if exists
      if (imagePath) {
        const fullImagePath = path.join(__dirname, '..', imagePath);
        if (fs.existsSync(fullImagePath)) {
          fs.unlink(fullImagePath, (unlinkErr) => {
            if (unlinkErr) console.error('Error deleting image file:', unlinkErr);
          });
        }
      }

      res.json({
        message: "Category deleted successfully"
      });
    });
  });
});






module.exports = router;