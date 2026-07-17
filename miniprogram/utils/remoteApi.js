const TOKEN_KEY = 'tongdao_api_token';
const BASE_URL_KEY = 'tongdao_api_base_url';
let redirectingToLogin = false;
let socketTask = null;
const realtimeListeners = new Set();

function baseUrl() {
  const stored = wx.getStorageSync(BASE_URL_KEY);
  if (stored) return String(stored).replace(/\/$/, '');
  try { return String(getApp().globalData.apiBaseUrl || '').replace(/\/$/, ''); } catch (_) { return ''; }
}

function isEnabled() {
  return Boolean(baseUrl());
}

function request(path, options = {}) {
  return new Promise(resolve => {
    const token = wx.getStorageSync(TOKEN_KEY);
    wx.request({
      url: `${baseUrl()}${path}`,
      method: options.method || 'GET',
      data: options.data,
      timeout: options.timeout || 15000,
      header: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.header || {}) },
      success(response) {
        const body = response.data || {};
        if (response.statusCode >= 200 && response.statusCode < 300 && body.ok !== false) return resolve(body.ok === true ? body : { ok: true, data: body });
        if (response.statusCode === 401 && body.error && body.error.code === 'AUTH_REQUIRED' && !redirectingToLogin) {
          redirectingToLogin = true;
          wx.reLaunch({ url: '/pages/login/login', complete: () => setTimeout(() => { redirectingToLogin = false; }, 500) });
        }
        resolve({ ok: false, message: body.error && body.error.message || `请求失败（${response.statusCode}）`, error: body.error || { code: 'HTTP_ERROR' } });
      },
      fail(error) { resolve({ ok: false, message: error.errMsg || '无法连接同路行服务', error: { code: 'NETWORK_ERROR' } }); }
    });
  });
}

function upload(filePath, directory = 'uploads') {
  return new Promise(resolve => {
    const token = wx.getStorageSync(TOKEN_KEY);
    wx.uploadFile({
      url: `${baseUrl()}/api/uploads`, filePath, name: 'file', formData: { directory },
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(response) {
        let body = {};
        try { body = JSON.parse(response.data); } catch (_) {}
        if (response.statusCode >= 200 && response.statusCode < 300 && body.ok) resolve(body);
        else resolve({ ok: false, message: body.error && body.error.message || '文件上传失败' });
      },
      fail(error) { resolve({ ok: false, message: error.errMsg || '文件上传失败' }); }
    });
  });
}

function saveSession(result) {
  if (result.ok && result.data && result.data.token) {
    wx.setStorageSync(TOKEN_KEY, result.data.token);
    try { getApp().globalData.user = adaptUser(result.data.user); } catch (_) {}
    connectRealtime();
  }
  return result;
}

function connectRealtime() {
  const token = wx.getStorageSync(TOKEN_KEY);
  if (!token || socketTask) return;
  const socketUrl = baseUrl().replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  socketTask = wx.connectSocket({ url: `${socketUrl}/ws?token=${encodeURIComponent(token)}` });
  socketTask.onMessage(event => {
    let payload;
    try { payload = JSON.parse(event.data); } catch (_) { return; }
    if (payload.event === 'message' || payload.event === 'notification') {
      try { wx.setTabBarBadge({ index: 1, text: '•' }); } catch (_) {}
    }
    realtimeListeners.forEach(listener => listener(payload));
  });
  socketTask.onClose(() => { socketTask = null; setTimeout(connectRealtime, 2000); });
  socketTask.onError(() => {});
}

function subscribeRealtime(listener) {
  realtimeListeners.add(listener);
  connectRealtime();
  return () => realtimeListeners.delete(listener);
}

function loginWechat(profile = {}, inviteToken = '') {
  return new Promise(resolve => {
    wx.login({
      success: async loginResult => resolve(saveSession(await request('/api/auth/wechat', { method: 'POST', data: { code: loginResult.code, profile, inviteToken } }))),
      fail: error => resolve({ ok: false, message: error.errMsg || '微信登录失败' })
    });
  });
}

function bindWechat() {
  return new Promise(resolve => {
    wx.login({
      success: loginResult => resolve(request('/api/auth/wechat/bind', { method: 'POST', data: { code: loginResult.code } })),
      fail: error => resolve({ ok: false, message: error.errMsg || '微信绑定失败' })
    });
  });
}

function sendSmsCode(phone) {
  return request('/api/auth/sms/send', { method: 'POST', data: { phone } });
}

function loginWithPhone(phone, code, profile = {}, inviteToken = '') {
  return request('/api/auth/sms/login', { method: 'POST', data: { phone, code, profile, inviteToken } }).then(saveSession);
}

async function login(profile = {}) {
  return loginWechat(profile);
}

