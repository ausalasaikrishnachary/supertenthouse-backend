const invoiceRoutes = require("./invoiceRoutes");
const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticate, requireRole, adminOnly } = require("../middleware/auth");
const {
    ensureSalesmanNotificationsTable,
    createOrderStatusNotification
} = require("../services/salesmanNotificationService");
const { addressFields, addressValues, ensureStaffOrderSnapshotColumns, getCustomerDeliveryAddress } = require('../services/staffOrderPresentation');
const { resolveOrderItemVariant } = require('../services/productVariants');
const deliveryDateService = require('../services/deliveryDate');
const { resolveOrderItemImage } = require('../services/orderItemMedia');
const orderPayments = require('../services/orderPayments');

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
        advance,
        notes = null
    } = req.body;

    // The day the customer is promised the goods. Validated before the transaction
    // opens so a malformed date is refused with a clear message rather than stored
    // as a day nobody chose, and left null when the salesman has not agreed one yet.
    let deliveryDate;
    try {
        deliveryDate = deliveryDateService.normalizeDeliveryDate(
            req.body.delivery_date ?? req.body.deliveryDate);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }

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
        await ensureStaffOrderSnapshotColumns(db.promise());
        await db.promise().query("START TRANSACTION");
        const deliveryAddress = await getCustomerDeliveryAddress(db.promise(), customer_id);

        const resolvedItems = [];
        for (const item of items) resolvedItems.push({ ...item, ...(await resolveOrderItemVariant(db.promise(), item)) });
        const subtotal = Math.round(resolvedItems.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0) * 100) / 100;
        // There is no tax on this order. The business does not charge GST, so
        // the figure the salesman's form quotes is the figure stored. A
        // tax_amount sent by any client is ignored on purpose: it must never be
        // able to raise the total above the price the customer was shown.
        const tax = 0;
        const grandTotal = subtotal;
        if (grandTotal < 0) {
            await db.promise().query("ROLLBACK");
            return res.status(400).json({ message: 'Order total cannot be negative' });
        }

        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const orderNumber = `SALE-${year}${month}${day}-${random}`;

        const orderSql = `
            INSERT INTO salesman_orders (
                customer_id, order_number, total_amount, tax_amount, grand_total, 
                order_date, status, payment_status, payment_method, notes, delivery_date,
                salesman_id, salesman_name, order_by, ${addressFields.join(', ')}
            )
            VALUES (?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?, ?, ?, ?, 'salesman', ${addressFields.map(() => '?').join(', ')})
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
            deliveryDate ?? null,
            salesman_id,
            salesman_name,
            ...addressValues(deliveryAddress)
        ]);

        const orderId = orderResult.insertId;

        // Insert order items
        for (const item of resolvedItems) {
            // Get product details
            const [product] = await db.promise().query(
                "SELECT product_name, product_code, discount FROM products WHERE id = ?",
                [item.product_id]
            );

            const productName = product.length > 0 ? product[0].product_name : 'Unknown Product';
            const productCode = product.length > 0 ? product[0].product_code : '';
            const discount = product.length > 0 ? product[0].discount : 0;
            
            // Store the image of the colour that was ordered so this line keeps
            // showing it even after the product's images change.
            const imageUrl = await resolveOrderItemImage(db.promise(), item);

            const subtotalItem = item.price * item.quantity;

            const itemSql = `
                INSERT INTO salesman_order_items (
                    order_id, product_id, product_name, product_code, 
                    quantity, price, discount, subtotal, image_url, selected_size, selected_color
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                imageUrl,
                item.selected_size,
                item.selected_color
            ]);

            // Update product stock
            await db.promise().query(
                "UPDATE products SET available_stock = available_stock - ? WHERE id = ?",
                [item.quantity, item.product_id]
            );
        }

        // Rejected before the commit so a bad advance rolls the whole order back
        // rather than saving an order whose advance was never applied.
        if (advance !== undefined && advance !== null && String(advance).trim() !== '') {
            await orderPayments.recordPayment(db.promise(), {
                source: 'salesman',
                orderId,
                amount: advance,
                mode: payment_method,
                remarks: 'Advance collected by salesman',
                actor: { id: salesman_id, role: 'salesman', name: salesman_name }
            });
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

        const payment = orderPayments.summarise(newOrder[0], orderPayments.parseAmount(advance ?? 0, 'Advance amount'));

        let invoiceWarning;
        try { newOrder[0].invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId, orderSource: 'salesman' }); }
        catch (error) { invoiceWarning = 'Order saved. Invoice generation is pending; do not place the order again.'; console.error('Invoice allocation failed:', error.message); }
        res.status(201).json({
            warning: invoiceWarning,
            message: "Salesman order placed successfully",
            order_id: orderId,
            order_number: orderNumber,
            order: {
                id: orderId,
                ...newOrder[0],
                items: orderItems,
                payment,
                order_total: payment.order_total,
                total_paid: payment.total_paid,
                balance_amount: payment.balance_amount,
                payment_status: payment.payment_status
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
router.get("/", authenticate, requireRole("salesman", "admin"), async (req, res) => {
    try {
        let sql = `
            SELECT 
                o.*,
                c.name as customer_name,
                c.email as customer_email,
                c.phone as customer_phone,
                c.address_line1,
                c.address_line2,
                c.city as address_city,
                c.state as address_state,
                c.pincode as address_pincode,
                c.country as address_country
            FROM salesman_orders o
            LEFT JOIN customers c ON o.customer_id = c.id
        `;
        
        const params = [];
        
        if (req.user.role === "salesman") {
            sql += " WHERE o.salesman_id = ?";
            params.push(req.user.id);
        }
        
        sql += " ORDER BY o.id DESC";

        const [orders] = await db.promise().query(sql, params);

        for (let order of orders) {
            const [items] = await db.promise().query(
                `SELECT * FROM salesman_order_items WHERE order_id = ?`,
                [order.id]
            );
            order.items = items;
            try {
                order.invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: order.id, orderSource: 'salesman' });
            } catch (err) {
                console.error("Failed to generate/fetch invoice for salesman order:", order.id, err);
            }
        }

        await orderPayments.attachPaymentSummaries(db.promise(), 'salesman', orders);

        res.json({
            message: "Salesman orders fetched successfully",
            count: orders.length,
            // A delivery date leaves as a bare YYYY-MM-DD day whatever the driver
            // produced. See services/deliveryDate.js.
            data: deliveryDateService.presentOrders(orders)
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
router.get("/:id", authenticate, requireRole("salesman", "admin"), async (req, res) => {
    try {
        const ownershipClause = req.user.role === "salesman" ? " AND o.salesman_id = ?" : "";
        const queryParams = req.user.role === "salesman"
            ? [req.params.id, req.user.id]
            : [req.params.id];
        const [order] = await db.promise().query(
            `
            SELECT 
                o.*,
                c.name as customer_name,
                c.email as customer_email,
                c.phone as customer_phone,
                c.address_line1,
                c.address_line2,
                c.city as address_city,
                c.state as address_state,
                c.pincode as address_pincode,
                c.country as address_country
            FROM salesman_orders o
            LEFT JOIN customers c ON o.customer_id = c.id
            WHERE o.id = ?${ownershipClause}
            `,
            queryParams
        );

        if (order.length === 0) {
            return res.status(404).json({ message: "Salesman order not found" });
        }

        const [items] = await db.promise().query(
            `SELECT * FROM salesman_order_items WHERE order_id = ?`,
            [req.params.id]
        );

        order[0].items = items;

        try {
            order[0].invoice_number = await invoiceRoutes.getOrCreateInvoiceNumber({ orderId: order[0].id, orderSource: 'salesman' });
        } catch (err) {
            console.error("Failed to generate/fetch invoice for salesman order details:", order[0].id, err);
        }

        await orderPayments.attachPaymentSummaries(db.promise(), 'salesman', order);

        res.json({
            message: "Salesman order fetched successfully",
            data: deliveryDateService.presentOrder(order[0])
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
// SET DELIVERY DATE
// ==============================
// A salesman may agree a delivery day with the customer while the order is being
// arranged, so unlike the status route this one is not admin only. It is scoped
// to the signed-in salesman's own orders; an order belonging to another salesman
// is reported as not found, which is the same answer as an id that never existed.
router.put("/:id/delivery-date", authenticate, requireRole("salesman", "admin"),
    deliveryDateService.createHandler('salesman_orders', { salesmanScoped: true }));

// ==============================
// UPDATE SALESMAN ORDER STATUS AND PAYMENT STATUS
// ==============================
router.put("/:id/status-payment", ...adminOnly, async (req, res) => {
    const { status, payment_status } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'];

    // payment_status is derived from recorded payments, so it is never written
    // here. It is still accepted so an older client can change the order status
    // without erroring, but it no longer changes what any panel displays.
    const paymentStatusIgnored = payment_status !== undefined && payment_status !== null;

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

    if (updates.length === 0) {
        return res.status(400).json({ 
            error: "At least one field (status or payment_status) is required" 
        });
    }

    try {
        await ensureSalesmanNotificationsTable();
        await db.promise().query("START TRANSACTION");

        const [existingOrders] = await db.promise().query(
            "SELECT id, order_number, salesman_id, status FROM salesman_orders WHERE id = ? FOR UPDATE",
            [req.params.id]
        );
        if (existingOrders.length === 0) {
            await db.promise().query("ROLLBACK");
            return res.status(404).json({ message: "Salesman order not found" });
        }

        const existingOrder = { ...existingOrders[0], order_source: "salesman" };
        const newStatus = status ? status.toLowerCase() : existingOrder.status;
        updates.push("updated_at = NOW()");

        await db.promise().query(
            `UPDATE salesman_orders SET ${updates.join(", ")} WHERE id = ?`,
            [...params, req.params.id]
        );

        await createOrderStatusNotification(
            db.promise(),
            existingOrder,
            existingOrder.status,
            newStatus,
            req.user
        );

        await db.promise().query("COMMIT");

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

        await orderPayments.attachPaymentSummaries(db.promise(), 'salesman', [orderData]);

        res.json({ 
            message: "Salesman order updated successfully", 
            warning: paymentStatusIgnored
                ? 'Payment status is calculated from recorded payments and was not changed. Record a payment to update it.'
                : undefined,
            data: orderData 
        });
    } catch (err) {
        await db.promise().query("ROLLBACK");
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
router.delete("/:id", ...adminOnly, async (req, res) => {
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
