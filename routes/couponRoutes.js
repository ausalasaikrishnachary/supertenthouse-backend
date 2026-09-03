// // backend/routes/couponRoutes.js
// const express = require('express');
// const router = express.Router();
// const db = require('../db');

// // ─── GET /api/coupons/active - Get all active coupons ──────────────────────────
// router.get('/coupons/active', (req, res) => {
//   console.log('📦 Fetching active coupons...');
  
//   const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
//   const query = `
//     SELECT * FROM coupons 
//     WHERE is_active = 1 
//     AND expires_at >= ?
//     ORDER BY discount DESC
//   `;
  
//   db.query(query, [now], (err, results) => {
//     if (err) {
//       console.error('❌ Error fetching coupons:', err);
//       return res.status(500).json({ 
//         success: false, 
//         message: 'Database error fetching coupons',
//         error: err.message 
//       });
//     }
    
//     console.log(`✅ Found ${results.length} active coupons`);
    
//     // Map database column names to frontend expected names
//     const coupons = results.map(coupon => {
//       return {
//         id: coupon.id,
//         code: coupon.code,
//         description: coupon.description,
//         discount: parseFloat(coupon.discount),
//         type: coupon.type,
//         minOrder: parseFloat(coupon.minimum_order || coupon.min_order || 0),
//         maxDiscount: coupon.max_discount ? parseFloat(coupon.max_discount) : null,
//         usageLimit: coupon.usage_limit || null,
//         perUserLimit: coupon.per_user_limit || null,
//         usedCount: coupon.used_count || 0,
//         startDate: coupon.start_date || coupon.created_at,
//         endDate: coupon.expires_at || coupon.end_date,
//         active: coupon.is_active === 1 || coupon.active === 1,
//         // Keep original fields for backward compatibility
//         minimum_order: coupon.minimum_order,
//         expires_at: coupon.expires_at,
//         is_active: coupon.is_active
//       };
//     });
    
//     res.json({ 
//       success: true, 
//       data: coupons,
//       count: coupons.length
//     });
//   });
// });

// // ─── GET /api/coupons/test - Test endpoint ─────────────────────────────────────
// router.get('/coupons/test', (req, res) => {
//   res.json({ 
//     success: true, 
//     message: 'Coupon routes are working!',
//     timestamp: new Date().toISOString(),
//     endpoints: [
//       'GET /api/coupons/active',
//       'GET /api/coupons/test',
//       'POST /api/coupons/validate',
//       'POST /api/coupons/apply',
//       'GET /api/admin/coupons',
//       'POST /api/admin/coupons',
//       'PUT /api/admin/coupons/:id',
//       'DELETE /api/admin/coupons/:id'
//     ]
//   });
// });

// // ─── POST /api/coupons/validate - Validate a coupon ────────────────────────────
// router.post('/coupons/validate', (req, res) => {
//   const { code, subtotal, customerId } = req.body;
  
//   console.log('📦 Validating coupon:', { code, subtotal, customerId });
  
//   if (!code) {
//     return res.status(400).json({ 
//       success: false, 
//       message: 'Coupon code is required' 
//     });
//   }
  
//   const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
//   const query = `
//     SELECT * FROM coupons 
//     WHERE code = ? 
//     AND is_active = 1 
//     AND expires_at >= ?
//   `;
  
//   db.query(query, [code.toUpperCase(), now], (err, results) => {
//     if (err) {
//       console.error('❌ Error validating coupon:', err);
//       return res.status(500).json({ 
//         success: false, 
//         message: 'Database error validating coupon' 
//       });
//     }
    
//     if (results.length === 0) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'Invalid or expired coupon' 
//       });
//     }
    
//     const coupon = results[0];
//     console.log('✅ Coupon found:', coupon.code);
    
//     // Get minimum order value (handle both column names)
//     const minOrder = coupon.minimum_order || coupon.min_order || 0;
    
//     // Check minimum order
//     if (subtotal && subtotal < minOrder) {
//       return res.status(400).json({ 
//         success: false, 
//         message: `Minimum order ₹${Number(minOrder).toLocaleString('en-IN')} required` 
//       });
//     }
    
//     // Check usage limit
//     if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Coupon usage limit exceeded' 
//       });
//     }
    
