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
  const presence = await app.inject({ method: 'POST', url: '/api/poi-topics/poi_001/presence', headers, payload: {} });
  if (presence.statusCode !== 200 || Number(presence.json().data.onlineCount) < 1) throw new Error(`POI presence failed: ${presence.body}`);
  const storedPresence = await app.repository.findOne('poi_topic_presence', { topic_id: 'poi_001', user_id: 'u_demo' });
  if (!storedPresence) throw new Error('POI presence was not persisted');
  await new Promise(resolve => setTimeout(resolve, 30));
  const audit = await app.repository.findOne('audit_logs', { actor_id: 'u_demo', path: '/api/settings' });
  if (!audit) throw new Error('audit log was not persisted');

  const merchantLogin = await app.inject({ method: 'POST', url: '/api/auth/demo', payload: { userId: 'u_merchant' } });
  const merchantHeaders = { authorization: `Bearer ${merchantLogin.json().data.token}` };
  const promotion = await app.inject({ method: 'POST', url: '/api/merchant/promotion/share', headers: merchantHeaders, payload: {} });
  if (promotion.statusCode !== 200) throw new Error(`merchant promotion failed: ${promotion.body}`);
  const inviteToken = new URL(`https://mini.invalid${promotion.json().data.miniProgramPath}`).searchParams.get('inviteToken');
  const phone = `139${String(Date.now()).slice(-8)}`;
  const code = await app.inject({ method: 'POST', url: '/api/auth/sms/send', payload: { phone } });
  const invited = await app.inject({
    method: 'POST', url: '/api/auth/sms/login',
    payload: { phone, code: code.json().data.devCode, profile: { nickname: '集成推广用户' }, inviteToken }
  });
  if (invited.statusCode !== 200) throw new Error(`merchant invite registration failed: ${invited.body}`);
  const invitedUserId = invited.json().data.user.id;
  const invite = await app.repository.findOne('invites', { invitee_id: invitedUserId });
  const merchantCoupon = await app.repository.findOne('user_coupons', { user_id: invitedUserId, source: 'merchant_promotion' });
  if (!invite || invite.source !== 'merchant' || !merchantCoupon) throw new Error('merchant invite attribution or coupon issuance failed');

  await app.cache.setex('tongdao:integration:probe', 10, 'ok');
  if (await app.cache.get('tongdao:integration:probe') !== 'ok') throw new Error('redis read/write failed');
  await app.close();
  console.log(JSON.stringify({ mysql: 'ok', redis: 'ok', api: 'ok', audit: 'ok', merchantInvite: 'ok', poiPresence: 'ok' }));
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
