// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { adminOnly } = require("./middleware/auth");

// Import all route files
const loginRoutes = require("./routes/loginRoutes");
const productRoutes = require("./routes/productRoute");
const orderRoutes = require("./routes/orderRoutes");
const categoryRoutes = require("./routes/categoryRoute");
const customerRoutes = require("./routes/CustomerLogin"); // This has register/login
const cartRoutes = require("./routes/CartRoute");
const userRoutes = require("./routes/userRoute");
const packageRoutes = require('./routes/packages');
const wishlistRoutes = require("./routes/WishlistRoute");
const couponRoutes = require("./routes/couponRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const salesmanRoutes = require("./routes/salesmanRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const salesmanNotificationRoutes = require("./routes/salesmanNotificationRoutes");

// Additional routes
const heroBannersRoutes = require("./routes/hero-banners");
const testimonialsRoutes = require("./routes/testimonials");
const whyChooseUsRoutes = require("./routes/whyChooseUs");
const addonRoutes = require('./routes/addons');
const checkoutRoutes = require("./routes/checkOut");
const customerOrderRoutes = require("./routes/customerOrderRoutes");
const customerProfileRoutes = require("./routes/customerProfileRoutes");
const salesmanOrderRoutes = require("./routes/salesmanOrderRoutes");
const orderPaymentRoutes = require("./routes/orderPayments");

const app = express();

// ─── Enhanced CORS configuration ──────────────────────────────────────────────
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin', 'Access-Control-Allow-Origin'],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false,
};

app.use(cors(corsOptions));

// Custom CORS headers middleware - runs for all requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin, Access-Control-Allow-Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    console.log('📡 Preflight request for:', req.url);
    return res.status(200).end();
  }
  next();
});

