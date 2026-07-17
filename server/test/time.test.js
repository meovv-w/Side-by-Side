const test = require('node:test');
const assert = require('node:assert/strict');
const { dateKey, timestamp } = require('../src/lib/time');

test('naive database timestamps are UTC instants', () => {
  assert.equal(timestamp('2026-07-17 16:30:00.000'), Date.parse('2026-07-17T16:30:00.000Z'));
});

test('business date keys use China Standard Time', () => {
  assert.equal(dateKey('2026-07-17 15:59:59.999'), '2026-07-17');
  assert.equal(dateKey('2026-07-17 16:00:00.000'), '2026-07-18');
});
