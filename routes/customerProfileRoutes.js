// routes/customerProfileRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

// ─── Configure multer for profile image upload ──────────────────────────────
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/profiles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('📁 Created profiles directory:', uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'profile-' + req.params.id + '-' + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (extname && mimetype) {
    return cb(null, true);
  }
  cb(new Error('Only image files are allowed'));
};

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: fileFilter
});

// ─── Helper: Get user by ID ──────────────────────────────────────────────────
const getUserById = (id) => {
  return new Promise((resolve, reject) => {
    db.query(
      `SELECT id, name, email, phone, avatar, is_verified,
              address_line1, address_line2, city, state, pincode, country,
              created_at, updated_at
       FROM customers WHERE id = ?`,
      [id],
      (err, results) => {
        if (err) {
          console.error('❌ Database error in getUserById:', err);
          return reject(err);
        }
        if (results.length === 0) {
          return resolve(null);
        }
        resolve(results[0]);
      }
    );
  });
};

// ─── GET: Get user profile ──────────────────────────────────────────────────
router.get('/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📡 Getting profile for user:', id);
    
    const user = await getUserById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar || 'https://images.pexels.com/photos/220457/pexels-photo-220457.jpeg?auto=compress&cs=tinysrgb&w=400',
        isPremium: false,
        isVerified: user.is_verified === 1,
        addressLine1: user.address_line1 || '',
        addressLine2: user.address_line2 || '',
        city: user.city || '',
        state: user.state || '',
        pincode: user.pincode || '',
        country: user.country || 'India',
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ─── GET: Get current user ─────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Invalid token format' });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'my_super_secret_key');
    const userId = decoded.id || decoded.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar || 'https://images.pexels.com/photos/220457/pexels-photo-220457.jpeg?auto=compress&cs=tinysrgb&w=400',
        isPremium: false,
        isVerified: user.is_verified === 1,
        addressLine1: user.address_line1 || '',
        addressLine2: user.address_line2 || '',
        city: user.city || '',
        state: user.state || '',
        pincode: user.pincode || '',
        country: user.country || 'India',
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });
  } catch (error) {
    console.error('❌ Get current user error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ─── PUT: Update user profile ────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, avatar, addressLine1, addressLine2, city, state, pincode, country } = req.body;

    console.log('📡 Updating profile for user:', id);
    console.log('📦 Update data:', { name, phone, addressLine1, city, state, pincode });

    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
    if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }
    if (addressLine1 !== undefined) { updates.push('address_line1 = ?'); values.push(addressLine1); }
    if (addressLine2 !== undefined) { updates.push('address_line2 = ?'); values.push(addressLine2); }
    if (city !== undefined) { updates.push('city = ?'); values.push(city); }
    if (state !== undefined) { updates.push('state = ?'); values.push(state); }
    if (pincode !== undefined) { updates.push('pincode = ?'); values.push(pincode); }
    if (country !== undefined) { updates.push('country = ?'); values.push(country); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(id);
    await new Promise((resolve, reject) => {
      db.query(
        `UPDATE customers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
        values,
        (err) => {
          if (err) {
            console.error('❌ Database error in update:', err);
            reject(err);
          }
          resolve();
        }
      );
    });

    const updatedUser = await getUserById(id);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        avatar: updatedUser.avatar || 'https://images.pexels.com/photos/220457/pexels-photo-220457.jpeg?auto=compress&cs=tinysrgb&w=400',
        isPremium: false,
        isVerified: updatedUser.is_verified === 1,
        addressLine1: updatedUser.address_line1 || '',
        addressLine2: updatedUser.address_line2 || '',
        city: updatedUser.city || '',
        state: updatedUser.state || '',
        pincode: updatedUser.pincode || '',
        country: updatedUser.country || 'India',
        createdAt: updatedUser.created_at,
        updatedAt: updatedUser.updated_at
      }
    });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ─── POST: Upload profile image ─────────────────────────────────────────────
router.post('/:id/profile-image', upload.single('profileImage'), async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📸 Upload profile image for user:', id);
    console.log('📁 Request file:', req.file);

    // Check if file was uploaded
    if (!req.file) {
      console.error('❌ No file in request');
      return res.status(400).json({ 
        success: false, 
        message: 'No image uploaded' 
      });
    }

    console.log('📁 File received:', {
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    // Check if user exists
    const user = await getUserById(id);
    if (!user) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
        console.log('🗑️ Deleted file because user not found');
      }
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Delete old avatar if exists
    if (user.avatar) {
      try {
        const oldAvatarPath = path.join(__dirname, '..', user.avatar.replace('/uploads/', 'uploads/'));
        if (fs.existsSync(oldAvatarPath) && fs.lstatSync(oldAvatarPath).isFile()) {
          fs.unlinkSync(oldAvatarPath);
          console.log('🗑️ Deleted old avatar:', oldAvatarPath);
        }
      } catch (err) {
        console.log('⚠️ Could not delete old avatar:', err.message);
      }
    }

    // Construct image URL
    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
    const imageUrl = `/uploads/profiles/${req.file.filename}`;
    const fullImageUrl = `${serverUrl}${imageUrl}`;

    console.log('📡 Image URL:', imageUrl);
    console.log('📡 Full Image URL:', fullImageUrl);

    // Update user in database
    await new Promise((resolve, reject) => {
      db.query(
        'UPDATE customers SET avatar = ?, updated_at = NOW() WHERE id = ?',
        [imageUrl, id],
        (err) => {
          if (err) {
            console.error('❌ Database error:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    // Get updated user
    const updatedUser = await getUserById(id);

    res.json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        imageUrl: imageUrl,
        fullUrl: fullImageUrl,
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          phone: updatedUser.phone,
          avatar: fullImageUrl, // Return full URL to the client
          isPremium: false,
          isVerified: updatedUser.is_verified === 1,
          addressLine1: updatedUser.address_line1 || '',
          addressLine2: updatedUser.address_line2 || '',
          city: updatedUser.city || '',
          state: updatedUser.state || '',
          pincode: updatedUser.pincode || '',
          country: updatedUser.country || 'India'
        }
      }
    });
  } catch (error) {
    console.error('❌ Upload profile image error:', error);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🗑️ Deleted file after error');
      } catch (err) {
        console.log('⚠️ Could not delete file after error:', err.message);
      }
    }
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload profile image',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ─── DELETE: Remove profile image ───────────────────────────────────────────
router.delete('/:id/profile-image', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ Removing profile image for user:', id);

    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    if (user.avatar) {
      const avatarPath = path.join(__dirname, '..', user.avatar.replace('/uploads/', 'uploads/'));
      if (fs.existsSync(avatarPath) && fs.lstatSync(avatarPath).isFile()) {
        fs.unlinkSync(avatarPath);
        console.log('🗑️ Deleted avatar:', avatarPath);
      }
    }

    await new Promise((resolve, reject) => {
      db.query(
        'UPDATE customers SET avatar = NULL, updated_at = NOW() WHERE id = ?',
        [id],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });

    const updatedUser = await getUserById(id);

    res.json({
      success: true,
      message: 'Profile image removed successfully',
      data: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        avatar: null
      }
    });
  } catch (error) {
    console.error('❌ Remove profile image error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to remove profile image',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;