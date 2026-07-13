const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const requiredPages = [
  'pages/index/index',
  'pages/messages/messages',
  'pages/trips/trips',
  'pages/publishTrip/publishTrip',
  'pages/tripDetail/tripDetail',
  'pages/chatGroup/chatGroup',
  'pages/poiChat/poiChat',
  'pages/createPoiChat/createPoiChat',
  'pages/privateChat/privateChat',
  'pages/userProfile/userProfile',
  'pages/social/social',
  'pages/certify/certify',
  'pages/invite/invite',
  'pages/coupons/coupons',
  'pages/nextTrip/nextTrip',
  'pages/support/support',
  'pages/groupbuyList/groupbuyList',
  'pages/groupbuyDetail/groupbuyDetail',
  'pages/orders/orders',
  'pages/orderDetail/orderDetail',
  'pages/badges/badges',
  'pages/settings/settings',
  'pages/mine/mine',
  'pages/login/login'
];

function checkStructure() {
  const app = readJson('miniprogram/app.json');
  assert(Array.isArray(app.pages), 'app.json pages must be an array');
  for (const page of requiredPages) assert(app.pages.includes(page), `required page is not registered: ${page}`);
  for (const page of app.pages) {
    for (const ext of ['js', 'wxml', 'wxss', 'json']) assert(exists(`miniprogram/${page}.${ext}`), `missing miniprogram/${page}.${ext}`);
  }

  const tabs = app.tabBar && app.tabBar.list || [];
  assert(tabs.length === 4, `expected 4 tab pages, got ${tabs.length}`);
  for (const page of ['pages/index/index', 'pages/messages/messages', 'pages/trips/trips', 'pages/mine/mine']) {
    const tab = tabs.find(item => item.pagePath === page);
    assert(tab, `tab missing: ${page}`);
    assert(tab.iconPath && tab.selectedIconPath, `tab icons missing: ${page}`);
    assert(exists(`miniprogram/${tab.iconPath}`) && exists(`miniprogram/${tab.selectedIconPath}`), `tab icon file missing: ${page}`);
  }

  for (const name of ['login', 'trip', 'groupbuy', 'order', 'chat']) {
    assert(exists(`cloudfunctions/${name}/index.js`), `missing cloudfunctions/${name}/index.js`);
    const pkg = readJson(`cloudfunctions/${name}/package.json`);
    assert(pkg.dependencies && pkg.dependencies['wx-server-sdk'], `missing wx-server-sdk in ${name}`);
  }

  const mock = readJson('scripts/mock-data.json');
  for (const name of ['users', 'trips', 'trip_members', 'messages', 'groupbuys', 'orders', 'vehicle_certs', 'invites', 'coupons', 'growth_logs']) {
    assert(Array.isArray(mock.collections[name]), `mock collection must be an array: ${name}`);
  }

  for (const adminFile of ['admin-merchant/index.html', 'admin-ops/index.html']) {
    const html = read(adminFile);
    assert(html.includes('localStorage'), `${adminFile} must persist actions`);
    assert(!html.includes("alert('Mock"), `${adminFile} still contains mock-only alerts`);
    assert(html.includes('<form') && html.includes('<table'), `${adminFile} must contain operational forms and tables`);
  }

  const visibleSources = requiredPages.flatMap(page => ['wxml', 'js'].map(ext => read(`miniprogram/${page}.${ext}`))).join('\n');
  assert(!/Mock 登录|模拟支付|MVP 使用模拟/.test(visibleSources), 'user-facing mock labels remain');
}