//     // Calculate discount
//     let discountAmount;
//     if (coupon.type === 'percentage') {
//       discountAmount = (subtotal * coupon.discount) / 100;
//       if (coupon.max_discount) {
//         discountAmount = Math.min(discountAmount, coupon.max_discount);
//       }
//     } else {
//       discountAmount = coupon.discount;
//     }
    
//     // Parse JSON fields if they exist
//     let applicableProducts = [];
//     let applicableCategories = [];
    
//     try {
//       if (coupon.applicable_products) {
//         applicableProducts = typeof coupon.applicable_products === 'string' ? 
//           JSON.parse(coupon.applicable_products) : 
//           coupon.applicable_products;
//       }
//       if (coupon.applicable_categories) {
//         applicableCategories = typeof coupon.applicable_categories === 'string' ? 
//           JSON.parse(coupon.applicable_categories) : 
//           coupon.applicable_categories;
//       }
//     } catch (e) {
//       console.warn('⚠️ Failed to parse JSON fields for coupon:', coupon.code);
//     }
    
//     const responseData = {
//       id: coupon.id,
//       code: coupon.code,
//       description: coupon.description,
//       discount: parseFloat(coupon.discount),
//       type: coupon.type,
//       minOrder: parseFloat(minOrder),
//       maxDiscount: coupon.max_discount ? parseFloat(coupon.max_discount) : null,
//       usageLimit: coupon.usage_limit || null,
//       perUserLimit: coupon.per_user_limit || null,
//       usedCount: coupon.used_count || 0,
//       startDate: coupon.start_date || coupon.created_at,
//       endDate: coupon.expires_at || coupon.end_date,
//       active: coupon.is_active === 1 || coupon.active === 1,
//       applicableProducts,
//       applicableCategories,
//       discountAmount: Math.round(discountAmount)
//     };
    
//     res.json({ 
//       success: true, 
//       data: responseData
//     });
//   });
// });

// // ─── POST /api/coupons/apply - Apply coupon (increment usage) ─────────────────
// router.post('/coupons/apply', (req, res) => {
//   const { code, customerId } = req.body;
  
//   console.log('📦 Applying coupon:', { code, customerId });
  
//   if (!code) {
//     return res.status(400).json({ 
//       success: false, 
//       message: 'Coupon code is required' 
//     });
//   }
  
//   // Start transaction
//   db.beginTransaction((err) => {
//     if (err) {
//       console.error('❌ Transaction error:', err);
//       return res.status(500).json({ 
//         success: false, 
//         message: 'Database transaction error' 
//       });
//     }
    
//     // Get coupon
//     const getQuery = 'SELECT * FROM coupons WHERE code = ? AND is_active = 1';
//     db.query(getQuery, [code.toUpperCase()], (err, results) => {
//       if (err) {
//         return db.rollback(() => {
//           console.error('❌ Error getting coupon:', err);
//           res.status(500).json({ 
//             success: false, 
//             message: 'Database error' 
//           });
//         });
//       }
      
//       if (results.length === 0) {
//         return db.rollback(() => {
//           res.status(404).json({ 
//             success: false, 
//             message: 'Coupon not found or inactive' 
//           });
//         });
//       }
      
//       const coupon = results[0];
      
//       // Check usage limit
//       if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
//         return db.rollback(() => {
//           res.status(400).json({ 
//             success: false, 
//             message: 'Coupon usage limit exceeded' 
//           });
//         });
//       }
      
//       // Update usage count
//       const updateQuery = `
//         UPDATE coupons 
//         SET used_count = used_count + 1 
//         WHERE id = ?
//       `;
      
//       db.query(updateQuery, [coupon.id], (err) => {
//         if (err) {
//           return db.rollback(() => {
//             console.error('❌ Error updating coupon usage:', err);
//             res.status(500).json({ 
//               success: false, 
//               message: 'Database error updating coupon' 
//             });
//           });
//         }
        
//         // Commit transaction
//         db.commit((err) => {
//           if (err) {
//             return db.rollback(() => {
//               console.error('❌ Error committing transaction:', err);
//               res.status(500).json({ 
//                 success: false, 
//                 message: 'Database commit error' 
//               });
//             });
//           }
          