// ─── Middleware - These must come BEFORE routes ──────────────────────────────
app.use(express.text({ type: "text/xml" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ─── Create uploads folders automatically ─────────────────────────────────────
const uploadPath = path.join(__dirname, "uploads");
const imagePath = path.join(uploadPath, "products");
const pdfPath = path.join(uploadPath, "pdfs");
const categoriesPath = path.join(uploadPath, "categories");
const profilesPath = path.join(uploadPath, "profiles");

[uploadPath, imagePath, pdfPath, categoriesPath, profilesPath].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// ─── Static folder - This must come BEFORE routes ────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads/products", express.static(path.join(__dirname, "uploads/products")));
app.use("/uploads/categories", express.static(path.join(__dirname, "uploads/categories")));
app.use("/uploads/pdfs", express.static(path.join(__dirname, "uploads/pdfs")));
app.use("/uploads/profiles", express.static(path.join(__dirname, "uploads/profiles")));

// ─── Add logging middleware to see incoming requests ─────────────────────────
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url}`);
  next();
});

// ─── Test route to verify API is working ──────────────────────────────────────
app.get("/api/test", (req, res) => {
  res.json({ 
    message: "API is working!", 
    timestamp: new Date().toISOString(),
    uploadsPath: "/uploads",
    authEndpoints: [
      "POST /api/auth/register",
      "POST /api/auth/login", 
      "POST /api/auth/verify-otp",
      "POST /api/auth/resend-otp",
      "POST /api/customers/register",
      "POST /api/customers/login"
    ]
  });
});

// ═══════════════════════════════════════════════════════════════════
// 🔐 FIX: Mount auth routes on /api/auth
// ═══════════════════════════════════════════════════════════════════
app.use("/api/auth", customerRoutes);

// ─── API Routes - Register AFTER middleware ──────────────────────────────────
app.use("/api/admin", loginRoutes);
app.use('/api/packages', packageRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/customers", userRoutes);
app.use('/api/addons', addonRoutes);
app.use("/api/customers", customerRoutes); // Also keep this for backward compatibility
app.use("/api/hero-banners", heroBannersRoutes);
app.use("/api/testimonials", testimonialsRoutes);
app.use("/api/why-choose-us", whyChooseUsRoutes);
app.use("/api", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/invoice", invoiceRoutes);
app.use("/api/salesman", salesmanRoutes);
app.use("/api", notificationRoutes);
app.use("/api/salesman/notifications", salesmanNotificationRoutes);
app.use("/api/salesman-orders", salesmanOrderRoutes);
app.use("/api/order-payments", orderPaymentRoutes);
app.use("/api/customers", customerProfileRoutes);
app.use("/api/customer-orders", customerOrderRoutes);
app.use("/api", couponRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/wishlist", wishlistRoutes);

// ─── Route to check if an image exists ──────────────────────────────────────
app.get("/api/check-image/:filename", (req, res) => {
  const filename = req.params.filename;
  const imagePath = path.join(__dirname, "uploads/products", filename);
  
  if (fs.existsSync(imagePath)) {
    res.json({ exists: true, path: `/uploads/products/${filename}` });
  } else {
    res.json({ exists: false, message: "Image not found" });
  }
});

// ─── Route to list all images in products folder ────────────────────────────
app.get("/api/list-images", (req, res) => {
  const productsPath = path.join(__dirname, "uploads/products");
  
  if (fs.existsSync(productsPath)) {
    const files = fs.readdirSync(productsPath);
    res.json({ 
      count: files.length, 
      files: files,
      path: "/uploads/products/"
    });
  } else {
    res.json({ count: 0, files: [], message: "Products folder not found" });
  }
});

// ─── Debug routes ──────────────────────────────────────────────────────────────
app.get("/api/debug/product/:id", (req, res) => {
  const productId = req.params.id;
  const db = require("./db");
  
  db.query(
    "SELECT id, product_name, colors, color_images FROM products WHERE id = ?",
    [productId],
    (err, results) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const product = results[0];
      
      if (product.color_images && typeof product.color_images === 'string') {
        try {
          product.color_images = JSON.parse(product.color_images);
        } catch (e) {
          product.color_images = { error: "Failed to parse JSON" };
        }
      }
      
      if (product.colors && typeof product.colors === 'string') {
        try {
          product.colors = JSON.parse(product.colors);
        } catch (e) {
          product.colors = { error: "Failed to parse JSON" };
        }
      }
      
      const filesOnDisk = fs.existsSync(imagePath) ? fs.readdirSync(imagePath) : [];
      
      let fullUrls = {};
      if (product.color_images && typeof product.color_images === 'object') {
        fullUrls = Object.keys(product.color_images).reduce((acc, color) => {
          acc[color] = product.color_images[color].map(img => {
            const filename = img.split('/').pop() || img;
            const exists = filesOnDisk.includes(filename);
            return {
              path: img,
              filename: filename,
              fullUrl: `http://localhost:5000/uploads/products/${filename}`,
              exists: exists
            };
          });
          return acc;
        }, {});
      }
      
      res.json({
        productId: product.id,
        productName: product.product_name,
        colors: product.colors,
        color_images: product.color_images,
        filesOnDisk: filesOnDisk,
        fullUrls: fullUrls,
        uploadsPath: imagePath
      });
    }
  );
});

app.get("/api/debug/description/:id", (req, res) => {
  const productId = req.params.id;
  const db = require("./db");
  
  db.query(
    "SELECT id, product_name, product_description, description FROM products WHERE id = ?",
    [productId],
    (err, results) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      res.json({
        productId: results[0].id,
        productName: results[0].product_name,
        product_description: results[0].product_description,
        description: results[0].description,
        hasProductDescription: !!results[0].product_description,
        hasDescription: !!results[0].description,
        length: results[0].product_description?.length || 0
      });
    }
  );
});

