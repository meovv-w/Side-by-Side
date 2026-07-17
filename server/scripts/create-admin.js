const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createMySqlPool, MySqlRepository } = require('../src/db/mysql');
const { dateTime } = require('../src/lib/time');

async function run() {
  const mysqlUrl = process.env.MYSQL_URL;
  const account = String(process.env.ADMIN_ACCOUNT || '').trim();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const role = String(process.env.ADMIN_ROLE || 'ops').trim();
  const merchantId = String(process.env.MERCHANT_ID || '').trim() || null;

  if (!mysqlUrl) throw new Error('MYSQL_URL is required');
  if (!account || account.length > 160) throw new Error('ADMIN_ACCOUNT is required and must not exceed 160 characters');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters');
  if (!['ops', 'merchant'].includes(role)) throw new Error('ADMIN_ROLE must be ops or merchant');
  if (role === 'merchant' && !merchantId) throw new Error('MERCHANT_ID is required for a merchant administrator');
  if (role === 'ops' && merchantId) throw new Error('MERCHANT_ID must be empty for an ops administrator');

  const pool = createMySqlPool(mysqlUrl);
  const repository = new MySqlRepository(pool);
  try {
    if (merchantId && !(await repository.get('merchants', merchantId))) throw new Error('MERCHANT_ID does not exist');
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await repository.findOne('admins', { account });
    if (existing) {
      await repository.update('admins', existing.id, {
        password_hash: passwordHash, role, merchant_id: merchantId, status: 'active'
      });
      console.log(`Administrator updated: ${account} (${role})`);
      return;
    }
    await repository.insert('admins', {
      id: `admin_${crypto.randomUUID()}`, account, password_hash: passwordHash, role,
      merchant_id: merchantId, status: 'active', created_at: dateTime(), last_login_at: null
    });
    console.log(`Administrator created: ${account} (${role})`);
  } finally {
    await pool.end();
  }
}

run().catch(error => {
  console.error(error.message);
  process.exit(1);
});