//           console.log('✅ Coupon applied successfully:', coupon.code);
//           res.json({ 
//             success: true, 
//             message: 'Coupon applied successfully',
//             data: {
//               code: coupon.code,
//               usedCount: coupon.used_count + 1
//             }
//           });
//         });
//       });
//     });
//   });
// });

// // ─── GET /api/admin/coupons - Get all coupons (Admin) ─────────────────────────
// router.get('/admin/coupons', (req, res) => {
//   console.log('📦 Admin fetching all coupons...');
  
//   const query = 'SELECT * FROM coupons ORDER BY created_at DESC';
  
//   db.query(query, (err, results) => {
//     if (err) {
//       console.error('❌ Error fetching coupons:', err);
//       return res.status(500).json({ 
//         success: false, 
//         message: 'Database error fetching coupons' 
//       });
//     }
    
//     console.log(`✅ Found ${results.length} coupons`);
//     res.json({ success: true, data: results });
//   });
// });

// // ─── POST /api/admin/coupons - Create coupon (Admin) ──────────────────────────
// // backend/routes/couponRoutes.js - Add notification on coupon creation

// // ─── POST /api/admin/coupons - Create coupon (Admin) ──────────────────────────
// // backend/routes/couponRoutes.js - Add notification on coupon creation

// // ─── POST /api/admin/coupons - Create coupon (Admin) ──────────────────────────
// router.post('/admin/coupons', (req, res) => {
//   const {
//     code,
//     description,
//     discount,
//     type,
//     minOrder,
//     maxDiscount,
//     usageLimit,
//     perUserLimit,
//     startDate,
//     endDate,
//     applicableProducts,
//     applicableCategories,
//     active
//   } = req.body;

//   console.log('📦 Creating coupon:', { code, type, discount });

//   if (!code || !description || !discount || !type || !endDate) {
//     return res.status(400).json({ 
//       success: false, 
//       message: 'Missing required fields' 
//     });
//   }

//   // Check if coupon code already exists
//   const checkQuery = 'SELECT id FROM coupons WHERE code = ?';
//   db.query(checkQuery, [code.toUpperCase()], (err, results) => {
//     if (err) {
//       console.error('❌ Error checking coupon:', err);
//       return res.status(500).json({ 
//         success: false, 
//         message: 'Database error' 
//       });
//     }
    
//     if (results.length > 0) {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Coupon code already exists' 
//       });
//     }

