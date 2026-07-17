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

  const follow = await app.inject({
    method: 'PUT', url: '/api/follows/user/u_other', headers: auth(guestToken), payload: { enabled: true }
  });
  assert.equal(follow.statusCode, 403);
  assert.equal(follow.json().error.code, 'OWNER_CERT_REQUIRED');

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

  const completed = await app.inject({ method: 'POST', url: `/api/trips/${trip.id}/state`, headers: auth(ownerToken), payload: { action: 'complete' } });
  assert.equal(completed.statusCode, 200, completed.body);
  const history = await app.inject({ method: 'GET', url: '/api/trips', headers: auth(memberToken) });
  const historyTrip = history.json().data.find(item => item.id === trip.id);
  assert.ok(historyTrip);
  assert.equal(historyTrip.participated, true);
  assert.equal(historyTrip.joined, false);
  const historyDetail = await app.inject({ method: 'GET', url: `/api/trips/${trip.id}`, headers: auth(memberToken) });
  assert.equal(historyDetail.statusCode, 200, historyDetail.body);
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
  const hiddenFromMap = await app.inject({
    method: 'GET', url: '/api/map/context?lng=121.2&lat=31.22&radius=30000', headers: auth(sender)
  });
  assert.ok(!hiddenFromMap.json().data.otherTeams.some(item => item.leader.id === 'u_other'));
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
  const followUp = await app.inject({
    method: 'POST', url: `/api/support/tickets/${ticketId}/messages`, headers: auth(userToken),
    payload: { content: '我补充一张新的聊天记录，请继续核实' }
  });
  assert.equal(followUp.statusCode, 201, followUp.body);
  assert.equal((await app.repository.get('support_tickets', ticketId)).status, 'open');
  const reopened = await app.inject({ method: 'GET', url: '/api/ops/support/tickets', headers: auth(opsToken) });
  assert.equal(reopened.json().data.find(item => item.id === ticketId).messages.at(-1).content, '我补充一张新的聊天记录，请继续核实');
});

