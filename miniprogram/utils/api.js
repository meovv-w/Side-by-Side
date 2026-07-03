const store = require('./mockStore');

const useCloud = false;

function callCloud(name, data) {
  return wx.cloud.callFunction({ name, data }).then(res => res.result);
}

function ok(data) {
  return Promise.resolve({ ok: true, data });
}

function fail(message) {
  return Promise.resolve({ ok: false, message });
}

function getCurrentUser(db) {
  return db.users.find(item => item._id === db.currentUserId) || db.users[0];
}

function login(profile) {
  if (useCloud) return callCloud('login', { action: 'mockLogin', profile });
  const db = store.getStore();
  const user = getCurrentUser(db);
  if (profile && profile.nickname) user.nickname = profile.nickname;
  db.currentUserId = user._id;
  store.saveStore(db);
  return ok(user);
}

function getHome() {
  if (useCloud) return callCloud('trip', { action: 'home' });
  const db = store.getStore();
  const user = getCurrentUser(db);
  const memberTripIds = db.trip_members.filter(item => item.userId === user._id).map(item => item.tripId);
  return ok({
    user,
    trips: db.trips.slice(0, 3),
    groupbuys: db.groupbuys.slice(0, 2),
    conversations: db.conversations || [],
    mapLayers: db.map_layers || [],
    poiChats: db.poi_chats || [],
    stats: {
      tripCount: db.trips.length,
      joinedTripCount: memberTripIds.length,
      orderCount: db.orders.filter(item => item.userId === user._id).length,
      groupbuyCount: db.groupbuys.length,
      unreadCount: (db.conversations || []).reduce((sum, item) => sum + Number(item.unread || 0), 0)
    }
  });
}

function listTrips() {
  if (useCloud) return callCloud('trip', { action: 'list' });
  const db = store.getStore();
  return ok(db.trips);
}

function getTrip(tripId) {
  if (useCloud) return callCloud('trip', { action: 'detail', tripId });
  const db = store.getStore();
  const trip = db.trips.find(item => item._id === tripId);
  if (!trip) return fail('行程不存在');
  const members = db.trip_members.filter(item => item.tripId === tripId);
  const user = getCurrentUser(db);
  return ok({
    trip,
    members,
    joined: members.some(item => item.userId === user._id)
  });
}

function createTrip(payload) {
  if (useCloud) return callCloud('trip', { action: 'create', payload });
  const db = store.getStore();
  const user = getCurrentUser(db);
  const trip = {
    _id: store.id('trip'),
    ownerId: user._id,
    ownerName: user.nickname,
    title: payload.title || `${payload.from} 到 ${payload.to}`,
    from: payload.from,
    to: payload.to,
    departAt: payload.departAt,
    seatTotal: Number(payload.seatTotal || 3),
    seatJoined: 1,
    priceShare: Number(payload.priceShare || 0),
    status: 'open',
    note: payload.note || '',
    route: [
      { latitude: 30.2741, longitude: 120.1551 },
      { latitude: 29.6097, longitude: 119.0419 }
    ],
    teammates: [
      { userId: user._id, nickname: user.nickname, latitude: 30.2741, longitude: 120.1551 }
    ],
    createdAt: store.currentTime()
  };
  db.trips.unshift(trip);
  db.trip_members.push({
    _id: store.id('tm'),
    tripId: trip._id,
    userId: user._id,
    nickname: user.nickname,
    role: 'owner',
    joinedAt: store.currentTime()
  });
  store.saveStore(db);
  return ok(trip);
}

function joinTrip(tripId) {
  if (useCloud) return callCloud('trip', { action: 'join', tripId });
  const db = store.getStore();
  const trip = db.trips.find(item => item._id === tripId);
  if (!trip) return fail('行程不存在');
  const user = getCurrentUser(db);
  const existed = db.trip_members.some(item => item.tripId === tripId && item.userId === user._id);
  if (existed) return ok({ trip, joined: true });
  if (trip.seatJoined >= trip.seatTotal) return fail('座位已满');
  trip.seatJoined += 1;
  if (trip.seatJoined >= trip.seatTotal) trip.status = 'full';
  trip.teammates.push({ userId: user._id, nickname: user.nickname, latitude: 30.18, longitude: 119.92 });
  db.trip_members.push({
    _id: store.id('tm'),
    tripId,
    userId: user._id,
    nickname: user.nickname,
    role: 'passenger',
    joinedAt: store.currentTime()
  });
  store.saveStore(db);
  return ok({ trip, joined: true });
}

