// Chooses the image stored on an order line.
//
// An order line must show the image of the colour that was actually ordered, not
// whichever image happens to be first for the product. The selected colour's
// image is resolved by resolveOrderItemVariant and passed in here; the product's
// first image is only a fallback for lines with no colour or a colour that has no
// image of its own.
//
// Both the admin and salesman order routes need this, so it lives here rather
// than being repeated per panel. It writes into the existing image_url column,
// so the image an order was created with stays with that order afterwards.

async function firstProductImage(connection, productId) {
  if (!productId) return '';
  const attempts = [
    'SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1',
    'SELECT image_url FROM product_images WHERE product_id = ? ORDER BY id ASC LIMIT 1',
  ];
  for (const sql of attempts) {
    try {
      const [images] = await connection.query(sql, [productId]);
      if (images[0]?.image_url) return images[0].image_url;
    } catch (error) {
      // Older schemas may lack sort_order; the next attempt drops it.
      if (error.code !== 'ER_BAD_FIELD_ERROR' && error.code !== 'ER_NO_SUCH_TABLE') throw error;
    }
  }
  return '';
}

async function resolveOrderItemImage(connection, item = {}) {
  const colorImage = String(item.selected_color_image ?? item.selectedColorImage ?? '').trim();
  if (colorImage) return colorImage;
  return firstProductImage(connection, item.product_id ?? item.productId);
}

module.exports = { resolveOrderItemImage, firstProductImage };
