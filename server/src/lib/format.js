function camelKey(key) {
  return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toPublic(value) {
  if (Array.isArray(value)) return value.map(toPublic);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [camelKey(key), toPublic(item)]));
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
}

module.exports = { toPublic, pick };
