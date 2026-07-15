const crypto = require('crypto');

function encryptText(value, secret) {
  if (!value) return '';
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

function maskCard(value) {
  const digits = String(value || '').replace(/\s/g, '');
  if (digits.length < 8) return digits ? '****' : '';
  return `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}`;
}

module.exports = { encryptText, maskCard };
