// routes/hero-banners.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// ====================================
// GET ALL HERO BANNERS
// ====================================
router.get("/", (req, res) => {
  const sql = `
    SELECT 
      id,
      title,
      subtitle,
      image_url as image,
      cta_text as cta,
      cta_link,
      display_order,
      is_active,
      created_at,
      updated_at
    FROM hero_banners
    WHERE is_active = 1
    ORDER BY display_order ASC, id ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching hero banners:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// ====================================
// GET SINGLE HERO BANNER
// ====================================
router.get("/:id", (req, res) => {
  const sql = `
    SELECT 
      id,
      title,
      subtitle,
      image_url as image,
      cta_text as cta,
      cta_link,
      display_order,
      is_active,
      created_at,
      updated_at
    FROM hero_banners
    WHERE id = ? AND is_active = 1
  `;

  db.query(sql, [req.params.id], (err, result) => {
    if (err) {
      console.error('Error fetching hero banner:', err);
      return res.status(500).json({ error: err.message });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Hero banner not found" });
    }
    res.json(result[0]);
  });
});

module.exports = router;