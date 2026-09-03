const express = require("express");
const router = express.Router();
const db = require("../db");

// ==============================
// CREATE NEW ORDER (Salesman)
// ==============================
router.post("/", async (req, res) => {
    const { 
        customer_id, 
        items, 
        total_amount, 
        order_date,
        salesman_id,
        salesman_name,
        payment_method = 'cash',
        notes = null
    } = req.body;

    if (!customer_id) {
        return res.status(400).json({ error: "Customer ID is required" });
    }

    if (!salesman_id) {
        return res.status(400).json({ error: "Salesman ID is required" });
    }

    if (!items || items.length === 0) {
        return res.status(400).json({ error: "At least one product is required" });
    }

    try {
        await db.promise().query("START TRANSACTION");

        const subtotal = total_amount || items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const tax = subtotal * 0.18;
        const grandTotal = subtotal + tax;

        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const orderNumber = `SALE-${year}${month}${day}-${random}`;

        const orderSql = `
            INSERT INTO salesman_orders (
                customer_id, order_number, total_amount, tax_amount, grand_total, 
                order_date, status, payment_status, payment_method, notes,
                salesman_id, salesman_name, order_by
            )
            VALUES (?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?, ?, ?, 'salesman')
        `;

        const [orderResult] = await db.promise().query(orderSql, [
            customer_id,
            orderNumber,
            subtotal,
            tax,
            grandTotal,
            order_date || new Date(),
            payment_method,
            notes,
            salesman_id,
            salesman_name
        ]);

        const orderId = orderResult.insertId;

        // Insert order items
        for (const item of items) {
            // Get product details
            const [product] = await db.promise().query(
                "SELECT product_name, product_code, discount FROM products WHERE id = ?",
                [item.product_id]
            );

            const productName = product.length > 0 ? product[0].product_name : 'Unknown Product';
            const productCode = product.length > 0 ? product[0].product_code : '';
            const discount = product.length > 0 ? product[0].discount : 0;
            
            // Get product image
            let imageUrl = '';
            try {
                const [images] = await db.promise().query(
                    "SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1",
                    [item.product_id]
                );
                if (images.length > 0) {
                    imageUrl = images[0].image_url;
                }
            } catch (imgErr) {
                console.error('Error fetching product image:', imgErr);
            }

            const subtotalItem = item.price * item.quantity;

            const itemSql = `
                INSERT INTO salesman_order_items (
                    order_id, product_id, product_name, product_code, 
                    quantity, price, discount, subtotal, image_url
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await db.promise().query(itemSql, [
                orderId,
                item.product_id,
                productName,
                productCode,
                item.quantity,
                item.price,
                discount,
                subtotalItem,
                imageUrl
            ]);

            // Update product stock
            await db.promise().query(
                "UPDATE products SET available_stock = available_stock - ? WHERE id = ?",
                [item.quantity, item.product_id]
            );
        }

        await db.promise().query("COMMIT");

        const [newOrder] = await db.promise().query(
            "SELECT * FROM salesman_orders WHERE id = ?",
            [orderId]
        );

        const [orderItems] = await db.promise().query(
            "SELECT * FROM salesman_order_items WHERE order_id = ?",
            [orderId]
        );

        res.status(201).json({
            message: "Salesman order placed successfully",
            order_id: orderId,
            order_number: orderNumber,
            order: {
                id: orderId,
                ...newOrder[0],
                items: orderItems
            }
        });

    } catch (err) {
        await db.promise().query("ROLLBACK");
        console.error("Error creating salesman order:", err);
        res.status(500).json({
            error: "Failed to create salesman order",
            message: err.message
        });
    }
});

// ==============================
// GET ALL SALESMAN ORDERS
// ==============================
router.get("/", async (req, res) => {
    const { salesman_id } = req.query;
    
    try {
        let sql = `
            SELECT 
                o.*,
                c.name as customer_name,
                c.email as customer_email,
                c.phone as customer_phone
            FROM salesman_orders o
            LEFT JOIN customers c ON o.customer_id = c.id
        `;
        
        const params = [];
        
        if (salesman_id) {
            sql += " WHERE o.salesman_id = ?";
            params.push(salesman_id);
        }
        
        sql += " ORDER BY o.id DESC";

        const [orders] = await db.promise().query(sql, params);

        for (let order of orders) {
            const [items] = await db.promise().query(
                `SELECT * FROM salesman_order_items WHERE order_id = ?`,
                [order.id]
            );
            order.items = items;
        }

        res.json({
            message: "Salesman orders fetched successfully",
            count: orders.length,
            data: orders
        });

    } catch (err) {
        console.error("Error fetching salesman orders:", err);
        res.status(500).json({
            error: "Failed to fetch salesman orders",
            message: err.message
        });
    }
});

// ==============================
// GET SINGLE SALESMAN ORDER
// ==============================
router.get("/:id", async (req, res) => {
    try {
        const [order] = await db.promise().query(
            `
            SELECT 
                o.*,
                c.name as customer_name,
                c.email as customer_email,
                c.phone as customer_phone
            FROM salesman_orders o
            LEFT JOIN customers c ON o.customer_id = c.id
            WHERE o.id = ?
            `,
            [req.params.id]
        );

        if (order.length === 0) {
            return res.status(404).json({ message: "Salesman order not found" });
        }

        const [items] = await db.promise().query(
            `SELECT * FROM salesman_order_items WHERE order_id = ?`,
            [req.params.id]
        );

        order[0].items = items;

        res.json({
            message: "Salesman order fetched successfully",
            data: order[0]
        });

    } catch (err) {
        console.error("Error fetching salesman order:", err);
        res.status(500).json({
            error: "Failed to fetch salesman order",
            message: err.message
        });
    }
});

// ==============================
// UPDATE SALESMAN ORDER STATUS AND PAYMENT STATUS
// ==============================
router.put("/:id/status-payment", async (req, res) => {
    const { status, payment_status } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'];
    const validPaymentStatuses = ['pending', 'paid', 'failed', 'blocked'];

    let updates = [];
    let params = [];

    if (status && validStatuses.includes(status.toLowerCase())) {
        updates.push("status = ?");
        params.push(status.toLowerCase());
    } else if (status) {
        return res.status(400).json({
            error: `Invalid status. Valid values: ${validStatuses.join(', ')}`
        });
    }

    if (payment_status && validPaymentStatuses.includes(payment_status.toLowerCase())) {
        updates.push("payment_status = ?");
        params.push(payment_status.toLowerCase());
    } else if (payment_status) {
        return res.status(400).json({
            error: `Invalid payment_status. Valid values: ${validPaymentStatuses.join(', ')}`
        });
    }

    if (updates.length === 0) {
        return res.status(400).json({ 
            error: "At least one field (status or payment_status) is required" 
        });
    }

    try {
        updates.push("updated_at = NOW()");
        
        const [result] = await db.promise().query(
            `UPDATE salesman_orders SET ${updates.join(", ")} WHERE id = ?`,
            [...params, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Salesman order not found" });
        }

        const [updatedOrder] = await db.promise().query(
            "SELECT * FROM salesman_orders WHERE id = ?",
            [req.params.id]
        );

        const [customer] = await db.promise().query(
            "SELECT name as customer_name, email as customer_email, phone as customer_phone FROM customers WHERE id = ?",
            [updatedOrder[0].customer_id]
        );

        const orderData = {
            ...updatedOrder[0],
            customer_name: customer[0]?.customer_name || 'Unknown',
            customer_email: customer[0]?.customer_email || '',
            customer_phone: customer[0]?.customer_phone || ''
        };

        res.json({ 
            message: "Salesman order updated successfully", 
            data: orderData 
        });
    } catch (err) {
        console.error("Error updating salesman order:", err);
        res.status(500).json({ 
            error: "Failed to update salesman order", 
            message: err.message 
        });
    }
});

// ==============================
// DELETE SALESMAN ORDER
// ==============================
router.delete("/:id", async (req, res) => {
    try {
        await db.promise().query("START TRANSACTION");

        const [items] = await db.promise().query(
            "SELECT product_id, quantity FROM salesman_order_items WHERE order_id = ?",
            [req.params.id]
        );

        for (const item of items) {
            await db.promise().query(
                "UPDATE products SET available_stock = available_stock + ? WHERE id = ?",
                [item.quantity, item.product_id]
            );
        }

        await db.promise().query(
            "DELETE FROM salesman_order_items WHERE order_id = ?",
            [req.params.id]
        );

        const [result] = await db.promise().query(
            "DELETE FROM salesman_orders WHERE id = ?",
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            await db.promise().query("ROLLBACK");
            return res.status(404).json({ message: "Salesman order not found" });
        }

        await db.promise().query("COMMIT");

        res.json({
            message: "Salesman order deleted successfully"
        });

    } catch (err) {
        await db.promise().query("ROLLBACK");
        console.error("Error deleting salesman order:", err);
        res.status(500).json({
            error: "Failed to delete salesman order",
            message: err.message
        });
    }
});

// ==============================
// GET SALESMAN ORDER STATISTICS
// ==============================
router.get("/stats/summary", async (req, res) => {
    const { salesman_id } = req.query;
    
    try {
        let whereClause = "";
        const params = [];
        
        if (salesman_id) {
            whereClause = " WHERE salesman_id = ?";
            params.push(salesman_id);
        }

        const [totalOrders] = await db.promise().query(
            `SELECT COUNT(*) as total FROM salesman_orders${whereClause}`,
            params
        );

        const [pendingOrders] = await db.promise().query(
            `SELECT COUNT(*) as pending FROM salesman_orders${whereClause} AND status = 'pending'`,
            params
        );

        const [completedOrders] = await db.promise().query(
            `SELECT COUNT(*) as completed FROM salesman_orders${whereClause} AND status = 'completed'`,
            params
        );

        const [totalRevenue] = await db.promise().query(
            `SELECT SUM(grand_total) as revenue FROM salesman_orders${whereClause} AND status != 'cancelled'`,
            params
        );

        res.json({
            total_orders: totalOrders[0].total || 0,
            pending_orders: pendingOrders[0].pending || 0,
            completed_orders: completedOrders[0].completed || 0,
            total_revenue: totalRevenue[0].revenue || 0
        });

    } catch (err) {
        console.error("Error fetching salesman order statistics:", err);
        res.status(500).json({
            error: "Failed to fetch salesman order statistics",
            message: err.message
        });
    }
});

module.exports = router;