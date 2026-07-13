const store = require('./mockStore');

// Local product mode keeps every interaction persistent on the device. Switch this
// on only after the matching cloud actions and database permissions are deployed.
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

function getUserById(db, userId) {
  return db.users.find(item => item._id === userId);
}

function relationFor(db, fromUserId, toUserId) {
  const isTeammate = (db.trip_members || []).some(member => {
    if (member.userId !== fromUserId) return false;
    return (db.trip_members || []).some(other => other.tripId === member.tripId && other.userId === toUserId);
  });
  if (isTeammate) return 'teammate';

  const follows = db.follows || [];
  const followsTarget = follows.some(item => item.followerId === fromUserId && item.targetType === 'user' && item.targetId === toUserId);
  const followedBack = follows.some(item => item.followerId === toUserId && item.targetType === 'user' && item.targetId === fromUserId);
  if (followsTarget && followedBack) return 'mutual';
  if (followsTarget) return 'following';
  return 'stranger';
}

function login(profile = {}) {
  if (useCloud) return callCloud('login', { action: 'login', profile });
  const db = store.getStore();
  const user = getCurrentUser(db);
  for (const key of ['nickname', 'phone', 'vehicleModel', 'vehicleNo']) {
    if (profile[key]) user[key] = profile[key];
  }
  user.lastLoginAt = store.currentTime();
  db.currentUserId = user._id;
  store.saveStore(db);
  return ok(user);
}

