const { colorNameFor, colorImageFor } = require('./colorCatalog');
const orderPayments = require('./orderPayments');

const tables = { customer: ['orders', null], admin: ['admin_orders', 'admin_order_items'], salesman: ['salesman_orders', 'salesman_order_items'] };
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const isCompletedOrder = status => String(status || '').trim().toLowerCase() === 'completed';

// Fetches the colour-to-image map for the products on this order in one query so
// a legacy line can still show the image belonging to its own colour.
async function loadColorImages(connection, items) {
  const ids = [...new Set(items
    .map(item => item?.product_id ?? item?.productId)
    .filter(id => id != null && String(id) !== '')
    .map(String))];
  const byProduct = new Map();
  if (ids.length === 0) return byProduct;
  try {
    const [rows] = await connection.query(
      `SELECT id, color_images FROM products WHERE CAST(id AS CHAR) IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    for (const row of rows) byProduct.set(String(row.id), row.color_images);
  } catch (error) {
    // Older databases may not have the column; names still resolve without it.
    if (error.code !== 'ER_BAD_FIELD_ERROR' && error.code !== 'ER_NO_SUCH_TABLE') throw error;
  }
  return byProduct;
}
async function loadInvoice(connection, input, customerId) {
  const source = input?.orderSource || 'customer';
  const id = Number(input?.orderId);
  if (!Object.hasOwn(tables, source) || !Number.isSafeInteger(id) || id <= 0) fail(400, 'Valid order ID and source required');
  const [table, itemTable] = tables[source];
  const [rows] = await connection.query(`SELECT * FROM ${table} WHERE id = ?${customerId != null ? ' AND customer_id = ?' : ''}`, customerId != null ? [id, customerId] : [id]);
  const order = rows[0];
  if (!order) fail(404, 'Order not found');
  if (!isCompletedOrder(order.status)) fail(409, 'Invoice is available only after the order is completed');
  if (!order.invoice_number?.trim()) fail(409, 'Invoice has not been generated');
  const [[customer = {}]] = await connection.query('SELECT * FROM customers WHERE id = ?', [order.customer_id]);
  let items = order.items;
  if (itemTable) [items] = await connection.query(`SELECT * FROM ${itemTable} WHERE order_id = ?`, [id]);
  if (typeof items === 'string') items = JSON.parse(items);
  if (!Array.isArray(items)) fail(422, 'Order items are unavailable');

  // An invoice is a historical document, so it shows the colour that was ordered
  // by name. Orders saved with the colour snapshot use it; older orders resolve
  // the name from the same stored colour value. A technical code is never shown.
  const colorImagesByProduct = await loadColorImages(connection, items);

  // The paid figure comes from the payment ledger, so an invoice can never show
  // a status the money does not support. If the ledger cannot be read the
  // invoice still prints with nothing recorded as paid: losing the document
  // because of an optional table would be worse than showing a zero balance.
  let payment = { order_total: num(order.grand_total), total_paid: 0, balance_amount: num(order.grand_total), payment_status: 'pending' };
  try {
    payment = (await orderPayments.getPaymentSummary(connection, source, id)).payment;
  } catch (error) {
    console.error('Invoice could not read the payment ledger:', error.message);
  }

  return {
    orderId: id, orderSource: source, orderNumber: order.order_number, invoiceNumber: order.invoice_number,
    customerName: order.customer_name || customer.name, customerEmail: order.customer_email || customer.email,
    customerPhone: order.customer_phone || customer.phone, eventDate: order.event_date, eventTime: order.event_time,
    eventType: order.event_type, venue: order.venue, guestCount: order.guest_count, specialInstructions: order.special_instructions,
    subtotal: num(order.subtotal ?? order.total_amount ?? order.total),
    grandTotal: num(order.grand_total), deliveryCharge: num(order.delivery_charge),
    couponDiscount: num(order.coupon_discount ?? order.discount), couponCode: order.coupon_code,
    paymentMethod: order.payment_method,
    paymentStatus: payment.payment_status,
    totalPaid: payment.total_paid,
    balanceAmount: payment.balance_amount,
    address: { fullName: order.address_full_name || customer.name, line1: order.address_line1 ?? customer.address_line1,
      line2: order.address_line2 ?? customer.address_line2, city: order.address_city ?? customer.city,
      state: order.address_state ?? customer.state, pincode: order.address_pincode ?? customer.pincode, country: order.address_country ?? customer.country },
    items: items.map(item => {
      const color = item.selectedColor ?? item.selected_color ?? null;
      const snapshotted = item.selectedColorName ?? item.selected_color_name ?? null;
      const colorImages = colorImagesByProduct.get(String(item.product_id ?? item.productId ?? ''));
      return {
        name: item.name || item.product_name, quantity: num(item.quantity),
        size: item.selectedSize || item.selected_size || null,
        color: snapshotted || colorNameFor(color) || null,
        // Used only to paint a swatch in the PDF; never rendered as text.
        colorValue: color,
        colorImage: item.selectedColorImage ?? item.selected_color_image
          ?? (color ? colorImageFor(color, colorImages) : null)
          ?? item.image_url ?? item.image ?? null,
        price: num(item.price), total: num(item.total ?? item.subtotal ?? num(item.price) * num(item.quantity))
      };
    })
  };
}
// Stored text must not become executable HTML inside Chromium.
function escapeInvoice(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  if (Array.isArray(value)) return value.map(escapeInvoice);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, escapeInvoice(entry)]));
  return value;
}
module.exports = { loadInvoice, escapeInvoice, isCompletedOrder };
