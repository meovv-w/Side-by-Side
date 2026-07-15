const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');

const BASE_TIME = Date.UTC(2026, 6, 14, 8, 0, 0);

async function setup(t) {
  let currentTime = BASE_TIME;
  const clock = () => currentTime;
  const app = await buildApp({
    env: {
      NODE_ENV: 'test', DB_MODE: 'memory', PROVIDER_MODE: 'demo', ALLOW_DEV_CODES: 'true',
      JWT_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters'
    },
    clock,
    logger: false
  });
  await app.ready();
  t.after(() => app.close());
  return { app, advance: milliseconds => { currentTime += milliseconds; }, now: () => currentTime };
}

async function demoLogin(app, userId = 'u_demo') {
  const response = await app.inject({ method: 'POST', url: '/api/auth/demo', payload: { userId } });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.token;
}

async function opsLogin(app) {
  const response = await app.inject({
    method: 'POST', url: '/api/admin/auth/login',
    payload: { account: 'ops@tongdao.cn', password: 'tongdao2026' }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.token;
}

function auth(token) {
  return { authorization: `Bearer ${token}` };
}

function multipartFile(filename, contentType, content) {
  const boundary = `----tongdao-${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="directory"\r\n\r\nchat\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, Buffer.from(content), tail]), contentType: `multipart/form-data; boundary=${boundary}` };
}

function tripPayload(now, overrides = {}) {
  return {
    title: '杭州到黄山测试车队', teamName: '黄山周末队',
    startName: '杭州', startLng: 120.1551, startLat: 30.2741,
    endName: '黄山', endLng: 118.3376, endLat: 29.7147,
    departAt: new Date(now + 86400000).toISOString(), days: 2, dailyKm: 220,
    maxCars: 4, depth: 'medium', plans: ['AA住宿'], equipment: ['应急药箱'],
    privacy: 'public', discoverable: true,
    ...overrides
  };
}

test('authentication and browse-only certification boundary', async t => {
  const { app, now } = await setup(t);
  const anonymous = await app.inject({ method: 'GET', url: '/api/home' });
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.json().error.code, 'AUTH_REQUIRED');

  const guestToken = await demoLogin(app, 'u_guest');
  const browse = await app.inject({ method: 'GET', url: '/api/products' });
  assert.equal(browse.statusCode, 200);
  assert.ok(browse.json().data.length >= 2);

  const create = await app.inject({ method: 'POST', url: '/api/trips', headers: auth(guestToken), payload: tripPayload(now()) });
  assert.equal(create.statusCode, 403);
  assert.equal(create.json().error.code, 'OWNER_CERT_REQUIRED');

  const wrongAdmin = await app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { account: 'ops@tongdao.cn', password: 'wrong' } });
  assert.equal(wrongAdmin.statusCode, 401);
  assert.ok(await opsLogin(app));
});

test('trip approval, departure leave review, and chat removal form one state machine', async t => {
  const { app, now } = await setup(t);
  const ownerToken = await demoLogin(app, 'u_demo');
  const memberToken = await demoLogin(app, 'u_other');

  const created = await app.inject({ method: 'POST', url: '/api/trips', headers: auth(ownerToken), payload: tripPayload(now()) });
  assert.equal(created.statusCode, 201, created.body);
  const trip = created.json().data;

  const applied = await app.inject({ method: 'POST', url: `/api/trips/${trip.id}/applications`, headers: auth(memberToken), payload: { message: '路线一致，希望同行' } });
  assert.equal(applied.statusCode, 201, applied.body);
  const application = applied.json().data;

  const approved = await app.inject({ method: 'PUT', url: `/api/trip-applications/${application.id}`, headers: auth(ownerToken), payload: { approved: true } });
  assert.equal(approved.statusCode, 200, approved.body);
  const member = approved.json().data;

  const message = await app.inject({ method: 'POST', url: `/api/trips/${trip.id}/messages`, headers: auth(memberToken), payload: { type: 'text', content: '我已准备出发' } });
  assert.equal(message.statusCode, 201, message.body);
  const voice = await app.inject({
    method: 'POST', url: `/api/trips/${trip.id}/messages`, headers: auth(memberToken),
    payload: { type: 'voice', content: '语音消息', mediaUrl: 'https://cdn.example.test/team-message.mp3', metadata: { duration: 5 } }
  });
  assert.equal(voice.statusCode, 201, voice.body);
  assert.equal(voice.json().data.messageType, 'voice');
  assert.equal(voice.json().data.metadata.duration, 5);
  const audio = multipartFile('voice.mp3', 'audio/mpeg', 'demo-audio-bytes');
  const upload = await app.inject({
    method: 'POST', url: '/api/uploads',
    headers: { ...auth(memberToken), 'content-type': audio.contentType }, payload: audio.payload
  });
  assert.equal(upload.statusCode, 201, upload.body);
  assert.match(upload.json().data.url, /^data:audio\/mpeg;base64,/);

  const departed = await app.inject({ method: 'POST', url: `/api/trips/${trip.id}/state`, headers: auth(ownerToken), payload: { action: 'depart' } });
  assert.equal(departed.json().data.stage, 'departed');

  const leave = await app.inject({ method: 'POST', url: `/api/trips/${trip.id}/leave`, headers: auth(memberToken), payload: { reason: '车辆故障' } });
  assert.equal(leave.json().data.status, 'leave_pending');

  const pendingChat = await app.inject({ method: 'POST', url: `/api/trips/${trip.id}/messages`, headers: auth(memberToken), payload: { content: '等待队长审批期间仍可沟通' } });
  assert.equal(pendingChat.statusCode, 201, pendingChat.body);

  const reviewed = await app.inject({ method: 'PUT', url: `/api/trip-members/${member.id}/leave`, headers: auth(ownerToken), payload: { approved: true } });
  assert.equal(reviewed.json().data.status, 'left');

  const blockedChat = await app.inject({ method: 'POST', url: `/api/trips/${trip.id}/messages`, headers: auth(memberToken), payload: { content: '不应发送成功' } });
  assert.equal(blockedChat.statusCode, 403);
  assert.equal(blockedChat.json().error.code, 'TRIP_CHAT_FORBIDDEN');
});

test('next-trip draft keeps notes and finds recruiting teams within 10km', async t => {
  const { app, now } = await setup(t);
  const userToken = await demoLogin(app, 'u_demo');
  const ownerToken = await demoLogin(app, 'u_other');
  const candidate = await app.inject({
    method: 'POST', url: '/api/trips', headers: auth(ownerToken),
    payload: tripPayload(now(), { startLng: 120.16, startLat: 30.28, departAt: new Date(now() + 3 * 86400000).toISOString() })
  });
  assert.equal(candidate.statusCode, 201, candidate.body);
  const draft = await app.inject({
    method: 'POST', url: '/api/trip-drafts', headers: auth(userToken),
    payload: {
      startName: '杭州', startLng: 120.1551, startLat: 30.2741,
      endName: '黄山', endLng: 118.3376, endLat: 29.7147,
      departAt: new Date(now() + 4 * 86400000).toISOString(), note: '偏好早上出发'
    }
  });
  assert.equal(draft.statusCode, 201, draft.body);
  assert.equal(draft.json().data.note, '偏好早上出发');
  const matches = await app.inject({ method: 'GET', url: `/api/trip-drafts/${draft.json().data.id}/matches`, headers: auth(userToken) });
  assert.equal(matches.statusCode, 200, matches.body);
  assert.equal(matches.json().data[0].id, candidate.json().data.id);
  assert.ok(matches.json().data[0].distanceMeters <= 10000);
  assert.ok(matches.json().data[0].matchRate >= 90);
});

test('private message three-message limit unlocks after recipient reply and respects blocking', async t => {
  const { app } = await setup(t);
  const sender = await demoLogin(app, 'u_demo');
  const recipient = await demoLogin(app, 'u_other');

  for (let index = 1; index <= 3; index += 1) {
    const response = await app.inject({ method: 'POST', url: '/api/private/u_other/messages', headers: auth(sender), payload: { content: `第${index}条` } });
    assert.equal(response.statusCode, 201, response.body);
  }
  const limited = await app.inject({ method: 'POST', url: '/api/private/u_other/messages', headers: auth(sender), payload: { content: '第四条' } });
  assert.equal(limited.statusCode, 403);
  assert.equal(limited.json().error.code, 'PRIVATE_LIMIT_REACHED');

  const reply = await app.inject({ method: 'POST', url: '/api/private/u_demo/messages', headers: auth(recipient), payload: { content: '收到' } });
  assert.equal(reply.statusCode, 201, reply.body);
  const unlocked = await app.inject({ method: 'POST', url: '/api/private/u_other/messages', headers: auth(sender), payload: { content: '回复后可继续' } });
  assert.equal(unlocked.statusCode, 201, unlocked.body);

  await app.inject({ method: 'PUT', url: '/api/blocks/u_other', headers: auth(sender), payload: { blocked: true } });
  const blocked = await app.inject({ method: 'POST', url: '/api/private/u_other/messages', headers: auth(sender), payload: { content: '拉黑后不可发送' } });
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.json().error.code, 'PRIVATE_BLOCKED');
});

test('support ticket preserves the conversation and ops replies are visible to the user', async t => {
  const { app } = await setup(t);
  const userToken = await demoLogin(app, 'u_demo');
  const opsToken = await opsLogin(app);
  const created = await app.inject({
    method: 'POST', url: '/api/support/tickets', headers: auth(userToken),
    payload: { category: '隐私投诉', title: '跨车队消息投诉', content: '对方持续发送无关消息' }
  });
  assert.equal(created.statusCode, 201, created.body);
  const ticketId = created.json().data.id;
  const opsList = await app.inject({ method: 'GET', url: '/api/ops/support/tickets', headers: auth(opsToken) });
  const ticket = opsList.json().data.find(item => item.id === ticketId);
  assert.equal(ticket.messages[0].content, '对方持续发送无关消息');
  const replied = await app.inject({
    method: 'POST', url: `/api/ops/support/tickets/${ticketId}/reply`, headers: auth(opsToken),
    payload: { content: '已核实并限制相关账号', close: true }
  });
  assert.equal(replied.statusCode, 200, replied.body);
  assert.equal(replied.json().data.status, 'resolved');
  const userDetail = await app.inject({ method: 'GET', url: `/api/support/tickets/${ticketId}`, headers: auth(userToken) });
  assert.equal(userDetail.json().data.messages.at(-1).content, '已核实并限制相关账号');
});

test('merchant onboarding review unlocks product publishing and inventory editing', async t => {
  const { app } = await setup(t);
  const merchantUser = await demoLogin(app, 'u_guest');
  const opsToken = await opsLogin(app);
  const application = await app.inject({
    method: 'POST', url: '/api/merchant/apply', headers: auth(merchantUser),
    payload: { name: '测试补给站', phone: '13800000003', address: '杭州测试服务区', licensePhoto: 'https://cdn.example.test/license.jpg', businessHours: '08:00-20:00' }
  });
  assert.equal(application.statusCode, 201, application.body);
  const merchantId = application.json().data.id;
  const reviewed = await app.inject({ method: 'PUT', url: `/api/ops/merchants/${merchantId}/review`, headers: auth(opsToken), payload: { approved: true } });
  assert.equal(reviewed.statusCode, 200, reviewed.body);
  const product = await app.inject({
    method: 'POST', url: '/api/merchant/products', headers: auth(merchantUser),
    payload: { name: '车队补给包', coverPhoto: 'https://cdn.example.test/product.jpg', originPrice: 50, stock: 20, tiers: [{ people: 1, price: 50 }, { people: 5, price: 42 }], publish: true }
  });
  assert.equal(product.statusCode, 201, product.body);
  const updated = await app.inject({ method: 'PATCH', url: `/api/merchant/products/${product.json().data.id}`, headers: auth(merchantUser), payload: { stock: 30 } });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().data.stock, 30);
});

test('POI topic is retained after participation, archives after 24h, and revives on new speech', async t => {
  const { app, advance } = await setup(t);
  const token = await demoLogin(app);
  const created = await app.inject({
    method: 'POST', url: '/api/poi-topics', headers: auth(token),
    payload: { name: '服务区排队情况', locationName: '富阳服务区', lng: 119.8, lat: 30.05 }
  });
  assert.equal(created.statusCode, 201, created.body);
  const topicId = created.json().data.id;
  const sent = await app.inject({ method: 'POST', url: `/api/poi-topics/${topicId}/messages`, headers: auth(token), payload: { content: '当前排队十分钟' } });
  assert.equal(sent.statusCode, 201, sent.body);

  advance(25 * 3600000);
  await app.services.chat.archiveInactiveTopics();
  assert.equal((await app.repository.get('poi_topics', topicId)).status, 'archived');

  const history = await app.inject({ method: 'GET', url: '/api/poi-topics', headers: auth(token) });
  assert.ok(history.json().data.some(item => item.id === topicId && item.retained));
  const revived = await app.inject({ method: 'POST', url: `/api/poi-topics/${topicId}/messages`, headers: auth(token), payload: { content: '重新更新路况' } });
  assert.equal(revived.statusCode, 201, revived.body);
  assert.equal((await app.repository.get('poi_topics', topicId)).status, 'active');
});

test('demo payment reaches group success, generates code, verifies, and creates settlement', async t => {
  const { app } = await setup(t);
  const userToken = await demoLogin(app, 'u_demo');
  const merchantToken = await demoLogin(app, 'u_merchant');

  const group = await app.inject({ method: 'POST', url: '/api/products/product_001/groupbuys', headers: auth(userToken), payload: { targetPeople: 1 } });
  assert.equal(group.statusCode, 201, group.body);
  const sessionId = group.json().data.id;

  const orderResponse = await app.inject({ method: 'POST', url: `/api/groupbuys/${sessionId}/orders`, headers: auth(userToken), payload: { quantity: 1 } });
  assert.equal(orderResponse.statusCode, 201, orderResponse.body);
  assert.equal(orderResponse.json().data.payment.demo, true);
  const orderId = orderResponse.json().data.order.id;

  const paid = await app.inject({ method: 'POST', url: `/api/demo/orders/${orderId}/pay`, headers: auth(userToken) });
  assert.equal(paid.statusCode, 200, paid.body);
  assert.equal(paid.json().data.status, 'paid');
  assert.ok(paid.json().data.verifyCode);
  assert.equal((await app.repository.get('groupbuy_sessions', sessionId)).status, 'success');
  assert.ok(await app.repository.findOne('notifications', { user_id: 'u_merchant', type: 'merchant_order' }));

  const bank = await app.inject({ method: 'PUT', url: '/api/merchant/bank', headers: auth(merchantToken), payload: { wechatReceiver: 'demo-merchant-receiver' } });
  assert.equal(bank.statusCode, 200, bank.body);
  const verified = await app.inject({
    method: 'POST', url: '/api/merchant/verify/order', headers: auth(merchantToken),
    payload: { code: paid.json().data.verifyCode, lng: 119.338, lat: 29.72 }
  });
  assert.equal(verified.statusCode, 200, verified.body);
  assert.equal(verified.json().data.order.status, 'verified');
  assert.equal(verified.json().data.settlement.status, 'completed');
  assert.ok(await app.repository.findOne('notifications', { user_id: 'u_merchant', type: 'merchant_verification' }));

  const couponRedeemed = await app.inject({
    method: 'POST', url: '/api/merchant/verify/coupon', headers: auth(merchantToken), payload: { code: 'CP520001', lng: 119.338, lat: 29.72 }
  });
  assert.equal(couponRedeemed.statusCode, 200, couponRedeemed.body);
  assert.equal(couponRedeemed.json().data.status, 'pending');
  const opsToken = await opsLogin(app);
  const redemptions = await app.inject({ method: 'GET', url: '/api/ops/coupon-redemptions', headers: auth(opsToken) });
  assert.equal(redemptions.statusCode, 200, redemptions.body);
  assert.equal(redemptions.json().data[0].coupon.name, '新用户拼团券');
  const couponSettled = await app.inject({
    method: 'POST', url: `/api/ops/coupon-redemptions/${couponRedeemed.json().data.id}/settle`,
    headers: auth(opsToken), payload: { providerId: 'FINANCE_TEST_001' }
  });
  assert.equal(couponSettled.statusCode, 200, couponSettled.body);
  assert.equal(couponSettled.json().data.status, 'settled');
  assert.equal(couponSettled.json().data.providerId, 'FINANCE_TEST_001');
  const couponPaused = await app.inject({
    method: 'PATCH', url: '/api/merchant/coupons/coupon_merchant', headers: auth(merchantToken),
    payload: { enabled: false, name: '湖畔咖啡拉新券', amount: 8, total: 100 }
  });
  assert.equal(couponPaused.statusCode, 200, couponPaused.body);
  assert.equal(couponPaused.json().data.status, 'paused');
});

test('invite reward also issues an available partner coupon from the merchant pool', async t => {
  const { app } = await setup(t);
  const opsToken = await opsLogin(app);
  const before = await app.repository.get('coupons', 'coupon_merchant');
  const issued = await app.inject({ method: 'POST', url: '/api/ops/invites/invite_001/reward', headers: auth(opsToken), payload: {} });
  assert.equal(issued.statusCode, 200, issued.body);
  assert.equal(issued.json().data.partnerCoupon.id, 'coupon_merchant');
  assert.ok(await app.repository.findOne('user_coupons', { user_id: 'u_owner', coupon_id: 'coupon_merchant', source: 'reward_pool' }));
  assert.equal((await app.repository.get('coupons', 'coupon_merchant')).issued, Number(before.issued) + 1);
});

test('successful groupbuy supports reviewed refund and restores inventory', async t => {
  const { app } = await setup(t);
  const userToken = await demoLogin(app, 'u_demo');
  const opsToken = await opsLogin(app);
  const before = await app.repository.get('products', 'product_001');

  const group = await app.inject({ method: 'POST', url: '/api/products/product_001/groupbuys', headers: auth(userToken), payload: { targetPeople: 3 } });
  const sessionId = group.json().data.id;
  const orderResponse = await app.inject({ method: 'POST', url: `/api/groupbuys/${sessionId}/orders`, headers: auth(userToken), payload: {} });
  const orderId = orderResponse.json().data.order.id;
  await app.inject({ method: 'POST', url: `/api/demo/orders/${orderId}/pay`, headers: auth(userToken) });
  await app.inject({ method: 'POST', url: `/api/ops/groupbuys/${sessionId}/intervene`, headers: auth(opsToken), payload: { outcome: 'success', reason: '运营确认成团' } });

  const refund = await app.inject({ method: 'POST', url: `/api/orders/${orderId}/refunds`, headers: auth(userToken), payload: { reason: '行程取消' } });
  assert.equal(refund.statusCode, 201, refund.body);
  const reviewed = await app.inject({ method: 'PUT', url: `/api/ops/refunds/${refund.json().data.id}`, headers: auth(opsToken), payload: { approved: true, reason: '符合退款条件' } });
  assert.equal(reviewed.statusCode, 200, reviewed.body);
  assert.equal(reviewed.json().data.status, 'completed');
  assert.equal((await app.repository.get('orders', orderId)).status, 'refunded');
  assert.equal((await app.repository.get('products', 'product_001')).sold, before.sold);
});

test('ops certification approval unlocks trip publishing and map context combines sources', async t => {
  const { app, now } = await setup(t);
  const guestToken = await demoLogin(app, 'u_guest');
  const opsToken = await opsLogin(app);

  const reviewed = await app.inject({ method: 'PUT', url: '/api/ops/certifications/cert_002', headers: auth(opsToken), payload: { approved: true } });
  assert.equal(reviewed.statusCode, 200, reviewed.body);
  const trip = await app.inject({ method: 'POST', url: '/api/trips', headers: auth(guestToken), payload: tripPayload(now(), { title: '认证后发布的行程' }) });
  assert.equal(trip.statusCode, 201, trip.body);

  const map = await app.inject({ method: 'GET', url: '/api/map/context?lng=120.1551&lat=30.2741&city=330100', headers: auth(guestToken) });
  assert.equal(map.statusCode, 200, map.body);
  assert.equal(map.json().data.providerMode, 'demo');
  assert.ok(Array.isArray(map.json().data.otherTeams));
  assert.ok(map.json().data.soloDrivers.some(item => item.user.id === 'u_solo'));
  assert.equal(map.json().data.amap.weather.temperature, '22');
});

test('SOS notifies active teammates with a high-priority alert', async t => {
  const { app } = await setup(t);
  const userToken = await demoLogin(app, 'u_demo');
  const response = await app.inject({
    method: 'POST', url: '/api/emergencies', headers: auth(userToken),
    payload: { tripId: 'trip_001', lng: 119.78, lat: 30.04 }
  });
  assert.equal(response.statusCode, 201, response.body);
  const notification = await app.repository.findOne('notifications', { user_id: 'u_owner', type: 'emergency' });
  assert.ok(notification);
  assert.equal(notification.priority, 'high');
});

test('reviewed safety report becomes public, awards growth, and unlocks badge', async t => {
  const { app } = await setup(t);
  const userToken = await demoLogin(app, 'u_other');
  const opsToken = await opsLogin(app);
  const before = await app.repository.get('users', 'u_other');
  const reported = await app.inject({
    method: 'POST', url: '/api/safety-reports', headers: auth(userToken),
    payload: { eventType: 'closure', description: '西向车道临时封闭，请提前并线', lng: 120.16, lat: 30.28 }
  });
  assert.equal(reported.statusCode, 201, reported.body);
  assert.equal(reported.json().data.status, 'pending');
  const hiddenMap = await app.inject({ method: 'GET', url: '/api/map/context?lng=120.16&lat=30.28', headers: auth(userToken) });
  assert.ok(!hiddenMap.json().data.trafficEvents.some(item => item.id === reported.json().data.id));
  const reviewed = await app.inject({
    method: 'PUT', url: `/api/ops/traffic-events/${reported.json().data.id}`, headers: auth(opsToken), payload: { approved: true }
  });
  assert.equal(reviewed.statusCode, 200, reviewed.body);
  assert.equal(reviewed.json().data.status, 'active');
  assert.equal((await app.repository.get('users', 'u_other')).growth, Number(before.growth) + 5);
  assert.ok(await app.repository.findOne('user_badges', { user_id: 'u_other', badge_id: 'badge_safety' }));
  const publicMap = await app.inject({ method: 'GET', url: '/api/map/context?lng=120.16&lat=30.28', headers: auth(userToken) });
  assert.ok(publicMap.json().data.trafficEvents.some(item => item.id === reported.json().data.id));
});

test('12-hour stale location sweep removes member from trip and conversation', async t => {
  const { app, advance } = await setup(t);
  advance(13 * 3600000);
  const result = await app.services.trips.runDropoutSweep();
  assert.ok(result.dropped.includes('tm_002'));
  assert.equal((await app.repository.get('trip_members', 'tm_002')).status, 'dropped');
  const conversation = await app.repository.get('conversation_members', 'cm_002');
  assert.ok(conversation.left_at);
});

test('cross-team trip detail exposes only leader location', async t => {
  const { app } = await setup(t);
  const teammateToken = await demoLogin(app, 'u_demo');
  const outsiderToken = await demoLogin(app, 'u_other');
  const teammateView = await app.inject({ method: 'GET', url: '/api/trips/trip_001', headers: auth(teammateToken) });
  const outsiderView = await app.inject({ method: 'GET', url: '/api/trips/trip_001', headers: auth(outsiderToken) });
  assert.equal(teammateView.statusCode, 200, teammateView.body);
  assert.equal(outsiderView.statusCode, 200, outsiderView.body);
  assert.equal(teammateView.json().data.trip.teammates.length, 2);
  assert.deepEqual(outsiderView.json().data.trip.teammates.map(item => item.userId), ['u_owner']);
});

test('pending orders reserve inventory atomically and expiration releases it', async t => {
  const { app, advance } = await setup(t);
  await app.repository.update('products', 'product_001', { stock: 19, sold: 18, reserved: 0 });
  const firstToken = await demoLogin(app, 'u_demo');
  const secondToken = await demoLogin(app, 'u_other');
  const group = await app.inject({ method: 'POST', url: '/api/products/product_001/groupbuys', headers: auth(firstToken), payload: { targetPeople: 2 } });
  const sessionId = group.json().data.id;
  const firstOrder = await app.inject({ method: 'POST', url: `/api/groupbuys/${sessionId}/orders`, headers: auth(firstToken), payload: {} });
  assert.equal(firstOrder.statusCode, 201, firstOrder.body);
  assert.equal((await app.repository.get('products', 'product_001')).reserved, 1);
  const soldOut = await app.inject({ method: 'POST', url: `/api/groupbuys/${sessionId}/orders`, headers: auth(secondToken), payload: {} });
  assert.equal(soldOut.statusCode, 409);
  assert.equal(soldOut.json().error.code, 'PRODUCT_STOCK_INSUFFICIENT');
  advance(16 * 60000);
  await app.services.commerce.closeExpiredOrders();
  assert.equal((await app.repository.get('products', 'product_001')).reserved, 0);
  assert.equal((await app.repository.get('orders', firstOrder.json().data.order.id)).status, 'closed');
});

test('merchant bank card is encrypted and public merchant responses are allowlisted', async t => {
  const { app } = await setup(t);
  const merchantToken = await demoLogin(app, 'u_merchant');
  const updated = await app.inject({
    method: 'PUT', url: '/api/merchant/bank', headers: auth(merchantToken),
    payload: { bank: '招商银行', card: '6225888800003188', wechatReceiver: 'receiver-demo' }
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().data.bankInfo.maskedCard, '6225 **** **** 3188');
  const stored = await app.repository.get('merchants', 'merchant_001');
  assert.match(stored.bank_info.cardEncrypted, /^v1:/);
  assert.equal(stored.bank_info.card, undefined);
  const products = await app.inject({ method: 'GET', url: '/api/products' });
  const publicMerchant = products.json().data[0].merchant;
  assert.equal(publicMerchant.bankInfo, undefined);
  assert.equal(publicMerchant.licensePhoto, undefined);
  assert.equal(publicMerchant.ownerUserId, undefined);
  const rescue = await app.inject({
    method: 'PUT', url: '/api/merchant/rescue', headers: auth(merchantToken),
    payload: { enabled: true, services: ['搭电', '拖车'], radiusKm: 25, phone: '057188881234', businessOpen: true }
  });
  assert.equal(rescue.statusCode, 200, rescue.body);
  assert.deepEqual(rescue.json().data.rescueServices, ['搭电', '拖车']);
  const opsToken = await opsLogin(app);
  const rescueDisabled = await app.inject({
    method: 'PUT', url: '/api/ops/rescue-merchants/merchant_001', headers: auth(opsToken), payload: { enabled: false }
  });
  assert.equal(rescueDisabled.statusCode, 200, rescueDisabled.body);
  assert.equal(rescueDisabled.json().data.rescueEnabled, false);
});

test('invite scene resolves to a signed first-touch token and mutations are audited', async t => {
  const { app } = await setup(t);
  const userToken = await demoLogin(app, 'u_demo');
  const share = await app.inject({ method: 'POST', url: '/api/invites/share', headers: auth(userToken), payload: { source: 'qrcode' } });
  assert.equal(share.statusCode, 200, share.body);
  const resolved = await app.inject({ method: 'GET', url: `/api/invites/resolve?scene=${share.json().data.sourceRef}` });
  assert.equal(resolved.statusCode, 200, resolved.body);
  const claim = app.jwt.verify(resolved.json().data.token);
  assert.equal(claim.inviterId, 'u_demo');
  assert.equal(claim.source, 'qrcode');
  const audit = await app.repository.findOne('audit_logs', { actor_id: 'u_demo', path: '/api/invites/share' });
  assert.ok(audit);
  assert.equal(audit.status_code, 200);
});
