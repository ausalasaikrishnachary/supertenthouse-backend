const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcrypt");

// ==============================
// CREATE USER (CUSTOMER)
// ==============================
router.post("/", async (req, res) => {
  const { name, email, phone, password } = req.body;

  try {
    // Check if email already exists
    const checkEmailSql = "SELECT * FROM customers WHERE email = ?";
    const [existingUser] = await db.promise().query(checkEmailSql, [email]);

    if (existingUser.length > 0) {
      return res.status(400).json({
        message: "Email already registered"
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = `
      INSERT INTO customers (name, email, phone, password)
      VALUES (?, ?, ?, ?)
    `;

    const [result] = await db.promise().query(sql, [name, email, phone, hashedPassword]);

    res.json({
      message: "User added successfully",
      id: result.insertId,
    });
  } catch (err) {
    console.error("Error adding user:", err);
    res.status(500).json({
      message: "Failed to add user",
      error: err.message
    });
  }
});

// ==============================
// GET ALL USERS (CUSTOMERS)
// ==============================
router.get("/all", (req, res) => {
  const sql = `
    SELECT id, name, email, phone, created_at
    FROM customers
    ORDER BY id DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to fetch users",
        error: err.message
      });
    }

    res.json({
      message: "Customers fetched successfully",
      count: result.length,
      data: result
    });
  });
});

// ==============================
// GET SINGLE USER
// ==============================
router.get("/:id", (req, res) => {
  const sql = `
    SELECT id, name, email, phone, created_at
    FROM customers
    WHERE id = ?
  `;

  db.query(sql, [req.params.id], (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to fetch user",
        error: err.message
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    res.json({
      message: "User fetched successfully",
      data: result[0]
    });
  });
});

// ==============================
// UPDATE USER
// ==============================
router.put("/:id", async (req, res) => {
  const { name, email, phone, password } = req.body;
  const userId = req.params.id;

  try {
    let sql;
    let params;

    // If password is provided, update it as well
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      sql = `
        UPDATE customers
        SET name = ?, email = ?, phone = ?, password = ?
        WHERE id = ?
      `;
      params = [name, email, phone, hashedPassword, userId];
    } else {
      sql = `
        UPDATE customers
        SET name = ?, email = ?, phone = ?
        WHERE id = ?
      `;
      params = [name, email, phone, userId];
    }

    await db.promise().query(sql, params);

    res.json({
      message: "User updated successfully",
    });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({
      message: "Failed to update user",
      error: err.message
    });
  }
});

// ==============================
// DELETE USER
// ==============================
router.delete("/:id", (req, res) => {
  const sql = `
    DELETE FROM customers
    WHERE id = ?
  `;

  db.query(sql, [req.params.id], (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete user",
        error: err.message
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    res.json({
      message: "User deleted successfully",
    });
  });
});

module.exports = router;