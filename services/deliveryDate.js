// A delivery date is the calendar day the customer is promised the goods. It is
// deliberately not the same thing as the order date, which is the day the order
// was placed, and it is not a timestamp: a tent is needed on a day, not at an
// instant, so there is no time and no timezone for two parties to disagree about.
//
// Staff may leave it unset. A NULL delivery date means "not promised yet", which
// is honest for a fresh order; defaulting it to today would claim the goods are
// needed the moment they are booked, so the column is nullable and stays empty
// until a person says otherwise.
//
// The database handle is required inside the route body rather than at the top of
// this file. db.js opens a real connection as it loads, so requiring it here
// would make every caller — including the tests for these pure date functions —
// hold an open socket.
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const reject = message => Object.assign(new Error(message), { status: 400 });
const pad = value => String(value).padStart(2, '0');

function formatDay(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The parts are rebuilt in local time and then compared back against the original
// year, month and day. This rejects the dates that do not exist: `2026-02-31`
// would otherwise roll silently into March and be stored as a different day than
// the one staff picked.
function assertRealDay(year, month, day, shown) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw reject(`Delivery date ${shown} is not a real calendar date`);
  }
  return date;
}

// Returns undefined when the field was not sent at all, which on an edit means
// "leave the stored date alone", and null when it was sent blank, which means
// "clear it". Only a real YYYY-MM-DD day comes back as a string, so a value
// reaching the database is always a day a person chose.
function normalizeDeliveryDate(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) throw reject('Delivery date is not a real calendar date');
    return formatDay(raw);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const match = ISO_DAY.exec(trimmed);
    if (!match) throw reject('Delivery date must be a calendar day written as YYYY-MM-DD');
    assertRealDay(Number(match[1]), Number(match[2]), Number(match[3]), trimmed);
    return trimmed;
  }
  throw reject('Delivery date must be a calendar day written as YYYY-MM-DD');
}

// Writes the validated day onto one staff order and returns the saved row. The
// owner check is part of the WHERE clause rather than a separate read, so a
// salesman who is not the owner of the order is told the order does not exist
// instead of learning that someone else's order number is in use.
async function setDeliveryDate(connection, { table, id, value, salesmanId = null }) {
  const deliveryDate = normalizeDeliveryDate(value);
  if (deliveryDate === undefined) throw reject('Delivery date is required');
  const ownership = salesmanId === null ? '' : ' AND salesman_id = ?';
  const whereParams = salesmanId === null ? [id] : [id, salesmanId];
  await connection.query(
    `UPDATE ${table} SET delivery_date = ?, updated_at = NOW() WHERE id = ?${ownership}`,
    [deliveryDate, ...whereParams]
  );
  const [rows] = await connection.query(`SELECT * FROM ${table} WHERE id = ?${ownership}`, whereParams);
  if (!rows.length) throw Object.assign(new Error('Order not found'), { status: 404 });
  return { ...rows[0], delivery_date: deliveryDate };
}

// ─────────────────────────────────────────────────────────────────────────────
// What the API promises: a delivery date arrives as a bare `YYYY-MM-DD` day.
//
// The connection is already configured for this — `dateStrings: ["DATE"]` in
// db.js — so a DATE column comes back as text and needs nothing done to it.
//
// This function is the second line of defence, and it exists because of what
// happens when that setting is missing on a deployed server. Without it the
// driver builds a JavaScript Date at local midnight, JSON renders it in UTC, and
// the stored day 2026-10-03 goes out as "2026-10-02T18:30:00.000Z" or
// "2026-10-03T00:00:00.000Z" depending on the server's timezone. Both are
// timestamps, so every client rejects them and the day silently reads as unset —
// with the data perfectly intact in the database the whole time.
//
// Doing the conversion here rather than trusting the connection option means the
// response is correct by construction. A `Date` is read by its own local
// year/month/day, which is the day that was stored, on any server in any
// timezone. A value that is not a real day becomes null, which reads as "not
// promised yet" — never as a neighbouring day, which is the failure that matters.

// True only for a `YYYY-MM-DD` string that is a day which exists. Matching the
// pattern is not enough: `2026-02-31` matches it and is not a day, because
// new Date() rolls it quietly on to 3 March.
function isRealDayString(value) {
  const match = ISO_DAY.exec(String(value));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function deliveryDayForResponse(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatDay(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return isRealDayString(trimmed) ? trimmed : null;
  }
  return null;
}

// Applied to order rows on the way out. `delivery_date` is the only column
// touched: every other field is either a timestamp the app already formats, or
// money, and neither is worth the risk of a blanket conversion.
function presentOrder(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  if (!('delivery_date' in row)) return row;
  return { ...row, delivery_date: deliveryDayForResponse(row.delivery_date) };
}

function presentOrders(rows) {
  return Array.isArray(rows) ? rows.map(presentOrder) : rows;
}

// Both staff panels post the same body to the same shape of route, so the route
// body lives here once. A salesman may only reach their own order, so their
// identity is folded into the WHERE clause; an admin reaches every order and
// gets no owner filter.
function createHandler(table, { salesmanScoped = false } = {}) {
  return async (req, res) => {
    const db = require('../db');
    const { ensureStaffOrderSnapshotColumns } = require('./staffOrderPresentation');
    // The schema is checked before the write, not after, so the very first order
    // created after a deploy does not fail on a column that is being added.
    try {
      await ensureStaffOrderSnapshotColumns(db.promise());
      const order = await setDeliveryDate(db.promise(), {
        table,
        id: req.params.id,
        value: req.body?.delivery_date ?? req.body?.deliveryDate,
        salesmanId: salesmanScoped && req.user.role === 'salesman' ? req.user.id : null
      });
      res.json({
        success: true,
        message: 'Delivery date updated successfully',
        delivery_date: order.delivery_date,
        data: order
      });
    } catch (error) {
      res.status(error.status || 500).json({
        message: error.status ? error.message : 'Failed to update delivery date; please retry'
      });
    }
  };
}

module.exports = {
  normalizeDeliveryDate,
  setDeliveryDate,
  createHandler,
  formatDay,
  ISO_DAY,
  deliveryDayForResponse,
  isRealDayString,
  presentOrder,
  presentOrders,
};
