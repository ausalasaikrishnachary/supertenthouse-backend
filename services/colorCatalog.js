// Single source of truth for turning a stored colour value into the pair the
// customer must see: a display NAME and the matching IMAGE.
//
// `products.colors` stores colour values (hex) and `products.color_images` is a
// map keyed by that same value. A cart/order/wishlist row stores only the value in
// `selected_color`, so any surface that renders that value directly leaks a hex
// code, and any surface that picks an image independently (e.g. product.images[0])
// can show an image belonging to a different colour.
//
// Everything here derives the name and the image from ONE lookup on the SAME key,
// so the two can never disagree.

const COLOR_CATALOG = [
  { name: 'Red', hex: '#FF0000' },
  { name: 'Crimson', hex: '#DC143C' },
  { name: 'Maroon', hex: '#800000' },
  { name: 'Pink', hex: '#FF69B4' },
  { name: 'Hot Pink', hex: '#FF1493' },
  { name: 'Orange', hex: '#FF8C00' },
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Yellow', hex: '#FFFF00' },
  { name: 'Lime', hex: '#00FF00' },
  { name: 'Green', hex: '#008000' },
  { name: 'Teal', hex: '#008080' },
  { name: 'Cyan', hex: '#00FFFF' },
  { name: 'Sky Blue', hex: '#87CEEB' },
  { name: 'Blue', hex: '#0000FF' },
  { name: 'Navy', hex: '#000080' },
  { name: 'Indigo', hex: '#4B0082' },
  { name: 'Purple', hex: '#800080' },
  { name: 'Violet', hex: '#EE82EE' },
  { name: 'Magenta', hex: '#FF00FF' },
  { name: 'Brown', hex: '#A52A2A' },
  { name: 'Beige', hex: '#F5F5DC' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Gray', hex: '#808080' },
  { name: 'Black', hex: '#000000' },
  { name: 'Silver', hex: '#C0C0C0' },
  { name: 'Rose Gold', hex: '#B76E79' },
  { name: 'Copper', hex: '#B87333' },
  { name: 'Bronze', hex: '#CD7F32' },
  { name: 'Emerald', hex: '#50C878' },
  { name: 'Sapphire', hex: '#0F52BA' },
  { name: 'Ruby', hex: '#9B111E' },
];

const NAME_BY_HEX = new Map(COLOR_CATALOG.map(entry => [entry.hex, entry.name]));

// Accepts '#abc', 'abc', '#AABBCC', 'aabbcc' and returns canonical '#AABBCC'.
const normalizeColorValue = (value) => {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const full = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex;
  return `#${full.toUpperCase()}`;
};

// Products may legitimately carry a name (or an old free-text value) instead of a
// hex. Those are already display-ready and must be passed through untouched.
//
// The test is deliberately strict, because anything too permissive here puts a raw
// stored token on screen. A display name is words only: letters, optionally
// separated by spaces or hyphens. That accepts "Blue", "Sky Blue" and "Hot Pink"
// while rejecting the values that must never be rendered:
//   'colour-id-99', '12', 'red_1', 'rgb(255,0,0)', 'hsl(0,0%,0%)', '#GGG'.
const DISPLAY_NAME = /^[\p{L}][\p{L}]*(?:[\s-][\p{L}]+)*$/u;
const isDisplayName = (value) => {
  const raw = String(value ?? '').trim();
  return Boolean(raw) && normalizeColorValue(raw) === null && DISPLAY_NAME.test(raw);
};

const colorNameFor = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (isDisplayName(raw)) return raw;
  return NAME_BY_HEX.get(normalizeColorValue(raw)) || null;
};

const parseJsonMap = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

// products.colors is a JSON column, so it reaches the API as a JSON string.
const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
};

const firstUsableImage = (images) => {
  if (Array.isArray(images)) {
    const first = images.find(image => typeof image === 'string' && image.trim());
    return first ? first.trim() : null;
  }
  if (typeof images === 'string' && images.trim()) return images.trim();
  return null;
};

// Looks the image up under the normalized key first, then the raw key, then a
// case-insensitive scan, so a map written with either '#0000FF' or '#0000ff'
// keys resolves against a value stored in the other convention.
const colorImageFor = (value, colorImages) => {
  const map = parseJsonMap(colorImages);
  const keys = [];
  const addKey = key => { if (key && !keys.includes(key)) keys.push(key); };

  const normalized = normalizeColorValue(value);
  addKey(normalized);
  if (normalized) addKey(normalized.toLowerCase());
  addKey(String(value ?? '').trim());

  for (const key of keys) {
    const image = firstUsableImage(map[key]);
    if (image) return image;
  }

  const wanted = normalized ? normalized.toLowerCase() : String(value ?? '').trim().toLowerCase();
  if (!wanted) return null;
  for (const [key, images] of Object.entries(map)) {
    if (String(key).trim().toLowerCase() === wanted) {
      const image = firstUsableImage(images);
      if (image) return image;
    }
  }
  return null;
};

// The one place a selected colour becomes a displayable record. Name and image are
// resolved from the same colour value against the same key.
const describeColor = (value, colorImages) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return {
    value: raw,
    name: colorNameFor(raw),
    image: colorImageFor(raw, colorImages),
  };
};

// Options for a colour picker: each entry keeps its own name and image together.
const describeColorOptions = (colors, colorImages) =>
  parseJsonArray(colors)
    .map(color => describeColor(color, colorImages))
    .filter(Boolean);

// Decorates an API row that stores the selection in `selected_color`, adding the
// display fields. Never falls back to the product's first colour.
const attachSelectedColor = (row, { colorImages, colorImagesKey = 'available_color_images' } = {}) => {
  if (!row || typeof row !== 'object') return row;
  const images = colorImages ?? row[colorImagesKey];
  const described = describeColor(row.selected_color ?? row.selectedColor, images);
  if (!described) return row;
  return {
    ...row,
    selected_color_name: described.name,
    selected_color_image: described.image,
    selected_color_options: describeColorOptions(row.available_colors ?? row.colors, images),
  };
};

const attachSelectedColors = (rows, options) =>
  Array.isArray(rows) ? rows.map(row => attachSelectedColor(row, options)) : rows;

module.exports = {
  COLOR_CATALOG,
  normalizeColorValue,
  colorNameFor,
  colorImageFor,
  describeColor,
  describeColorOptions,
  attachSelectedColor,
  attachSelectedColors,
};
