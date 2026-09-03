// // routes/LoginRoute.js
// const express = require("express");
// const router = express.Router();
// const db = require("../db");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const otpGenerator = require("otp-generator");
// const sendOTP = require("../Utils/mailer");

// require("dotenv").config();

// const SECRET = process.env.JWT_SECRET;



// // 👉 ADMIN LOGIN
// router.post("/login", (req, res) => {
//   const { email, password } = req.body;

//   const query = "SELECT * FROM admins WHERE email = ?";

//   db.query(query, [email], (err, results) => {
//     if (err) {
//       return res.status(500).json({ message: "Server error" });
//     }

//     if (results.length === 0) {
//       return res.status(401).json({ message: "Invalid email" });
//     }

//     const user = results[0];

//     // 🔐 Compare password
//     const isMatch = bcrypt.compareSync(password, user.password);

//     if (!isMatch) {
//       return res.status(401).json({ message: "Invalid password" });
//     }

//     // 🎟️ Generate JWT (JSON Web Token)
//     const token = jwt.sign(
//       { id: user.id, email: user.email },
//       SECRET,
//       { expiresIn: "1d" }
//     );

//     res.json({
//       message: "Login successful",
//       token,
//       user: {
//         id: user.id,
//         email: user.email,
//       },
//     });
//   });
// });





// router.post("/forgot-password", (req, res) => {
//   const { email } = req.body;

//   db.query("SELECT * FROM admins WHERE email = ?", [email], async (err, results) => {
//     if (err) return res.status(500).json({ message: "DB error" });

//     if (results.length === 0) {
//       return res.status(400).json({ message: "Admin email not matched" });
//     }

//     const otp = otpGenerator.generate(6, { upperCase: false, specialChars: false });
//     const expiry = Date.now() + 5 * 60 * 1000;

//     try {
//       await sendOTP(email, otp);
//     } catch (error) {
//       console.error(error);
//       return res.status(500).json({ message: "Email sending failed" });
//     }

//     db.query(
//       "UPDATE admins SET otp=?, otp_expiry=? WHERE email=?",
//       [otp, expiry, email]
//     );

//     res.json({ message: "OTP sent successfully" });
//   });
// });

// router.post("/verify-otp", (req, res) => {
//   const { email, otp } = req.body;

//   db.query("SELECT * FROM admins WHERE email = ?", [email], (err, results) => {
//     if (err) return res.status(500).json({ message: "DB error" });

//     const user = results[0];

//     if (!user || user.otp !== otp) {
//       return res.status(400).json({ message: "Invalid OTP" });
//     }

//     if (Date.now() > user.otp_expiry) {
//       return res.status(400).json({ message: "OTP expired" });
//     }

//     res.json({ message: "OTP verified" });
//   });
// });

// router.post("/reset-password", async (req, res) => {
//   const { email, password } = req.body;

//   const hashedPassword = await bcrypt.hash(password, 10);

//   db.query(
//     "UPDATE admins SET password=?, otp=NULL, otp_expiry=NULL WHERE email=?",
//     [hashedPassword, email],
//     (err) => {
//       if (err) return res.status(500).json({ message: "Update failed" });

//       res.json({ message: "Password reset successful" });
//     }
//   );
// });
// module.exports = router;





// routes/LoginRoute.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const sendOTP = require("../Utils/mailer");

require("dotenv").config();

const SECRET = process.env.JWT_SECRET;

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────────
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  const query = "SELECT * FROM admins WHERE email = ?";

  db.query(query, [email], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid email" });
    }

    const user = results[0];

    const isMatch = bcrypt.compareSync(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: 'admin' },
      SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name || 'Admin',
        email: user.email,
        phone: user.phone || '',
        role: 'admin'
      },
    });
  });
});

// ─── SALESMAN LOGIN ──────────────────────────────────────────────────────────
router.post("/salesman-login", (req, res) => {
  const { email, password } = req.body;

  console.log('📦 Salesman login attempt:', { email });

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required"
    });
  }

  const query = "SELECT * FROM salesmen WHERE email = ? AND is_active = 1";

  db.query(query, [email], (err, results) => {
    if (err) {
      console.error("❌ Salesman login error:", err);
      return res.status(500).json({
        success: false,
        message: "Server error"
      });
    }

    if (results.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or account inactive"
      });
    }

    const user = results[0];

    // Check password (support both hashed and plain text)
    let isMatch = false;
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
      isMatch = bcrypt.compareSync(password, user.password);
    } else {
      isMatch = password === user.password;
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid password"
      });
    }

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

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
router.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  db.query("SELECT * FROM admins WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (results.length === 0) {
      return res.status(400).json({ message: "Admin email not matched" });
    }

    const otp = otpGenerator.generate(6, { upperCase: false, specialChars: false });
    const expiry = Date.now() + 5 * 60 * 1000;

    try {
      await sendOTP(email, otp);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Email sending failed" });
    }

    db.query(
      "UPDATE admins SET otp=?, otp_expiry=? WHERE email=?",
      [otp, expiry, email]
    );

    res.json({ message: "OTP sent successfully" });
  });
});

// ─── VERIFY OTP ──────────────────────────────────────────────────────────────
router.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  db.query("SELECT * FROM admins WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });

    const user = results[0];

    if (!user || user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (Date.now() > user.otp_expiry) {
      return res.status(400).json({ message: "OTP expired" });
    }

    res.json({ message: "OTP verified" });
  });
});

// ─── RESET PASSWORD ──────────────────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  const { email, password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  db.query(
    "UPDATE admins SET password=?, otp=NULL, otp_expiry=NULL WHERE email=?",
    [hashedPassword, email],
    (err) => {
      if (err) return res.status(500).json({ message: "Update failed" });

      res.json({ message: "Password reset successful" });
    }
  );
});

module.exports = router;