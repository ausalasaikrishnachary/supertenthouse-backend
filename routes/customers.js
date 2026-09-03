// server/routes/customers.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/profiles');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + req.params.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

// ─── Upload Profile Image ─────────────────────────────────────────────────────
router.post('/:id/profile-image', upload.single('profileImage'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image uploaded' });
    }

    // Get server URL from environment or construct it
    const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
    const imageUrl = `${serverUrl}/uploads/profiles/${req.file.filename}`;

    // Update user profile image in database
    await db.query(
      'UPDATE customers SET avatar = ? WHERE id = ?',
      [imageUrl, id]
    );

    res.json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: { imageUrl }
    });
  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload profile image' 
    });
  }
});

// ─── Update Customer Profile ──────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, avatar, addressLine1, addressLine2, city, state, pincode, country } = req.body;

    const updates = [];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (phone) { updates.push('phone = ?'); values.push(phone); }
    if (avatar) { updates.push('avatar = ?'); values.push(avatar); }
    if (addressLine1) { updates.push('address_line1 = ?'); values.push(addressLine1); }
    if (addressLine2) { updates.push('address_line2 = ?'); values.push(addressLine2); }
    if (city) { updates.push('city = ?'); values.push(city); }
    if (state) { updates.push('state = ?'); values.push(state); }
    if (pincode) { updates.push('pincode = ?'); values.push(pincode); }
    if (country) { updates.push('country = ?'); values.push(country); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(id);
    await db.query(
      `UPDATE customers SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Get updated user
    const [user] = await db.query('SELECT * FROM customers WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update profile' 
    });
  }
});

// ─── Get User Profile ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [user] = await db.query('SELECT * FROM customers WHERE id = ?', [id]);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get user' 
    });
  }
});

module.exports = router;