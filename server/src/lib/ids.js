const crypto = require('crypto');

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function sixDigitCode() {
  return `${crypto.randomInt(100000, 1000000)}`;
}

function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let i = 0; i < 8; i += 1) value += alphabet[crypto.randomInt(0, alphabet.length)];
  return value;
}

module.exports = { id, sixDigitCode, inviteCode };