async function getHome() {
  const home = await request('/api/home');
  if (!home.ok) return home;
  connectRealtime();
  try { getApp().globalData.user = adaptUser(home.data.user); } catch (_) {}
  const currentRaw = home.data.currentTrip;
  const deviceLocation = await getLocation();
  const routeCenter = currentRaw && currentRaw.route && currentRaw.route[0] || { lng: 120.1551, lat: 30.2741 };
  const center = deviceLocation.ok
    ? { lng: deviceLocation.data.longitude, lat: deviceLocation.data.latitude }
    : routeCenter;
  const [tripRows, productRows, conversationRows, topicRows, map, notificationRows] = await Promise.all([
    request('/api/trips'), request(`/api/products?sort=nearby&radius=50000&lng=${center.lng}&lat=${center.lat}`),
    request('/api/conversations'), request(`/api/poi-topics?lng=${center.lng}&lat=${center.lat}`),
    request(`/api/map/context?lng=${center.lng}&lat=${center.lat}`), request('/api/notifications')
  ]);
  const highPriorityNotification = notificationRows.ok
    ? notificationRows.data.find(item => !item.readAt && ['high', 'urgent'].includes(item.priority)) || null
    : null;
  const safetyUnreadCount = notificationRows.ok
    ? notificationRows.data.filter(item => !item.readAt && (['high', 'urgent'].includes(item.priority) || ['emergency', 'safety_report'].includes(item.type))).length
    : 0;
  const trips = tripRows.ok ? tripRows.data.map(item => adaptTrip(item)) : [];
  let currentTrip = currentRaw ? adaptTrip(currentRaw) : null;
  if (currentTrip && map.ok) {
    const listed = trips.find(item => item._id === currentTrip._id);
    if (listed) Object.assign(currentTrip, { owned: listed.owned, joined: listed.joined });
    const teamConversation = conversationRows.ok ? conversationRows.data.find(item => item.conversationType === 'team' && item.conversationId === currentTrip._id) : null;
    currentTrip.teammates = (map.data.teammates || []).map(item => ({
      userId: item.user.id, nickname: item.user.nickname,
      latitude: Number(item.lat), longitude: Number(item.lng), speed: item.speed, altitude: item.altitude,
      distanceMeters: item.distanceMeters, reportedAt: item.reportedAt, level: item.user.level,
      offline: Boolean(item.offline), avatar: item.user.avatar || '',
      isLeader: Boolean(item.isLeader || item.member && item.member.role === 'owner'),
      ownerCertStatus: item.user.ownerCertStatus, bio: item.user.bio,
      latestMessage: teamConversation && teamConversation.latestMessage && teamConversation.latestMessage.content || ''
    }));
    const selfLocation = (map.data.teammates || []).find(item => item.user.id === home.data.user.id);
    if (selfLocation) currentTrip.remainingKm = Math.round(haversine({ lng: selfLocation.lng, lat: selfLocation.lat }, { lng: currentRaw.endLng, lat: currentRaw.endLat }) / 1000);
  }
  return {
    ok: true,
    data: {
      user: adaptUser(home.data.user), currentTrip, trips: trips.slice(0, 4),
      groupbuys: productRows.ok ? flattenGroupbuys(productRows.data) : [],
      conversations: conversationRows.ok ? conversationRows.data.map(adaptConversation) : [],
      poiChats: topicRows.ok ? topicRows.data.map(adaptTopic) : [],
      mapLayers: map.ok ? mapLayers(map.data) : [], settings: home.data.settings || {},
      highPriorityNotification,
      stats: {
        ...(home.data.stats || {}),
        mapUnreadCount: map.ok ? Number(map.data.unreadCount || 0) + safetyUnreadCount : Number(home.data.stats && home.data.stats.mapUnreadCount || 0)
      },
      weather: map.ok ? {
        altitude: Math.round(Number(deviceLocation.ok ? deviceLocation.data.altitude || 0 : ((map.data.teammates || []).find(item => item.user.id === home.data.user.id) || {}).altitude || 0)),
        text: map.data.amap && map.data.amap.weather && map.data.amap.weather.weather || '--',
        temperature: map.data.amap && map.data.amap.weather && map.data.amap.weather.temperature || '--'
      } : null,
      energyReminder: map.ok ? map.data.energyReminder : null,
      location: { latitude: center.lat, longitude: center.lng, altitude: deviceLocation.ok ? Number(deviceLocation.data.altitude || 0) : 0 }
    }
  };
}

async function listTrips(sort = 'match') {
  const location = await getLocation();
  const params = [`sort=${encodeURIComponent(sort)}`];
  if (location.ok) params.push(`lng=${location.data.longitude}`, `lat=${location.data.latitude}`, 'radius=10000');
  const response = await request(`/api/trips?${params.join('&')}`);
  return response.ok ? { ok: true, data: response.data.map(adaptTrip) } : response;
}

async function getTrip(tripId) {
  const response = await request(`/api/trips/${tripId}`);
  if (!response.ok) return response;
  return {
    ok: true,
    data: {
      trip: adaptTrip(response.data.trip),
      members: (response.data.members || []).map(item => ({
        ...item, _id: item.id, userId: item.userId, nickname: item.user.nickname,
        vehicleModel: item.user.vehicleModel, user: adaptUser(item.user)
      })),
      requests: (response.data.applications || []).map(item => ({ ...item, _id: item.id, userId: item.userId, vehicleModel: item.vehicleModel })),
      leaveRequests: (response.data.leaveRequests || []).map(item => ({
        ...item, _id: item.id, userId: item.userId, nickname: item.user && item.user.nickname,
        vehicleModel: item.user && item.user.vehicleModel
      })),
      joined: response.data.joined, owned: response.data.owned, requestStatus: response.data.requestStatus || 'none'
    }
  };
}

async function createTrip(payload) {
  const points = await resolveTripPoints(payload);
  if (!points.ok) return points;
  const response = await request('/api/trips', { method: 'POST', data: tripRequest(payload, points.data) });
  return response.ok ? { ok: true, data: adaptTrip(response.data) } : response;
}

async function planRoute(payload) {
  const points = await resolveTripPoints(payload);
  if (!points.ok) return points;
  const waypoints = [];
  for (const item of payload.waypoints || []) {
    if (item && item.lng != null) waypoints.push(item);
    else {
      const geocoded = await request(`/api/map/geocode?address=${encodeURIComponent(item)}`);
      const point = geocoded.ok ? geocodePoint(geocoded.data) : null;
      if (!point) return { ok: false, message: `无法识别途经点“${item}”，请重新选择` };
      waypoints.push(point);
    }
  }
  const response = await request('/api/map/route', { method: 'POST', data: { origin: points.data.start, destination: points.data.end, waypoints } });
  if (!response.ok) return response;
  const path = response.data.route && response.data.route.paths && response.data.route.paths[0];
  const encoded = path && (path.polyline || (path.steps || []).map(step => step.polyline).filter(Boolean).join(';'));
  const route = encoded ? encoded.split(';').filter(Boolean).map(item => { const [lng, lat] = item.split(',').map(Number); return { latitude: lat, longitude: lng }; }) : [];
  return { ok: true, data: { ...points.data, route } };
}

async function updateTrip(tripId, payload) {
  const points = await resolveTripPoints(payload);
  if (!points.ok) return points;
  const response = await request(`/api/trips/${tripId}`, { method: 'PATCH', data: tripRequest(payload, points.data) });
  return response.ok ? { ok: true, data: adaptTrip(response.data) } : response;
}

function applyTrip(tripId, message = '') {
  return request(`/api/trips/${tripId}/applications`, { method: 'POST', data: { message } });
}

function joinTrip(tripId) { return applyTrip(tripId); }

function approveTripRequest(requestId, approve = true) {
  return request(`/api/trip-applications/${requestId}`, { method: 'PUT', data: { approved: approve } });
}

function leaveTrip(tripId) {
  return request(`/api/trips/${tripId}/leave`, { method: 'POST', data: { reason: '用户主动退出' } });
}

function reviewTripLeave(memberId, approved) {
  return request(`/api/trip-members/${memberId}/leave`, { method: 'PUT', data: { approved } });
}

function removeTripMember(tripId, memberId, reason = '队长移除') {
  return request(`/api/trips/${tripId}/members/${memberId}`, { method: 'DELETE', data: { reason } });
}

async function updateTripState(tripId, action) {
  const response = await request(`/api/trips/${tripId}/state`, { method: 'POST', data: { action } });
  return response.ok ? { ok: true, data: adaptTrip(response.data) } : response;
}

async function endTrip(tripId) {
  const detail = await request(`/api/trips/${tripId}`);
  if (!detail.ok) return detail;
  const action = detail.data.trip.stage === 'forming' ? 'cancel' : 'complete';
  return updateTripState(tripId, action);
}