function getHome() {
  if (useCloud) return callCloud('trip', { action: 'home' });
  const db = store.getStore();
  const user = getCurrentUser(db);
  const memberTripIds = (db.trip_members || []).filter(item => item.userId === user._id).map(item => item.tripId);
  const currentTrip = db.trips.find(item => memberTripIds.includes(item._id) && item.status !== 'done') || null;
  return ok({
    user,
    currentTrip,
    trips: db.trips.slice().sort((a, b) => Number(b.matchRate || 0) - Number(a.matchRate || 0)).slice(0, 4),
    groupbuys: db.groupbuys.slice(0, 3),
    conversations: db.conversations || [],
    mapLayers: db.map_layers || [],
    poiChats: db.poi_chats || [],
    settings: (db.user_settings || {})[user._id] || {},
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
  const user = getCurrentUser(db);
  const memberTripIds = (db.trip_members || []).filter(item => item.userId === user._id).map(item => item.tripId);
  const requests = db.trip_requests || [];
  return ok(db.trips.map(item => ({
    ...item,
    joined: memberTripIds.includes(item._id),
    owned: item.ownerId === user._id,
    requestStatus: (requests.find(request => request.tripId === item._id && request.userId === user._id) || {}).status || 'none'
  })).sort((a, b) => Number(b.matchRate || 0) - Number(a.matchRate || 0)));
}

function getTrip(tripId) {
  if (useCloud) return callCloud('trip', { action: 'detail', tripId });
  const db = store.getStore();
  const trip = db.trips.find(item => item._id === tripId);
  if (!trip) return fail('行程不存在');
  const members = (db.trip_members || []).filter(item => item.tripId === tripId).map(item => ({
    ...item,
    user: getUserById(db, item.userId) || {}
  }));
  const user = getCurrentUser(db);
  const request = (db.trip_requests || []).find(item => item.tripId === tripId && item.userId === user._id);
  return ok({
    trip,
    members,
    requests: (db.trip_requests || []).filter(item => item.tripId === tripId && item.status === 'pending'),
    joined: members.some(item => item.userId === user._id),
    owned: trip.ownerId === user._id,
    requestStatus: request ? request.status : 'none'
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
    title: payload.title || `${payload.from}到${payload.to}同路行`,
    teamName: payload.teamName || `${payload.to}同路小队`,
    from: payload.from,
    to: payload.to,
    waypoints: payload.waypoints || [],
    departAt: payload.departAt,
    days: Number(payload.days || 1),
    dailyKm: Number(payload.dailyKm || 200),
    seatTotal: Number(payload.seatTotal || 4),
    seatJoined: 1,
    priceShare: Number(payload.priceShare || 0),
    depth: payload.depth || '中度',
    plans: payload.plans || ['AA住宿', '互助'],
    equipment: payload.equipment || [],
    privacy: payload.privacy || 'public',
    discoverable: payload.discoverable !== false,
    status: 'open',
    stage: 'forming',
    matchRate: 100,
    remainingKm: Number(payload.dailyKm || 200),
    sharedLocation: true,
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
  db.conversations.unshift({
    _id: store.id('conv_team'),
    type: 'team',
    title: `${trip.teamName} · 1人`,
    lastMessage: '系统：车队已创建，邀请同路人加入吧',
    time: '刚刚',
    meta: '位置共享 ON',
    unread: 0,
    targetId: trip._id
  });
  db.messages.push({
    _id: store.id('msg'),
    tripId: trip._id,
    userId: 'system',
    nickname: '系统',
    type: 'system',
    content: `${user.nickname}创建了${trip.teamName}`,
    createdAt: store.currentTime()
  });
  store.saveStore(db);
  return ok(trip);
}

function updateTrip(tripId, payload) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const trip = db.trips.find(item => item._id === tripId);
  if (!trip) return fail('行程不存在');
  if (trip.ownerId !== user._id) return fail('只有队长可以编辑行程');
  for (const key of ['title', 'teamName', 'from', 'to', 'departAt', 'note', 'depth', 'privacy']) {
    if (payload[key] !== undefined) trip[key] = payload[key];
  }
  for (const key of ['days', 'dailyKm', 'seatTotal', 'priceShare']) {
    if (payload[key] !== undefined) trip[key] = Number(payload[key]);
  }
  if (payload.waypoints) trip.waypoints = payload.waypoints;
  if (payload.plans) trip.plans = payload.plans;
  if (payload.equipment) trip.equipment = payload.equipment;
  trip.updatedAt = store.currentTime();
  store.saveStore(db);
  return ok(trip);
}

function applyTrip(tripId, message = '') {
  const db = store.getStore();
  const trip = db.trips.find(item => item._id === tripId);
  if (!trip) return fail('行程不存在');
  if (trip.status !== 'open') return fail('当前行程不可申请');
  const user = getCurrentUser(db);
  if ((db.trip_members || []).some(item => item.tripId === tripId && item.userId === user._id)) {
    return ok({ status: 'joined', trip });
  }
  const existed = (db.trip_requests || []).find(item => item.tripId === tripId && item.userId === user._id && item.status === 'pending');
  if (existed) return ok(existed);
  const request = {
    _id: store.id('request'),
    tripId,
    userId: user._id,
    nickname: user.nickname,
    vehicleModel: user.vehicleModel,
    message: message || '路线顺路，希望加入车队。',
    status: 'pending',
    createdAt: store.currentTime()
  };
  db.trip_requests = db.trip_requests || [];
  db.trip_requests.unshift(request);
  store.saveStore(db);
  return ok(request);
}

function joinTrip(tripId) {
  return applyTrip(tripId);
}

function approveTripRequest(requestId, approve = true) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const request = (db.trip_requests || []).find(item => item._id === requestId);
  if (!request) return fail('申请不存在');
  const trip = db.trips.find(item => item._id === request.tripId);
  if (!trip || trip.ownerId !== user._id) return fail('只有队长可以处理申请');
  if (!approve) {
    request.status = 'rejected';
    request.reviewedAt = store.currentTime();
    store.saveStore(db);
    return ok(request);
  }
  if (trip.seatJoined >= trip.seatTotal) return fail('车队人数已满');
  const applicant = getUserById(db, request.userId);
  request.status = 'approved';
  request.reviewedAt = store.currentTime();
  trip.seatJoined += 1;
  if (trip.seatJoined >= trip.seatTotal) trip.status = 'full';
  trip.teammates.push({ userId: applicant._id, nickname: applicant.nickname, latitude: 30.18, longitude: 119.92 });
  db.trip_members.push({
    _id: store.id('tm'),
    tripId: trip._id,
    userId: applicant._id,
    nickname: applicant.nickname,
    role: 'passenger',
    joinedAt: store.currentTime()
  });
  store.saveStore(db);
  return ok(request);
}

function leaveTrip(tripId) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const trip = db.trips.find(item => item._id === tripId);
  if (!trip) return fail('行程不存在');
  if (trip.ownerId === user._id) return fail('队长需先结束行程，不能直接退出');
  const index = (db.trip_members || []).findIndex(item => item.tripId === tripId && item.userId === user._id);
  if (index < 0) return fail('你不在该车队中');
  db.trip_members.splice(index, 1);
  trip.teammates = (trip.teammates || []).filter(item => item.userId !== user._id);
  trip.seatJoined = Math.max(1, Number(trip.seatJoined || 1) - 1);
  if (trip.status === 'full') trip.status = 'open';
  store.saveStore(db);
  return ok(trip);
}

function endTrip(tripId) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const trip = db.trips.find(item => item._id === tripId);
  if (!trip) return fail('行程不存在');
  if (trip.ownerId !== user._id) return fail('只有队长可以结束行程');
  trip.status = 'done';
  trip.stage = 'completed';
  trip.completedAt = store.currentTime();
  store.saveStore(db);
  return ok(trip);
}