function listMessages(tripId) {
  if (useCloud) return callCloud('chat', { action: 'list', tripId });
  const db = store.getStore();
  return ok(db.messages.filter(item => item.tripId === tripId));
}

function listConversations(type) {
  const db = store.getStore();
  const items = db.conversations || [];
  return ok(type && type !== 'all' ? items.filter(item => item.type === type) : items);
}

function getPoiChat(poiChatId) {
  const db = store.getStore();
  const room = (db.poi_chats || []).find(item => item._id === poiChatId);
  if (!room) return fail('地点聊天室不存在');
  const messages = (db.poi_messages || []).filter(item => item.poiChatId === poiChatId);
  return ok({ room, messages });
}

function sendPoiMessage(poiChatId, content) {
  const text = `${content || ''}`.trim();
  if (!text) return fail('消息不能为空');
  const db = store.getStore();
  const user = getCurrentUser(db);
  const room = (db.poi_chats || []).find(item => item._id === poiChatId);
  if (!room) return fail('地点聊天室不存在');
  const message = {
    _id: store.id('poim'),
    poiChatId,
    userId: user._id,
    nickname: user.nickname,
    content: text,
    createdAt: store.currentTime()
  };
  db.poi_messages = db.poi_messages || [];
  db.poi_messages.push(message);
  room.lastMessage = text;
  room.status = 'active';
  const conv = (db.conversations || []).find(item => item.type === 'poi' && item.targetId === poiChatId);
  if (conv) {
    conv.lastMessage = text;
    conv.unread = 0;
  }
  store.saveStore(db);
  return ok(message);
}

function sendMessage(tripId, content) {
  if (useCloud) return callCloud('chat', { action: 'send', tripId, content });
  const db = store.getStore();
  const user = getCurrentUser(db);
  const message = {
    _id: store.id('msg'),
    tripId,
    userId: user._id,
    nickname: user.nickname,
    content,
    createdAt: store.currentTime()
  };
  db.messages.push(message);
  store.saveStore(db);
  return ok(message);
}

function listGroupbuys() {
  if (useCloud) return callCloud('groupbuy', { action: 'list' });
  return ok(store.getStore().groupbuys);
}

function getGroupbuy(groupbuyId) {
  if (useCloud) return callCloud('groupbuy', { action: 'detail', groupbuyId });
  const item = store.getStore().groupbuys.find(g => g._id === groupbuyId);
  return item ? ok(item) : fail('拼团不存在');
}

function createOrder(groupbuyId) {
  if (useCloud) return callCloud('order', { action: 'create', groupbuyId });
  const db = store.getStore();
  const user = getCurrentUser(db);
  const groupbuy = db.groupbuys.find(item => item._id === groupbuyId);
  if (!groupbuy) return fail('拼团不存在');
  const existed = db.orders.find(item => item.userId === user._id && item.groupbuyId === groupbuyId && item.status === 'paid');
  if (existed) return ok(existed);
  groupbuy.joined += 1;
  const order = {
    _id: store.id('order'),
    userId: user._id,
    groupbuyId,
    title: groupbuy.title,
    amount: groupbuy.price,
    status: 'paid',
    verifyCode: `${Math.floor(100000 + Math.random() * 900000)}`,
    createdAt: store.currentTime()
  };
  db.orders.unshift(order);
  store.saveStore(db);
  return ok(order);
}

function listOrders() {
  if (useCloud) return callCloud('order', { action: 'list' });
  const db = store.getStore();
  const user = getCurrentUser(db);
  return ok(db.orders.filter(item => item.userId === user._id));
}