async function listMessages(tripId) {
  const response = await request(`/api/conversations/team/${tripId}/messages`);
  return response.ok ? { ok: true, data: response.data.map(adaptMessage) } : response;
}

async function listConversations(type = 'all') {
  const [response, notifications] = await Promise.all([
    request(`/api/conversations?type=${type || 'all'}`),
    type === 'all' ? request('/api/notifications') : Promise.resolve({ ok: true, data: [] })
  ]);
  if (!response.ok) return response;
  return { ok: true, data: [
    ...response.data.map(adaptConversation),
    ...(notifications.ok ? notifications.data.map(adaptNotification) : [])
  ].sort((first, second) => new Date(String(second.time).replace(/-/g, '/')) - new Date(String(first.time).replace(/-/g, '/'))) };
}

async function markConversationRead(targetId, type) {
  if (type === 'system') return request(`/api/notifications/${targetId}/read`, { method: 'PUT', data: {} });
  if (type === 'private') return request(`/api/private/${targetId}`);
  return request(`/api/conversations/${type}/${targetId}/messages`);
}

async function sendMessage(tripId, content, type = 'text', options = {}) {
  const supported = ['text', 'image', 'voice', 'location', 'groupbuy', 'traffic'];
  let mediaUrl = '';
  if (['image', 'voice'].includes(type)) {
    if (!/^https?:|^data:/.test(content)) {
      const uploaded = await upload(content, 'chat');
      if (!uploaded.ok) return uploaded;
      mediaUrl = uploaded.data.url;
    } else {
      mediaUrl = content;
    }
    content = type === 'image' ? '[图片]' : '语音消息';
  }
  const response = await request(`/api/trips/${tripId}/messages`, {
    method: 'POST',
    data: { content, mediaUrl, metadata: options, type: supported.includes(type) ? type : 'text' }
  });
  return response.ok ? { ok: true, data: adaptMessage(response.data) } : response;
}

async function shareLocation(tripId) {
  const location = await getLocation();
  if (!location.ok) return location;
  await request('/api/locations', { method: 'POST', data: { tripId, lng: location.data.longitude, lat: location.data.latitude, altitude: location.data.altitude || 0, speed: location.data.speed || 0, accuracy: location.data.accuracy || 0 } });
  return sendMessage(tripId, '已共享当前位置', 'location', {
    latitude: location.data.latitude, longitude: location.data.longitude, name: '队友当前位置'
  });
}

async function sharePresence() {
  const location = await getLocation();
  if (!location.ok) return location;
  return request('/api/presence', { method: 'POST', data: {
    lng: location.data.longitude, lat: location.data.latitude, altitude: location.data.altitude || 0,
    speed: location.data.speed || 0, accuracy: location.data.accuracy || 0
  } });
}

async function getPrivateChat(userId) {
  const response = await request(`/api/private/${userId}`);
  if (!response.ok) return response;
  return { ok: true, data: {
    target: adaptUser(response.data.target), currentUserId: currentUserId(), relation: response.data.relation.type,
    blocked: Boolean(response.data.relation.blockedBySelf), canSend: response.data.canSend,
    remaining: response.data.remaining,
    messages: (response.data.messages || []).map(item => adaptPrivateMessage(item, userId))
  } };
}

async function sendPrivateMessage(userId, content) {
  const response = await request(`/api/private/${userId}/messages`, { method: 'POST', data: { content, type: 'text' } });
  return response.ok ? { ok: true, data: adaptPrivateMessage(response.data, userId) } : response;
}

async function getPoiChat(topicId) {
  const response = await request(`/api/poi-topics/${topicId}`);
  if (!response.ok) return response;
  return { ok: true, data: { room: adaptTopic({ ...response.data.topic, membership: response.data.membership, participantCount: response.data.participantCount, onlineCount: response.data.onlineCount }), messages: (response.data.messages || []).map(adaptMessage) } };
}

function touchPoiPresence(topicId) {
  return request(`/api/poi-topics/${topicId}/presence`, { method: 'POST', data: {} });
}

async function createPoiChat(payload) {
  let lng = Number(payload.longitude || payload.lng);
  let lat = Number(payload.latitude || payload.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    const location = await getLocation();
    if (!location.ok) return location;
    lng = location.data.longitude; lat = location.data.latitude;
  }
  const response = await request('/api/poi-topics', { method: 'POST', data: { name: payload.name, locationName: payload.locationName || payload.location, lng, lat } });
  return response.ok ? { ok: true, data: adaptTopic(response.data) } : response;
}

async function followPoiChat(topicId) {
  const detail = await request(`/api/poi-topics/${topicId}`);
  if (!detail.ok) return detail;
  const enabled = !(detail.data.membership && detail.data.membership.followed);
  const response = await request(`/api/poi-topics/${topicId}/follow`, { method: 'PUT', data: { enabled } });
  if (!response.ok) return response;
  const latest = await request(`/api/poi-topics/${topicId}`);
  return { ok: true, data: adaptTopic({ ...latest.data.topic, membership: latest.data.membership, participantCount: latest.data.participantCount }) };
}

async function sendPoiMessage(topicId, content, type = 'text', metadata = {}) {
  let mediaUrl = '';
  if (type === 'image' && !/^https?:|^data:/.test(content)) {
    const uploaded = await upload(content, 'chat');
    if (!uploaded.ok) return uploaded;
    mediaUrl = uploaded.data.url;
    content = '[图片]';
  }
  const response = await request(`/api/poi-topics/${topicId}/messages`, { method: 'POST', data: { content, mediaUrl, type, metadata } });
  return response.ok ? { ok: true, data: adaptMessage(response.data) } : response;
}

function reportPoiTopic(topicId, reason, messageId = '') {
  return submitTicket({
    category: '地点内容举报', title: '举报地点聊天室违规内容', content: reason,
    targetType: 'poi_topic', targetId: topicId, messageId
  });
}

async function listGroupbuys(options = {}) {
  const params = [];
  const mode = options.mode || 'hot';
  if (mode === 'route' && options.tripId) params.push('sort=route', `tripId=${encodeURIComponent(options.tripId)}`, 'routeRadius=30000');
  else if (mode === 'nearby') {
    const location = await getLocation();
    if (!location.ok) return location;
    params.push('sort=nearby');
    params.push(`lng=${location.data.longitude}`, `lat=${location.data.latitude}`, 'radius=50000');
  } else params.push('sort=hot');
  const response = await request(`/api/products?${params.join('&')}`);
  return response.ok ? { ok: true, data: flattenGroupbuys(response.data, true) } : response;
}

async function createGroupbuySession(productId, options = {}) {
  const response = await request(`/api/products/${productId}/groupbuys`, {
    method: 'POST', data: { targetPeople: options.targetPeople, tripId: options.tripId || undefined }
  });
  return response.ok ? { ok: true, data: { ...response.data, _id: response.data.id } } : response;
}