function listMessages(tripId) {
  if (useCloud) return callCloud('chat', { action: 'list', tripId });
  const db = store.getStore();
  return ok((db.messages || []).filter(item => item.tripId === tripId));
}

function listConversations(type) {
  const db = store.getStore();
  const items = db.conversations || [];
  return ok((type && type !== 'all' ? items.filter(item => item.type === type) : items).slice().sort((a, b) => Number(b.unread || 0) - Number(a.unread || 0)));
}

function markConversationRead(targetId, type) {
  const db = store.getStore();
  const conversation = (db.conversations || []).find(item => item.targetId === targetId && (!type || item.type === type));
  if (conversation) conversation.unread = 0;
  store.saveStore(db);
  return ok(conversation || null);
}

function sendMessage(tripId, content, type = 'text') {
  if (useCloud) return callCloud('chat', { action: 'send', tripId, content, type });
  const text = `${content || ''}`.trim();
  if (!text) return fail('消息不能为空');
  const db = store.getStore();
  const user = getCurrentUser(db);
  const isMember = (db.trip_members || []).some(item => item.tripId === tripId && item.userId === user._id);
  if (!isMember) return fail('加入车队后才能发言');
  const message = {
    _id: store.id('msg'),
    tripId,
    userId: user._id,
    nickname: user.nickname,
    type,
    content: text,
    createdAt: store.currentTime()
  };
  db.messages.push(message);
  const conversation = (db.conversations || []).find(item => item.type === 'team' && item.targetId === tripId);
  if (conversation) {
    conversation.lastMessage = `${user.nickname}：${text}`;
    conversation.time = '刚刚';
    conversation.unread = 0;
  }
  store.saveStore(db);
  return ok(message);
}

function shareLocation(tripId) {
  return sendMessage(tripId, '已共享位置：西湖文化广场东门', 'location');
}

function getPrivateChat(userId) {
  const db = store.getStore();
  const current = getCurrentUser(db);
  const target = getUserById(db, userId);
  if (!target) return fail('用户不存在');
  const blocked = (db.blocked_users || []).some(item => item.userId === current._id && item.targetId === userId);
  const relation = relationFor(db, current._id, userId);
  const outgoingCount = (db.private_messages || []).filter(item => item.fromUserId === current._id && item.toUserId === userId).length;
  const canSend = !blocked && (relation === 'mutual' || relation === 'teammate' || (relation === 'following' && outgoingCount < 3));
  const messages = (db.private_messages || []).filter(item =>
    (item.fromUserId === current._id && item.toUserId === userId) ||
    (item.fromUserId === userId && item.toUserId === current._id)
  );
  return ok({ target, currentUserId: current._id, relation, blocked, outgoingCount, remaining: relation === 'following' ? Math.max(0, 3 - outgoingCount) : null, canSend, messages });
}

