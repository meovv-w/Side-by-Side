const mysql = require('mysql2/promise');
const { TABLES, JSON_COLUMNS } = require('./schema');

function ident(value) {
  return `\`${value}\``;
}

function validateTable(table) {
  if (!TABLES[table]) throw new Error(`Unknown table: ${table}`);
}

function validateColumn(table, column) {
  if (!TABLES[table].includes(column)) throw new Error(`Unknown column: ${table}.${column}`);
}

function encodeValue(table, column, value) {
  return JSON_COLUMNS.has(`${table}.${column}`) && value != null ? JSON.stringify(value) : value;
}

function decodeRow(table, row) {
  if (!row) return null;
  const result = { ...row };
  for (const column of TABLES[table]) {
    if (!JSON_COLUMNS.has(`${table}.${column}`) || typeof result[column] !== 'string') continue;
    try { result[column] = JSON.parse(result[column]); } catch (_) {}
  }
  return result;
}

function whereClause(table, criteria, values) {
  const parts = [];
  for (const [column, expected] of Object.entries(criteria || {})) {
    validateColumn(table, column);
    if (Array.isArray(expected)) {
      if (!expected.length) { parts.push('1 = 0'); continue; }
      parts.push(`${ident(column)} IN (${expected.map(() => '?').join(',')})`);
      values.push(...expected.map(value => encodeValue(table, column, value)));
      continue;
    }
    if (expected && typeof expected === 'object' && expected.op) {
      const operators = { not: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' };
      if (expected.op === 'null' || expected.op === 'notNull') {
        parts.push(`${ident(column)} IS ${expected.op === 'notNull' ? 'NOT ' : ''}NULL`);
      } else {
        if (!operators[expected.op]) throw new Error(`Unsupported operator: ${expected.op}`);
        parts.push(`${ident(column)} ${operators[expected.op]} ?`);
        values.push(encodeValue(table, column, expected.value));
      }
      continue;
    }
    if (expected == null) parts.push(`${ident(column)} IS NULL`);
    else { parts.push(`${ident(column)} = ?`); values.push(encodeValue(table, column, expected)); }
  }
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
}

class MySqlRepository {
  constructor(executor) {
    this.executor = executor;
  }

  async insert(table, row) {
    validateTable(table);
    const columns = Object.keys(row);
    columns.forEach(column => validateColumn(table, column));
    const values = columns.map(column => encodeValue(table, column, row[column]));
    await this.executor.execute(
      `INSERT INTO ${ident(table)} (${columns.map(ident).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      values
    );
    return this.get(table, row.id);
  }

  async get(table, id) {
    validateTable(table);
    const [rows] = await this.executor.execute(`SELECT * FROM ${ident(table)} WHERE id = ? LIMIT 1`, [id]);
    return decodeRow(table, rows[0] || null);
  }

  async findOne(table, criteria = {}, options = {}) {
    const rows = await this.find(table, criteria, { ...options, limit: 1 });
    return rows[0] || null;
  }

  async find(table, criteria = {}, options = {}) {
    validateTable(table);
    const values = [];
    let sql = `SELECT * FROM ${ident(table)}${whereClause(table, criteria, values)}`;
    if (options.orderBy) {
      const orders = Array.isArray(options.orderBy[0]) ? options.orderBy : [options.orderBy];
      sql += ` ORDER BY ${orders.map(([column, direction = 'asc']) => {
        validateColumn(table, column);
        return `${ident(column)} ${String(direction).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`;
      }).join(',')}`;
    }
    if (options.limit) sql += ` LIMIT ${Math.max(1, Math.floor(Number(options.limit)))}`;
    if (options.offset) {
      if (!options.limit) sql += ' LIMIT 18446744073709551615';
      sql += ` OFFSET ${Math.max(0, Math.floor(Number(options.offset)))}`;
    }
    const [rows] = await this.executor.execute(sql, values);
    return rows.map(row => decodeRow(table, row));
  }

  async update(table, id, changes) {
    validateTable(table);
    const columns = Object.keys(changes);
    if (!columns.length) return this.get(table, id);
    columns.forEach(column => validateColumn(table, column));
    const values = columns.map(column => encodeValue(table, column, changes[column]));
    values.push(id);
    const [result] = await this.executor.execute(
      `UPDATE ${ident(table)} SET ${columns.map(column => `${ident(column)} = ?`).join(',')} WHERE id = ?`,
      values
    );
    return result.affectedRows ? this.get(table, id) : null;
  }

  async updateWhere(table, criteria, changes) {
    validateTable(table);
    const columns = Object.keys(changes);
    columns.forEach(column => validateColumn(table, column));
    const values = columns.map(column => encodeValue(table, column, changes[column]));
    const where = whereClause(table, criteria, values);
    if (!where) throw new Error('updateWhere requires criteria');
    const [result] = await this.executor.execute(
      `UPDATE ${ident(table)} SET ${columns.map(column => `${ident(column)} = ?`).join(',')}${where}`,
      values
    );
    return result.affectedRows;
  }

  async increment(table, id, changes) {
    validateTable(table);
    const columns = Object.keys(changes);
    columns.forEach(column => validateColumn(table, column));
    const values = columns.map(column => Number(changes[column]));
    values.push(id);
    await this.executor.execute(
      `UPDATE ${ident(table)} SET ${columns.map(column => `${ident(column)} = ${ident(column)} + ?`).join(',')} WHERE id = ?`,
      values
    );
    return this.get(table, id);
  }

  async reserveInventory(productId, amount) {
    const quantity = Number(amount);
    const [result] = await this.executor.execute(
      'UPDATE `products` SET `reserved` = `reserved` + ? WHERE `id` = ? AND `sold` + `reserved` + ? <= `stock`',
      [quantity, productId, quantity]
    );
    return result.affectedRows ? this.get('products', productId) : null;
  }

  async commitInventory(productId, amount) {
    const quantity = Number(amount);
    const [result] = await this.executor.execute(
      'UPDATE `products` SET `reserved` = `reserved` - ?, `sold` = `sold` + ? WHERE `id` = ? AND `reserved` >= ?',
      [quantity, quantity, productId, quantity]
    );
    return result.affectedRows ? this.get('products', productId) : null;
  }

  async releaseInventory(productId, amount) {
    const quantity = Number(amount);
    await this.executor.execute(
      'UPDATE `products` SET `reserved` = GREATEST(0, `reserved` - ?) WHERE `id` = ?',
      [quantity, productId]
    );
    return this.get('products', productId);
  }

  async delete(table, id) {
    validateTable(table);
    const [result] = await this.executor.execute(`DELETE FROM ${ident(table)} WHERE id = ?`, [id]);
    return result.affectedRows > 0;
  }

  async count(table, criteria = {}) {
    validateTable(table);
    const values = [];
    const [rows] = await this.executor.execute(
      `SELECT COUNT(*) total FROM ${ident(table)}${whereClause(table, criteria, values)}`,
      values
    );
    return Number(rows[0].total);
  }

  async transaction(work) {
    const connection = await this.executor.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(new MySqlRepository(connection));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

function createMySqlPool(url) {
  const parsed = new URL(url);
  return mysql.createPool({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    connectionLimit: 10,
    decimalNumbers: true,
    timezone: 'Z',
    charset: 'utf8mb4'
  });
}

module.exports = { MySqlRepository, createMySqlPool };
