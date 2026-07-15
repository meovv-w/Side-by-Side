const { buildApp } = require('../src/app');

async function run() {
  const app = await buildApp({
    env: {
      NODE_ENV: 'development', DB_MODE: 'mysql', PROVIDER_MODE: 'demo', ALLOW_DEV_CODES: 'true',
      MYSQL_URL: process.env.MYSQL_URL, REDIS_URL: process.env.REDIS_URL,
      JWT_SECRET: 'integration-secret-that-is-longer-than-thirty-two-characters',
      DATA_ENCRYPTION_KEY: 'integration-data-key-that-is-longer-than-thirty-two-characters'
    },
    logger: process.env.DEBUG_INTEGRATION === 'true'
  });
  await app.ready();
  const login = await app.inject({ method: 'POST', url: '/api/auth/demo', payload: { userId: 'u_demo' } });
  if (login.statusCode !== 200) throw new Error(`demo login failed: ${login.body}`);
  const token = login.json().data.token;
  const headers = { authorization: `Bearer ${token}` };
  const home = await app.inject({ method: 'GET', url: '/api/home', headers });
  if (home.statusCode !== 200 || home.json().data.currentTrip.id !== 'trip_001') throw new Error(`home failed: ${home.body}`);
  const settings = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { allowMarketing: false } });
  if (settings.statusCode !== 200) throw new Error(`settings mutation failed: ${settings.body}`);
  await new Promise(resolve => setTimeout(resolve, 30));
  const audit = await app.repository.findOne('audit_logs', { actor_id: 'u_demo', path: '/api/settings' });
  if (!audit) throw new Error('audit log was not persisted');
  await app.cache.setex('tongdao:integration:probe', 10, 'ok');
  if (await app.cache.get('tongdao:integration:probe') !== 'ok') throw new Error('redis read/write failed');
  await app.close();
  console.log(JSON.stringify({ mysql: 'ok', redis: 'ok', api: 'ok', audit: 'ok' }));
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