async function getGroupbuy(sessionId) {
  const [response, couponResponse] = await Promise.all([request(`/api/groupbuys/${sessionId}`), request('/api/coupons/me')]);
  if (!response.ok) return response;
  const joinPrice = Number(response.data.joinPrice);
  const coupons = couponResponse.ok
    ? couponResponse.data.filter(instance => couponUsableFor(instance, response.data.product, response.data.merchant, joinPrice))
    : [];
  return { ok: true, data: adaptGroupbuy({ ...response.data.session, joinPrice }, response.data.product, response.data.merchant, response.data.participants, coupons) };
}

async function getMerchant(merchantId) {
  const response = await request(`/api/merchants/${merchantId}`);
  if (!response.ok) return response;
  return { ok: true, data: {
    ...response.data.merchant, _id: response.data.merchant.id,
    groupbuys: flattenGroupbuys(response.data.products || [], true)
  } };
}

async function createOrder(sessionId, options = {}) {
  const created = await request(`/api/groupbuys/${sessionId}/orders`, { method: 'POST', data: { userCouponId: options.couponId || undefined, quantity: options.quantity || 1 } });
  if (!created.ok) return created;
  const order = created.data.order;
  const payment = created.data.payment;
  let paid;
  if (payment.demo) paid = await request(`/api/demo/orders/${order.id}/pay`, { method: 'POST', data: {} });
  else {
    const paymentResult = await requestPayment(payment);
    if (!paymentResult.ok) return paymentResult;
    paid = await pollOrder(order.id, ['paid', 'verified'], 8);
  }
  if (!paid.ok) return paid;
  const detail = await request(`/api/orders/${order.id}`);
  return detail.ok ? { ok: true, data: adaptOrder(detail.data) } : detail;
}

async function listOrders() {
  const response = await request('/api/orders');
  return response.ok ? { ok: true, data: response.data.map(adaptOrder) } : response;
}

async function getOrder(orderId) {
  const response = await request(`/api/orders/${orderId}`);
  return response.ok ? { ok: true, data: adaptOrder(response.data) } : response;
}

async function retryOrderPayment(orderId) {
  const response = await request(`/api/orders/${orderId}/payment`, { method: 'POST', data: {} });
  if (!response.ok) return response;
  const payment = response.data.payment;
  let paid;
  if (payment.demo) paid = await request(`/api/demo/orders/${orderId}/pay`, { method: 'POST', data: {} });
  else {
    const result = await requestPayment(payment);
    if (!result.ok) return result;
    paid = await pollOrder(orderId, ['paid', 'verified'], 8);
  }
  if (!paid.ok) return paid;
  return getOrder(orderId);
}

function requestRefund(orderId, reason) {
  return request(`/api/orders/${orderId}/refunds`, { method: 'POST', data: { reason } });
}

async function getMine() {
  const [profile, tripRows, orderRows, couponRows, draftRows, socialRows, growthRows] = await Promise.all([
    request('/api/users/me'), request('/api/trips'), request('/api/orders'), request('/api/coupons/me'),
    request('/api/trip-drafts'), listSocial(), request('/api/growth/me')
  ]);
  if (!profile.ok) return profile;
  return { ok: true, data: {
    user: adaptUser(profile.data), trips: tripRows.ok ? tripRows.data.filter(item => item.participated || item.joined || item.owned).map(adaptTrip) : [],
    orders: orderRows.ok ? orderRows.data.map(adaptOrder) : [], coupons: couponRows.ok ? couponRows.data.map(adaptCoupon) : [],
    growthLogs: growthRows.ok ? growthRows.data.map(item => ({ ...item, _id: item.id, createdAt: normalizeDate(item.createdAt) })) : [], nextTrips: draftRows.ok ? draftRows.data.map(adaptDraft) : [],
    social: socialRows.ok ? {
      following: socialRows.data.following.length,
      followers: socialRows.data.followers.length,
      blocked: socialRows.data.blocked.length
    } : {}
  } };
}

