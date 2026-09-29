const express = require('express');
const db = require('../db');
const paymentAuth = require('../middleware/paymentAuth');
const payments = require('../services/orderPayments');

const router = express.Router();
router.use(paymentAuth);

const role = req => String(req.user?.role || '').toLowerCase();

// A customer may only ever see and pay their own order; a salesman only their
// own sales; an admin may touch any of them.
async function loadScopedOrder(req) {
  const source = payments.ORDER_SOURCES.includes(String(req.params.source || '').toLowerCase())
    ? String(req.params.source).toLowerCase()
    : null;
  if (!source) {
    const error = new Error('Invalid order source');
    error.status = 400;
    throw error;
  }
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    const error = new Error('Invalid order id');
    error.status = 400;
    throw error;
  }

  await payments.ensureOrderPaymentsTable(db.promise());
  const [rows] = await db.promise().query(
    `SELECT * FROM ${payments.ORDER_TABLE[source]} WHERE id = ?`, [orderId]
  );
  const order = rows[0];
  if (!order) {
    const error = new Error('Order not found');
    error.status = 404;
    throw error;
  }

  const who = role(req);
  if (who === 'customer' && Number(order.customer_id) !== Number(req.user.id)) {
    const error = new Error('You do not have permission to view this order');
    error.status = 403;
    throw error;
  }
  if (who === 'salesman' && Number(order.salesman_id) !== Number(req.user.id)) {
    const error = new Error('You do not have permission to view this order');
    error.status = 403;
    throw error;
  }
  return { source, orderId, order, who };
}

// Only admin and the owning salesman may rewrite history. A customer can add a
// payment to their own order but never edit or void a recorded one.
function requireCorrectionAccess(who) {
  if (who !== 'admin' && who !== 'salesman') {
    const error = new Error('You do not have permission to change a recorded payment');
    error.status = 403;
    throw error;
  }
}

const respondError = (res, error) => {
  if (error.status) return res.status(error.status).json({ success: false, message: error.message });
  console.error('Payment route error:', error);
  return res.status(500).json({ success: false, message: 'Failed to process the payment; please retry' });
};

// GET /:source/:orderId — summary plus the full audit trail, voided rows included
// so a correction is visible rather than silently disappearing.
router.get('/:source/:orderId', async (req, res) => {
  try {
    const { source, orderId } = await loadScopedOrder(req);
    const { payment } = await payments.getPaymentSummary(db.promise(), source, orderId);
    const history = await payments.listPayments(db.promise(), source, orderId, { includeVoided: true });
    res.json({ success: true, data: { orderSource: source, orderId, ...payment, history } });
  } catch (error) {
    respondError(res, error);
  }
});

// POST /:source/:orderId — record a payment against the order balance.
router.post('/:source/:orderId', async (req, res) => {
  try {
    const { source, orderId } = await loadScopedOrder(req);
    const result = await payments.withTransaction(async connection => {
      await payments.lockOrderRow(connection, source, orderId);
      return payments.recordPayment(connection, {
        source,
        orderId,
        amount: req.body?.amount,
        mode: req.body?.mode ?? req.body?.payment_mode,
        remarks: req.body?.remarks ?? req.body?.notes,
        actor: req.user,
      });
    });
    const history = await payments.listPayments(db.promise(), source, orderId, { includeVoided: true });
    res.status(201).json({ success: true, message: 'Payment recorded', data: { orderSource: source, orderId, ...result.payment, history } });
  } catch (error) {
    respondError(res, error);
  }
});

// PUT /:source/:orderId/:paymentId — correct a recorded payment in place. The
// previous values are replaced, not versioned, so the ledger history endpoint
// should be read alongside it when auditing.
router.put('/:source/:orderId/:paymentId', async (req, res) => {
  try {
    const { source, orderId, who } = await loadScopedOrder(req);
    requireCorrectionAccess(who);
    const result = await payments.withTransaction(async connection => {
      await payments.lockOrderRow(connection, source, orderId);
      return payments.updatePayment(connection, {
        source,
        orderId,
        paymentId: req.params.paymentId,
        amount: req.body?.amount,
        mode: req.body?.mode ?? req.body?.payment_mode,
        remarks: req.body?.remarks ?? req.body?.notes,
        actor: req.user,
      });
    });
    const history = await payments.listPayments(db.promise(), source, orderId, { includeVoided: true });
    res.json({ success: true, message: 'Payment updated', data: { orderSource: source, orderId, ...result.payment, history } });
  } catch (error) {
    respondError(res, error);
  }
});

// POST /:source/:orderId/:paymentId/void — reverse a payment while keeping the
// original row for audit, so the balance reopens instead of being overwritten.
router.post('/:source/:orderId/:paymentId/void', async (req, res) => {
  try {
    const { source, orderId, who } = await loadScopedOrder(req);
    requireCorrectionAccess(who);
    const result = await payments.withTransaction(async connection => {
      await payments.lockOrderRow(connection, source, orderId);
      return payments.voidPayment(connection, {
        source,
        orderId,
        paymentId: req.params.paymentId,
        reason: req.body?.reason,
        actor: req.user,
      });
    });
    const history = await payments.listPayments(db.promise(), source, orderId, { includeVoided: true });
    res.json({ success: true, message: 'Payment voided', data: { orderSource: source, orderId, ...result.payment, history } });
  } catch (error) {
    respondError(res, error);
  }
});

module.exports = router;
