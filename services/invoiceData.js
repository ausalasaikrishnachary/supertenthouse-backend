const tables = { customer: ['orders', null], admin: ['admin_orders', 'admin_order_items'], salesman: ['salesman_orders', 'salesman_order_items'] };
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const isCompletedOrder = status => String(status || '').trim().toLowerCase() === 'completed';
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
  return {
    orderId: id, orderSource: source, orderNumber: order.order_number, invoiceNumber: order.invoice_number,
    customerName: order.customer_name || customer.name, customerEmail: order.customer_email || customer.email,
    customerPhone: order.customer_phone || customer.phone, eventDate: order.event_date, eventTime: order.event_time,
    eventType: order.event_type, venue: order.venue, guestCount: order.guest_count, specialInstructions: order.special_instructions,
    subtotal: num(order.subtotal ?? order.total_amount ?? order.total), gst: num(order.gst ?? order.tax_amount ?? order.tax),
    grandTotal: num(order.grand_total), deliveryCharge: num(order.delivery_charge),
    couponDiscount: num(order.coupon_discount ?? order.discount), couponCode: order.coupon_code,
    paymentMethod: order.payment_method, paymentStatus: order.payment_status,
    address: { fullName: order.address_full_name || customer.name, line1: order.address_line1 ?? customer.address_line1,
      line2: order.address_line2 ?? customer.address_line2, city: order.address_city ?? customer.city,
      state: order.address_state ?? customer.state, pincode: order.address_pincode ?? customer.pincode, country: order.address_country ?? customer.country },
    items: items.map(item => ({ name: item.name || item.product_name, quantity: num(item.quantity), price: num(item.price), total: num(item.total ?? item.subtotal ?? num(item.price) * num(item.quantity)) }))
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
