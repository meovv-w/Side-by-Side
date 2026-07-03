const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function checkStructure() {
  const app = readJson('miniprogram/app.json');
  assert(Array.isArray(app.pages), 'app.json pages must be an array');
  assert(app.pages.length >= 15, `expected at least 15 pages for HR MVP coverage, got ${app.pages.length}`);

  for (const page of [
    'pages/index/index',
    'pages/messages/messages',
    'pages/trips/trips',
    'pages/publishTrip/publishTrip',
    'pages/tripDetail/tripDetail',
    'pages/chatGroup/chatGroup',
    'pages/poiChat/poiChat',
    'pages/certify/certify',
    'pages/invite/invite',
    'pages/coupons/coupons',
    'pages/nextTrip/nextTrip',
    'pages/support/support',
    'pages/groupbuyList/groupbuyList',
    'pages/groupbuyDetail/groupbuyDetail',
    'pages/orders/orders',
    'pages/mine/mine',
    'pages/login/login'
  ]) {
    assert(app.pages.includes(page), `required page is not registered: ${page}`);
  }

  for (const page of app.pages) {
    for (const ext of ['js', 'wxml', 'wxss', 'json']) {
      assert(exists(`miniprogram/${page}.${ext}`), `missing miniprogram/${page}.${ext}`);
    }
  }

  const tabPages = new Set((app.tabBar && app.tabBar.list || []).map(item => item.pagePath));
  assert(tabPages.size === 4, `HR MVP expects 4 tab pages, got ${tabPages.size}`);
  for (const page of ['pages/index/index', 'pages/messages/messages', 'pages/trips/trips', 'pages/mine/mine']) {
    assert(tabPages.has(page), `HR tab missing: ${page}`);
  }
  for (const page of tabPages) {
    assert(app.pages.includes(page), `tabBar page is not registered: ${page}`);
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

  assert(exists('admin-merchant/index.html'), 'missing merchant admin prototype');
  assert(exists('admin-ops/index.html'), 'missing ops admin prototype');
}

async function checkMockFlow() {
  const storage = new Map();
  global.wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    cloud: {
      callFunction: () => Promise.reject(new Error('cloud disabled in verify'))
    }
  };

  const api = require(path.join(root, 'miniprogram/utils/api'));

  await api.resetDemo();
  const login = await api.login({ nickname: '验证用户' });
  assert(login.ok && login.data.nickname === '验证用户', 'login mock flow failed');

  const home = await api.getHome();
  assert(home.ok && home.data.trips.length > 0, 'home mock flow failed');
  assert(home.data.stats && typeof home.data.stats.tripCount === 'number', 'home stats missing');
  assert(home.data.mapLayers.length > 0, 'map layers missing');

  const conversations = await api.listConversations('all');
  assert(conversations.ok && conversations.data.length >= 3, 'conversation mock flow failed');

  const poi = await api.getPoiChat('poi_001');
  assert(poi.ok && poi.data.messages.length > 0, 'poi chat detail failed');
  const poiMessage = await api.sendPoiMessage('poi_001', '地点聊天室验证');
  assert(poiMessage.ok && poiMessage.data.content === '地点聊天室验证', 'poi chat send failed');

  const trip = await api.createTrip({
    from: '杭州西湖',
    to: '绍兴鲁迅故里',
    departAt: '2026-07-06 09:00',
    seatTotal: 2,
    priceShare: 42
  });
  assert(trip.ok && trip.data._id, 'createTrip mock flow failed');

  const detail = await api.getTrip(trip.data._id);
  assert(detail.ok && detail.data.joined, 'getTrip mock flow failed');

  const message = await api.sendMessage(trip.data._id, '车队消息测试');
  assert(message.ok && message.data.content === '车队消息测试', 'sendMessage mock flow failed');

  const groups = await api.listGroupbuys();
  assert(groups.ok && groups.data.length > 0, 'listGroupbuys mock flow failed');

  const group = await api.getGroupbuy(groups.data[0]._id);
  assert(group.ok && group.data.title, 'getGroupbuy mock flow failed');

  const order1 = await api.createOrder(groups.data[0]._id);
  const order2 = await api.createOrder(groups.data[0]._id);
  assert(order1.ok && order1.data.verifyCode, 'createOrder mock flow failed');
  assert(order1.data._id === order2.data._id, 'duplicate order guard failed');

  const orders = await api.listOrders();
  assert(orders.ok && orders.data.length === 1, 'listOrders mock flow failed');

  const mine = await api.getMine();
  assert(mine.ok && mine.data.trips.some(item => item._id === trip.data._id), 'mine trips missing');
  assert(mine.data.orders.length === 1, 'mine orders missing');
  assert(mine.data.coupons.length > 0, 'mine coupons missing');
  assert(mine.data.growthLogs.length > 0, 'mine growth logs missing');

  const cert = await api.submitCertification({ name: '验证用户', plate: '浙A12345' });
  assert(cert.ok && cert.data.status === 'pending', 'certification flow failed');

  const invite = await api.listInvites();
  assert(invite.ok && invite.data.inviteCode, 'invite flow failed');

  const nextTrip = await api.createNextTrip({ from: '杭州', to: '黄山', departAt: '2026-07-12 09:00' });
  assert(nextTrip.ok && nextTrip.data.status === 'draft', 'next trip flow failed');

  const ticket = await api.submitTicket({ title: '客服工单验证' });
  assert(ticket.ok && ticket.data.status === 'open', 'support ticket flow failed');

  const admin = await api.getAdminSnapshot();
  assert(admin.ok && admin.data.stats.users > 0 && admin.data.merchants.length > 0, 'admin snapshot missing');
}

(async () => {
  checkStructure();
  await checkMockFlow();
  console.log('TongDao-v2 verify ok');
})().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
