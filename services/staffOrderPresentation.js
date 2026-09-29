const { colorNameFor } = require('./colorCatalog');

const addressFields = [
  'address_id', 'address_label', 'address_full_name', 'address_phone', 'address_line1',
  'address_line2', 'address_city', 'address_state', 'address_pincode', 'address_country'
];
const snapshotDefinitions = {
  address_id: 'INT NULL', address_label: 'VARCHAR(100) NULL', address_full_name: 'VARCHAR(255) NULL',
  address_phone: 'VARCHAR(50) NULL', address_line1: 'VARCHAR(500) NULL', address_line2: 'VARCHAR(500) NULL',
  address_city: 'VARCHAR(150) NULL', address_state: 'VARCHAR(150) NULL', address_pincode: 'VARCHAR(30) NULL',
  address_country: 'VARCHAR(100) NULL',
  // The day the customer is promised the goods. Nullable on purpose: an order
  // has no promised day until a person sets one, and a blank date is shown as
  // "not promised yet" rather than guessed from the day the order was placed.
  delivery_date: 'DATE NULL'
};
const itemSnapshotDefinitions = { selected_size: 'VARCHAR(100) NULL', selected_color: 'VARCHAR(100) NULL' };
// The promised day also lives on `orders`, because a customer can place an order
// themselves and staff still have to be able to say when it will be delivered.
// `orders.event_date` is left exactly as it is: it is a separate legacy field that
// the customer app fills with today's date rather than a day anyone chose, so
// promoting it to "the delivery date" would show a placeholder as if it had been
// agreed.
const orderTableDefinitions = { delivery_date: 'DATE NULL' };
let schemaPromise;
function ensureStaffOrderSnapshotColumns(connection) {
  if (!schemaPromise) schemaPromise = (async () => {
    for (const table of ['admin_orders', 'salesman_orders']) {
      const [existing] = await connection.query(`SHOW COLUMNS FROM ${table}`);
      const names = new Set(existing.map(column => column.Field));
      for (const [name, definition] of Object.entries(snapshotDefinitions)) {
        if (!names.has(name)) await connection.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
    }
    for (const table of ['admin_order_items', 'salesman_order_items']) {
      const [existing] = await connection.query(`SHOW COLUMNS FROM ${table}`);
      const names = new Set(existing.map(column => column.Field));
      for (const [name, definition] of Object.entries(itemSnapshotDefinitions)) {
        if (!names.has(name)) await connection.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
    }
    // Every order can be promised a day, whichever panel created it.
    {
      const [existing] = await connection.query('SHOW COLUMNS FROM orders');
      const names = new Set(existing.map(column => column.Field));
      for (const [name, definition] of Object.entries(orderTableDefinitions)) {
        if (!names.has(name)) await connection.query(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
      }
    }
  })().catch(error => { schemaPromise = undefined; throw error; });
  return schemaPromise;
}

async function getCustomerDeliveryAddress(connection, customerId) {
  const [customers] = await connection.query(
    `SELECT id, name, phone, address_line1, address_line2, city, state, pincode, country
     FROM customers WHERE id = ?`, [customerId]
  );
  if (!customers[0]) throw Object.assign(new Error('Selected customer not found'), { status: 404 });
  const customer = customers[0];
  let address;
  try {
    const [addresses] = await connection.query(
      `SELECT id, label, full_name, phone, line1, line2, city, state, pincode, country
       FROM customer_addresses WHERE customer_id = ?
       ORDER BY is_default DESC, created_at DESC LIMIT 1`, [customerId]
    );
    address = addresses[0];
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
  }
  return {
    address_id: address?.id ?? null,
    address_label: address?.label ?? null,
    address_full_name: address?.full_name || customer.name || '',
    address_phone: address?.phone || customer.phone || '',
    address_line1: address?.line1 || customer.address_line1 || '',
    address_line2: address?.line2 || customer.address_line2 || '',
    address_city: address?.city || customer.city || '',
    address_state: address?.state || customer.state || '',
    address_pincode: address?.pincode || customer.pincode || '',
    address_country: address?.country || customer.country || 'India',
  };
}

function addressValues(address) { return addressFields.map(field => address[field] ?? null); }

async function enrichStaffOrderItems(connection, table, orderId, existingItems) {
  let items = existingItems;
  if (!Array.isArray(items)) [items] = await connection.query(
    `SELECT oi.product_id, oi.product_name AS name, oi.quantity, oi.price,
            oi.discount, oi.subtotal, oi.image_url, oi.selected_size, oi.selected_color
     FROM ${table} oi WHERE oi.order_id = ?`, [orderId]
  );
  for (const item of items) {
    // image_url already holds the image of the colour that was ordered, so it is
    // only filled in for older lines that were stored before colour images were
    // recorded. The first product image is a last resort, never a substitute for
    // a colour that has its own image.
    if (!String(item.image_url || '').trim() && item.product_id) {
      let images;
      try {
        [images] = await connection.query(`SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1`, [item.product_id]);
      } catch (error) {
        if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;
        [images] = await connection.query(`SELECT image_url FROM product_images WHERE product_id = ? ORDER BY id ASC LIMIT 1`, [item.product_id]);
      }
      item.image_url = images[0]?.image_url || '';
    }
    item.image = item.image_url || '';
    // Resolve the display name from this line's own colour value so the client
    // never has to render the stored value or guess from the product.
    const color = item.selected_color ?? item.selectedColor;
    const snapshotName = item.selected_color_name ?? item.selectedColorName;
    if (color) {
      item.selected_color_name = snapshotName || colorNameFor(color) || null;
    }
  }
  return items;
}

module.exports = { addressFields, addressValues, ensureStaffOrderSnapshotColumns, getCustomerDeliveryAddress, enrichStaffOrderItems };
