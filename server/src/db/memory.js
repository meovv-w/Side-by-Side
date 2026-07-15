const { TABLES } = require('./schema');

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function matches(row, criteria) {
  return Object.entries(criteria || {}).every(([key, expected]) => {
    if (Array.isArray(expected)) return expected.includes(row[key]);
    if (expected && typeof expected === 'object' && expected.op) {
      if (expected.op === 'not') return row[key] !== expected.value;
      if (expected.op === 'lt') return row[key] < expected.value;
      if (expected.op === 'lte') return row[key] <= expected.value;
      if (expected.op === 'gt') return row[key] > expected.value;
      if (expected.op === 'gte') return row[key] >= expected.value;
      if (expected.op === 'null') return row[key] == null;
      if (expected.op === 'notNull') return row[key] != null;
    }
    return row[key] === expected;
  });
}

class MemoryRepository {
  constructor(seed = {}) {
    this.data = {};
    for (const table of Object.keys(TABLES)) this.data[table] = clone(seed[table] || []);
  }

  async insert(table, row) {
    this.#table(table).push(clone(row));
    return clone(row);
  }

  async get(table, id) {
    return clone(this.#table(table).find(row => row.id === id) || null);
  }

  async findOne(table, criteria = {}, options = {}) {
    const rows = await this.find(table, criteria, { ...options, limit: 1 });
    return rows[0] || null;
  }

  async find(table, criteria = {}, options = {}) {
    let rows = this.#table(table).filter(row => matches(row, criteria));
    if (options.orderBy) {
      const orders = Array.isArray(options.orderBy[0]) ? options.orderBy : [options.orderBy];
      rows = rows.slice().sort((a, b) => {
        for (const [column, direction = 'asc'] of orders) {
          const av = a[column]; const bv = b[column];
          if (av === bv) continue;
          const result = av == null ? -1 : bv == null ? 1 : av > bv ? 1 : -1;
          return direction.toLowerCase() === 'desc' ? -result : result;
        }
        return 0;
      });
    }
    if (options.offset) rows = rows.slice(options.offset);
    if (options.limit) rows = rows.slice(0, options.limit);
    return clone(rows);
  }

  async update(table, id, changes) {
    const row = this.#table(table).find(item => item.id === id);
    if (!row) return null;
    Object.assign(row, clone(changes));
    return clone(row);
  }

  async updateWhere(table, criteria, changes) {
    const rows = this.#table(table).filter(row => matches(row, criteria));
    rows.forEach(row => Object.assign(row, clone(changes)));
    return rows.length;
  }

  async increment(table, id, changes) {
    const row = this.#table(table).find(item => item.id === id);
    if (!row) return null;
    for (const [column, delta] of Object.entries(changes)) row[column] = Number(row[column] || 0) + Number(delta);
    return clone(row);
  }

  async reserveInventory(productId, amount) {
    const product = this.#table('products').find(item => item.id === productId);
    if (!product || Number(product.sold) + Number(product.reserved || 0) + Number(amount) > Number(product.stock)) return null;
    product.reserved = Number(product.reserved || 0) + Number(amount);
    return clone(product);
  }

  async commitInventory(productId, amount) {
    const product = this.#table('products').find(item => item.id === productId);
    if (!product || Number(product.reserved || 0) < Number(amount)) return null;
    product.reserved = Number(product.reserved) - Number(amount);
    product.sold = Number(product.sold) + Number(amount);
    return clone(product);
  }

  async releaseInventory(productId, amount) {
    const product = this.#table('products').find(item => item.id === productId);
    if (!product) return null;
    product.reserved = Math.max(0, Number(product.reserved || 0) - Number(amount));
    return clone(product);
  }

  async delete(table, id) {
    const rows = this.#table(table);
    const index = rows.findIndex(row => row.id === id);
    if (index < 0) return false;
    rows.splice(index, 1);
    return true;
  }

  async count(table, criteria = {}) {
    return this.#table(table).filter(row => matches(row, criteria)).length;
  }

  async transaction(work) {
    const snapshot = clone(this.data);
    try {
      return await work(this);
    } catch (error) {
      this.data = snapshot;
      throw error;
    }
  }

  snapshot() {
    return clone(this.data);
  }

  #table(table) {
    if (!TABLES[table]) throw new Error(`Unknown table: ${table}`);
    return this.data[table];
  }
}

module.exports = { MemoryRepository };
