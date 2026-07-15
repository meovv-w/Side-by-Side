const { loadConfig } = require('../src/config');
const { createMySqlPool, MySqlRepository } = require('../src/db/mysql');
const { createDemoSeed } = require('../src/db/demo-seed');

const ORDER = [
  'users', 'user_settings', 'vehicle_certifications', 'trip_drafts', 'badges', 'user_badges',
  'merchants', 'merchant_change_requests', 'admins', 'trips', 'trip_applications', 'trip_members',
  'locations', 'messages', 'conversation_members', 'follows', 'blocks', 'poi_topics', 'poi_topic_members',
  'products', 'groupbuy_sessions', 'coupons', 'orders', 'groupbuy_members', 'payment_events', 'refunds',
  'verification_records', 'settlements', 'user_coupons', 'coupon_redemptions', 'invites', 'invite_links', 'growth_rules',
  'growth_logs', 'support_tickets', 'support_messages', 'notifications', 'emergency_events',
  'traffic_events', 'system_settings', 'idempotency_keys', 'audit_logs'
];

async function run() {
  if (process.env.NODE_ENV === 'production' || process.env.SEED_DEMO !== 'true') {
    throw new Error('Demo seeding requires SEED_DEMO=true and is disabled in production');
  }
  const config = loadConfig();
  const pool = createMySqlPool(config.mysqlUrl);
  const repository = new MySqlRepository(pool);
  const seed = createDemoSeed();
  seed.users.sort((a, b) => Number(Boolean(a.invited_by)) - Number(Boolean(b.invited_by)));
  for (const table of ORDER) {
    for (const row of seed[table] || []) {
      if (!(await repository.get(table, row.id))) await repository.insert(table, row);
    }
  }
  await pool.end();
  console.log('Demo data seeded');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