function sendPrivateMessage(userId, content) {
  const text = `${content || ''}`.trim();
  if (!text) return fail('消息不能为空');
  const db = store.getStore();
  const current = getCurrentUser(db);
  const target = getUserById(db, userId);
  if (!target) return fail('用户不存在');
  const blocked = (db.blocked_users || []).some(item => item.userId === current._id && item.targetId === userId);
  if (blocked) return fail('已将该用户加入黑名单');
  const relation = relationFor(db, current._id, userId);
  const outgoingCount = (db.private_messages || []).filter(item => item.fromUserId === current._id && item.toUserId === userId).length;
  if (relation === 'stranger') return fail('关注后才可以发消息');
  if (relation === 'following' && outgoingCount >= 3) return fail('对方回复或回关后可继续发送');
  const message = {
    _id: store.id('pm'),
    fromUserId: current._id,
    toUserId: userId,
    nickname: current.nickname,
    content: text,
    createdAt: store.currentTime()
  };
  db.private_messages = db.private_messages || [];
  db.private_messages.push(message);
  let conversation = (db.conversations || []).find(item => item.type === 'private' && item.targetId === userId);
  if (!conversation) {
    conversation = { _id: store.id('conv_private'), type: 'private', targetId: userId, unread: 0 };
    db.conversations.unshift(conversation);
  }
  conversation.title = `${target.nickname} · ★${target.creditScore || '-'}`;
  conversation.lastMessage = text;
  conversation.time = '刚刚';
  conversation.meta = relation === 'mutual' ? '已互关' : relation === 'teammate' ? '同队成员' : '已关注';
  conversation.unread = 0;
  store.saveStore(db);
  return ok(message);
}

function getPoiChat(poiChatId) {
  const db = store.getStore();
  const room = (db.poi_chats || []).find(item => item._id === poiChatId);
  if (!room) return fail('地点聊天室不存在');
  const messages = (db.poi_messages || []).filter(item => item.poiChatId === poiChatId);
  return ok({ room, messages });
}

function createPoiChat(payload) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const room = {
    _id: store.id('poi'),
    name: payload.name,
    location: payload.location,
    online: 1,
    status: 'active',
    lastMessage: '话题已创建，来分享路况和补给信息吧',
    creatorId: user._id,
    followed: true,
    createdAt: store.currentTime()
  };
  db.poi_chats.unshift(room);
  db.poi_messages.push({
    _id: store.id('poim'), poiChatId: room._id, userId: 'system', nickname: '系统',
    content: `${user.nickname}创建了地点话题`, createdAt: store.currentTime()
  });
  db.conversations.unshift({
    _id: store.id('conv_poi'), type: 'poi', title: `${room.name} · 1人在聊`, lastMessage: room.lastMessage,
    time: '刚刚', meta: '我创建的', unread: 0, targetId: room._id
  });
  store.saveStore(db);
  return ok(room);
}

function followPoiChat(poiChatId) {
  const db = store.getStore();
  const room = (db.poi_chats || []).find(item => item._id === poiChatId);
  if (!room) return fail('地点聊天室不存在');
  room.followed = !room.followed;
  const conversation = (db.conversations || []).find(item => item.type === 'poi' && item.targetId === poiChatId);
  if (room.followed && !conversation) {
    db.conversations.unshift({ _id: store.id('conv_poi'), type: 'poi', title: room.name, lastMessage: room.lastMessage, time: '刚刚', meta: '已关注', unread: 0, targetId: room._id });
  }
  store.saveStore(db);
  return ok(room);
}

