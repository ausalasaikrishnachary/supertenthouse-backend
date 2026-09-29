// Single source of truth for every rupee that comes in against an order.
//
// Orders live in three separate tables (orders / admin_orders / salesman_orders)
// so payments are keyed by (order_source, order_id) rather than a bare order_id.
// The order total is never stored here: it is always read back from the order's
// own table, so a payment ledger can never drift from the order it belongs to.

const ORDER_SOURCES = ['customer', 'admin', 'salesman'];

const ORDER_TABLE = {
  customer: 'orders',
  admin: 'admin_orders',
  salesman: 'salesman_orders',
};

const PAYMENT_SOURCES = ['Customer', 'Salesman', 'Admin'];

// A payment is only ever one of these three. The three order tables carry their
// own legacy payment_status enums which cannot express "partially paid", so those
// columns are left untouched and the status shown everywhere is derived here.
const PAYMENT_STATUS = {
  PENDING: 'pending',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
};

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};

const isReal = source => ORDER_SOURCES.includes(String(source || '').trim().toLowerCase());
const isPaymentSource = value => PAYMENT_SOURCES.includes(String(value || '').trim());

// ─── money ───────────────────────────────────────────────────────────────────
// All comparisons run in integer paise. Floating point rupees are the usual
// reason a ledger ends up one paisa short of "fully paid" forever.
function toPaise(value) {
  if (value === null || value === undefined || value === '') return 0;
  // Only real numbers and numeric strings are amounts. An array such as [5]
  // stringifies to "5" and an object to "[object Object]", so both are rejected
  // before any coercion happens.
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  const raw = typeof value === 'string' ? value.trim().replace(/,/g, '') : value;
  if (raw === '') return 0;
  const number = Number(raw);
  if (!Number.isFinite(number)) return NaN;
  return Math.round(number * 100);
}

const fromPaise = paise => Math.round(paise) / 100;

// Accepts 1234.5 and "1,234.50" but never "12abc" or "1.2.3", which Number()
// would happily coerce into a number and then quietly pay the wrong amount.
function parseAmount(value, label) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value !== 'number' && typeof value !== 'string') {
    fail(400, `${label} must be a number with up to 2 decimal places`);
  }
  const text = String(value).trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) {
    fail(400, `${label} must be a number with up to 2 decimal places`);
  }
  return toPaise(text);
}

function orderTotalPaise(order) {
  const candidates = [
    order?.grand_total,
    order?.grandTotal,
    order?.total_amount,
    order?.totalAmount,
    order?.total,
  ];
  for (const candidate of candidates) {
    const paise = toPaise(candidate);
    if (Number.isFinite(paise) && paise > 0) return paise;
  }
  const fallback = toPaise(candidates.find(candidate => candidate !== null && candidate !== undefined));
  return Number.isFinite(fallback) ? fallback : 0;
}

// ─── schema ──────────────────────────────────────────────────────────────────
// Same self-healing guard the rest of the project uses (see WishlistRoute and
// staffOrderPresentation): the table is created on first use rather than
// requiring a manual migration, and a failure resets the cache so a later
// request can retry.
let schemaPromise;

