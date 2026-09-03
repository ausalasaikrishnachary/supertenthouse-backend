// backend/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// ─── Helper: Create Notification ──────────────────────────────────────────────
const createNotification = async (userId, title, message, type, icon, data = null) => {
  try {
    // Check if user exists
    const [user] = await db.promise().query('SELECT id FROM customers WHERE id = ?', [userId]);
    
    if (user.length === 0) {
      console.log(`⚠️ User ${userId} not found, skipping notification`);
      return null;
    }
    
    const query = `
      INSERT INTO notifications (user_id, title, message, type, icon, data, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, NOW())
    `;
    
    const values = [userId, title, message, type, icon, data ? JSON.stringify(data) : null];
    
    const [result] = await db.promise().query(query, values);
    console.log(`📧 Notification created for user ${userId}: ${title}`);
    return result.insertId;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// ─── Helper: Broadcast Notification to All Customers ────────────────────────
const broadcastNotification = async (title, message, type, icon, data = null) => {
  try {
    // Get all customers
    const [customers] = await db.promise().query('SELECT id FROM customers');
    
    if (customers.length === 0) {
      console.log('⚠️ No customers found to send notifications');
      return 0;
    }
    
    console.log(`📧 Broadcasting notification to ${customers.length} customers`);
    
    // Create notification for each customer
    const values = customers.map(c => [
      c.id,
      title,
      message,
      type || 'general',
      icon || 'bell',
      data ? JSON.stringify(data) : null,
      0,
      new Date().toISOString().slice(0, 19).replace('T', ' ')
    ]);
    
    const query = `
      INSERT INTO notifications (user_id, title, message, type, icon, data, is_read, created_at)
      VALUES ?
    `;
    
    const [result] = await db.promise().query(query, [values]);
    console.log(`✅ Broadcast notification sent to ${result.affectedRows} customers`);
    return result.affectedRows;
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    return 0;
  }
};

// ─── Get Notifications for a User ────────────────────────────────────────────
router.get('/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`📦 Fetching notifications for user: ${userId}`);
    
    const query = `
      SELECT * FROM notifications 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 50
    `;
    
    const [notifications] = await db.promise().query(query, [userId]);
    
    // Parse data JSON
    const parsedNotifications = notifications.map(notif => {
      try {
        if (notif.data) {
          notif.data = JSON.parse(notif.data);
        }
      } catch (e) {
        notif.data = null;
      }
      return notif;
    });
    
    console.log(`✅ Found ${parsedNotifications.length} notifications for user ${userId}`);
    
    res.json({
      success: true,
      data: parsedNotifications
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
});

// ─── Mark Notification as Read ──────────────────────────────────────────────
router.put('/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.promise().query(
      'UPDATE notifications SET is_read = 1 WHERE id = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
});

// ─── Mark All Notifications as Read ─────────────────────────────────────────
router.put('/notifications/:userId/read-all', async (req, res) => {
  try {
    const { userId } = req.params;
    
    await db.promise().query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
      [userId]
    );
    
    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read'
    });
  }
});

// ─── Get Unread Count ────────────────────────────────────────────────────────
router.get('/notifications/:userId/unread-count', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [result] = await db.promise().query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    
    res.json({
      success: true,
      count: result[0]?.count || 0
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count'
    });
  }
});

// ─── Admin: Broadcast Notification ──────────────────────────────────────────
router.post('/admin/notifications/broadcast', async (req, res) => {
  try {
    const { title, message, type, icon, data } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required'
      });
    }
    
    const count = await broadcastNotification(
      title,
      message,
      type || 'general',
      icon || 'bell',
      data || null
    );
    
    res.json({
      success: true,
      message: `Broadcast notification sent to ${count} customers`,
      count
    });
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to broadcast notification'
    });
  }
});



// backend/routes/notificationRoutes.js - Add this endpoint

// ─── Get Unread Count ────────────────────────────────────────────────────────
router.get('/notifications/:userId/unread-count', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [result] = await db.promise().query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    
    res.json({
      success: true,
      count: result[0]?.count || 0
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count'
    });
  }
});

module.exports = router;