async function updateProfile(payload) {
  let avatar = payload.avatar;
  if (avatar && (/^(wxfile:|file:|\/)/.test(avatar) || /^http:\/\/tmp\//.test(avatar))) {
    const uploaded = await upload(avatar, 'avatars');
    if (!uploaded.ok) return uploaded;
    avatar = uploaded.data.url;
  }
  const response = await request('/api/users/me', { method: 'PATCH', data: {
    nickname: payload.nickname, avatar, vehicleModel: payload.vehicleModel,
    vehicleNo: payload.vehicleNo, bio: payload.bio, discoverable: payload.discoverable
  } });
  return response.ok ? { ok: true, data: adaptUser(response.data) } : response;
}

async function getUserProfile(userId) {
  const profile = await request(`/api/users/${userId}`);
  if (!profile.ok) return profile;
  const following = ['following', 'mutual'].includes(profile.data.relation);
  return { ok: true, data: {
    user: adaptUser(profile.data), relation: profile.data.relation, following,
    trips: (profile.data.trips || []).map(adaptTrip),
    trajectory: (profile.data.trajectory || []).map(point => ({
      tripId: point.tripId, latitude: Number(point.lat), longitude: Number(point.lng), reportedAt: normalizeDate(point.reportedAt)
    }))
  } };
}

async function getBadgeWall() {
  const response = await request('/api/badges/wall');
  return response.ok ? { ok: true, data: response.data.map(item => ({
    ...item, _id: item.id, name: item.name, desc: item.description, owned: Boolean(item.owned), awardedAt: normalizeDate(item.awardedAt)
  })) } : response;
}

async function toggleFollow(targetType, targetId) {
  const social = await request('/api/social/me');
  if (!social.ok) return social;
  const existing = (social.data.following || []).find(item => item.targetType === targetType && item.targetId === targetId);
  const response = await request(`/api/follows/${targetType}/${targetId}`, { method: 'PUT', data: { enabled: !existing } });
  return response.ok ? { ok: true, data: { following: !existing } } : response;
}

function setBlocked(userId, blocked) {
  return request(`/api/blocks/${userId}`, { method: 'PUT', data: { blocked } });
}

async function listSocial() {
  const response = await request('/api/social/me');
  if (!response.ok) return response;
  const following = [];
  for (const item of response.data.following || []) {
    const target = item.targetType === 'user' ? await request(`/api/users/${item.targetId}`) : await request(`/api/trips/${item.targetId}`);
    following.push({ ...item, _id: item.id, targetType: item.targetType, targetId: item.targetId, target: target.ok ? (item.targetType === 'user' ? adaptUser(target.data) : adaptTrip(target.data.trip)) : {} });
  }
  const followers = [];
  for (const item of response.data.followers || []) {
    const user = await request(`/api/users/${item.followerId}`);
    if (user.ok) {
      const adapted = adaptUser(user.data);
      followers.push({ ...adapted, relationId: item.id, userId: adapted._id });
    }
  }
  const blocked = [];
  for (const item of response.data.blocked || []) {
    const user = await request(`/api/users/${item.targetUserId}`);
    if (user.ok) {
      const adapted = adaptUser(user.data);
      blocked.push({ ...adapted, blockId: item.id, userId: adapted._id });
    }
  }
  return { ok: true, data: { following, followers, blocked } };
}

async function getCertification() {
  const response = await request('/api/certifications/me');
  if (!response.ok) return response;
  return { ok: true, data: response.data ? adaptCertification(response.data) : { status: 'none' } };
}

async function startCertification(payload) {
  const uploaded = await upload(payload.licensePhoto, 'certifications');
  if (!uploaded.ok) return uploaded;
  return request('/api/certifications/session', { method: 'POST', data: { licensePhoto: uploaded.data.url } });
}

function checkCertificationLiveness() {
  return request('/api/certifications/session/status');
}

async function submitCertification(payload) {
  const response = await request('/api/certifications', { method: 'POST', data: { realName: payload.name, plate: payload.plate, vehicleModel: payload.vehicleModel } });
  return response.ok ? { ok: true, data: adaptCertification(response.data) } : response;
}

async function listCoupons() {
  const response = await request('/api/coupons/me');
  return response.ok ? { ok: true, data: response.data.map(adaptCoupon) } : response;
}

async function listInvites() {
  const [summary, linkShare, qrShare, profile] = await Promise.all([
    request('/api/invites/me'),
    request('/api/invites/share', { method: 'POST', data: { source: 'link' } }),
    request('/api/invites/share', { method: 'POST', data: { source: 'qrcode' } }),
    request('/api/users/me')
  ]);
  if (!summary.ok) return summary;
  return { ok: true, data: {
    inviteCode: linkShare.ok ? linkShare.data.inviteCode : '',
    sharePath: linkShare.ok ? linkShare.data.miniProgramPath : '/pages/login/login',
    qrCode: qrShare.ok ? qrShare.data.qrCode : '',
    records: (summary.data.items || []).map(item => ({
      ...item, _id: item.id, inviteeName: item.invitee.nickname,
      status: item.status === 'registered' ? 'registered' : 'ordered',
      sourceText: { qrcode: '扫码注册', link: '分享链接', phone_fallback: '手机号补绑', merchant: '商家推广' }[item.source] || item.source,
      rewardText: Number(item.rewardValue || 0) > 0
        ? `¥${Number(item.rewardValue)} ${item.rewardStatus === 'issued' ? '已发放' : '待发放'}`
        : '+10 同路值'
    })),
    rewards: (summary.data.rewardTiers || []).map(item => ({
      target: Number(item.firstOrders), title: `${Number(item.firstOrders)} 位好友完成首单`,
      reward: `¥${Number(item.reward)} 奖励券`, reached: Number(summary.data.stats.firstOrders || 0) >= Number(item.firstOrders)
    })),
    stats: summary.data.stats,
    canBindInviter: Boolean(profile.ok && !profile.data.invitedBy && Date.now() - serverTimestamp(profile.data.createdAt) <= 7 * 86400000)
  } };
}

function bindInviterByPhone(phone) {
  return request('/api/invites/bind-by-phone', { method: 'POST', data: { phone } });
}

async function createNextTrip(payload) {
  const points = await resolveTripPoints({ from: payload.from, to: payload.to });
  if (!points.ok) return points;
  const response = await request('/api/trip-drafts', { method: 'POST', data: {
    startName: payload.from, startLng: points.data.start.lng, startLat: points.data.start.lat,
    endName: payload.to, endLng: points.data.end.lng, endLat: points.data.end.lat,
    departAt: toServerDate(payload.departAt), waypoints: [], note: payload.note || ''
  } });
  return response.ok ? { ok: true, data: adaptDraft(response.data) } : response;
}

async function matchNextTrip(draftId) {
  const response = await request(`/api/trip-drafts/${draftId}/matches`);
  return response.ok ? { ok: true, data: response.data.map(adaptTrip) } : response;
}

async function publishNextTrip(draftId) {
  const response = await request(`/api/trip-drafts/${draftId}/convert`, { method: 'POST', data: {} });
  return response.ok ? { ok: true, data: adaptTrip(response.data) } : response;
}

function submitTicket(payload) {
  return request('/api/support/tickets', { method: 'POST', data: payload });
}

function reportUser(userId, reason) {
  return submitTicket({
    category: '隐私投诉', title: '跨车队私信骚扰投诉', content: reason,
    targetType: 'user', targetId: userId
  });
}

async function listTickets() {
  const response = await request('/api/support/tickets');
  if (!response.ok) return response;
  const result = [];
  for (const ticket of response.data) {
    const detail = await request(`/api/support/tickets/${ticket.id}`);
    result.push({ ...ticket, _id: ticket.id, messages: detail.ok ? detail.data.messages : [] });
  }
  return { ok: true, data: result };
}

async function getTicket(ticketId) {
  const response = await request(`/api/support/tickets/${ticketId}`);
  return response.ok ? { ok: true, data: { ...response.data.ticket, _id: response.data.ticket.id, messages: response.data.messages || [] } } : response;
}

function replyTicket(ticketId, content) {
  return request(`/api/support/tickets/${ticketId}/messages`, { method: 'POST', data: { content } });
}

function getSettings() { return request('/api/settings'); }

function updateSettings(payload) {
  return request('/api/settings', { method: 'PATCH', data: payload });
}

async function recordEmergency(payload = {}) {
  const location = await getLocation();
  if (!location.ok) return location;
  return request('/api/emergencies', { method: 'POST', data: { ...payload, lng: location.data.longitude, lat: location.data.latitude } });
}

async function reportSafetyEvent(payload = {}) {
  const location = await getLocation();
  if (!location.ok) return location;
  return request('/api/safety-reports', {
    method: 'POST', data: { ...payload, lng: location.data.longitude, lat: location.data.latitude }
  });
}

function reportLiveLocation(tripId, location) {
  const data = {
    lng: location.longitude, lat: location.latitude, speed: location.speed || 0,
    altitude: location.altitude || 0, accuracy: location.accuracy || 0
  };
  return tripId
    ? request('/api/locations', { method: 'POST', data: { ...data, tripId } })
    : request('/api/presence', { method: 'POST', data });
}

function getAdminSnapshot() {
  return Promise.resolve({ ok: false, message: '请使用运营后台查看平台数据' });
}

function resetDemo() {
  return Promise.resolve({ ok: false, message: '远程模式不会重置服务端数据' });
}

async function resolveTripPoints(payload) {
  let startPoint = validPoint(payload.startPoint) ? payload.startPoint : null;
  let endPoint = validPoint(payload.endPoint) ? payload.endPoint : null;
  const from = payload.from || payload.startName;
  const to = payload.to || payload.endName;
  const [start, end] = await Promise.all([
    startPoint ? Promise.resolve({ ok: true }) : request(`/api/map/geocode?address=${encodeURIComponent(from || '')}`),
    endPoint ? Promise.resolve({ ok: true }) : request(`/api/map/geocode?address=${encodeURIComponent(to || '')}`)
  ]);
  if (!start.ok || !end.ok) return { ok: false, message: start.message || end.message || '地点解析失败' };
  if (!startPoint) startPoint = geocodePoint(start.data);
  if (!endPoint) endPoint = geocodePoint(end.data);
  if (!validPoint(startPoint) || !validPoint(endPoint)) return { ok: false, message: '无法识别起点或终点，请从地图重新选择' };
  return { ok: true, data: { start: startPoint, end: endPoint } };
}

function validPoint(point) {
  const lng = point && Number(point.lng);
  const lat = point && Number(point.lat);
  return point && Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function tripRequest(payload, points) {
  return {
    title: payload.title, teamName: payload.teamName, startName: payload.from, startLng: points.start.lng, startLat: points.start.lat,
    endName: payload.to, endLng: points.end.lng, endLat: points.end.lat, departAt: toServerDate(payload.departAt),
    days: Number(payload.days), dailyKm: Number(payload.dailyKm), maxCars: Number(payload.seatTotal),
    priceShare: Number(payload.priceShare || 0), depth: depthToApi(payload.depth), plans: payload.plans || [],
    equipment: payload.equipment || [], privacy: payload.privacy || 'public', discoverable: payload.discoverable !== false,
    note: payload.note || '', waypoints: payload.waypoints || []
    ,route: (payload.route || []).map(point => ({ lng: Number(point.longitude), lat: Number(point.latitude) }))
  };
}

function adaptUser(user = {}) {
  return {
    ...user, _id: user.id, ownerCertStatus: user.ownerCertStatus || 'none', vehicleModel: user.vehicleModel || '',
    vehicleNo: user.vehicleNo || '', creditScore: user.creditScore == null ? 5 : user.creditScore,
    inviteCode: user.inviteCode || '', followerCount: Number(user.followers || user.followerCount || 0),
    followingCount: Number(user.following || user.followingCount || 0), teamCount: Number(user.teamCount || 0),
    companionCount: Number(user.companionCount || user.completedTripCount || 0), distanceKm: Number(user.distanceKm || 0),
    badges: (user.badges || []).map(item => item && item.badge ? item.badge.name : item && item.name ? item.name : item)
  };
}

function adaptTrip(trip = {}) {
  const status = { recruiting: 'open', full: 'full', started: 'started', completed: 'done', cancelled: 'done' }[trip.status] || trip.status;
  return {
    ...trip, _id: trip.id, ownerId: trip.ownerId, ownerName: trip.owner && trip.owner.nickname || trip.ownerName || '',
    from: trip.startName, to: trip.endName, departAt: normalizeDate(trip.departAt),
    seatTotal: trip.maxCars, seatJoined: trip.currentCars, dailyKm: trip.dailyKm,
    priceShare: trip.priceShare, depth: depthFromApi(trip.depth), status,
    route: (trip.route || []).map(point => ({ latitude: Number(point.lat == null ? point.latitude : point.lat), longitude: Number(point.lng == null ? point.longitude : point.lng) })),
    teammates: (trip.teammates || []).map(item => ({ userId: item.userId || item.user_id, nickname: item.nickname, role: item.role, latitude: Number(item.latitude), longitude: Number(item.longitude) })),
    joined: trip.joined, participated: trip.participated == null ? trip.joined : trip.participated, owned: trip.owned,
    requestStatus: trip.applicationStatus || trip.requestStatus || 'none', matchRate: trip.matchRate,
    distanceKm: trip.distanceMeters == null ? null : Number((Number(trip.distanceMeters) / 1000).toFixed(1))
  };
}

function adaptConversation(item) {
  return {
    ...item, _id: item.id, type: item.conversationType, targetId: item.targetId || item.conversationId,
    lastMessage: item.latestMessage && item.latestMessage.content || '', time: item.latestMessage ? normalizeDate(item.latestMessage.createdAt) : '',
    unread: item.unreadCount || 0, meta: item.status, archived: item.status === 'archived'
  };
}

function adaptNotification(item) {
  return {
    ...item, _id: `notification:${item.id}`, type: 'system', notificationType: item.type, targetId: item.id,
    title: item.title, lastMessage: item.content, time: normalizeDate(item.createdAt),
    unread: item.readAt ? 0 : 1, meta: item.priority === 'high' ? '重要通知' : '系统通知', data: item.data || {}
  };
}

function adaptMessage(item) {
  return {
    ...item, _id: item.id, tripId: item.conversationId, userId: item.senderId,
    nickname: item.sender && item.sender.nickname || (item.senderId ? '同路用户' : '系统'),
    type: item.messageType, mediaUrl: item.mediaUrl,
    content: item.messageType === 'image' && item.mediaUrl ? item.mediaUrl : item.content,
    duration: Number(item.metadata && item.metadata.duration || 0), createdAt: normalizeDate(item.createdAt)
  };
}

function adaptPrivateMessage(item, targetId) {
  const mine = item.senderId !== targetId;
  return { ...adaptMessage(item), fromUserId: mine ? currentUserId() : targetId, toUserId: mine ? targetId : currentUserId() };
}

function adaptTopic(topic) {
  return {
    ...topic, _id: topic.id, online: topic.onlineCount == null ? Number(topic.participantCount || 0) : Number(topic.onlineCount),
    participantCount: Number(topic.participantCount || 0), lastMessage: topic.latestMessage && topic.latestMessage.content || '',
    followed: Boolean(topic.membership && topic.membership.followed), participated: Boolean(topic.membership && topic.membership.participated),
    latitude: Number(topic.lat), longitude: Number(topic.lng)
  };
}

function flattenGroupbuys(products, includeAvailableProducts = false) {
  const result = [];
  for (const item of products || []) {
    for (const session of item.sessions || []) result.push(adaptGroupbuy(session, item, item.merchant, [], []));
    if (includeAvailableProducts && !(item.sessions || []).length) result.push(adaptAvailableProduct(item));
  }
  return result;
}

function adaptAvailableProduct(product) {
  const tiers = product.tiers || [];
  const first = tiers[0] || { people: 1, price: product.originPrice };
  const target = tiers.find(item => Number(item.people) > 1) || first;
  const merchant = product.merchant || {};
  return {
    _id: `available:${product.id}`, productId: product.id, availableToStart: true,
    title: product.name, merchantId: merchant.id, merchantName: merchant.name,
    coverPhoto: product.coverPhoto, photos: product.photos || [], description: product.description,
    category: product.category, originPrice: Number(product.originPrice), currentPrice: Number(first.price), price: Number(first.price),
    tiers, joined: 0, targetPeople: Number(target.people || 1), validUntil: '',
    distanceKm: Number(product.distanceMeters || 0) / 1000,
    routeDistanceKm: product.routeDistanceMeters == null ? null : Number((Number(product.routeDistanceMeters) / 1000).toFixed(1)),
    participants: [], participantUsers: [], coupons: [], address: product.address,
    latitude: product.lat, longitude: product.lng, rating: merchant.score ? (Number(merchant.score) / 20).toFixed(1) : '5.0',
    stock: Number(product.stock) - Number(product.sold) - Number(product.reserved || 0), sold: Number(product.sold), status: 'available'
  };
}

function adaptGroupbuy(session, product, merchant, participants = [], coupons = []) {
  return {
    ...session, _id: session.id, productId: product.id, title: product.name, merchantId: merchant.id, merchantName: merchant.name,
    coverPhoto: product.coverPhoto, photos: product.photos || [], description: product.description,
    originPrice: Number(product.originPrice), currentPrice: Number(session.joinPrice == null ? session.currentPrice : session.joinPrice), price: Number(session.joinPrice == null ? session.currentPrice : session.joinPrice),
    tiers: product.tiers || [], joined: Number(session.joinedPeople), targetPeople: Number(session.targetPeople),
    validUntil: normalizeDate(session.expiresAt), distanceKm: Number(product.distanceMeters || 0) / 1000,
    routeDistanceKm: product.routeDistanceMeters == null ? null : Number((Number(product.routeDistanceMeters) / 1000).toFixed(1)),
    participants: participants.map(item => item.user && item.user.nickname || '同路用户'),
    participantUsers: participants.map(item => item.user ? adaptUser(item.user) : null).filter(Boolean),
    coupons: coupons.map(adaptCoupon), address: product.address, latitude: product.lat, longitude: product.lng,
    rating: merchant.score ? (Number(merchant.score) / 20).toFixed(1) : '5.0', stock: Number(product.stock) - Number(product.sold) - Number(product.reserved || 0), sold: Number(product.sold),
    status: session.status
  };
}

function adaptOrder(order) {
  const status = { pending_payment: 'pending', paid: 'paid', refund_pending: 'paid', refunded: 'refunded', verified: 'used', closed: 'closed' }[order.status] || order.status;
  return {
    ...order, _id: order.id, orderNo: order.orderNo, title: order.product && order.product.name || '',
    merchantName: order.merchant && order.merchant.name || '', coverPhoto: order.product && order.product.coverPhoto || '',
    amount: Number(order.paidAmount), originPrice: Number(order.originAmount), status,
    refundStatus: order.refund ? ({ pending_review: 'pending', processing: 'pending', completed: 'completed', rejected: 'rejected', failed: 'failed' }[order.refund.status] || order.refund.status) : 'none',
    verifyCode: order.verifyCode, verifyQrCode: order.verifyQrCode || '', createdAt: normalizeDate(order.createdAt), paidAt: normalizeDate(order.paidAt), usedAt: normalizeDate(order.verifiedAt),
    merchantLatitude: order.merchant && Number(order.merchant.lat), merchantLongitude: order.merchant && Number(order.merchant.lng),
    merchantAddress: order.merchant && order.merchant.address || ''
  };
}

function adaptCoupon(instance) {
  const coupon = instance.coupon || instance;
  const merchantOnly = coupon.ownerType === 'merchant' || Boolean(coupon.ownerId);
  const discountRate = Number(coupon.discountRate || 0);
  return {
    ...instance, _id: instance.id, title: coupon.name, amount: Number(coupon.amount || 0),
    threshold: Number(coupon.thresholdAmount || 0), type: coupon.type, discountRate, status: instance.status,
    discountText: coupon.type === 'discount' && discountRate > 0 ? `${Number((discountRate * 10).toFixed(1))}折` : `减¥${Number(coupon.amount || 0)}`,
    expireAt: normalizeDate(instance.expiresAt).slice(0, 10), expiresAt: normalizeDate(instance.expiresAt),
    merchantId: merchantOnly ? coupon.ownerId : '', scope: merchantOnly ? '仅指定合作商家可用' : '全平台拼团可用',
    verifyCode: instance.verifyCode, verifyQrCode: instance.verifyQrCode || '',
    category: merchantOnly ? 'merchant' : coupon.type === 'reward' ? 'reward' : 'platform'
  };
}

function couponUsableFor(instance, product, merchant, amount) {
  const coupon = instance.coupon || instance;
  if (instance.status !== 'unused' || serverTimestamp(instance.expiresAt) <= Date.now()) return false;
  if (coupon.status && coupon.status !== 'active') return false;
  if (coupon.ownerType === 'merchant' && coupon.ownerId !== merchant.id) return false;
  return Number(amount) >= Number(coupon.thresholdAmount || 0) && product.merchantId === merchant.id;
}

function adaptCertification(item) {
  return { ...item, _id: item.id, name: item.realName, vehicleModel: item.vehicleModel, licensePhoto: item.licensePhoto, faceVerified: Boolean(item.livenessResult && (item.livenessResult.passed || item.livenessResult.status === 'passed')), createdAt: normalizeDate(item.createdAt) };
}

function adaptDraft(item) {
  return { ...item, _id: item.id, from: item.startName, to: item.endName, departAt: normalizeDate(item.departAt), createdAt: normalizeDate(item.createdAt) };
}

function mapLayers(context) {
  const rows = [];
  for (const item of context.otherTeams || []) rows.push({
    type: 'team', targetId: item.trip.id, title: item.trip.teamName,
    subtitle: `${item.direction === 'opposite' ? '逆向车队' : item.relativePosition === 'ahead' ? '同向 · 前方车队' : item.relativePosition === 'behind' ? '同向 · 后方车队' : '同向车队'} · ${item.trip.startName}→${item.trip.endName}`,
    desc: `队长 ${item.leader.nickname} · Lv.${item.leader.level}${item.leader.ownerCertStatus === 'approved' ? ' · 已认证' : ''} · ${item.trip.currentCars}/${item.trip.maxCars}车 · 距你 ${(item.distanceMeters / 1000).toFixed(1)}km`,
    markerKind: item.direction === 'opposite' ? 'oppositeTeam' : 'team',
    leaderId: item.leader.id, latitude: Number(item.location.lat), longitude: Number(item.location.lng),
    unread: Number(item.unreadPrivateCount || 0), preview: item.latestPrivateMessage && item.latestPrivateMessage.content || ''
  });
  for (const item of context.soloDrivers || []) rows.push({
    type: 'driver', title: item.user.nickname, subtitle: `个人自驾者 · Lv.${item.user.level}${item.user.ownerCertStatus === 'approved' ? ' · 车主已认证' : ''}`,
    desc: `距你 ${(item.distanceMeters / 1000).toFixed(1)}km · 车速 ${Math.round(Number(item.location.speed || 0))}km/h · ${normalizeDate(item.location.reportedAt)}`,
    userId: item.user.id, latitude: Number(item.location.lat), longitude: Number(item.location.lng),
    avatar: item.user.avatar || '', bio: item.user.bio || '',
    unread: Number(item.unreadPrivateCount || 0), preview: item.latestPrivateMessage && item.latestPrivateMessage.content || ''
  });
  for (const item of context.merchants || []) rows.push({
    type: 'poi', subtype: item.rescueEnabled ? 'rescue' : 'merchant', targetId: item.id,
    title: item.name, subtitle: item.rescueEnabled ? '道路救援服务' : '沿途商家',
    desc: item.rescueEnabled ? `${(item.rescueServices || []).join('、') || '应急救援'} · 服务半径 ${item.rescueRadiusKm || 0}km` : item.address,
    phone: item.rescuePhone || item.phone, address: item.address,
    latitude: Number(item.lat), longitude: Number(item.lng)
  });
  for (const item of context.amap && context.amap.services || []) rows.push({
    type: 'poi', markerKind: poiMarkerKind(item.typecode), title: item.name, subtitle: `${item.type || '沿途服务'} · 评分 ${item.rating || '--'}`,
    desc: item.address, phone: item.tel, latitude: item.lat, longitude: item.lng
  });
  for (const item of context.amap && context.amap.safety || []) rows.push({ type: 'safe', title: item.name, subtitle: '安全服务', desc: item.address, phone: item.tel, latitude: item.lat, longitude: item.lng });
  for (const item of context.trafficEvents || []) rows.push({
    type: 'traffic', targetId: item.id, title: item.title,
    subtitle: ({ accident: '交通事故', closure: '道路封闭', construction: '道路施工' }[item.eventType] || '实时路况'),
    desc: item.description, latitude: Number(item.lat), longitude: Number(item.lng)
  });
  return rows;
}

function poiMarkerKind(typecode) {
  const prefix = String(typecode || '').slice(0, 2);
  if (prefix === '01') return 'gas';
  if (prefix === '05') return 'food';
  if (prefix === '10') return 'hotel';
  if (['09', '13'].includes(prefix)) return 'safe';
  if (['03', '18'].includes(prefix)) return 'team';
  if (['06', '15'].includes(prefix)) return 'groupbuy';
  if (['08', '11'].includes(prefix)) return 'poiChat';
  return 'poi';
}

function depthToApi(value) { return { '浅度': 'light', '中度': 'medium', '深度': 'deep' }[value] || value || 'medium'; }
function depthFromApi(value) { return { light: '浅度', medium: '中度', deep: '深度' }[value] || value; }
function normalizeDate(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(serverTimestamp(text));
  if (!Number.isFinite(date.getTime())) return text.replace('T', ' ').replace(/\.\d{3}Z$|Z$/g, '');
  const parts = [
    date.getFullYear(), padDate(date.getMonth() + 1), padDate(date.getDate()),
    padDate(date.getHours()), padDate(date.getMinutes()), padDate(date.getSeconds())
  ];
  return `${parts[0]}-${parts[1]}-${parts[2]} ${parts[3]}:${parts[4]}:${parts[5]}`;
}
function toServerDate(value) {
  if (!value) return '';
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0))
    : new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 23).replace('T', ' ') : text;
}
function serverTimestamp(value) {
  const text = String(value || '');
  return new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text) && !/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? `${text.replace(' ', 'T')}Z` : text).getTime();
}
function padDate(value) { return String(value).padStart(2, '0'); }
function geocodePoint(data) { const row = data.geocodes && data.geocodes[0]; if (!row || !row.location) return null; const [lng, lat] = row.location.split(',').map(Number); return { lng, lat }; }
function haversine(first, second) { const rad = value => value * Math.PI / 180; const dLat = rad(Number(second.lat) - Number(first.lat)); const dLng = rad(Number(second.lng) - Number(first.lng)); const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(Number(first.lat))) * Math.cos(rad(Number(second.lat))) * Math.sin(dLng / 2) ** 2; return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)); }
function currentUserId() { try { return getApp().globalData.user && getApp().globalData.user._id || ''; } catch (_) { return ''; } }