//     const query = `
//       INSERT INTO coupons (
//         code, description, discount, type, minimum_order, max_discount,
//         usage_limit, per_user_limit, expires_at, start_date,
//         applicable_products, applicable_categories, is_active
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     const values = [
//       code.toUpperCase(),
//       description,
//       parseFloat(discount),
//       type,
//       parseFloat(minOrder) || 0,
//       maxDiscount ? parseFloat(maxDiscount) : null,
//       usageLimit ? parseInt(usageLimit) : null,
//       perUserLimit ? parseInt(perUserLimit) : null,
//       endDate,
//       startDate || new Date().toISOString().slice(0, 19).replace('T', ' '),
//       applicableProducts ? JSON.stringify(applicableProducts) : null,
//       applicableCategories ? JSON.stringify(applicableCategories) : null,
//       active !== undefined ? (active ? 1 : 0) : 1
//     ];

//     db.query(query, values, (err, result) => {
//       if (err) {
//         console.error('❌ Error creating coupon:', err);
//         return res.status(500).json({ 
//           success: false, 
//           message: 'Database error creating coupon',
//           error: err.message 
//         });
//       }
      
//       console.log('✅ Coupon created:', code);

//       // ─── BROADCAST NOTIFICATION TO ALL CUSTOMERS ─────────────────────────
//       const couponData = {
//         code: code.toUpperCase(),
//         discount: discount,
//         type: type,
//         description: description,
//         minOrder: minOrder || 0,
//         expiresAt: endDate
//       };

//       // Get all customers
//       db.query('SELECT id FROM customers', (err, customers) => {
//         if (!err && customers && customers.length > 0) {
//           const notifTitle = `🎉 New Coupon: ${code.toUpperCase()}`;
//           const notifMessage = `Get ${type === 'percentage' ? `${discount}%` : `₹${discount}`} off! ${description}`;
          
//           const notifQuery = `
//             INSERT INTO notifications (user_id, title, message, type, icon, data, created_at)
//             VALUES ?
//           `;
          
//           const notifValues = customers.map(c => [
//             c.id,
//             notifTitle,
//             notifMessage,
//             'coupon',
//             'tag',
//             JSON.stringify(couponData),
//             new Date().toISOString().slice(0, 19).replace('T', ' ')
//           ]);
          
//           db.query(notifQuery, [notifValues], (notifErr) => {
//             if (notifErr) {
//               console.error('Error broadcasting coupon notification:', notifErr);
//             } else {
//               console.log(`📧 Coupon notification sent to ${customers.length} customers`);
//             }
//           });
//         }
//       });

//       res.status(201).json({ 
//         success: true, 
//         message: 'Coupon created successfully',
//         data: { id: result.insertId, code: code.toUpperCase() }
//       });
//     });
//   });
// });

// // ─── PUT /api/admin/coupons/:id - Update coupon (Admin) ───────────────────────
// router.put('/admin/coupons/:id', (req, res) => {
//   const couponId = req.params.id;
//   const {
//     code,
//     description,
//     discount,
//     type,
//     minOrder,
//     maxDiscount,
//     usageLimit,
//     perUserLimit,
//     startDate,
//     endDate,
//     applicableProducts,
//     applicableCategories,
//     active
//   } = req.body;

//   console.log('📦 Updating coupon:', { id: couponId, code });

//   // Check if coupon exists
//   const checkQuery = 'SELECT id FROM coupons WHERE id = ?';
//   db.query(checkQuery, [couponId], (err, results) => {
//     if (err) {
//       console.error('❌ Error checking coupon:', err);
//       return res.status(500).json({ 
//         success: false, 
//         message: 'Database error' 
//       });
//     }
    
//     if (results.length === 0) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'Coupon not found' 
//       });
//     }

//     // Check if code is taken by another coupon
//     if (code) {
//       const codeCheckQuery = 'SELECT id FROM coupons WHERE code = ? AND id != ?';
//       db.query(codeCheckQuery, [code.toUpperCase(), couponId], (err, codeResults) => {
//         if (err) {
//           console.error('❌ Error checking code:', err);
//           return res.status(500).json({ 
//             success: false, 
//             message: 'Database error' 
//           });
//         }
        
//         if (codeResults.length > 0) {
//           return res.status(400).json({ 
//             success: false, 
//             message: 'Coupon code already exists' 
//           });
//         }
        
//         updateCoupon();
//       });
//     } else {
//       updateCoupon();
//     }

//     function updateCoupon() {
//       const query = `
//         UPDATE coupons SET
//           code = COALESCE(?, code),
//           description = COALESCE(?, description),
//           discount = COALESCE(?, discount),
//           type = COALESCE(?, type),
//           minimum_order = COALESCE(?, minimum_order),
//           max_discount = ?,
//           usage_limit = ?,
//           per_user_limit = ?,
//           expires_at = COALESCE(?, expires_at),
//           start_date = COALESCE(?, start_date),
//           applicable_products = ?,
//           applicable_categories = ?,
//           is_active = COALESCE(?, is_active)
//         WHERE id = ?
//       `;

//       const values = [
//         code ? code.toUpperCase() : null,
//         description,
//         discount ? parseFloat(discount) : null,
//         type,
//         minOrder ? parseFloat(minOrder) : null,
//         maxDiscount ? parseFloat(maxDiscount) : null,
//         usageLimit ? parseInt(usageLimit) : null,
//         perUserLimit ? parseInt(perUserLimit) : null,
//         endDate,
//         startDate,
//         applicableProducts ? JSON.stringify(applicableProducts) : null,
//         applicableCategories ? JSON.stringify(applicableCategories) : null,
//         active !== undefined ? (active ? 1 : 0) : null,
//         couponId
//       ];

//       db.query(query, values, (err) => {
//         if (err) {
//           console.error('❌ Error updating coupon:', err);
//           return res.status(500).json({ 
//             success: false, 
//             message: 'Database error updating coupon' 
//           });
//         }
        
//         console.log('✅ Coupon updated:', code || couponId);
//         res.json({ 
//           success: true, 
//           message: 'Coupon updated successfully' 
//         });
//       });
//     }
//   });
// });

// // ─── DELETE /api/admin/coupons/:id - Delete coupon (Admin) ────────────────────
// router.delete('/admin/coupons/:id', (req, res) => {
//   const couponId = req.params.id;
  
//   console.log('📦 Deleting coupon:', couponId);
  
//   const query = 'DELETE FROM coupons WHERE id = ?';
//   db.query(query, [couponId], (err, result) => {
//     if (err) {
//       console.error('❌ Error deleting coupon:', err);
//       return res.status(500).json({ 
//         success: false, 
//         message: 'Database error deleting coupon' 
//       });
//     }
    
//     if (result.affectedRows === 0) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'Coupon not found' 
//       });
//     }
    
//     console.log('✅ Coupon deleted:', couponId);
//     res.json({ 
//       success: true, 
//       message: 'Coupon deleted successfully' 
//     });
//   });
// });

// module.exports = router;




// backend/routes/couponRoutes.js
// backend/routes/couponRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// ─── Helper: Broadcast Coupon Notification to All Customers ────────────────
const broadcastCouponNotification = async (couponData) => {
  try {
    console.log('📧 Starting broadcast for coupon notification...');
    
    // Get all customers
    const [customers] = await db.promise().query('SELECT id FROM customers');
    
    if (customers.length === 0) {
      console.log('⚠️ No customers found to send notifications');
      return 0;
    }
    
    console.log(`📧 Found ${customers.length} customers`);
    
    const { code, discount, type, description, minOrder, expiresAt } = couponData;
    
    const title = `🎉 New Coupon: ${code}`;
    const message = `Get ${type === 'percentage' ? `${discount}%` : `₹${discount}`} off! ${description || 'Use this coupon on your next order'}`;
    
    // Create notification for each customer
    const values = customers.map(c => [
      c.id,
      title,
      message,
      'coupon',
      'tag',
      JSON.stringify(couponData),
      0,
      new Date().toISOString().slice(0, 19).replace('T', ' ')
    ]);
    
    const query = `
      INSERT INTO notifications (user_id, title, message, type, icon, data, is_read, created_at)
      VALUES ?
    `;
    
    console.log(`📧 Inserting ${values.length} notifications...`);
    
    const [result] = await db.promise().query(query, [values]);
    console.log(`✅ ${result.affectedRows} notifications inserted successfully`);
    return result.affectedRows;
  } catch (error) {
    console.error('❌ Error broadcasting coupon notification:', error);
    return 0;
  }
};

// ─── GET /api/coupons/active - Get all active coupons ──────────────────────────
router.get('/coupons/active', (req, res) => {
  console.log('📦 Fetching active coupons...');
  
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  const query = `
    SELECT * FROM coupons 
    WHERE is_active = 1 
    AND expires_at >= ?
    ORDER BY discount DESC
  `;
  
  db.query(query, [now], (err, results) => {
    if (err) {
      console.error('❌ Error fetching coupons:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error fetching coupons',
        error: err.message 
      });
    }
    
    console.log(`✅ Found ${results.length} active coupons`);
    
    const coupons = results.map(coupon => {
      return {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount: parseFloat(coupon.discount),
        type: coupon.type,
        minOrder: parseFloat(coupon.minimum_order || coupon.min_order || 0),
        maxDiscount: coupon.max_discount ? parseFloat(coupon.max_discount) : null,
        usageLimit: coupon.usage_limit || null,
        perUserLimit: coupon.per_user_limit || null,
        usedCount: coupon.used_count || 0,
        startDate: coupon.start_date || coupon.created_at,
        endDate: coupon.expires_at || coupon.end_date,
        active: coupon.is_active === 1 || coupon.active === 1,
        minimum_order: coupon.minimum_order,
        expires_at: coupon.expires_at,
        is_active: coupon.is_active
      };
    });
    
    res.json({ 
      success: true, 
      data: coupons,
      count: coupons.length
    });
  });
});