function ensureOrderPaymentsTable(connection) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const [found] = await connection.query(
        `SELECT COUNT(*) AS count FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = 'order_payments'`
      );
      if (Number(found[0]?.count || 0) === 0) {
        await connection.query(`
          CREATE TABLE IF NOT EXISTS order_payments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_source ENUM('customer','admin','salesman') NOT NULL,
            order_id INT(11) NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            payment_mode VARCHAR(50) NULL,
            remarks VARCHAR(255) NULL,
            payment_source ENUM('Customer','Salesman','Admin') NOT NULL,
            created_by INT(11) NULL,
            created_by_name VARCHAR(120) NULL,
            payment_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            voided_at DATETIME NULL,
            voided_by INT(11) NULL,
            voided_by_name VARCHAR(120) NULL,
            void_reason VARCHAR(255) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_order_payments_order (order_source, order_id),
            KEY idx_order_payments_date (order_source, order_id, payment_date)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
      }
      return true;
    })().catch(error => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

// ─── reads ───────────────────────────────────────────────────────────────────
const ACTIVE = 'voided_at IS NULL';

async function loadOrderRow(connection, source, orderId) {
  const table = ORDER_TABLE[source];
  const [rows] = await connection.query(`SELECT * FROM ${table} WHERE id = ?`, [orderId]);
  if (!rows[0]) fail(404, 'Order not found');
  return rows[0];
}

// One grouped query for a whole page of orders, so a list response costs one
// extra round trip instead of one per row.
async function loadTotals(connection, source, orderIds) {
  const ids = [...new Set((orderIds || []).filter(id => id !== null && id !== undefined))]
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0);
  const totals = new Map();
  if (ids.length === 0) return totals;

  await ensureOrderPaymentsTable(connection);
  const [rows] = await connection.query(
    `SELECT order_id, COALESCE(SUM(amount), 0) AS total_paid
     FROM order_payments
     WHERE order_source = ? AND ${ACTIVE} AND order_id IN (${ids.map(() => '?').join(',')})
     GROUP BY order_id`,
    [source, ...ids]
  );
  for (const row of rows) totals.set(Number(row.order_id), toPaise(row.total_paid) || 0);
  return totals;
}

function summarise(order, totalPaidPaise) {
  const orderTotalPaiseValue = orderTotalPaise(order);
  const paid = Math.max(0, Number(totalPaidPaise) || 0);
  const balance = orderTotalPaiseValue - paid;
  let paymentStatus = PAYMENT_STATUS.PENDING;
  if (orderTotalPaiseValue > 0 && paid >= orderTotalPaiseValue) paymentStatus = PAYMENT_STATUS.PAID;
  else if (paid > 0) paymentStatus = PAYMENT_STATUS.PARTIALLY_PAID;
  return {
    order_total: fromPaise(orderTotalPaiseValue),
    total_paid: fromPaise(paid),
    balance_amount: fromPaise(balance),
    payment_status: paymentStatus,
  };
}

// Mutates and returns each order with a `payment` block. The legacy
// payment_status column is deliberately overwritten in the response so all
// three panels read one derived value, but the stored column is left alone.
async function attachPaymentSummaries(connection, source, orders) {
  const list = Array.isArray(orders) ? orders : [orders];
  if (list.length === 0) return orders;
  const totals = await loadTotals(connection, source, list.map(order => order?.id));
  for (const order of list) {
    if (!order || typeof order !== 'object') continue;
    const payment = summarise(order, totals.get(Number(order.id)) ?? 0);
    order.payment = payment;
    order.order_total = payment.order_total;
    order.total_paid = payment.total_paid;
    order.balance_amount = payment.balance_amount;
    order.payment_status = payment.payment_status;
  }
  return orders;
}

async function getPaymentSummary(connection, source, orderId) {
  await ensureOrderPaymentsTable(connection);
  const order = await loadOrderRow(connection, source, orderId);
  const totals = await loadTotals(connection, source, [orderId]);
  return { order, payment: summarise(order, totals.get(Number(orderId)) ?? 0) };
}

function listPaymentsSql(where, orderBy = 'payment_date ASC, id ASC') {
  return `SELECT id, order_source, order_id, amount, payment_mode, remarks, payment_source,
                 created_by, created_by_name, payment_date, voided_at, voided_by, voided_by_name, void_reason
          FROM order_payments WHERE ${where} ORDER BY ${orderBy}`;
}

async function listPayments(connection, source, orderId, { includeVoided = false } = {}) {
  await ensureOrderPaymentsTable(connection);
  const where = includeVoided
    ? 'order_source = ? AND order_id = ?'
    : `order_source = ? AND order_id = ? AND ${ACTIVE}`;
  const [rows] = await connection.query(listPaymentsSql(where), [source, orderId]);
  return rows.map(decorate);
}

function decorate(row) {
  return {
    ...row,
    amount: fromPaise(toPaise(row.amount)),
    voided: Boolean(row.voided_at),
  };
}

// ─── writes ──────────────────────────────────────────────────────────────────
function assertSource(source) {
  const key = String(source || '').trim().toLowerCase();
  if (!isReal(key)) fail(400, 'Invalid order source');
  return key;
}

function assertOrderId(orderId) {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) fail(400, 'Invalid order id');
  return id;
}

function actorDetails(actor) {
  if (!actor) return { payment_source: 'Admin', created_by: null, created_by_name: null };
  const role = String(actor.role || '').toLowerCase();
  const paymentSource = role === 'customer' ? 'Customer' : role === 'salesman' ? 'Salesman' : 'Admin';
  return {
    payment_source: paymentSource,
    created_by: actor.id ?? null,
    created_by_name: actor.name || actor.email || null,
  };
}

// Rejects anything that would make the ledger disagree with the order total, and
// runs inside the caller's transaction with the order row already locked.
async function recordPayment(connection, { source, orderId, amount, mode, remarks, actor, allowOverpayment = false }) {
  const key = assertSource(source);
  const id = assertOrderId(orderId);
  const amountPaise = parseAmount(amount, 'Payment amount');
  if (amountPaise <= 0) fail(400, 'Payment amount must be greater than 0');
  if (amountPaise > 100000 * 100) fail(400, 'Payment amount is unrealistically large');

  if (mode !== null && mode !== undefined && String(mode).trim() === '') fail(400, 'Payment mode cannot be empty');
  if (remarks !== null && remarks !== undefined && String(remarks).length > 255) {
    fail(400, 'Remarks must be 255 characters or fewer');
  }

  await ensureOrderPaymentsTable(connection);
  const order = await loadOrderRow(connection, key, id);
  const totals = await loadTotals(connection, key, [id]);
  const alreadyPaid = totals.get(id) ?? 0;
  const orderTotal = orderTotalPaise(order);
  const newTotal = alreadyPaid + amountPaise;

  if (!allowOverpayment && newTotal > orderTotal) {
    const remaining = fromPaise(Math.max(0, orderTotal - alreadyPaid));
    fail(400, `Payment exceeds the order balance. ${remaining} is still due on this order`);
  }

  const who = actorDetails(actor);
  const [result] = await connection.query(
    `INSERT INTO order_payments
       (order_source, order_id, amount, payment_mode, remarks, payment_source, created_by, created_by_name, payment_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      key, id, fromPaise(amountPaise),
      mode ? String(mode).trim() : null,
      remarks ? String(remarks).trim() : null,
      who.payment_source, who.created_by, who.created_by_name,
      new Date(),
    ]
  );

  return { paymentId: result.insertId, order, payment: summarise(order, newTotal) };
}

