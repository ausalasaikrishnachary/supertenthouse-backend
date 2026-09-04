// routes/addons.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// ====================================
// GET ALL ADD-ONS
// ====================================
router.get("/", (req, res) => {
  const sql = `
    SELECT id, addon_name AS name, price, icon, description, category, is_active FROM add_ons WHERE is_active = 1 ORDER BY id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching add-ons:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// ====================================
// GET SINGLE ADD-ON
// ====================================
router.get("/:id", (req, res) => {
  const sql = `SELECT id, addon_name AS name, price, icon, description, category, is_active FROM add_ons WHERE id = ?`;

  db.query(sql, [req.params.id], (err, results) => {
    if (err) {
      console.error("Error fetching add-on:", err);
      return res.status(500).json({ error: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ message: "Add-on not found" });
    }
    res.json(results[0]);
  });
});

// ====================================
// CREATE ADD-ON
// ====================================
router.post("/", (req, res) => {
  try {
    const { name, price, icon, description, category, is_active } = req.body;

    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: "Name is required" });
    }

    if (price === undefined || price === null || isNaN(parseFloat(price))) {
      return res.status(400).json({ error: "Valid price is required" });
    }

    // Sanitize and prepare data
    const sanitizedName = name.trim();
    const sanitizedPrice = parseFloat(price);
    const sanitizedIcon = icon || '📦';
    const sanitizedDescription = description && description.trim() !== '' ? description.trim() : null;
    const sanitizedCategory = category || 'General';
    
    // Ensure is_active is a number (0 or 1)
    let sanitizedIsActive = 1; // default to active
    if (is_active !== undefined && is_active !== null) {
      // If it's a boolean, convert to number
      if (typeof is_active === 'boolean') {
        sanitizedIsActive = is_active ? 1 : 0;
      } else {
        // Try to parse as number
        const parsed = parseInt(is_active);
        sanitizedIsActive = !isNaN(parsed) ? parsed : 1;
      }
    }

    console.log('Creating add-on with data:', {
      name: sanitizedName,
      price: sanitizedPrice,
      icon: sanitizedIcon,
      description: sanitizedDescription,
      category: sanitizedCategory,
      is_active: sanitizedIsActive
    });

    const sql = `
      INSERT INTO add_ons (addon_name, price, icon, description, category, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [
        sanitizedName,
        sanitizedPrice,
        sanitizedIcon,
        sanitizedDescription,
        sanitizedCategory,
        sanitizedIsActive
      ],
      (err, result) => {
        if (err) {
          console.error("Error creating add-on:", err);
          return res.status(500).json({ error: err.message });
        }
        res.json({
          message: "Add-on created successfully",
          id: result.insertId,
        });
      }
    );
  } catch (error) {
    console.error("Error in add-on creation:", error);
    res.status(500).json({ error: error.message });
  }
});

// ====================================
// UPDATE ADD-ON
// ====================================
router.put("/:id", (req, res) => {
  try {
    const id = req.params.id;
    const { name, price, icon, description, category, is_active } = req.body;

    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: "Name is required" });
    }

    if (price === undefined || price === null || isNaN(parseFloat(price))) {
      return res.status(400).json({ error: "Valid price is required" });
    }

    // Sanitize and prepare data
    const sanitizedName = name.trim();
    const sanitizedPrice = parseFloat(price);
    const sanitizedIcon = icon || '📦';
    const sanitizedDescription = description && description.trim() !== '' ? description.trim() : null;
    const sanitizedCategory = category || 'General';
    
    // Ensure is_active is a number (0 or 1)
    let sanitizedIsActive = 1; // default to active
    if (is_active !== undefined && is_active !== null) {
      // If it's a boolean, convert to number
      if (typeof is_active === 'boolean') {
        sanitizedIsActive = is_active ? 1 : 0;
      } else {
        // Try to parse as number
        const parsed = parseInt(is_active);
        sanitizedIsActive = !isNaN(parsed) ? parsed : 1;
      }
    }

    console.log('Updating add-on with data:', {
      id,
      name: sanitizedName,
      price: sanitizedPrice,
      icon: sanitizedIcon,
      description: sanitizedDescription,
      category: sanitizedCategory,
      is_active: sanitizedIsActive
    });

    const sql = `
      UPDATE add_ons
      SET
        addon_name = ?,
        price = ?,
        icon = ?,
        description = ?,
        category = ?,
        is_active = ?
      WHERE id = ?
    `;

    db.query(
      sql,
      [
        sanitizedName,
        sanitizedPrice,
        sanitizedIcon,
        sanitizedDescription,
        sanitizedCategory,
        sanitizedIsActive,
        id,
      ],
      (err, result) => {
        if (err) {
          console.error("Error updating add-on:", err);
          return res.status(500).json({ error: err.message });
        }
        if (result.affectedRows === 0) {
          return res.status(404).json({ message: "Add-on not found" });
        }
        res.json({
          message: "Add-on updated successfully",
        });
      }
    );
  } catch (error) {
    console.error("Error in add-on update:", error);
    res.status(500).json({ error: error.message });
  }
});

// ====================================
// DELETE ADD-ON
// ====================================
router.delete("/:id", (req, res) => {
  const id = req.params.id;

  // First check if the add-on exists
  db.query("SELECT id FROM add_ons WHERE id = ?", [id], (err, results) => {
    if (err) {
      console.error("Error checking add-on:", err);
      return res.status(500).json({ error: err.message });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ message: "Add-on not found" });
    }

    // Delete the add-on
    db.query("DELETE FROM add_ons WHERE id = ?", [id], (err) => {
      if (err) {
        console.error("Error deleting add-on:", err);
        return res.status(500).json({ error: err.message });
      }
      res.json({
        message: "Add-on deleted successfully",
      });
    });
  });
});

module.exports = router;