// ─── GET /api/coupons/test - Test endpoint ─────────────────────────────────────
router.get('/coupons/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Coupon routes are working!',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/coupons/active',
      'GET /api/coupons/test',
      'POST /api/coupons/validate',
      'POST /api/coupons/apply',
      'GET /api/admin/coupons',
      'POST /api/admin/coupons',
      'PUT /api/admin/coupons/:id',
      'DELETE /api/admin/coupons/:id'
    ]
  });
});

// ─── POST /api/coupons/validate - Validate a coupon ────────────────────────────
router.post('/coupons/validate', (req, res) => {
  const { code, subtotal, customerId } = req.body;
  
  console.log('📦 Validating coupon:', { code, subtotal, customerId });
  
  if (!code) {
    return res.status(400).json({ 
      success: false, 
      message: 'Coupon code is required' 
    });
  }
  
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  const query = `
    SELECT * FROM coupons 
    WHERE code = ? 
    AND is_active = 1 
    AND expires_at >= ?
  `;
  
  db.query(query, [code.toUpperCase(), now], (err, results) => {
    if (err) {
      console.error('❌ Error validating coupon:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error validating coupon' 
      });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invalid or expired coupon' 
      });
    }
    
    const coupon = results[0];
    console.log('✅ Coupon found:', coupon.code);
    
    const minOrder = coupon.minimum_order || coupon.min_order || 0;
    
    if (subtotal && subtotal < minOrder) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum order ₹${Number(minOrder).toLocaleString('en-IN')} required` 
      });
    }
    
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return res.status(400).json({ 
        success: false, 
        message: 'Coupon usage limit exceeded' 
      });
    }
    
    let discountAmount;
    if (coupon.type === 'percentage') {
      discountAmount = (subtotal * coupon.discount) / 100;
      if (coupon.max_discount) {
        discountAmount = Math.min(discountAmount, coupon.max_discount);
      }
    } else {
      discountAmount = coupon.discount;
    }
    
    let applicableProducts = [];
    let applicableCategories = [];
    
    try {
      if (coupon.applicable_products) {
        applicableProducts = typeof coupon.applicable_products === 'string' ? 
          JSON.parse(coupon.applicable_products) : 
          coupon.applicable_products;
      }
      if (coupon.applicable_categories) {
        applicableCategories = typeof coupon.applicable_categories === 'string' ? 
          JSON.parse(coupon.applicable_categories) : 
          coupon.applicable_categories;
      }
    } catch (e) {
      console.warn('⚠️ Failed to parse JSON fields for coupon:', coupon.code);
    }
    
    const responseData = {
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discount: parseFloat(coupon.discount),
      type: coupon.type,
      minOrder: parseFloat(minOrder),
      maxDiscount: coupon.max_discount ? parseFloat(coupon.max_discount) : null,
      usageLimit: coupon.usage_limit || null,
      perUserLimit: coupon.per_user_limit || null,
      usedCount: coupon.used_count || 0,
      startDate: coupon.start_date || coupon.created_at,
      endDate: coupon.expires_at || coupon.end_date,
      active: coupon.is_active === 1 || coupon.active === 1,
      applicableProducts,
      applicableCategories,
      discountAmount: Math.round(discountAmount)
    };
    
    res.json({ 
      success: true, 
      data: responseData
    });
  });
});

// ─── POST /api/coupons/apply - Apply coupon (increment usage) ─────────────────
router.post('/coupons/apply', (req, res) => {
  const { code, customerId } = req.body;
  
  console.log('📦 Applying coupon:', { code, customerId });
  
  if (!code) {
    return res.status(400).json({ 
      success: false, 
      message: 'Coupon code is required' 
    });
  }
  
  db.beginTransaction((err) => {
    if (err) {
      console.error('❌ Transaction error:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Database transaction error' 
      });
    }
    
    const getQuery = 'SELECT * FROM coupons WHERE code = ? AND is_active = 1';
    db.query(getQuery, [code.toUpperCase()], (err, results) => {
      if (err) {
        return db.rollback(() => {
          console.error('❌ Error getting coupon:', err);
          res.status(500).json({ 
            success: false, 
            message: 'Database error' 
          });
        });
      }
      
      if (results.length === 0) {
        return db.rollback(() => {
          res.status(404).json({ 
            success: false, 
            message: 'Coupon not found or inactive' 
          });
        });
      }
      
      const coupon = results[0];
      
      if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
        return db.rollback(() => {
          res.status(400).json({ 
            success: false, 
            message: 'Coupon usage limit exceeded' 
          });
        });
      }
      
      const updateQuery = `
        UPDATE coupons 
        SET used_count = used_count + 1 
        WHERE id = ?
      `;
      
      db.query(updateQuery, [coupon.id], (err) => {
        if (err) {
          return db.rollback(() => {
            console.error('❌ Error updating coupon usage:', err);
            res.status(500).json({ 
              success: false, 
              message: 'Database error updating coupon' 
            });
          });
        }
        
        db.commit((err) => {
          if (err) {
            return db.rollback(() => {
              console.error('❌ Error committing transaction:', err);
              res.status(500).json({ 
                success: false, 
                message: 'Database commit error' 
              });
            });
          }
          
          console.log('✅ Coupon applied successfully:', coupon.code);
          res.json({ 
            success: true, 
            message: 'Coupon applied successfully',
            data: {
              code: coupon.code,
              usedCount: coupon.used_count + 1
            }
          });
        });
      });
    });
  });
});

// ─── GET /api/admin/coupons - Get all coupons (Admin) ─────────────────────────
router.get('/admin/coupons', (req, res) => {
  console.log('📦 Admin fetching all coupons...');
  
  const query = 'SELECT * FROM coupons ORDER BY created_at DESC';
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching coupons:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error fetching coupons' 
      });
    }
    
    console.log(`✅ Found ${results.length} coupons`);
    res.json({ success: true, data: results });
  });
});

// ─── POST /api/admin/coupons - Create coupon (Admin) ──────────────────────────
router.post('/admin/coupons', async (req, res) => {
  const {
    code,
    description,
    discount,
    type,
    minOrder,
    maxDiscount,
    usageLimit,
    perUserLimit,
    startDate,
    endDate,
    applicableProducts,
    applicableCategories,
    active
  } = req.body;

  console.log('📦 Creating coupon:', { code, type, discount });

  if (!code || !description || !discount || !type || !endDate) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields' 
    });
  }

  // Check if coupon code already exists
  const checkQuery = 'SELECT id FROM coupons WHERE code = ?';
  db.query(checkQuery, [code.toUpperCase()], (err, results) => {
    if (err) {
      console.error('❌ Error checking coupon:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error' 
      });
    }
    
    if (results.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Coupon code already exists' 
      });
    }

    const query = `
      INSERT INTO coupons (
        code, description, discount, type, minimum_order, max_discount,
        usage_limit, per_user_limit, expires_at, start_date,
        applicable_products, applicable_categories, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      code.toUpperCase(),
      description,
      parseFloat(discount),
      type,
      parseFloat(minOrder) || 0,
      maxDiscount ? parseFloat(maxDiscount) : null,
      usageLimit ? parseInt(usageLimit) : null,
      perUserLimit ? parseInt(perUserLimit) : null,
      endDate,
      startDate || new Date().toISOString().slice(0, 19).replace('T', ' '),
      applicableProducts ? JSON.stringify(applicableProducts) : null,
      applicableCategories ? JSON.stringify(applicableCategories) : null,
      active !== undefined ? (active ? 1 : 0) : 1
    ];

    db.query(query, values, async (err, result) => {
      if (err) {
        console.error('❌ Error creating coupon:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'Database error creating coupon',
          error: err.message 
        });
      }
      
      console.log('✅ Coupon created successfully with ID:', result.insertId);

      // ─── BROADCAST NOTIFICATION TO ALL CUSTOMERS ─────────────────────────
      try {
        // Check if customers table has data
        const [customers] = await db.promise().query('SELECT id FROM customers');
        console.log(`📧 Found ${customers.length} customers in database`);
        
        if (customers && customers.length > 0) {
          const couponData = {
            code: code.toUpperCase(),
            discount: parseFloat(discount),
            type: type,
            description: description,
            minOrder: parseFloat(minOrder) || 0,
            expiresAt: endDate
          };
          
          const title = `🎉 New Coupon: ${code.toUpperCase()}`;
          const message = `Get ${type === 'percentage' ? `${discount}%` : `₹${discount}`} off! ${description}`;
          
          // Create notification for each customer
          const notifValues = customers.map(c => [
            c.id,
            title,
            message,
            'coupon',
            'tag',
            JSON.stringify(couponData),
            0,
            new Date().toISOString().slice(0, 19).replace('T', ' ')
          ]);
          
          const notifQuery = `
            INSERT INTO notifications (user_id, title, message, type, icon, data, is_read, created_at)
            VALUES ?
          `;
          
          const [notifResult] = await db.promise().query(notifQuery, [notifValues]);
          console.log(`✅ ${notifResult.affectedRows} notifications inserted successfully`);
        } else {
          console.log('⚠️ No customers found to send coupon notification');
        }
      } catch (notifError) {
        console.error('❌ Error in notification broadcasting:', notifError);
        console.error('Error details:', notifError.message);
      }

      res.status(201).json({ 
        success: true, 
        message: 'Coupon created successfully',
        data: { id: result.insertId, code: code.toUpperCase() }
      });
    });
  });
});

