const fs = require('fs');
const path = require('path');
const { createMySqlPool } = require('../src/db/mysql');
const { loadConfig } = require('../src/config');

async function run() {
  const config = loadConfig();
  const pool = createMySqlPool(config.mysqlUrl);
  const migrationDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationDir).filter(file => file.endsWith('.sql')).sort();
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  for (const file of files) {
    const [rows] = await pool.execute('SELECT name FROM schema_migrations WHERE name = ?', [file]);
    if (rows.length) continue;
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map(value => value.trim()).filter(Boolean)) await connection.query(statement);
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      await connection.commit();
      console.log(`applied ${file}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  await pool.end();
}

run().catch(error => { console.error(error); process.exit(1); });