async function updatePayment(connection, { source, orderId, paymentId, amount, mode, remarks, actor }) {
  const key = assertSource(source);
  const id = assertOrderId(orderId);
  await ensureOrderPaymentsTable(connection);

  const [rows] = await connection.query(
    `${listPaymentsSql('order_source = ? AND order_id = ? AND id = ? AND ' + ACTIVE, 'id ASC')} LIMIT 1`,
    [key, id, paymentId]
  );
  const existing = rows[0];
  if (!existing) fail(404, 'Payment not found');

  const amountPaise = amount === undefined || amount === null || amount === ''
    ? toPaise(existing.amount)
    : parseAmount(amount, 'Payment amount');
  if (amountPaise <= 0) fail(400, 'Payment amount must be greater than 0');
  if (mode !== undefined) {
    if (mode !== null && String(mode).trim() === '') fail(400, 'Payment mode cannot be empty');
  }
  if (remarks !== undefined && remarks !== null && String(remarks).length > 255) {
    fail(400, 'Remarks must be 255 characters or fewer');
  }

  const totals = await loadTotals(connection, key, [id]);
  const otherPaid = Math.max(0, (totals.get(id) ?? 0) - toPaise(existing.amount));
  const order = await loadOrderRow(connection, key, id);
  const orderTotal = orderTotalPaise(order);
  if (otherPaid + amountPaise > orderTotal) {
    const remaining = fromPaise(Math.max(0, orderTotal - otherPaid));
    fail(400, `Payment exceeds the order balance. ${remaining} is still due on this order`);
  }

  await connection.query(
    `UPDATE order_payments
     SET amount = ?, payment_mode = ?, remarks = ?, updated_at = NOW()
     WHERE id = ? AND order_source = ? AND order_id = ?`,
    [
      fromPaise(amountPaise),
      mode === undefined ? existing.payment_mode : (mode ? String(mode).trim() : null),
      remarks === undefined ? existing.remarks : (remarks ? String(remarks).trim() : null),
      paymentId, key, id,
    ]
  );

  const after = await loadTotals(connection, key, [id]);
  return { order, payment: summarise(order, after.get(id) ?? 0) };
}