// Rewrites `color_images` in place, so it is admin-only. It was previously
// reachable with no token at all.
app.post("/api/fix-color-images/:id", adminOnly, (req, res) => {
  const productId = req.params.id;
  const db = require("./db");
  
  db.query(
    "SELECT id, product_name, colors, color_images FROM products WHERE id = ?",
    [productId],
    (err, results) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const product = results[0];
      let colorImages = {};
      
      if (product.color_images && typeof product.color_images === 'string') {
        try {
          colorImages = JSON.parse(product.color_images);
        } catch (e) {
          colorImages = {};
        }
      } else if (product.color_images && typeof product.color_images === 'object') {
        colorImages = product.color_images;
      }
      
      const filesOnDisk = fs.existsSync(imagePath) ? fs.readdirSync(imagePath) : [];
      
      const filenameMap = {};
      filesOnDisk.forEach(file => {
        if (file.includes('homedecoration') || file.includes('1785319610272-672129863')) {
          filenameMap['homedecorationicon.jpg'] = file;
        }
        if (file.includes('Exploded') || file.includes('1785319610272-164699782')) {
          filenameMap['Exploded_technical_visualizati_1.jpg'] = file;
        }
        if (file.includes('stage') || file.includes('1785319610285-278028816')) {
          filenameMap['stage.jpg'] = file;
        }
        if (file.includes('lighting') || file.includes('1785319610305-429067254')) {
          filenameMap['lighting.jpg'] = file;
        }
        if (file.includes('partysuppiies') || file.includes('1785319610272-672129863')) {
          filenameMap['partysuppiies.jpg'] = file;
        }
        if (file.includes('tables') || file.includes('1785319610272-164699782')) {
          filenameMap['tables.jpg'] = file;
        }
        if (file.includes('candlelamps') || file.includes('1785319610285-278028816')) {
          filenameMap['candlelamps.jpg'] = file;
        }
        if (file.includes('banner') || file.includes('1785319610305-429067254')) {
          filenameMap['banner stands.jpg'] = file;
          filenameMap['banner_stands.jpg'] = file;
        }
      });
      
      const updatedColorImages = {};
      Object.keys(colorImages).forEach(color => {
        const images = colorImages[color];
        if (Array.isArray(images)) {
          updatedColorImages[color] = images.map(img => {
            const filename = img.split('/').pop() || img;
            if (filenameMap[filename]) {
              return `uploads/products/${filenameMap[filename]}`;
            }
            if (filesOnDisk.includes(filename)) {
              return `uploads/products/${filename}`;
            }
            return img;
          });
        }
      });
      
      db.query(
        "UPDATE products SET color_images = ? WHERE id = ?",
        [JSON.stringify(updatedColorImages), productId],
        (updateErr) => {
          if (updateErr) {
            return res.status(500).json({ error: updateErr.message });
          }
          
          res.json({
            message: "Color images fixed successfully",
            productId: productId,
            oldColorImages: colorImages,
            newColorImages: updatedColorImages,
            filenameMap: filenameMap
          });
        }
      );
    }
  );
});

// ─── Error handling middleware ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ─── 404 handler - This should be LAST ──────────────────────────────────────
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ 
    message: 'Route not found',
    path: req.url,
    availableEndpoints: {
      auth: [
        "POST /api/auth/register - Register new user",
        "POST /api/auth/login - Login user", 
        "POST /api/auth/verify-otp - Verify OTP",
        "POST /api/auth/resend-otp - Resend OTP"
      ],
      customers: [
        "POST /api/customers/register - Register (alternate)",
        "POST /api/customers/login - Login (alternate)",
        "GET /api/customers/profile/:id - Get profile",
        "PUT /api/customers/:id - Update profile",
        "POST /api/customers/:id/profile-image - Upload photo",
        "GET /api/customers/me - Get current user"
      ],
      products: [
        "GET /api/products - Get all products",
        "GET /api/products/:id - Get single product",
        "GET /api/products/category/:categoryId - Get by category"
      ],
      other: [
        "GET /api/test - Test API",
        "GET /api/categories - Get all categories",
        "GET /api/cart/:customerId - Get cart",
        "GET /api/wishlist/:customerId - Get wishlist"
      ]
    }
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`\n🔐 AUTH ENDPOINTS (via /api/auth):`);
  console.log(`   ──────────────────────────────────────`);
  console.log(`   POST /api/auth/register        - Register new user`);
  console.log(`   POST /api/auth/login           - Login user`);
  console.log(`   POST /api/auth/verify-otp      - Verify OTP`);
  console.log(`   POST /api/auth/resend-otp      - Resend OTP`);
  console.log(`   ──────────────────────────────────────`);
  console.log(`   POST /api/customers/register   - Register (alternate)`);
  console.log(`   POST /api/customers/login      - Login (alternate)`);
  console.log(`   ──────────────────────────────────────`);
  console.log(`\n📁 Static Files: http://localhost:${PORT}/uploads/`);
});