test('merchant onboarding review unlocks product publishing and inventory editing', async t => {
  const { app } = await setup(t);
  const merchantUser = await demoLogin(app, 'u_guest');
  const opsToken = await opsLogin(app);
  const application = await app.inject({
    method: 'POST', url: '/api/merchant/apply', headers: auth(merchantUser),
    payload: { name: '测试补给站', phone: '13800000003', address: '杭州测试服务区', lng: 120.1551, lat: 30.2741, licensePhoto: 'https://cdn.example.test/license.jpg', businessHours: '08:00-20:00' }
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

test('POI topic is retained read-only after archive and a new visitor can revive it', async t => {
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
  const retainedWrite = await app.inject({ method: 'POST', url: `/api/poi-topics/${topicId}/messages`, headers: auth(token), payload: { content: '老成员不应恢复话题' } });
  assert.equal(retainedWrite.statusCode, 409, retainedWrite.body);
  assert.equal(retainedWrite.json().error.code, 'TOPIC_ARCHIVED_READ_ONLY');
  const visitor = await demoLogin(app, 'u_other');
  const revived = await app.inject({ method: 'POST', url: `/api/poi-topics/${topicId}/messages`, headers: auth(visitor), payload: { content: '新的到访者更新路况' } });
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
  const payableDetail = await app.inject({ method: 'GET', url: `/api/orders/${orderId}`, headers: auth(userToken) });
  assert.match(payableDetail.json().data.verifyQrCode, /^data:image\/png;base64,/);
  const couponWallet = await app.inject({ method: 'GET', url: '/api/coupons/me', headers: auth(userToken) });
  assert.match(couponWallet.json().data.find(item => item.verifyCode === 'CP520001').verifyQrCode, /^data:image\/png;base64,/);
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
  await app.repository.update('settlements', verified.json().data.settlement.id, { status: 'processing', completed_at: null });
  const refreshedSettlement = await app.inject({
    method: 'POST', url: `/api/ops/settlements/${verified.json().data.settlement.id}/trigger`, headers: auth(opsToken), payload: {}
  });
  assert.equal(refreshedSettlement.statusCode, 200, refreshedSettlement.body);
  assert.equal(refreshedSettlement.json().data.status, 'completed');
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

test('AMap traffic incidents are persisted once and immediately create a POI topic', async t => {
  const { app } = await setup(t);
  const token = await demoLogin(app);
  app.providers.amap.trafficIncidents = async ({ adcode }) => ({
    code: 1,
    data: [{
      eventID: 90001, eventType: 201, brief: '绕城高速施工', eventDesc: '右侧车道施工，请减速通行',
      roadName: '绕城高速', startTime: '2026-07-14 15:00:00', endTime: '2026-07-15 18:00:00', x: 120.16, y: 30.28,
      adcode
    }]
  });
  const first = await app.inject({ method: 'GET', url: '/api/map/context?lng=120.1551&lat=30.2741', headers: auth(token) });
  assert.equal(first.statusCode, 200, first.body);
  const event = await app.repository.findOne('traffic_events', { provider_id: 'amap:90001' });
  assert.ok(event);
  assert.equal(event.event_type, 'construction');
  assert.ok(event.topic_id);
  assert.ok(first.json().data.trafficEvents.some(item => item.id === event.id));

  const second = await app.inject({ method: 'GET', url: '/api/map/context?lng=120.1551&lat=30.2741', headers: auth(token) });
  assert.equal(second.statusCode, 200, second.body);
  assert.equal((await app.repository.find('traffic_events', { provider_id: 'amap:90001' })).length, 1);
  assert.equal((await app.repository.find('poi_topics', { event_id: event.id })).length, 1);
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

test('50km route deviation must persist for 30 minutes before automatic removal', async t => {
  const { app, advance } = await setup(t);
  const userToken = await demoLogin(app, 'u_demo');
  const first = await app.inject({
    method: 'POST', url: '/api/locations', headers: auth(userToken),
    payload: { tripId: 'trip_001', lng: 121.9, lat: 31.3, speed: 60 }
  });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().data.dropout, false);
  assert.ok((await app.repository.get('trip_members', 'tm_002')).deviation_started_at);

  advance(29 * 60000);
  const early = await app.inject({
    method: 'POST', url: '/api/locations', headers: auth(userToken),
    payload: { tripId: 'trip_001', lng: 121.91, lat: 31.31, speed: 58 }
  });
  assert.equal(early.statusCode, 201, early.body);
  assert.equal(early.json().data.dropout, false);

  advance(2 * 60000);
  const dropped = await app.inject({
    method: 'POST', url: '/api/locations', headers: auth(userToken),
    payload: { tripId: 'trip_001', lng: 121.92, lat: 31.32, speed: 57 }
  });
  assert.equal(dropped.statusCode, 201, dropped.body);
  assert.equal(dropped.json().data.dropout, true);
  assert.equal((await app.repository.get('trip_members', 'tm_002')).status, 'dropped');
  assert.ok((await app.repository.get('conversation_members', 'cm_002')).left_at);
  const departureMessages = (await app.repository.find('messages', {
    conversation_type: 'team', conversation_id: 'trip_001', message_type: 'system'
  })).filter(item => item.content === '林小路 已离开车队');
  assert.equal(departureMessages.length, 1);
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
  const encryptedCard = stored.bank_info.cardEncrypted;
  const receiverOnly = await app.inject({
    method: 'PUT', url: '/api/merchant/bank', headers: auth(merchantToken),
    payload: { bank: '招商银行', card: '', wechatReceiver: 'receiver-updated' }
  });
  assert.equal(receiverOnly.statusCode, 200, receiverOnly.body);
  const preserved = await app.repository.get('merchants', 'merchant_001');
  assert.equal(preserved.bank_info.cardEncrypted, encryptedCard);
  assert.equal(preserved.bank_info.maskedCard, '6225 **** **** 3188');
  assert.equal(preserved.bank_info.wechatReceiver, 'receiver-updated');
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
  assert.equal(rescue.json().data.rescueReviewStatus, 'pending');
  assert.deepEqual((await app.repository.get('merchants', 'merchant_001')).rescue_services, []);
  const opsToken = await opsLogin(app);
  const request = (await app.repository.find('merchant_change_requests', { merchant_id: 'merchant_001', status: 'pending' }))
    .find(item => item.changes && item.changes.rescue_enabled);
  assert.ok(request);
  const rescueApproved = await app.inject({
    method: 'PUT', url: `/api/ops/merchant-changes/${request.id}`, headers: auth(opsToken), payload: { approved: true }
  });
  assert.equal(rescueApproved.statusCode, 200, rescueApproved.body);
  assert.deepEqual((await app.repository.get('merchants', 'merchant_001')).rescue_services, ['搭电', '拖车']);
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

test('trip editing persists changed endpoints, waypoints, and sampled route', async t => {
  const { app, now } = await setup(t);
  const token = await demoLogin(app, 'u_demo');
  const created = await app.inject({
    method: 'POST', url: '/api/trips', headers: auth(token),
    payload: tripPayload(now(), { route: [{ lng: 120.1551, lat: 30.2741 }, { lng: 118.3376, lat: 29.7147 }] })
  });
  const tripId = created.json().data.id;
  const route = [{ lng: 120.2, lat: 30.3 }, { lng: 119.4, lat: 30.1 }, { lng: 118.5, lat: 29.8 }];
  const updated = await app.inject({
    method: 'PATCH', url: `/api/trips/${tripId}`, headers: auth(token),
    payload: {
      startName: '杭州东站', startLng: 120.2, startLat: 30.3,
      endName: '黄山北门', endLng: 118.5, endLat: 29.8,
      waypoints: ['富阳服务区', '临安补给点'], route
    }
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().data.startName, '杭州东站');
  assert.equal(updated.json().data.endName, '黄山北门');
  assert.deepEqual(updated.json().data.waypoints, ['富阳服务区', '临安补给点']);
  assert.deepEqual(updated.json().data.route, route);
});

test('product route sorting differs from nearby sorting and session quantity cap is enforced', async t => {
  const { app } = await setup(t);
  await app.repository.update('products', 'product_001', { max_quantity: 1 });
  await app.repository.update('products', 'product_002', { lng: 121.48, lat: 31.23 });
  const alongRoute = await app.inject({ method: 'GET', url: '/api/products?sort=route&tripId=trip_001&routeRadius=30000' });
  assert.equal(alongRoute.statusCode, 200, alongRoute.body);
  assert.equal(alongRoute.json().data[0].id, 'product_001');
  assert.ok(Number.isFinite(alongRoute.json().data[0].routeDistanceMeters));
  assert.ok(!alongRoute.json().data.some(item => item.id === 'product_002'));
  const nearby = await app.inject({ method: 'GET', url: '/api/products?sort=nearby&lng=121.48&lat=31.23&radius=5000' });
  assert.deepEqual(nearby.json().data.map(item => item.id), ['product_002']);
  await app.repository.update('groupbuy_sessions', 'session_001', { joined_people: 2, current_price: 48 });
  const detail = await app.inject({ method: 'GET', url: '/api/groupbuys/session_001' });
  assert.equal(detail.json().data.joinPrice, 39.9);

  const firstToken = await demoLogin(app, 'u_demo');
  const secondToken = await demoLogin(app, 'u_other');
  const session = await app.inject({ method: 'POST', url: '/api/products/product_001/groupbuys', headers: auth(firstToken), payload: { targetPeople: 2 } });
  const sessionId = session.json().data.id;
  const first = await app.inject({ method: 'POST', url: `/api/groupbuys/${sessionId}/orders`, headers: auth(firstToken), payload: { quantity: 1 } });
  assert.equal(first.statusCode, 201, first.body);
  const capped = await app.inject({ method: 'POST', url: `/api/groupbuys/${sessionId}/orders`, headers: auth(secondToken), payload: { quantity: 1 } });
  assert.equal(capped.statusCode, 409, capped.body);
  assert.equal(capped.json().error.code, 'GROUPBUY_QUANTITY_LIMIT');
});

test('growth rule daily cap allows a partial final award and then stops', async t => {
  const { app } = await setup(t);
  const opsToken = await opsLogin(app);
  const before = await app.repository.get('users', 'u_other');
  const configured = await app.inject({
    method: 'PATCH', url: '/api/ops/growth-rules/growth_rule_5', headers: auth(opsToken),
    payload: { points: 4, dailyLimit: 5, enabled: true }
  });
  assert.equal(configured.statusCode, 200, configured.body);
  await app.services.common.awardGrowth('u_other', 'safety_report', '测试奖励一', 'test', 'daily-1');
  await app.services.common.awardGrowth('u_other', 'safety_report', '测试奖励二', 'test', 'daily-2');
  const third = await app.services.common.awardGrowth('u_other', 'safety_report', '测试奖励三', 'test', 'daily-3');
  assert.equal(third, null);
  assert.equal((await app.repository.get('users', 'u_other')).growth, Number(before.growth) + 5);
  const logs = await app.repository.find('growth_logs', { user_id: 'u_other', rule_key: 'safety_report' });
  assert.deepEqual(logs.map(item => item.delta), [4, 1]);
});

test('POI report exposes evidence to ops and moderation resolves the complaint', async t => {
  const { app } = await setup(t);
  const userToken = await demoLogin(app, 'u_demo');
  const opsToken = await opsLogin(app);
  const report = await app.inject({
    method: 'POST', url: '/api/support/tickets', headers: auth(userToken),
    payload: {
      category: '地点内容举报', title: '举报地点聊天室违规内容', content: '消息含有公开车牌和手机号',
      targetType: 'poi_topic', targetId: 'poi_001', messageId: 'msg_003'
    }
  });
  assert.equal(report.statusCode, 201, report.body);
  const topics = await app.inject({ method: 'GET', url: '/api/ops/poi-topics', headers: auth(opsToken) });
  const topic = topics.json().data.find(item => item.id === 'poi_001');
  assert.equal(topic.messages[0].content, '95号有货，排队约15分钟。');
  assert.equal(topic.reports[0].messageId, 'msg_003');
  assert.equal(topic.reports[0].messages[0].content, '消息含有公开车牌和手机号');
  const removed = await app.inject({
    method: 'PUT', url: '/api/ops/poi-topics/poi_001', headers: auth(opsToken), payload: { action: 'remove' }
  });
  assert.equal(removed.statusCode, 200, removed.body);
  assert.equal((await app.repository.get('support_tickets', report.json().data.id)).status, 'resolved');
  assert.ok(await app.repository.findOne('notifications', { user_id: 'u_demo', type: 'support' }));
});

test('mutual-friend private unread remains in messages and is hidden from map preview', async t => {
  const { app } = await setup(t);
  const currentToken = await demoLogin(app, 'u_demo');
  const otherToken = await demoLogin(app, 'u_other');
  const followedBack = await app.inject({
    method: 'PUT', url: '/api/follows/user/u_demo', headers: auth(otherToken), payload: { enabled: true }
  });
  assert.equal(followedBack.statusCode, 200, followedBack.body);
  const sent = await app.inject({
    method: 'POST', url: '/api/private/u_demo/messages', headers: auth(otherToken), payload: { content: '这条消息只在消息页显示' }
  });
  assert.equal(sent.statusCode, 201, sent.body);
  const conversationId = app.services.common.privateConversationId('u_demo', 'u_other');
  const membership = await app.repository.findOne('conversation_members', {
    conversation_type: 'private', conversation_id: conversationId, user_id: 'u_demo'
  });
  assert.equal(membership.unread_count, 1);
  const map = await app.inject({
    method: 'GET', url: '/api/map/context?lng=121.2&lat=31.22&radius=30000', headers: auth(currentToken)
  });
  const team = map.json().data.otherTeams.find(item => item.leader.id === 'u_other');
  assert.ok(team);
  assert.equal(team.unreadPrivateCount, 0);
  assert.equal(team.latestPrivateMessage, null);
});

test('platform coupon budget and per-user cap block reward issuance', async t => {
  const { app } = await setup(t);
  const opsToken = await opsLogin(app);
  const userCap = await app.inject({
    method: 'PUT', url: '/api/ops/settings/coupon_budget', headers: auth(opsToken),
    payload: { value: { monthlyTotal: 100, monthlyUserLimit: 5 } }
  });
  assert.equal(userCap.statusCode, 200, userCap.body);
  const userBlocked = await app.inject({ method: 'POST', url: '/api/ops/invites/invite_001/reward', headers: auth(opsToken), payload: {} });
  assert.equal(userBlocked.statusCode, 409, userBlocked.body);
  assert.equal(userBlocked.json().error.code, 'PLATFORM_COUPON_USER_LIMIT_EXCEEDED');

  await app.inject({
    method: 'PUT', url: '/api/ops/settings/coupon_budget', headers: auth(opsToken),
    payload: { value: { monthlyTotal: 10, monthlyUserLimit: 50 } }
  });
  const totalBlocked = await app.inject({ method: 'POST', url: '/api/ops/invites/invite_001/reward', headers: auth(opsToken), payload: {} });
  assert.equal(totalBlocked.statusCode, 409, totalBlocked.body);
  assert.equal(totalBlocked.json().error.code, 'PLATFORM_COUPON_BUDGET_EXCEEDED');
  assert.equal((await app.repository.get('invites', 'invite_001')).reward_status, 'pending');
});

test('invalid operations settings, references, and verification locations are rejected', async t => {
  const { app } = await setup(t);
  const opsToken = await opsLogin(app);
  const userToken = await demoLogin(app, 'u_demo');
  const merchantToken = await demoLogin(app, 'u_merchant');

  const invalidBudget = await app.inject({
    method: 'PUT', url: '/api/ops/settings/coupon_budget', headers: auth(opsToken),
    payload: { value: { monthlyTotal: -1, monthlyUserLimit: 50 } }
  });
  assert.equal(invalidBudget.statusCode, 400, invalidBudget.body);
  assert.equal(invalidBudget.json().error.code, 'COUPON_BUDGET_INVALID');

  const invalidAssessment = await app.inject({
    method: 'PUT', url: '/api/ops/settings/merchant_assessment', headers: auth(opsToken),
    payload: { value: {
      bronze: { minScore: 0, commissionRate: 0.12, benefit: '基础权益' },
      silver: { minScore: 80, commissionRate: 0.1, benefit: '白银权益' },
      gold: { minScore: 75, commissionRate: 0.08, benefit: '黄金权益' },
      diamond: { minScore: 98, commissionRate: 0.06, benefit: '钻石权益' }
    } }
  });
  assert.equal(invalidAssessment.statusCode, 400, invalidAssessment.body);
  assert.equal(invalidAssessment.json().error.code, 'ASSESSMENT_SCORE_INVALID');

  const invalidGrowth = await app.inject({
    method: 'PATCH', url: '/api/ops/growth-rules/growth_rule_1', headers: auth(opsToken),
    payload: { points: -5, dailyLimit: 20 }
  });
  assert.equal(invalidGrowth.statusCode, 400, invalidGrowth.body);
  assert.equal(invalidGrowth.json().error.code, 'GROWTH_POINTS_INVALID');

  const foreignOrderTicket = await app.inject({
    method: 'POST', url: '/api/support/tickets', headers: auth(userToken),
    payload: { title: '不属于我的订单', content: '测试越权引用', targetType: 'order', targetId: 'order_002' }
  });
  assert.equal(foreignOrderTicket.statusCode, 404, foreignOrderTicket.body);
  assert.equal(foreignOrderTicket.json().error.code, 'ORDER_NOT_FOUND');

  const ownOrderTicket = await app.inject({
    method: 'POST', url: '/api/support/tickets', headers: auth(userToken),
    payload: { title: '我的订单咨询', content: '需要核对核销时间', targetType: 'order', targetId: 'order_001' }
  });
  assert.equal(ownOrderTicket.statusCode, 201, ownOrderTicket.body);
  assert.equal(ownOrderTicket.json().data.orderId, 'order_001');

  const missingFollowTarget = await app.inject({
    method: 'PUT', url: '/api/follows/user/missing-user', headers: auth(userToken), payload: { enabled: true }
  });
  assert.equal(missingFollowTarget.statusCode, 404, missingFollowTarget.body);
  assert.equal(missingFollowTarget.json().error.code, 'USER_NOT_FOUND');

  const invalidLocation = await app.inject({
    method: 'POST', url: '/api/merchant/verify/coupon', headers: auth(merchantToken),
    payload: { code: 'CP520001', lng: 119.338 }
  });
  assert.equal(invalidLocation.statusCode, 400, invalidLocation.body);
  assert.equal(invalidLocation.json().error.code, 'LOCATION_INVALID');

  const invalidEmergencyPhone = await app.inject({
    method: 'PATCH', url: '/api/settings', headers: auth(userToken), payload: { emergencyPhone: '123' }
  });
  assert.equal(invalidEmergencyPhone.statusCode, 400, invalidEmergencyPhone.body);
  assert.equal(invalidEmergencyPhone.json().error.code, 'EMERGENCY_PHONE_INVALID');
});

test('merchant promotion registration binds attribution and automatically issues the merchant coupon', async t => {
  const { app } = await setup(t);
  const merchantToken = await demoLogin(app, 'u_merchant');
  const before = await app.repository.get('coupons', 'coupon_merchant');
  const share = await app.inject({
    method: 'POST', url: '/api/merchant/promotion/share', headers: auth(merchantToken), payload: {}
  });
  assert.equal(share.statusCode, 200, share.body);
  assert.ok(share.json().data.qrCode);
  const sharePath = new URL(`https://mini.invalid${share.json().data.miniProgramPath}`);
  const inviteToken = sharePath.searchParams.get('inviteToken');
  assert.ok(inviteToken);

  const sms = await app.inject({ method: 'POST', url: '/api/auth/sms/send', payload: { phone: '13800000019' } });
  const login = await app.inject({
    method: 'POST', url: '/api/auth/sms/login',
    payload: { phone: '13800000019', code: sms.json().data.devCode, profile: { nickname: '推广新用户' }, inviteToken }
  });
  assert.equal(login.statusCode, 200, login.body);
  const userId = login.json().data.user.id;
  const invite = await app.repository.findOne('invites', { invitee_id: userId });
  assert.equal(invite.source, 'merchant');
  assert.equal(invite.inviter_id, 'u_merchant');
  const coupon = await app.repository.findOne('user_coupons', { user_id: userId, source: 'merchant_promotion' });
  assert.equal(coupon.coupon_id, 'coupon_merchant');
  assert.match(coupon.verify_code, /^CP\d{6}$/);
  assert.equal((await app.repository.get('coupons', 'coupon_merchant')).issued, Number(before.issued) + 1);
  assert.ok(await app.repository.findOne('notifications', { user_id: userId, type: 'coupon' }));
});

test('an invited user first ordering after seven days is not counted as a new-user reward', async t => {
  const { app, advance } = await setup(t);
  const token = await demoLogin(app, 'u_demo');
  advance(3 * 86400000);
  const group = await app.inject({
    method: 'POST', url: '/api/products/product_001/groupbuys', headers: auth(token), payload: { targetPeople: 1 }
  });
  const order = await app.inject({
    method: 'POST', url: `/api/groupbuys/${group.json().data.id}/orders`, headers: auth(token), payload: {}
  });
  const paid = await app.inject({
    method: 'POST', url: `/api/demo/orders/${order.json().data.order.id}/pay`, headers: auth(token), payload: {}
  });
  assert.equal(paid.statusCode, 200, paid.body);
  const invite = await app.repository.get('invites', 'invite_001');
  assert.equal(invite.status, 'first_order');
  assert.equal(invite.reward_status, 'none');
  assert.equal(await app.repository.findOne('growth_logs', { user_id: 'u_owner', rule_key: 'invite_first_order' }), null);
});

test('demo admin login endpoint is unavailable outside demo provider mode', async t => {
  const app = await buildApp({
    env: {
      NODE_ENV: 'test', DB_MODE: 'memory', PROVIDER_MODE: 'real', STRICT_PROVIDER_CONFIG: 'false',
      JWT_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters'
    },
    logger: false
  });
  await app.ready();
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/admin/auth/demo', payload: { role: 'ops' } });
  assert.equal(response.statusCode, 404, response.body);
  assert.equal(response.json().error.code, 'NOT_FOUND');
});

test('POI presence expires independently from retained membership and replies keep their reference', async t => {
  const { app, advance } = await setup(t);
  const first = await demoLogin(app, 'u_demo');
  const second = await demoLogin(app, 'u_other');
  const firstPresence = await app.inject({ method: 'POST', url: '/api/poi-topics/poi_001/presence', headers: auth(first), payload: {} });
  const secondPresence = await app.inject({ method: 'POST', url: '/api/poi-topics/poi_001/presence', headers: auth(second), payload: {} });
  assert.equal(firstPresence.statusCode, 200, firstPresence.body);
  assert.equal(secondPresence.json().data.onlineCount, 2);
  let detail = await app.inject({ method: 'GET', url: '/api/poi-topics/poi_001', headers: auth(first) });
  assert.equal(detail.json().data.onlineCount, 2);

  advance(91 * 1000);
  await app.inject({ method: 'POST', url: '/api/poi-topics/poi_001/presence', headers: auth(first), payload: {} });
  detail = await app.inject({ method: 'GET', url: '/api/poi-topics/poi_001', headers: auth(first) });
  assert.equal(detail.json().data.onlineCount, 1);
  assert.ok(detail.json().data.participantCount >= 1);

  const reply = await app.inject({
    method: 'POST', url: '/api/poi-topics/poi_001/messages', headers: auth(first),
    payload: { type: 'text', content: '补充：入口处也有空位', metadata: { replyTo: { messageId: 'msg_003', nickname: '服务区车友', content: '95号有货' } } }
  });
  assert.equal(reply.statusCode, 201, reply.body);
  assert.equal(reply.json().data.metadata.replyTo.messageId, 'msg_003');
});

test('invite page receives the operator-configured reward ladder', async t => {
  const { app } = await setup(t);
  const opsToken = await opsLogin(app);
  const userToken = await demoLogin(app, 'u_demo');
  const configured = await app.inject({
    method: 'PUT', url: '/api/ops/settings/invite_rewards', headers: auth(opsToken),
    payload: { value: { tiers: [{ firstOrders: 2, reward: 8 }, { firstOrders: 6, reward: 30 }] } }
  });
  assert.equal(configured.statusCode, 200, configured.body);
  const summary = await app.inject({ method: 'GET', url: '/api/invites/me', headers: auth(userToken) });
  assert.deepEqual(summary.json().data.rewardTiers, [{ firstOrders: 2, reward: 8 }, { firstOrders: 6, reward: 30 }]);
});

test('operations validates merchant scores and creates an immediate topic for a manual traffic event', async t => {
  const { app, now } = await setup(t);
  const token = await opsLogin(app);
  const invalidScore = await app.inject({
    method: 'PUT', url: '/api/ops/merchants/merchant_001/level', headers: auth(token),
    payload: { level: 'gold', score: 101 }
  });
  assert.equal(invalidScore.statusCode, 400, invalidScore.body);
  assert.equal(invalidScore.json().error.code, 'MERCHANT_SCORE_INVALID');

  const invalidLocation = await app.inject({
    method: 'POST', url: '/api/ops/traffic-events', headers: auth(token),
    payload: { title: '坐标错误', eventType: 'closure', lng: 200, lat: 30, severity: 3 }
  });
  assert.equal(invalidLocation.statusCode, 400, invalidLocation.body);
  assert.equal(invalidLocation.json().error.code, 'TRAFFIC_EVENT_LOCATION_INVALID');

  const created = await app.inject({
    method: 'POST', url: '/api/ops/traffic-events', headers: auth(token),
    payload: {
      title: '测试高速临时封闭', description: '前方出口实施临时交通管制', eventType: 'closure',
      lng: 120.16, lat: 30.28, severity: 3,
      startsAt: new Date(now()).toISOString(), endsAt: new Date(now() + 2 * 3600000).toISOString()
    }
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.ok(created.json().data.topicId);
  const topic = await app.repository.get('poi_topics', created.json().data.topicId);
  assert.equal(topic.event_id, created.json().data.id);
  assert.equal(topic.status, 'active');
});

test('public profile trajectory uses completed-trip GPS points and excludes the active live trip', async t => {
  const { app } = await setup(t);
  const viewer = await demoLogin(app, 'u_other');
  const profile = await app.inject({ method: 'GET', url: '/api/users/u_demo', headers: auth(viewer) });
  assert.equal(profile.statusCode, 200, profile.body);
  assert.deepEqual(profile.json().data.trajectory.map(point => point.tripId), ['trip_history', 'trip_history', 'trip_history']);
  assert.equal(profile.json().data.vehicleNo, undefined);
});

test('liveness provider callback is authenticated and can complete the certification session', async t => {
  const { app } = await setup(t);
  const token = await demoLogin(app, 'u_solo');
  const started = await app.inject({
    method: 'POST', url: '/api/certifications/session', headers: auth(token),
    payload: { licensePhoto: 'https://cdn.example.test/solo-license.jpg' }
  });
  assert.equal(started.statusCode, 200, started.body);
  const session = JSON.parse(await app.cache.get('certification:u_solo'));
  const rejected = await app.inject({
    method: 'POST', url: '/api/certifications/liveness/callback?token=invalid',
    payload: { token: session.livenessToken, status: 'success' }
  });
  assert.equal(rejected.statusCode, 400, rejected.body);
  const callback = await app.inject({
    method: 'POST', url: `/api/certifications/liveness/callback?token=${session.callbackToken}`,
    payload: { token: session.livenessToken, status: 'success', score: 0.99 }
  });
  assert.equal(callback.statusCode, 200, callback.body);
  const status = await app.inject({ method: 'GET', url: '/api/certifications/session/status', headers: auth(token) });
  assert.equal(status.json().data.passed, true);
  const submitted = await app.inject({
    method: 'POST', url: '/api/certifications', headers: auth(token),
    payload: { realName: '山野独行', plate: '浙A8T520', vehicleModel: '斯巴鲁森林人' }
  });
  assert.equal(submitted.statusCode, 201, submitted.body);
  assert.equal(submitted.json().data.status, 'pending');
  assert.equal(await app.cache.get(`certification-callback:${session.callbackToken}`), null);
});

test('operations can retry a failed automatic refund idempotently', async t => {
  const { app } = await setup(t);
  const token = await opsLogin(app);
  await app.repository.update('orders', 'order_001', { status: 'refund_pending' });
  await app.repository.insert('refunds', {
    id: 'refund_retry', order_id: 'order_001', user_id: 'u_demo', reason: '自动退款通道首次失败', amount: 48,
    status: 'failed', provider_refund_id: null, reviewed_by: null, review_reason: '支付通道超时',
    created_at: app.services.common.now(), reviewed_at: app.services.common.now(), completed_at: null
  });
  const retried = await app.inject({
    method: 'POST', url: '/api/ops/refunds/refund_retry/retry', headers: auth(token), payload: {}
  });
  assert.equal(retried.statusCode, 200, retried.body);
  assert.equal(retried.json().data.status, 'completed');
  assert.equal((await app.repository.get('orders', 'order_001')).status, 'refunded');
});