// ─── PUT /api/admin/coupons/:id - Update coupon (Admin) ───────────────────────
router.put('/admin/coupons/:id', (req, res) => {
  const couponId = req.params.id;
  const {
    code,
    description,
    discount,
    type,
    minOrder,
    maxDiscount,
    usageLimit,
    perUserLimit,
    startDate,
    endDate,
    applicableProducts,
    applicableCategories,
    active
  } = req.body;

  console.log('📦 Updating coupon:', { id: couponId, code });

  const checkQuery = 'SELECT id FROM coupons WHERE id = ?';
  db.query(checkQuery, [couponId], (err, results) => {
    if (err) {
      console.error('❌ Error checking coupon:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error' 
      });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Coupon not found' 
      });
    }

    if (code) {
      const codeCheckQuery = 'SELECT id FROM coupons WHERE code = ? AND id != ?';
      db.query(codeCheckQuery, [code.toUpperCase(), couponId], (err, codeResults) => {
        if (err) {
          console.error('❌ Error checking code:', err);
          return res.status(500).json({ 
            success: false, 
            message: 'Database error' 
          });
        }
        
        if (codeResults.length > 0) {
          return res.status(400).json({ 
            success: false, 
            message: 'Coupon code already exists' 
          });
        }
        
        updateCoupon();
      });
    } else {
      updateCoupon();
    }

    function updateCoupon() {
      const query = `
        UPDATE coupons SET
          code = COALESCE(?, code),
          description = COALESCE(?, description),
          discount = COALESCE(?, discount),
          type = COALESCE(?, type),
          minimum_order = COALESCE(?, minimum_order),
          max_discount = ?,
          usage_limit = ?,
          per_user_limit = ?,
          expires_at = COALESCE(?, expires_at),
          start_date = COALESCE(?, start_date),
          applicable_products = ?,
          applicable_categories = ?,
          is_active = COALESCE(?, is_active)
        WHERE id = ?
      `;

      const values = [
        code ? code.toUpperCase() : null,
        description,
        discount ? parseFloat(discount) : null,
        type,
        minOrder ? parseFloat(minOrder) : null,
        maxDiscount ? parseFloat(maxDiscount) : null,
        usageLimit ? parseInt(usageLimit) : null,
        perUserLimit ? parseInt(perUserLimit) : null,
        endDate,
        startDate,
        applicableProducts ? JSON.stringify(applicableProducts) : null,
        applicableCategories ? JSON.stringify(applicableCategories) : null,
        active !== undefined ? (active ? 1 : 0) : null,
        couponId
      ];

      db.query(query, values, (err) => {
        if (err) {
          console.error('❌ Error updating coupon:', err);
          return res.status(500).json({ 
            success: false, 
            message: 'Database error updating coupon' 
          });
        }
        
        console.log('✅ Coupon updated:', code || couponId);
        res.json({ 
          success: true, 
          message: 'Coupon updated successfully' 
        });
      });
    }
  });
});

// ─── DELETE /api/admin/coupons/:id - Delete coupon (Admin) ────────────────────
router.delete('/admin/coupons/:id', (req, res) => {
  const couponId = req.params.id;
  
  console.log('📦 Deleting coupon:', couponId);
  
  const query = 'DELETE FROM coupons WHERE id = ?';
  db.query(query, [couponId], (err, result) => {
    if (err) {
      console.error('❌ Error deleting coupon:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error deleting coupon' 
      });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Coupon not found' 
      });
    }
    
    console.log('✅ Coupon deleted:', couponId);
    res.json({ 
      success: true, 
      message: 'Coupon deleted successfully' 
    });
  });
});

module.exports = router;