function sendPoiMessage(poiChatId, content) {
  const text = `${content || ''}`.trim();
  if (!text) return fail('消息不能为空');
  const db = store.getStore();
  const user = getCurrentUser(db);
  const room = (db.poi_chats || []).find(item => item._id === poiChatId);
  if (!room) return fail('地点聊天室不存在');
  if (room.status === 'archived') return fail('历史话题只可浏览，不能发言');
  const message = { _id: store.id('poim'), poiChatId, userId: user._id, nickname: user.nickname, content: text, createdAt: store.currentTime() };
  db.poi_messages.push(message);
  room.lastMessage = text;
  room.status = 'active';
  room.followed = true;
  let conversation = (db.conversations || []).find(item => item.type === 'poi' && item.targetId === poiChatId);
  if (!conversation) {
    conversation = { _id: store.id('conv_poi'), type: 'poi', targetId: poiChatId };
    db.conversations.unshift(conversation);
  }
  conversation.title = `${room.name} · ${room.online}人在聊`;
  conversation.lastMessage = text;
  conversation.time = '刚刚';
  conversation.meta = '参与过的话题';
  conversation.unread = 0;
  store.saveStore(db);
  return ok(message);
}

function listGroupbuys() {
  if (useCloud) return callCloud('groupbuy', { action: 'list' });
  const db = store.getStore();
  return ok(db.groupbuys.map(groupbuy => ({ ...groupbuy, currentPrice: getTierPrice(groupbuy, groupbuy.joined) })));
}

function getTierPrice(groupbuy, people) {
  return (groupbuy.tiers || []).reduce((price, tier) => Number(people) >= Number(tier.people) ? Number(tier.price) : price, Number(groupbuy.originPrice || groupbuy.price || 0));
}

function getGroupbuy(groupbuyId) {
  if (useCloud) return callCloud('groupbuy', { action: 'detail', groupbuyId });
  const db = store.getStore();
  const item = db.groupbuys.find(groupbuy => groupbuy._id === groupbuyId);
  if (!item) return fail('拼团不存在');
  const nextPeople = Number(item.joined || 0) + 1;
  return ok({ ...item, currentPrice: getTierPrice(item, nextPeople), coupons: eligibleCoupons(db, item, getCurrentUser(db)) });
}

function eligibleCoupons(db, groupbuy, user) {
  const price = getTierPrice(groupbuy, Number(groupbuy.joined || 0) + 1);
  return (db.coupons || []).filter(coupon => {
    if (coupon.userId && coupon.userId !== user._id) return false;
    if (coupon.status !== 'unused' || Number(coupon.threshold || 0) > price) return false;
    if (coupon.merchantId && coupon.merchantId !== groupbuy.merchantId) return false;
    return true;
  });
}

function createOrder(groupbuyId, options = {}) {
  if (useCloud) return callCloud('order', { action: 'create', groupbuyId, options });
  const db = store.getStore();
  const user = getCurrentUser(db);
  const groupbuy = db.groupbuys.find(item => item._id === groupbuyId);
  if (!groupbuy) return fail('拼团不存在');
  if (Number(groupbuy.stock || 0) <= 0) return fail('商品已售罄');
  const existed = db.orders.find(item => item.userId === user._id && item.groupbuyId === groupbuyId && ['paid', 'used'].includes(item.status));
  if (existed) return ok({ ...existed, existing: true });
  const originAmount = getTierPrice(groupbuy, Number(groupbuy.joined || 0) + 1);
  let coupon = null;
  if (options.couponId) coupon = eligibleCoupons(db, groupbuy, user).find(item => item._id === options.couponId) || null;
  const discountAmount = coupon ? Math.min(Number(coupon.amount || 0), originAmount) : 0;
  const amount = Math.max(0, Number((originAmount - discountAmount).toFixed(2)));
  groupbuy.joined += 1;
  groupbuy.stock -= 1;
  if (coupon) {
    coupon.status = 'used';
    coupon.usedAt = store.currentTime();
  }
  const order = {
    _id: store.id('order'),
    userId: user._id,
    groupbuyId,
    merchantId: groupbuy.merchantId,
    merchantName: groupbuy.merchantName,
    title: groupbuy.title,
    originAmount,
    discountAmount,
    couponId: coupon ? coupon._id : '',
    amount,
    status: 'paid',
    refundStatus: 'none',
    verifyCode: `${Math.floor(100000 + Math.random() * 900000)}`,
    createdAt: store.currentTime(),
    expiresAt: groupbuy.validUntil
  };
  db.orders.unshift(order);
  db.growth_logs.unshift({ _id: store.id('gl'), userId: user._id, delta: 20, reason: '参与拼团', createdAt: store.currentTime() });
  store.saveStore(db);
  return ok(order);
}

