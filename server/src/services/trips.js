const { assert } = require('../lib/errors');
const { id } = require('../lib/ids');
const { distanceMeters, routeMatchRate, distanceFromRoute } = require('../lib/geo');
const { addTime, timestamp } = require('../lib/time');
const { publicUser } = require('./users');
const { publicMerchant } = require('./merchant');

function createTripService({ repository, providers, common, clock = () => Date.now() }) {
  async function list(userId, query = {}) {
    const userMemberships = await repository.find('trip_members', { user_id: userId, status: ['active', 'leave_pending'] });
    const memberIds = new Set(userMemberships.map(item => item.trip_id));
    let trips = await repository.find('trips', { status: query.status || ['recruiting', 'full', 'started'] });
    trips = trips.filter(trip => (trip.privacy === 'public' && trip.discoverable !== false) || trip.owner_id === userId || memberIds.has(trip.id));
    let candidate = query.startLng != null ? {
      start: { lng: Number(query.startLng), lat: Number(query.startLat) },
      end: { lng: Number(query.endLng), lat: Number(query.endLat) },
      route: Array.isArray(query.route) ? query.route : []
    } : null;
    if (!candidate && query.sort === 'match') {
      for (const membership of userMemberships) {
        const ownTrip = await repository.get('trips', membership.trip_id);
        if (ownTrip && ownTrip.stage !== 'completed') { candidate = tripPoints(ownTrip); break; }
      }
    }
    const items = [];
    for (const trip of trips) {
      const owner = await common.getUser(trip.owner_id);
      const application = await repository.findOne('trip_applications', { trip_id: trip.id, user_id: userId });
      const distance = query.lng != null ? distanceMeters({ lng: query.lng, lat: query.lat }, { lng: trip.start_lng, lat: trip.start_lat }) : null;
      items.push({
        ...trip, owner: publicUser(owner, false), joined: memberIds.has(trip.id),
        applicationStatus: application ? application.status : 'none',
        matchRate: candidate ? routeMatchRate(candidate, tripPoints(trip)) : null,
        distanceMeters: Number.isFinite(distance) ? Math.round(distance) : null
      });
    }
    const radius = Number(query.radius || 0);
    const visibleItems = radius > 0
      ? items.filter(item => item.owner_id === userId || memberIds.has(item.id) || (item.distanceMeters != null && item.distanceMeters <= radius))
      : items;
    const sort = query.sort || (candidate ? 'match' : 'time');
    visibleItems.sort((a, b) => sort === 'distance'
      ? Number(a.distanceMeters == null ? Infinity : a.distanceMeters) - Number(b.distanceMeters == null ? Infinity : b.distanceMeters)
      : sort === 'match'
        ? Number(b.matchRate || 0) - Number(a.matchRate || 0)
        : timestamp(a.depart_at) - timestamp(b.depart_at));
    return visibleItems;
  }

  async function detail(userId, tripId) {
    const trip = await getTrip(tripId);
    const memberships = await repository.find('trip_members', { trip_id: tripId });
    const active = memberships.filter(item => ['active', 'leave_pending'].includes(item.status));
    const member = active.find(item => item.user_id === userId);
    assert(trip.privacy === 'public' || trip.owner_id === userId || member, 403, 'PRIVATE_TRIP', '该行程为私密行程');
    const members = [];
    for (const membership of active) members.push({ ...membership, user: publicUser(await common.getUser(membership.user_id), membership.user_id === userId) });
    const applicationRows = trip.owner_id === userId
      ? await repository.find('trip_applications', { trip_id: tripId, status: 'pending' }, { orderBy: ['created_at', 'asc'] }) : [];
    const applications = [];
    for (const application of applicationRows) {
      const applicant = await common.getUser(application.user_id);
      applications.push({ ...application, nickname: applicant.nickname, vehicle_model: applicant.vehicle_model, user: publicUser(applicant, false) });
    }
    const leaveRequests = [];
    if (trip.owner_id === userId) {
      for (const membership of memberships.filter(item => item.status === 'leave_pending')) leaveRequests.push({
        ...membership, user: publicUser(await common.getUser(membership.user_id), false)
      });
    }
    const teammates = [];
    const visibleLocations = member || trip.owner_id === userId ? active : active.filter(item => item.role === 'owner');
    for (const membership of visibleLocations) {
      const location = await latestLocation(membership.user_id, tripId);
      const teammate = await common.getUser(membership.user_id);
      teammates.push({
        user_id: membership.user_id, nickname: teammate.nickname,
        latitude: location ? Number(location.lat) : Number(trip.start_lat),
        longitude: location ? Number(location.lng) : Number(trip.start_lng),
        speed: location ? Number(location.speed) : 0, reported_at: location ? location.reported_at : null
      });
    }
    const ownApplication = await repository.findOne('trip_applications', { trip_id: tripId, user_id: userId });
    return {
      trip: { ...trip, teammates }, members, applications, leaveRequests,
      joined: Boolean(member), owned: trip.owner_id === userId, requestStatus: ownApplication ? ownApplication.status : 'none'
    };
  }

  async function create(userId, payload, routeOverride) {
    await common.assertCertified(userId);
    validateTripPayload(payload);
    const route = routeOverride || payload.route || await fetchRoute(payload);
    const now = common.now();
    const trip = await repository.transaction(async tx => {
      const row = await tx.insert('trips', {
        id: id('trip'), owner_id: userId, title: String(payload.title).trim().slice(0, 200),
        team_name: String(payload.teamName || payload.title).trim().slice(0, 120),
        start_name: String(payload.startName).trim(), start_lng: Number(payload.startLng), start_lat: Number(payload.startLat),
        end_name: String(payload.endName).trim(), end_lng: Number(payload.endLng), end_lat: Number(payload.endLat),
        route, waypoints: payload.waypoints || [], depart_at: payload.departAt,
        days: Number(payload.days || 1), daily_km: Number(payload.dailyKm || 200), max_cars: Number(payload.maxCars || 4),
        current_cars: 1, price_share: Number(payload.priceShare || 0), depth: payload.depth || 'medium',
        plans: payload.plans || [], equipment: payload.equipment || [], privacy: payload.privacy || 'public',
        discoverable: payload.discoverable !== false, status: 'recruiting', stage: 'forming',
        note: String(payload.note || '').slice(0, 1000), created_at: now, updated_at: now, completed_at: null
      });
      await tx.insert('trip_members', {
        id: id('trip_member'), trip_id: row.id, user_id: userId, role: 'owner', status: 'active',
        joined_at: now, left_at: null, leave_reason: '', last_location_at: null, deviation_started_at: null
      });
      return row;
    });
    await common.ensureConversationMember('team', trip.id, userId, 'owner');
    await common.addMessage({ type: 'team', conversationId: trip.id, senderId: null, messageType: 'system', content: `车队“${trip.team_name}”已创建` });
    try { await providers.im.createGroup(trip.id, trip.team_name, userId, [userId]); } catch (error) {
      if (error.code !== 'IM_NOT_CONFIGURED') throw error;
    }
    return trip;
  }

  async function update(userId, tripId, payload) {
    const trip = await getTrip(tripId);
    assert(trip.owner_id === userId, 403, 'TRIP_OWNER_REQUIRED', '只有队长可以编辑行程');
    assert(trip.stage === 'forming', 409, 'TRIP_ALREADY_DEPARTED', '行程出发后不能修改路线和基础信息');
    const allowed = {
      title: payload.title, team_name: payload.teamName, depart_at: payload.departAt,
      days: payload.days, daily_km: payload.dailyKm, max_cars: payload.maxCars,
      price_share: payload.priceShare, depth: payload.depth, plans: payload.plans,
      equipment: payload.equipment, privacy: payload.privacy, discoverable: payload.discoverable,
      note: payload.note
    };
    const changes = Object.fromEntries(Object.entries(allowed).filter(([, value]) => value !== undefined));
    if (changes.max_cars !== undefined) {
      changes.max_cars = Number(changes.max_cars);
      assert(changes.max_cars >= trip.current_cars && changes.max_cars <= 20, 400, 'MAX_CARS_INVALID', '同行车数必须在当前人数至20辆之间');
    }
    changes.updated_at = common.now();
    return repository.update('trips', tripId, changes);
  }

  async function apply(userId, tripId, message = '') {
    await common.assertCertified(userId);
    const trip = await getTrip(tripId);
    assert(trip.owner_id !== userId, 400, 'OWNER_ALREADY_MEMBER', '你已经是该车队队长');
    assert(trip.status === 'recruiting', 409, 'TRIP_NOT_RECRUITING', '当前行程不可申请加入');
    assert(!(await repository.findOne('trip_members', { trip_id: tripId, user_id: userId, status: ['active', 'leave_pending'] })), 409, 'ALREADY_TRIP_MEMBER', '你已在该车队中');
    const existing = await repository.findOne('trip_applications', { trip_id: tripId, user_id: userId });
    if (existing && existing.status === 'pending') return existing;
    if (existing) return repository.update('trip_applications', existing.id, { status: 'pending', message: String(message).slice(0, 500), created_at: common.now(), reviewed_at: null, reviewed_by: null });
    const application = await repository.insert('trip_applications', {
      id: id('trip_application'), trip_id: tripId, user_id: userId, message: String(message).slice(0, 500),
      status: 'pending', reviewed_by: null, created_at: common.now(), reviewed_at: null
    });
    await common.notify(trip.owner_id, 'trip_application', '新的入队申请', '有车主申请加入你的车队', { tripId, applicationId: application.id });
    return application;
  }

  async function reviewApplication(ownerId, applicationId, approved) {
    const application = await repository.get('trip_applications', applicationId);
    assert(application && application.status === 'pending', 404, 'APPLICATION_NOT_FOUND', '待处理申请不存在');
    const trip = await getTrip(application.trip_id);
    assert(trip.owner_id === ownerId, 403, 'TRIP_OWNER_REQUIRED', '只有队长可以处理申请');
    if (!approved) {
      const row = await repository.update('trip_applications', application.id, { status: 'rejected', reviewed_by: ownerId, reviewed_at: common.now() });
      await common.notify(application.user_id, 'trip_application', '入队申请未通过', `你申请加入“${trip.team_name}”的请求未通过`, { tripId: trip.id });
      return row;
    }
    assert(trip.status === 'recruiting' && Number(trip.current_cars) < Number(trip.max_cars), 409, 'TRIP_FULL', '车队人数已满或已出发');
    const member = await repository.transaction(async tx => {
      const currentTrip = await tx.get('trips', trip.id);
      assert(currentTrip.status === 'recruiting' && Number(currentTrip.current_cars) < Number(currentTrip.max_cars), 409, 'TRIP_FULL', '车队人数已满或已出发');
      await tx.update('trip_applications', application.id, { status: 'approved', reviewed_by: ownerId, reviewed_at: common.now() });
      const previous = await tx.findOne('trip_members', { trip_id: trip.id, user_id: application.user_id });
      const joined = previous
        ? await tx.update('trip_members', previous.id, { role: 'member', status: 'active', joined_at: common.now(), left_at: null, leave_reason: '', last_location_at: null, deviation_started_at: null })
        : await tx.insert('trip_members', {
          id: id('trip_member'), trip_id: trip.id, user_id: application.user_id, role: 'member', status: 'active',
          joined_at: common.now(), left_at: null, leave_reason: '', last_location_at: null, deviation_started_at: null
        });
      const count = Number(currentTrip.current_cars) + 1;
      await tx.update('trips', trip.id, { current_cars: count, status: count >= Number(currentTrip.max_cars) ? 'full' : 'recruiting', updated_at: common.now() });
      return joined;
    });
    await common.ensureConversationMember('team', trip.id, application.user_id);
    await common.addMessage({ type: 'team', conversationId: trip.id, senderId: null, messageType: 'system', content: `${(await common.getUser(application.user_id)).nickname} 已加入车队` });
    await common.notify(application.user_id, 'trip_application', '入队申请已通过', `你已加入“${trip.team_name}”`, { tripId: trip.id });
    await notifyTeamFollowers(trip, '车队有新成员', `${(await common.getUser(application.user_id)).nickname} 已加入“${trip.team_name}”`);
    try { await providers.im.addGroupMember(trip.id, application.user_id); } catch (error) {
      if (error.code !== 'IM_NOT_CONFIGURED') throw error;
    }
    return member;
  }

  async function leave(userId, tripId, reason = '') {
    const trip = await getTrip(tripId);
    const member = await activeMember(tripId, userId);
    if (member.status === 'leave_pending') return member;
    assert(member.role !== 'owner' || trip.stage === 'completed', 409, 'OWNER_CANNOT_LEAVE', '队长需结束或取消行程，不能直接退出');
    if (['departed', 'driving'].includes(trip.stage)) {
      return repository.update('trip_members', member.id, { status: 'leave_pending', leave_reason: String(reason).slice(0, 255) });
    }
    return removeMember(member, trip, 'left', reason || '主动退出');
  }

  async function reviewLeave(ownerId, memberId, approved) {
    const member = await repository.get('trip_members', memberId);
    assert(member && member.status === 'leave_pending', 404, 'LEAVE_REQUEST_NOT_FOUND', '待处理退出申请不存在');
    const trip = await getTrip(member.trip_id);
    assert(trip.owner_id === ownerId, 403, 'TRIP_OWNER_REQUIRED', '只有队长可以处理退出申请');
    if (!approved) return repository.update('trip_members', member.id, { status: 'active', leave_reason: '' });
    return removeMember(member, trip, 'left', member.leave_reason || '退出申请已批准');
  }

  async function removeByOwner(ownerId, tripId, memberId, reason = '队长移除') {
    const trip = await getTrip(tripId);
    assert(trip.owner_id === ownerId, 403, 'TRIP_OWNER_REQUIRED', '只有队长可以移除成员');
    const member = await repository.get('trip_members', memberId);
    assert(member && member.trip_id === tripId && member.status === 'active' && member.role !== 'owner', 404, 'MEMBER_NOT_FOUND', '车队成员不存在');
    return removeMember(member, trip, 'removed', reason);
  }

  async function transition(ownerId, tripId, action) {
    const trip = await getTrip(tripId);
    assert(trip.owner_id === ownerId, 403, 'TRIP_OWNER_REQUIRED', '只有队长可以更新行程状态');
    const transitions = {
      depart: { from: 'forming', stage: 'departed', status: 'started', text: '车队已出发' },
      drive: { from: 'departed', stage: 'driving', status: 'started', text: '车队进入行进状态' },
      complete: { from: ['departed', 'driving'], stage: 'completed', status: 'completed', text: '行程已完成，群聊将永久保留' },
      cancel: { from: 'forming', stage: 'completed', status: 'cancelled', text: '行程已取消' }
    };
    const next = transitions[action];
    assert(next && (Array.isArray(next.from) ? next.from.includes(trip.stage) : trip.stage === next.from), 409, 'TRIP_TRANSITION_INVALID', '当前行程状态不支持该操作');
    const updated = await repository.update('trips', tripId, {
      stage: next.stage, status: next.status, updated_at: common.now(), completed_at: action === 'complete' ? common.now() : trip.completed_at
    });
    await common.addMessage({ type: 'team', conversationId: tripId, senderId: null, messageType: 'system', content: next.text });
    if (['depart', 'complete'].includes(action)) await notifyTeamFollowers(trip, next.text, `${trip.team_name}状态已更新`);
    if (action === 'complete') {
      const members = await repository.find('trip_members', { trip_id: tripId, status: 'active' });
      for (const member of members) await common.awardGrowth(member.user_id, 'complete_trip', '完成同行行程', 'trip', tripId);
    }
    return updated;
  }

  async function reportLocation(userId, payload) {
    const trip = await getTrip(payload.tripId);
    const member = await activeMember(trip.id, userId);
    const settings = await repository.findOne('user_settings', { user_id: userId });
    assert(!settings || settings.share_location, 403, 'LOCATION_SHARING_DISABLED', '你已关闭位置共享');
    const now = common.now();
    const location = await repository.insert('locations', {
      id: id('location'), user_id: userId, trip_id: trip.id, lng: Number(payload.lng), lat: Number(payload.lat),
      speed: Number(payload.speed || 0), altitude: Number(payload.altitude || 0), accuracy: Number(payload.accuracy || 0),
      bearing: Number(payload.bearing || 0), reported_at: now, expires_at: addTime(clock(), 24, 'hours')
    });
    const changes = { last_location_at: now };
    if (trip.stage === 'driving' && member.role !== 'owner') {
      const deviation = distanceFromRoute({ lng: location.lng, lat: location.lat }, trip.route || []);
      if (deviation > 50000) {
        if (!member.deviation_started_at) changes.deviation_started_at = now;
        else if (clock() - timestamp(member.deviation_started_at) >= 30 * 60000) {
          await removeMember(member, trip, 'dropped', '偏离路线超过50km并持续30分钟');
          return { location, dropout: true, reason: 'route_deviation' };
        }
      } else changes.deviation_started_at = null;
    }
    await repository.update('trip_members', member.id, changes);
    return { location, dropout: false };
  }

  async function reportPresence(userId, payload) {
    await common.assertCertified(userId);
    const user = await common.getUser(userId);
    const settings = await repository.findOne('user_settings', { user_id: userId });
    assert(user.discoverable && (!settings || settings.share_location), 403, 'PRESENCE_SHARING_DISABLED', '请先开启附近发现和位置共享');
    assert(Number.isFinite(Number(payload.lng)) && Number.isFinite(Number(payload.lat)), 400, 'LOCATION_REQUIRED', '位置坐标不能为空');
    return repository.insert('locations', {
      id: id('location'), user_id: userId, trip_id: null, lng: Number(payload.lng), lat: Number(payload.lat),
      speed: Number(payload.speed || 0), altitude: Number(payload.altitude || 0), accuracy: Number(payload.accuracy || 0),
      bearing: Number(payload.bearing || 0), reported_at: common.now(), expires_at: addTime(clock(), 1, 'hours')
    });
  }

  async function mapSnapshot(userId, query = {}) {
    const radius = Math.min(Number(query.radius || 50000), 100000);
    const center = { lng: Number(query.lng), lat: Number(query.lat) };
    const ownMemberships = await repository.find('trip_members', { user_id: userId, status: ['active', 'leave_pending'] });
    const ownTripIds = new Set(ownMemberships.map(item => item.trip_id));
    const ownTrips = [];
    const teammates = [];
    for (const membership of ownMemberships) {
      const trip = await repository.get('trips', membership.trip_id);
      if (!trip || trip.stage === 'completed') continue;
      ownTrips.push(trip);
      const members = await repository.find('trip_members', { trip_id: trip.id, status: ['active', 'leave_pending'] });
      for (const item of members) {
        const location = await latestLocation(item.user_id, trip.id);
        if (!location) continue;
        teammates.push({ ...location, member: item, user: publicUser(await common.getUser(item.user_id), item.user_id === userId), distanceMeters: Math.round(distanceMeters(center, location)) });
      }
    }
    const otherTeams = [];
    const trips = await repository.find('trips', { status: ['recruiting', 'full', 'started'], discoverable: true, privacy: 'public' });
    for (const trip of trips) {
      if (ownTripIds.has(trip.id)) continue;
      const owner = await common.getUser(trip.owner_id);
      if (!owner.discoverable) continue;
      const location = await latestLocation(trip.owner_id, trip.id);
      if (!location) continue;
      const distance = distanceMeters(center, location);
      if (distance <= radius) {
        const privatePreview = await unreadPrivatePreview(userId, owner.id);
        otherTeams.push({ trip, leader: publicUser(owner, false), location, distanceMeters: Math.round(distance), direction: routeDirection(ownTrips[0], trip), ...privatePreview });
      }
    }
    const soloDrivers = [];
    const activeDriverIds = new Set((await repository.find('trip_members', { status: ['active', 'leave_pending'] })).map(item => item.user_id));
    const latestSolo = new Map();
    for (const location of await repository.find('locations', { trip_id: null }, { orderBy: ['reported_at', 'desc'] })) {
      if (!latestSolo.has(location.user_id)) latestSolo.set(location.user_id, location);
    }
    for (const [driverId, location] of latestSolo) {
      if (driverId === userId || activeDriverIds.has(driverId) || timestamp(location.expires_at) <= clock()) continue;
      const driver = await common.getUser(driverId);
      const settings = await repository.findOne('user_settings', { user_id: driverId });
      if (!driver.discoverable || (settings && !settings.share_location)) continue;
      const distance = distanceMeters(center, location);
      if (distance > radius) continue;
      soloDrivers.push({ user: publicUser(driver, false), location, distanceMeters: Math.round(distance), ...(await unreadPrivatePreview(userId, driverId)) });
    }
    const merchants = [];
    for (const merchant of await repository.find('merchants', { status: 'approved', business_open: true })) {
      const distance = distanceMeters(center, merchant);
      if (distance <= radius) merchants.push({ ...publicMerchant(merchant), distanceMeters: Math.round(distance), sessions: await activeMerchantSessions(merchant.id) });
    }
    const topics = [];
    for (const topic of await repository.find('poi_topics', { status: ['active', 'quiet'] })) {
      const distance = distanceMeters(center, topic);
      if (distance <= radius) topics.push({ ...topic, distanceMeters: Math.round(distance), participantCount: await repository.count('poi_topic_members', { topic_id: topic.id }) });
    }
    const trafficEvents = (await repository.find('traffic_events', { status: 'active' })).filter(event =>
      (!event.ends_at || timestamp(event.ends_at) > clock()) && distanceMeters(center, event) <= radius
    );
    const unread = (await repository.find('conversation_members', { user_id: userId, left_at: null })).reduce((sum, item) => sum + Number(item.unread_count || 0), 0);
    return { ownTrips, teammates, otherTeams, soloDrivers, merchants, topics, trafficEvents, unreadCount: unread, isTripOwner: ownMemberships.some(item => item.role === 'owner') };
  }

  async function drafts(userId) {
    return repository.find('trip_drafts', { user_id: userId }, { orderBy: ['depart_at', 'asc'] });
  }

  async function createDraft(userId, payload) {
    await common.assertCertified(userId);
    validateRoutePoints(payload);
    const route = payload.route || await fetchRoute(payload);
    return repository.insert('trip_drafts', {
      id: id('trip_draft'), user_id: userId, start_name: payload.startName, start_lng: Number(payload.startLng), start_lat: Number(payload.startLat),
      end_name: payload.endName, end_lng: Number(payload.endLng), end_lat: Number(payload.endLat), depart_at: payload.departAt,
      route, waypoints: payload.waypoints || [], note: String(payload.note || '').slice(0, 1000), status: 'draft', converted_trip_id: null,
      created_at: common.now(), updated_at: common.now()
    });
  }

  async function draftMatches(userId, draftId) {
    const draft = await repository.get('trip_drafts', draftId);
    assert(draft && draft.user_id === userId && draft.status === 'draft', 404, 'DRAFT_NOT_FOUND', '行程草稿不存在');
    const candidates = await list(userId, {
      status: 'recruiting', sort: 'match',
      startLng: draft.start_lng, startLat: draft.start_lat,
      endLng: draft.end_lng, endLat: draft.end_lat,
      lng: draft.start_lng, lat: draft.start_lat, route: draft.route, radius: 10000
    });
    return candidates
      .filter(trip => trip.owner_id !== userId && Number(trip.distanceMeters) <= 10000)
      .map(trip => ({
        ...trip,
        departureDeltaHours: Math.round(Math.abs(timestamp(trip.depart_at) - timestamp(draft.depart_at)) / 3600000)
      }))
      .sort((first, second) => Number(second.matchRate || 0) - Number(first.matchRate || 0) || first.departureDeltaHours - second.departureDeltaHours)
      .slice(0, 10);
  }

  async function convertDraft(userId, draftId, payload = {}) {
    const draft = await repository.get('trip_drafts', draftId);
    assert(draft && draft.user_id === userId && draft.status === 'draft', 404, 'DRAFT_NOT_FOUND', '行程草稿不存在');
    const trip = await create(userId, {
      title: payload.title || `${draft.start_name}到${draft.end_name}同路行`, teamName: payload.teamName,
      startName: draft.start_name, startLng: draft.start_lng, startLat: draft.start_lat,
      endName: draft.end_name, endLng: draft.end_lng, endLat: draft.end_lat,
      departAt: draft.depart_at, waypoints: draft.waypoints, route: draft.route,
      days: payload.days || 1, dailyKm: payload.dailyKm || 200, maxCars: payload.maxCars || 4,
      depth: payload.depth || 'medium', plans: payload.plans || [], equipment: payload.equipment || [],
      privacy: payload.privacy || 'public', discoverable: payload.discoverable !== false, note: payload.note || draft.note || ''
    }, draft.route);
    await repository.update('trip_drafts', draft.id, { status: 'converted', converted_trip_id: trip.id, updated_at: common.now() });
    return trip;
  }

  async function runDropoutSweep() {
    const threshold = clock() - 12 * 3600000;
    const trips = await repository.find('trips', { stage: 'driving' });
    const dropped = [];
    for (const trip of trips) {
      const members = await repository.find('trip_members', { trip_id: trip.id, status: 'active', role: 'member' });
      for (const member of members) {
        if (!member.last_location_at || timestamp(member.last_location_at) <= threshold) {
          await removeMember(member, trip, 'dropped', '超过12小时未同步位置');
          dropped.push(member.id);
        }
      }
    }
    return { dropped };
  }

  async function removeMember(member, trip, status, reason) {
    const updated = await repository.transaction(async tx => {
      const row = await tx.update('trip_members', member.id, { status, left_at: common.now(), leave_reason: String(reason).slice(0, 255) });
      const current = await tx.get('trips', trip.id);
      const count = member.role === 'owner' ? Math.max(0, Number(current.current_cars) - 1) : Math.max(1, Number(current.current_cars) - 1);
      await tx.update('trips', trip.id, { current_cars: count, status: current.status === 'full' ? 'recruiting' : current.status, updated_at: common.now() });
      return row;
    });
    const conversation = await repository.findOne('conversation_members', { conversation_type: 'team', conversation_id: trip.id, user_id: member.user_id });
    if (conversation) await repository.update('conversation_members', conversation.id, { left_at: common.now(), unread_count: 0 });
    await common.addMessage({ type: 'team', conversationId: trip.id, senderId: null, messageType: 'system', content: `${(await common.getUser(member.user_id)).nickname} 已离开车队` });
    await common.notify(member.user_id, 'trip_dropout', '已退出车队', reason, { tripId: trip.id }, status === 'dropped' ? 'high' : 'normal');
    try { await providers.im.removeGroupMember(trip.id, member.user_id, reason); } catch (error) {
      if (error.code !== 'IM_NOT_CONFIGURED') throw error;
    }
    return updated;
  }

  async function activeMember(tripId, userId) {
    const member = await repository.findOne('trip_members', { trip_id: tripId, user_id: userId, status: ['active', 'leave_pending'] });
    assert(member, 403, 'TRIP_MEMBER_REQUIRED', '你不是该车队成员');
    return member;
  }

  async function getTrip(tripId) {
    const trip = await repository.get('trips', tripId);
    assert(trip, 404, 'TRIP_NOT_FOUND', '行程不存在');
    return trip;
  }

  async function latestLocation(userId, tripId) {
    return repository.findOne('locations', { user_id: userId, trip_id: tripId }, { orderBy: ['reported_at', 'desc'] });
  }

  async function unreadPrivatePreview(userId, targetUserId) {
    const conversationId = common.privateConversationId(userId, targetUserId);
    const membership = await repository.findOne('conversation_members', {
      conversation_type: 'private', conversation_id: conversationId, user_id: userId, left_at: null
    });
    if (!membership || !Number(membership.unread_count)) return { unreadPrivateCount: 0, latestPrivateMessage: null };
    return {
      unreadPrivateCount: Number(membership.unread_count),
      latestPrivateMessage: await repository.findOne('messages', { conversation_type: 'private', conversation_id: conversationId, deleted_at: null }, { orderBy: ['created_at', 'desc'] })
    };
  }

  async function activeMerchantSessions(merchantId) {
    const products = await repository.find('products', { merchant_id: merchantId, status: 'on' });
    const sessions = [];
    for (const product of products) {
      for (const session of await repository.find('groupbuy_sessions', { product_id: product.id, status: 'forming' })) sessions.push({ ...session, product });
    }
    return sessions;
  }

  async function notifyTeamFollowers(trip, title, content) {
    const followers = await repository.find('follows', { target_type: 'team', target_id: trip.id });
    for (const follow of followers) {
      const settings = await repository.findOne('user_settings', { user_id: follow.follower_id });
      if (settings && settings.allow_team_message === false) continue;
      await common.notify(follow.follower_id, 'followed_team', title, content, { tripId: trip.id });
    }
  }

  async function fetchRoute(payload) {
    const result = await providers.amap.drivingRoute(
      { lng: payload.startLng, lat: payload.startLat },
      { lng: payload.endLng, lat: payload.endLat },
      (payload.waypoints || []).filter(item => item && item.lng != null)
    );
    return amapPolyline(result);
  }

  function validateTripPayload(payload) {
    assert(String(payload.title || '').trim(), 400, 'TRIP_TITLE_REQUIRED', '请填写行程标题');
    validateRoutePoints(payload);
    assert(payload.departAt && timestamp(payload.departAt) > clock(), 400, 'DEPARTURE_TIME_INVALID', '出发时间必须晚于当前时间');
    assert(Number(payload.maxCars || 4) >= 1 && Number(payload.maxCars || 4) <= 20, 400, 'MAX_CARS_INVALID', '同行车数必须为1至20辆');
    assert(Number(payload.days || 1) >= 1, 400, 'TRIP_DAYS_INVALID', '预计天数必须大于0');
  }

  function validateRoutePoints(payload) {
    for (const key of ['startLng', 'startLat', 'endLng', 'endLat']) assert(Number.isFinite(Number(payload[key])), 400, 'TRIP_COORDINATES_REQUIRED', '起点和终点坐标不能为空');
    assert(payload.startName && payload.endName, 400, 'TRIP_POINTS_REQUIRED', '起点和终点不能为空');
  }

  return {
    list, detail, create, update, apply, reviewApplication, leave, reviewLeave, removeByOwner,
    transition, reportLocation, reportPresence, mapSnapshot, drafts, createDraft, draftMatches, convertDraft, runDropoutSweep,
    getTrip, activeMember
  };
}

function tripPoints(trip) {
  return {
    start: { lng: trip.start_lng, lat: trip.start_lat },
    end: { lng: trip.end_lng, lat: trip.end_lat },
    route: trip.route || []
  };
}

function routeDirection(first, second) {
  if (!first) return 'unknown';
  const firstVector = { x: Number(first.end_lng) - Number(first.start_lng), y: Number(first.end_lat) - Number(first.start_lat) };
  const secondVector = { x: Number(second.end_lng) - Number(second.start_lng), y: Number(second.end_lat) - Number(second.start_lat) };
  return firstVector.x * secondVector.x + firstVector.y * secondVector.y >= 0 ? 'same' : 'opposite';
}

function amapPolyline(result) {
  const path = result.route && result.route.paths && result.route.paths[0];
  const encoded = path && (path.polyline || (path.steps || []).map(step => step.polyline).filter(Boolean).join(';'));
  if (!encoded) return [];
  return encoded.split(';').filter(Boolean).map(point => {
    const [lng, lat] = point.split(',').map(Number);
    return { lng, lat };
  });
}

module.exports = { createTripService, amapPolyline };