async function checkProductFlow() {
  const storage = new Map();
  global.wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    cloud: { callFunction: () => Promise.reject(new Error('cloud disabled in verify')) }
  };

  const api = require(path.join(root, 'miniprogram/utils/api'));

  await api.resetDemo();
  const login = await api.login({ nickname: '验证用户', phone: '13812345678' });
  assert(login.ok && login.data.nickname === '验证用户' && login.data.phone === '13812345678', 'login flow failed');

  const home = await api.getHome();
  assert(home.ok && home.data.currentTrip && home.data.trips.length >= 3, 'home current trip missing');
  assert(home.data.stats.unreadCount > 0 && home.data.mapLayers.length >= 6, 'home map/unread data missing');

  const trips = await api.listTrips();
  assert(trips.ok && trips.data.some(item => item.owned) && trips.data.some(item => item.joined), 'trip ownership state missing');
  const application = await api.applyTrip('trip_002', '自动验收申请');
  assert(application.ok && application.data.status === 'pending', 'trip application flow failed');
  const ownedTrip = await api.getTrip('trip_003');
  assert(ownedTrip.ok && ownedTrip.data.requests.length === 1, 'captain pending requests missing');
  const approval = await api.approveTripRequest(ownedTrip.data.requests[0]._id, true);
  assert(approval.ok && approval.data.status === 'approved', 'captain approval flow failed');

  const trip = await api.createTrip({
    title: '自动验收路线', teamName: '自动验收小队', from: '杭州西湖', to: '绍兴鲁迅故里',
    departAt: '2026-08-06 09:00', seatTotal: 4, priceShare: 42, days: 2, dailyKm: 180,
    depth: '中度', plans: ['AA住宿', '互助'], waypoints: ['萧山服务区']
  });
  assert(trip.ok && trip.data.teamName === '自动验收小队', 'three-step trip publish payload failed');
  const message = await api.sendMessage(trip.data._id, '车队文本消息', 'text');
  const location = await api.shareLocation(trip.data._id);
  assert(message.ok && location.ok && location.data.type === 'location', 'group chat attachment flow failed');

  const conversations = await api.listConversations('all');
  assert(conversations.ok && conversations.data.some(item => item.type === 'private'), 'conversation types missing');
  const privateChat = await api.getPrivateChat('u_owner_002');
  assert(privateChat.ok && privateChat.data.relation === 'mutual' && privateChat.data.canSend, 'private chat relationship failed');
  const privateMessage = await api.sendPrivateMessage('u_owner_002', '私信自动验收');
  assert(privateMessage.ok && privateMessage.data.content === '私信自动验收', 'private message send failed');

  const topic = await api.createPoiChat({ name: '自动验收地点话题', location: '杭州测试服务区' });
  assert(topic.ok && topic.data.followed, 'location topic create failed');
  const poiMessage = await api.sendPoiMessage(topic.data._id, '地点消息自动验收');
  assert(poiMessage.ok, 'location topic message failed');

  const groups = await api.listGroupbuys();
  assert(groups.ok && groups.data.length >= 2 && groups.data[0].currentPrice, 'tier price calculation missing');
  const group = await api.getGroupbuy('gb_001');
  assert(group.ok && group.data.coupons.length > 0, 'eligible coupon matching failed');
  const order = await api.createOrder('gb_001', { couponId: group.data.coupons[0]._id });
  assert(order.ok && order.data.verifyCode && order.data.discountAmount > 0, 'coupon order flow failed');
  const duplicate = await api.createOrder('gb_001');
  assert(duplicate.ok && duplicate.data._id === order.data._id && duplicate.data.existing, 'duplicate order guard failed');
  const refund = await api.requestRefund(order.data._id, '自动验收退款');
  assert(refund.ok && refund.data.status === 'pending', 'refund application failed');
  const orderDetail = await api.getOrder(order.data._id);
  assert(orderDetail.ok && orderDetail.data.refundStatus === 'pending', 'order refund status missing');

  const profile = await api.getUserProfile('u_owner_002');
  assert(profile.ok && profile.data.user.bio && profile.data.trips.length > 0, 'user profile flow failed');
  const blocked = await api.setBlocked('u_owner_002', true);
  assert(blocked.ok && blocked.data.blocked, 'block user flow failed');
  await api.setBlocked('u_owner_002', false);
  const settings = await api.updateSettings({ discoverable: false, sentinelMode: true, emergencyPhone: '13900001111' });
  assert(settings.ok && settings.data.discoverable === false && settings.data.emergencyPhone, 'privacy/safety settings failed');

  const cert = await api.submitCertification({ name: '验证用户', plate: '浙A12345', vehicleModel: '测试车型', licensePhoto: 'wxfile://license.jpg', faceVerified: true });
  assert(cert.ok && cert.data.status === 'pending' && cert.data.faceVerified, 'certification submit failed');
  const invites = await api.listInvites();
  assert(invites.ok && invites.data.rewards.length === 3 && invites.data.sharePath, 'invite rewards/share path missing');

  const draft = await api.createNextTrip({ from: '杭州', to: '黄山', departAt: '2026-08-12 09:00', note: '草稿验收' });
  const published = await api.publishNextTrip(draft.data._id);
  assert(published.ok && published.data._id, 'next trip publish failed');
  const ticket = await api.submitTicket({ category: '订单问题', title: '客服自动验收', content: '详细问题' });
  const tickets = await api.listTickets();
  assert(ticket.ok && tickets.data.some(item => item._id === ticket.data._id), 'support ticket persistence failed');
  const sos = await api.recordEmergency({ tripId: 'trip_001', location: '自动验收位置' });
  assert(sos.ok && sos.data.status === 'notified', 'SOS record failed');

  const mine = await api.getMine();
  assert(mine.ok && mine.data.orders.length >= 3 && mine.data.social && mine.data.settings, 'mine aggregate data incomplete');
  const admin = await api.getAdminSnapshot();
  assert(admin.ok && admin.data.stats.users >= 4 && admin.data.refunds.length >= 1 && admin.data.emergencyEvents.length >= 1, 'admin aggregate data incomplete');
}

(async () => {
  checkStructure();
  await checkProductFlow();
  console.log('TongDao-v2 product verify ok');
})().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