function listOrders() {
  if (useCloud) return callCloud('order', { action: 'list' });
  const db = store.getStore();
  const user = getCurrentUser(db);
  return ok(db.orders.filter(item => item.userId === user._id));
}

function getOrder(orderId) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const order = db.orders.find(item => item._id === orderId && item.userId === user._id);
  return order ? ok(order) : fail('订单不存在');
}

function requestRefund(orderId, reason) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const order = db.orders.find(item => item._id === orderId && item.userId === user._id);
  if (!order) return fail('订单不存在');
  if (order.status !== 'paid' || order.refundStatus === 'pending') return fail('当前订单不能申请退款');
  order.refundStatus = 'pending';
  const refund = {
    _id: store.id('refund'), orderId, userId: user._id, userName: user.nickname,
    amount: order.amount, status: 'pending', reason: reason || '用户主动申请', createdAt: store.currentTime()
  };
  db.refunds.unshift(refund);
  store.saveStore(db);
  return ok(refund);
}

function getMine() {
  if (useCloud) return callCloud('login', { action: 'mine' });
  const db = store.getStore();
  const user = getCurrentUser(db);
  const memberTripIds = db.trip_members.filter(item => item.userId === user._id).map(item => item.tripId);
  const settings = (db.user_settings || {})[user._id] || {};
  return ok({
    user,
    settings,
    trips: db.trips.filter(item => memberTripIds.includes(item._id)),
    orders: db.orders.filter(item => item.userId === user._id),
    coupons: (db.coupons || []).filter(item => !item.userId || item.userId === user._id),
    invites: (db.invites || []).filter(item => item.inviterId === user._id),
    growthLogs: (db.growth_logs || []).filter(item => item.userId === user._id),
    nextTrips: (db.next_trips || []).filter(item => item.userId === user._id),
    social: {
      following: (db.follows || []).filter(item => item.followerId === user._id).length,
      followers: (db.follows || []).filter(item => item.targetType === 'user' && item.targetId === user._id).length,
      blocked: (db.blocked_users || []).filter(item => item.userId === user._id).length
    }
  });
}

function updateProfile(payload) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  for (const key of ['nickname', 'phone', 'vehicleModel', 'vehicleNo', 'bio']) {
    if (payload[key] !== undefined) user[key] = payload[key];
  }
  store.saveStore(db);
  return ok(user);
}

function getUserProfile(userId) {
  const db = store.getStore();
  const current = getCurrentUser(db);
  const user = getUserById(db, userId);
  if (!user) return fail('用户不存在');
  const relation = relationFor(db, current._id, userId);
  const following = (db.follows || []).some(item => item.followerId === current._id && item.targetType === 'user' && item.targetId === userId);
  const trips = (db.trip_members || []).filter(item => item.userId === userId).map(item => db.trips.find(trip => trip._id === item.tripId)).filter(Boolean);
  return ok({ user, relation, following, trips });
}

