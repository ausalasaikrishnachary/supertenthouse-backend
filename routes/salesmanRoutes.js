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
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  console.log('📦 Salesman login attempt:', { email, password: '***' });

  if (!email || !password) {
    return res.status(400).json({ 
      success: false,
      message: "Email and password are required" 
    });
  }

  // First, check if the salesmen table exists
  const checkTable = "SHOW TABLES LIKE 'salesmen'";
  db.query(checkTable, (tableErr, tableResults) => {
    if (tableErr) {
      console.error("❌ Error checking table:", tableErr);
      return res.status(500).json({ 
        success: false,
        message: "Database error: Could not verify table" 
      });
    }

    if (tableResults.length === 0) {
      console.error("❌ Salesmen table does not exist!");
      return res.status(500).json({ 
        success: false,
        message: "Salesmen table not found" 
      });
    }

    console.log('✅ Salesmen table exists');

    // Now query for the salesman
    const query = "SELECT * FROM salesmen WHERE email = ?";
    
    db.query(query, [email], (err, results) => {
      if (err) {
        console.error("❌ Salesman login error:", err);
        return res.status(500).json({ 
          success: false,
          message: "Server error: " + err.message 
        });
      }

      console.log('📦 Salesman found:', results.length);

      if (results.length === 0) {
        // Check if the email exists in admins table (for debugging)
        db.query("SELECT * FROM admins WHERE email = ?", [email], (adminErr, adminResults) => {
          if (!adminErr && adminResults.length > 0) {
            console.log('⚠️ Email found in admins table, not in salesmen');
          }
        });
        
        return res.status(401).json({ 
          success: false,
          message: "Invalid email or account inactive" 
        });
      }

      const user = results[0];
      console.log('📦 User found:', { 
        id: user.id, 
        email: user.email, 
        name: user.name,
        hashed: user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))
      });

      // Check if user is active
      if (user.is_active === 0) {
        return res.status(401).json({ 
          success: false,
          message: "Account is inactive. Please contact admin." 
        });
      }

      // Check password
      let isMatch = false;
      
      if (!user.password) {
        return res.status(401).json({ 
          success: false,
          message: "Account has no password set. Please contact admin." 
        });
      }

      // Check if the password is hashed
      if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
        try {
          isMatch = bcrypt.compareSync(password, user.password);
          console.log('🔐 Using bcrypt comparison');
        } catch (compareErr) {
          console.error('❌ Error comparing password:', compareErr);
          isMatch = false;
        }
      } else {
        // Password is plain text (temporary for testing)
        isMatch = password === user.password;
        console.log('⚠️ Using plain text password comparison');
      }

      console.log('📦 Password match:', isMatch);

      if (!isMatch) {
        return res.status(401).json({ 
          success: false,
          message: "Invalid password" 
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: user.id, 
          email: user.email, 
          name: user.name,
          role: 'salesman' 
        },
        SECRET,
        { expiresIn: "1d" }
      );

      res.json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: 'salesman'
        },
      });
    });
  });
});

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
      "SELECT id, name, email, phone, is_active FROM salesmen WHERE id = ?",
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