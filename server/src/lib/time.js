function dateTime(value = Date.now()) {
  return asDate(value).toISOString().slice(0, 23).replace('T', ' ');
}

function addTime(value, amount, unit = 'milliseconds') {
  const factors = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };
  return dateTime(timestamp(value) + amount * (factors[unit] || 1));
}

function isPast(value, now = Date.now()) {
  return value != null && timestamp(value) <= timestamp(now);
}

function asDate(value) {
  if (value instanceof Date || typeof value === 'number') return new Date(value);
  const text = String(value || '');
  return new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text) && !/[zZ]|[+-]\d\d:?\d\d$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text);
}

function timestamp(value) {
  return asDate(value).getTime();
}

function dateKey(value = Date.now(), offsetMinutes = 480) {
  return new Date(timestamp(value) + offsetMinutes * 60000).toISOString().slice(0, 10);
}

module.exports = { dateTime, addTime, isPast, timestamp, dateKey };