function toggleFollow(targetType, targetId) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  db.follows = db.follows || [];
  const index = db.follows.findIndex(item => item.followerId === user._id && item.targetType === targetType && item.targetId === targetId);
  let following;
  if (index >= 0) {
    db.follows.splice(index, 1);
    following = false;
  } else {
    db.follows.unshift({ _id: store.id('follow'), followerId: user._id, targetType, targetId, createdAt: store.currentTime() });
    following = true;
  }
  store.saveStore(db);
  return ok({ following });
}

function setBlocked(userId, blocked) {
  const db = store.getStore();
  const current = getCurrentUser(db);
  db.blocked_users = db.blocked_users || [];
  const index = db.blocked_users.findIndex(item => item.userId === current._id && item.targetId === userId);
  if (blocked && index < 0) db.blocked_users.push({ _id: store.id('block'), userId: current._id, targetId: userId, createdAt: store.currentTime() });
  if (!blocked && index >= 0) db.blocked_users.splice(index, 1);
  store.saveStore(db);
  return ok({ blocked });
}

function listSocial() {
  const db = store.getStore();
  const current = getCurrentUser(db);
  const following = (db.follows || []).filter(item => item.followerId === current._id).map(item => ({ ...item, target: item.targetType === 'user' ? getUserById(db, item.targetId) : db.trips.find(trip => trip._id === item.targetId) })).filter(item => item.target);
  const followers = (db.follows || []).filter(item => item.targetType === 'user' && item.targetId === current._id).map(item => getUserById(db, item.followerId)).filter(Boolean);
  const blocked = (db.blocked_users || []).filter(item => item.userId === current._id).map(item => getUserById(db, item.targetId)).filter(Boolean);
  return ok({ following, followers, blocked });
}

function getCertification() {
  const db = store.getStore();
  const user = getCurrentUser(db);
  return ok((db.vehicle_certs || []).find(item => item.userId === user._id) || { userId: user._id, name: user.nickname, plate: user.vehicleNo || '', status: user.ownerCertStatus || 'none' });
}

function submitCertification(payload) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const cert = {
    _id: store.id('cert'), userId: user._id, name: payload.name || user.nickname, plate: payload.plate || user.vehicleNo || '',
    vehicleModel: payload.vehicleModel || user.vehicleModel || '', licensePhoto: payload.licensePhoto || '', faceVerified: Boolean(payload.faceVerified),
    status: 'pending', createdAt: store.currentTime()
  };
  db.vehicle_certs = (db.vehicle_certs || []).filter(item => item.userId !== user._id);
  db.vehicle_certs.unshift(cert);
  user.ownerCertStatus = 'pending';
  user.vehicleNo = cert.plate;
  user.vehicleModel = cert.vehicleModel;
  store.saveStore(db);
  return ok(cert);
}

function listCoupons() {
  const db = store.getStore();
  const user = getCurrentUser(db);
  return ok((db.coupons || []).filter(item => !item.userId || item.userId === user._id));
}

function listInvites() {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const records = (db.invites || []).filter(item => item.inviterId === user._id);
  return ok({
    inviteCode: user.inviteCode || 'TD0000',
    sharePath: `/pages/login/login?inviter=${user._id}`,
    records,
    rewards: [
      { target: 1, title: '邀请首位好友', reward: '10同路值', reached: records.length >= 1 },
      { target: 3, title: '邀请3位好友', reward: '20元平台券', reached: records.length >= 3 },
      { target: 5, title: '邀请5位好友', reward: '限定勋章', reached: records.length >= 5 }
    ]
  });
}

function createNextTrip(payload) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const draft = { _id: store.id('draft'), userId: user._id, from: payload.from, to: payload.to, departAt: payload.departAt, note: payload.note || '', status: 'draft', createdAt: store.currentTime() };
  db.next_trips = db.next_trips || [];
  db.next_trips.unshift(draft);
  store.saveStore(db);
  return ok(draft);
}

