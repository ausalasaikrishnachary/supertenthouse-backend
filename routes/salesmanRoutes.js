// backend/routes/salesmanRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const SECRET = process.env.JWT_SECRET || 'your_secret_key_here';

// ─── TEST ENDPOINT ──────────────────────────────────────────────────────────
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Salesman routes are working!",
    timestamp: new Date().toISOString()
  });
});

// ─── SALESMAN LOGIN ──────────────────────────────────────────────────────────
router.post("/login", require("../services/salesmanLogin").createSalesmanLogin(db));

// ─── GET SALESMAN PROFILE ──────────────────────────────────────────────────
router.get("/profile", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: "No token provided" 
    });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    
    if (decoded.role !== 'salesman') {
      return res.status(403).json({ 
        success: false,
        message: "Access denied" 
      });
    }

    db.query(
      "SELECT id, name, email, phone, is_salesman FROM customers WHERE id = ? AND is_salesman = 1",
      [decoded.id],
      (err, results) => {
        if (err) {
          return res.status(500).json({ 
            success: false,
            message: "Server error" 
          });
        }
        
        if (results.length === 0) {
          return res.status(404).json({ 
            success: false,
            message: "Salesman not found" 
          });
        }

        res.json({
          success: true,
          data: results[0]
        });
      }
    );
  } catch (err) {
    return res.status(401).json({ 
      success: false,
      message: "Invalid token" 
    });
  }
});

module.exports = router;