async function voidPayment(connection, { source, orderId, paymentId, reason, actor }) {
  const key = assertSource(source);
  const id = assertOrderId(orderId);
  if (reason !== null && reason !== undefined && String(reason).trim() === '') {
    fail(400, 'A reason is required to void a payment');
  }
  if (reason !== null && reason !== undefined && String(reason).length > 255) {
    fail(400, 'Reason must be 255 characters or fewer');
  }
  await ensureOrderPaymentsTable(connection);

  const [rows] = await connection.query(
    `${listPaymentsSql('order_source = ? AND order_id = ? AND id = ? AND ' + ACTIVE, 'id ASC')} LIMIT 1`,
    [key, id, paymentId]
  );
  if (!rows[0]) fail(404, 'Payment not found or already voided');

  const who = actorDetails(actor);
  await connection.query(
    `UPDATE order_payments
     SET voided_at = NOW(), voided_by = ?, voided_by_name = ?, void_reason = ?, updated_at = NOW()
     WHERE id = ? AND order_source = ? AND order_id = ?`,
    [
      who.created_by, who.created_by_name, reason ? String(reason).trim() : null,
      paymentId, key, id,
    ]
  );

  const order = await loadOrderRow(connection, key, id);
  const after = await loadTotals(connection, key, [id]);
  // The voided row stays for audit but the balance reopens, so the summary is
  // deliberately recomputed from the remaining active payments only.
  return { order, payment: summarise(order, after.get(id) ?? 0) };
}

// A real transaction, on its own connection. `db` is a single shared connection
// rather than a pool, so a write that must lock the order row and insert against
// a freshly-read total cannot safely share that handle.
async function withTransaction(work) {
  const mysql = require('mysql2/promise');
  const db = require('../db');
  const { host, user, password, database, port } = db.config;
  const connection = await mysql.createConnection({ host, user, password, database, port });
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    await connection.end();
  }
}

// Locks the order row so two concurrent payments cannot both read the same
// "already paid" total and each be accepted.
async function lockOrderRow(connection, source, orderId) {
  const table = ORDER_TABLE[source];
  const [rows] = await connection.query(`SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [orderId]);
  if (!rows[0]) fail(404, 'Order not found');
  return rows[0];
}

// Convenience for order creation: records an advance if one was given and
// otherwise leaves the order untouched at zero paid.
async function recordInitialAdvance(connection, { source, orderId, amount, mode, actor }) {
  const paise = parseAmount(amount ?? 0, 'Advance amount');
  if (paise <= 0) return null;
  return recordPayment(connection, { source, orderId, amount: fromPaise(paise), mode, actor });
}

module.exports = {
  ORDER_SOURCES,
  ORDER_TABLE,
  PAYMENT_SOURCES,
  PAYMENT_STATUS,
  ensureOrderPaymentsTable,
  toPaise,
  fromPaise,
  parseAmount,
  orderTotalPaise,
  summarise,
  attachPaymentSummaries,
  getPaymentSummary,
  listPayments,
  recordPayment,
  recordInitialAdvance,
  updatePayment,
  voidPayment,
  actorDetails,
  withTransaction,
  lockOrderRow,
};