function getMine() {
  if (useCloud) return callCloud('login', { action: 'mine' });
  const db = store.getStore();
  const user = getCurrentUser(db);
  const memberTripIds = db.trip_members.filter(item => item.userId === user._id).map(item => item.tripId);
  return ok({
    user,
    trips: db.trips.filter(item => memberTripIds.includes(item._id)),
    orders: db.orders.filter(item => item.userId === user._id),
    coupons: db.coupons || [],
    invites: (db.invites || []).filter(item => item.inviterId === user._id),
    growthLogs: (db.growth_logs || []).filter(item => item.userId === user._id),
    nextTrips: (db.next_trips || []).filter(item => item.userId === user._id)
  });
}

function getCertification() {
  const db = store.getStore();
  const user = getCurrentUser(db);
  return ok((db.vehicle_certs || []).find(item => item.userId === user._id) || {
    userId: user._id,
    name: user.nickname,
    plate: user.vehicleNo || '',
    status: user.ownerCertStatus || 'none'
  });
}

function submitCertification(payload) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const cert = {
    _id: store.id('cert'),
    userId: user._id,
    name: payload.name || user.nickname,
    plate: payload.plate || user.vehicleNo || '',
    licensePhoto: 'mock-upload-license.jpg',
    status: 'pending',
    createdAt: store.currentTime()
  };
  db.vehicle_certs = db.vehicle_certs || [];
  db.vehicle_certs.unshift(cert);
  user.ownerCertStatus = 'pending';
  store.saveStore(db);
  return ok(cert);
}

function listCoupons() {
  const db = store.getStore();
  return ok(db.coupons || []);
}

function listInvites() {
  const db = store.getStore();
  const user = getCurrentUser(db);
  return ok({
    inviteCode: user.inviteCode || 'TD0000',
    qrcode: `https://mock.tongdao.local/invite/${user.inviteCode || 'TD0000'}`,
    records: (db.invites || []).filter(item => item.inviterId === user._id)
  });
}

function createNextTrip(payload) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const draft = {
    _id: store.id('draft'),
    userId: user._id,
    from: payload.from,
    to: payload.to,
    departAt: payload.departAt,
    status: 'draft'
  };
  db.next_trips = db.next_trips || [];
  db.next_trips.unshift(draft);
  store.saveStore(db);
  return ok(draft);
}

function submitTicket(payload) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const ticket = {
    _id: store.id('ticket'),
    userName: user.nickname,
    title: payload.title,
    status: 'open',
    createdAt: store.currentTime()
  };
  db.service_tickets = db.service_tickets || [];
  db.service_tickets.unshift(ticket);
  store.saveStore(db);
  return ok(ticket);
}

function getAdminSnapshot() {
  const db = store.getStore();
  return ok({
    users: db.users || [],
    certs: db.vehicle_certs || [],
    merchants: db.merchants || [],
    groupbuys: db.groupbuys || [],
    orders: db.orders || [],
    refunds: db.refunds || [],
    tickets: db.service_tickets || [],
    invites: db.invites || [],
    coupons: db.coupons || [],
    poiChats: db.poi_chats || [],
    stats: {
      users: (db.users || []).length,
      merchants: (db.merchants || []).length,
      orders: (db.orders || []).length,
      gmv: (db.orders || []).reduce((sum, item) => sum + Number(item.amount || 0), 0),
      groupbuys: (db.groupbuys || []).length,
      verifications: (db.merchants || []).reduce((sum, item) => sum + Number(item.verifyCount || 0), 0)
    }
  });
}

function resetDemo() {
  if (useCloud) return fail('云开发模式请手动初始化数据库');
  return ok(store.resetStore());
}

module.exports = {
  login,
  getHome,
  listTrips,
  getTrip,
  createTrip,
  joinTrip,
  listMessages,
  listConversations,
  getPoiChat,
  sendPoiMessage,
  sendMessage,
  listGroupbuys,
  getGroupbuy,
  createOrder,
  listOrders,
  getMine,
  getCertification,
  submitCertification,
  listCoupons,
  listInvites,
  createNextTrip,
  submitTicket,
  getAdminSnapshot,
  resetDemo
};