function getLocation() {
  return new Promise(resolve => wx.getLocation({ type: 'gcj02', altitude: true, success: data => resolve({ ok: true, data }), fail: error => resolve({ ok: false, message: error.errMsg || '无法获取当前位置' }) }));
}

function requestPayment(payment) {
  return new Promise(resolve => wx.requestPayment({ ...payment, success: () => resolve({ ok: true }), fail: error => resolve({ ok: false, message: error.errMsg && error.errMsg.includes('cancel') ? '已取消支付' : '微信支付失败' }) }));
}

async function pollOrder(orderId, statuses, attempts) {
  for (let index = 0; index < attempts; index += 1) {
    const response = await request(`/api/orders/${orderId}`);
    if (response.ok && statuses.includes(response.data.status)) return response;
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  return { ok: false, message: '支付结果确认中，请稍后在订单页查看' };
}

module.exports = {
  isEnabled, login, loginWechat, bindWechat, sendSmsCode, loginWithPhone, getHome, listTrips, getTrip, createTrip, planRoute, updateTrip,
  applyTrip, joinTrip, approveTripRequest, leaveTrip, reviewTripLeave, removeTripMember, updateTripState, endTrip, listMessages, listConversations,
  markConversationRead, sendMessage, shareLocation, sharePresence, getPrivateChat, sendPrivateMessage,
  getPoiChat, touchPoiPresence, createPoiChat, followPoiChat, sendPoiMessage, reportPoiTopic, listGroupbuys, getGroupbuy, getMerchant, createGroupbuySession,
  createOrder, listOrders, getOrder, retryOrderPayment, requestRefund, getMine, updateProfile, getUserProfile, getBadgeWall,
  toggleFollow, setBlocked, listSocial, getCertification, startCertification, checkCertificationLiveness, submitCertification,
  listCoupons, listInvites, bindInviterByPhone, createNextTrip, matchNextTrip, publishNextTrip, submitTicket, reportUser, listTickets, getTicket, replyTicket,
  getSettings, updateSettings, recordEmergency, reportSafetyEvent, reportLiveLocation, getAdminSnapshot, resetDemo, subscribeRealtime,
  normalizeDate, toServerDate, serverTimestamp
};