async function publishNextTrip(draftId) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const draft = (db.next_trips || []).find(item => item._id === draftId && item.userId === user._id);
  if (!draft || draft.status !== 'draft') return fail('草稿不存在或已发布');
  const result = await createTrip({ from: draft.from, to: draft.to, departAt: draft.departAt, note: draft.note, seatTotal: 4, priceShare: 0 });
  if (result.ok) {
    const latestDb = store.getStore();
    const latestDraft = latestDb.next_trips.find(item => item._id === draftId);
    latestDraft.status = 'published';
    latestDraft.tripId = result.data._id;
    store.saveStore(latestDb);
  }
  return result;
}

function submitTicket(payload) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const ticket = {
    _id: store.id('ticket'), userId: user._id, userName: user.nickname, category: payload.category || '其他问题',
    title: payload.title, status: 'open', createdAt: store.currentTime(),
    messages: [{ sender: 'user', content: payload.content || payload.title, createdAt: store.currentTime() }]
  };
  db.service_tickets = db.service_tickets || [];
  db.service_tickets.unshift(ticket);
  store.saveStore(db);
  return ok(ticket);
}

function listTickets() {
  const db = store.getStore();
  const user = getCurrentUser(db);
  return ok((db.service_tickets || []).filter(item => item.userId === user._id));
}

function getSettings() {
  const db = store.getStore();
  const user = getCurrentUser(db);
  return ok((db.user_settings || {})[user._id] || {});
}

function updateSettings(payload) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  db.user_settings = db.user_settings || {};
  db.user_settings[user._id] = { ...(db.user_settings[user._id] || {}), ...payload };
  if (payload.discoverable !== undefined) user.discoverable = payload.discoverable;
  store.saveStore(db);
  return ok(db.user_settings[user._id]);
}

function recordEmergency(payload = {}) {
  const db = store.getStore();
  const user = getCurrentUser(db);
  const event = {
    _id: store.id('sos'), userId: user._id, userName: user.nickname, tripId: payload.tripId || '',
    location: payload.location || '西湖文化广场东门', status: 'notified', createdAt: store.currentTime()
  };
  db.emergency_events = db.emergency_events || [];
  db.emergency_events.unshift(event);
  store.saveStore(db);
  return ok(event);
}

function getAdminSnapshot() {
  const db = store.getStore();
  return ok({
    users: db.users || [], certs: db.vehicle_certs || [], merchants: db.merchants || [], groupbuys: db.groupbuys || [],
    orders: db.orders || [], refunds: db.refunds || [], tickets: db.service_tickets || [], invites: db.invites || [],
    coupons: db.coupons || [], poiChats: db.poi_chats || [], emergencyEvents: db.emergency_events || [],
    stats: {
      users: (db.users || []).length,
      merchants: (db.merchants || []).length,
      orders: (db.orders || []).length,
      gmv: (db.orders || []).reduce((sum, item) => sum + Number(item.amount || 0), 0),
      groupbuys: (db.groupbuys || []).length,
      verifications: (db.orders || []).filter(item => item.status === 'used').length
    }
  });
}

function resetDemo() {
  if (useCloud) return fail('云开发模式请手动初始化数据库');
  return ok(store.resetStore());
}

module.exports = {
  login, getHome, listTrips, getTrip, createTrip, updateTrip, applyTrip, joinTrip, approveTripRequest, leaveTrip, endTrip,
  listMessages, listConversations, markConversationRead, sendMessage, shareLocation, getPrivateChat, sendPrivateMessage,
  getPoiChat, createPoiChat, followPoiChat, sendPoiMessage,
  listGroupbuys, getGroupbuy, createOrder, listOrders, getOrder, requestRefund,
  getMine, updateProfile, getUserProfile, toggleFollow, setBlocked, listSocial,
  getCertification, submitCertification, listCoupons, listInvites, createNextTrip, publishNextTrip,
  submitTicket, listTickets, getSettings, updateSettings, recordEmergency, getAdminSnapshot, resetDemo
};
