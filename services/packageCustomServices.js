const predefined = new Set(['catering', 'stage decoration', 'flower decoration', 'lighting', 'photography', 'videography', 'sound system', 'dj setup']);
function parseCustomServices(value) {
  const values = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(values) || values.length > 50) throw new Error('Custom services must be a list of at most 50 names');
  const seen = new Set(predefined);
  return values.map(name => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new Error('Service names must contain 1–100 characters');
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (seen.has(normalized.toLowerCase())) throw new Error('Service names must be unique and not duplicate predefined services');
    seen.add(normalized.toLowerCase()); return normalized;
  });
}
function validateCustomServices(req, res, next) {
  try {
    req.customServicesJSON = req.body.custom_services === undefined ? null : JSON.stringify(parseCustomServices(req.body.custom_services));
    next();
  } catch (error) { res.status(400).json({ error: 'Invalid custom services', message: error.message }); }
}
module.exports = { parseCustomServices, validateCustomServices };
