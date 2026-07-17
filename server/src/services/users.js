const crypto = require('crypto');
const QRCode = require('qrcode');
const { assert } = require('../lib/errors');
const { id } = require('../lib/ids');
const { addTime, timestamp } = require('../lib/time');
const { pick } = require('../lib/format');
const { distanceMeters, validCoordinate } = require('../lib/geo');

function createUserService({ repository, cache, providers, config, common, clock = () => Date.now() }) {
  async function profile(userId, viewerId = userId) {
    const user = await common.getUser(userId);
    const [badges, followers, following, memberships, locations] = await Promise.all([
      userBadges(userId),
      repository.count('follows', { target_type: 'user', target_id: userId }),
      repository.count('follows', { follower_id: userId }),
      repository.find('trip_members', { user_id: userId }),
      repository.find('locations', { user_id: userId }, { orderBy: ['reported_at', 'asc'] })
    ]);
    const completedTrips = [];
    const visibleTrips = [];
    const teammateIds = new Set();
    for (const membership of memberships) {
      const trip = await repository.get('trips', membership.trip_id);
      if (!trip) continue;
      if (trip.status === 'completed') completedTrips.push(trip);
      if (viewerId === userId || trip.privacy === 'public') visibleTrips.push(trip);
      for (const teammate of await repository.find('trip_members', { trip_id: trip.id })) if (teammate.user_id !== userId) teammateIds.add(teammate.user_id);
    }
    let distance = 0;
    for (let index = 1; index < locations.length; index += 1) {
      if (locations[index - 1].trip_id !== locations[index].trip_id) continue;
      const segment = distanceMeters(locations[index - 1], locations[index]);
      if (segment <= 500000) distance += segment;
    }
    const relation = viewerId === userId ? 'self' : await relationFor(viewerId, userId);
    const trajectoryTripIds = new Set(visibleTrips.filter(trip => trip.status === 'completed').map(trip => trip.id));
    const trajectory = locations
      .filter(location => location.trip_id && trajectoryTripIds.has(location.trip_id) && validCoordinate(location))
      .map(location => ({ trip_id: location.trip_id, lng: Number(location.lng), lat: Number(location.lat), reported_at: location.reported_at }));
    return {
      ...publicUser(user, viewerId === userId), badges, followers, following,
      completedTripCount: completedTrips.length, companionCount: completedTrips.length,
      teamCount: teammateIds.size, distanceKm: Math.round(distance / 1000), relation, trajectory,
      trips: visibleTrips.sort((a, b) => timestamp(b.depart_at) - timestamp(a.depart_at)).slice(0, 20)
    };
  }

  async function home(userId) {
    const memberships = await repository.find('trip_members', { user_id: userId, status: ['active', 'leave_pending'] });
    let currentTrip = null;
    for (const membership of memberships) {
      const trip = await repository.get('trips', membership.trip_id);
      if (trip && ['recruiting', 'full', 'started'].includes(trip.status)) { currentTrip = trip; break; }
    }
    const [user, settings, conversations, orders, coupons, notifications] = await Promise.all([
      profile(userId),
      repository.findOne('user_settings', { user_id: userId }),
      repository.find('conversation_members', { user_id: userId, left_at: null }),
      repository.find('orders', { user_id: userId }),
      repository.find('user_coupons', { user_id: userId, status: 'unused' }),
      repository.find('notifications', { user_id: userId, read_at: null })
    ]);
    return {
      user, settings, currentTrip,
      stats: {
        joinedTripCount: memberships.length,
        orderCount: orders.length,
        couponCount: coupons.length,
        unreadCount: conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0) + notifications.length,
        mapUnreadCount: conversations.filter(item => item.conversation_type === 'team').reduce((sum, item) => sum + Number(item.unread_count || 0), 0)
          + notifications.filter(item => item.priority === 'high' || ['emergency', 'safety_report'].includes(item.type)).length
      }
    };
  }

  async function updateProfile(userId, payload) {
    const changes = pick(payload, ['nickname', 'avatar', 'vehicle_model', 'vehicle_no', 'bio', 'discoverable']);
    if (changes.nickname !== undefined) {
      changes.nickname = String(changes.nickname).trim().slice(0, 80);
      assert(changes.nickname, 400, 'NICKNAME_REQUIRED', '昵称不能为空');
    }
    if (changes.avatar !== undefined) {
      changes.avatar = String(changes.avatar || '').trim();
      assert(changes.avatar.length <= 1024, 400, 'AVATAR_URL_TOO_LONG', '头像地址过长');
    }
    if (changes.vehicle_model !== undefined) changes.vehicle_model = String(changes.vehicle_model || '').trim().slice(0, 120);
    if (changes.vehicle_no !== undefined) changes.vehicle_no = String(changes.vehicle_no || '').trim().slice(0, 32);
    if (changes.bio !== undefined) changes.bio = String(changes.bio).slice(0, 500);
    if (changes.discoverable !== undefined) changes.discoverable = Boolean(changes.discoverable);
    changes.updated_at = common.now();
    return repository.update('users', userId, changes);
  }

  async function settings(userId) {
    return repository.findOne('user_settings', { user_id: userId });
  }

  async function updateSettings(userId, payload) {
    const row = await settings(userId);
    assert(row, 404, 'SETTINGS_NOT_FOUND', '用户设置不存在');
    const changes = pick(payload, ['allow_team_message', 'allow_marketing', 'share_location', 'sentinel_mode', 'emergency_name', 'emergency_phone']);
    for (const key of ['allow_team_message', 'allow_marketing', 'share_location', 'sentinel_mode']) if (changes[key] !== undefined) changes[key] = Boolean(changes[key]);
    if (changes.emergency_name !== undefined) changes.emergency_name = String(changes.emergency_name || '').trim().slice(0, 80);
    if (changes.emergency_phone !== undefined) {
      changes.emergency_phone = String(changes.emergency_phone || '').trim();
      assert(!changes.emergency_phone || /^1\d{10}$/.test(changes.emergency_phone), 400, 'EMERGENCY_PHONE_INVALID', '紧急联系人手机号格式不正确');
    }
    changes.updated_at = common.now();
    return repository.update('user_settings', row.id, changes);
  }

  async function certification(userId) {
    return repository.findOne('vehicle_certifications', { user_id: userId }, { orderBy: ['created_at', 'desc'] });
  }

  async function startCertification(userId, licensePhoto) {
    assert(String(licensePhoto || '').trim(), 400, 'LICENSE_PHOTO_REQUIRED', '请先上传行驶证照片');
    assert(String(licensePhoto).length <= 1024, 400, 'LICENSE_PHOTO_URL_TOO_LONG', '行驶证图片地址过长');
    const existing = await certification(userId);
    assert(!existing || existing.status !== 'pending', 409, 'CERTIFICATION_PENDING', '已有认证资料正在审核，请勿重复提交');
    const ocr = await providers.identity.ocrVehicleLicense(licensePhoto);
    const callbackToken = crypto.randomBytes(24).toString('hex');
    const session = { licensePhoto, ocr, callbackToken, livenessToken: null, livenessCallback: null, createdAt: common.now() };
    await cache.setex(`certification:${userId}`, 1800, JSON.stringify(session));
    await cache.setex(`certification-callback:${callbackToken}`, 1800, userId);
    let liveness;
    try {
      const callbackUrl = `${config.publicBaseUrl.replace(/\/$/, '')}/api/certifications/liveness/callback?token=${callbackToken}`;
      liveness = await providers.identity.createLivenessSession(userId, callbackUrl);
    } catch (error) {
      await cache.del(`certification:${userId}`);
      await cache.del(`certification-callback:${callbackToken}`);
      throw error;
    }
    const latestRaw = await cache.get(`certification:${userId}`);
    const latest = latestRaw ? JSON.parse(latestRaw) : session;
    await cache.setex(`certification:${userId}`, 1800, JSON.stringify({ ...latest, livenessToken: liveness.token }));
    return { ocr, liveness };
  }

  async function applyLivenessCallback(callbackToken, payload = {}) {
    const userId = await cache.get(`certification-callback:${String(callbackToken || '')}`);
    assert(userId, 400, 'LIVENESS_CALLBACK_INVALID', '活体检测回调令牌无效或已过期');
    const raw = await cache.get(`certification:${userId}`);
    assert(raw, 400, 'CERTIFICATION_SESSION_EXPIRED', '认证会话已过期');
    const session = JSON.parse(raw);
    const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
    const providerToken = data.token || data.sessionToken || data.bizToken;
    assert(!session.livenessToken || !providerToken || providerToken === session.livenessToken, 400, 'LIVENESS_TOKEN_MISMATCH', '活体检测凭证不匹配');
    const status = String(data.status || data.result || '').toLowerCase();
    const passed = data.passed === true || ['passed', 'success', 'approved'].includes(status);
    const resolved = typeof data.passed === 'boolean' || ['passed', 'success', 'approved', 'failed', 'rejected', 'denied'].includes(status);
    const normalized = { ...data, passed, resolved, receivedAt: common.now() };
    await cache.setex(`certification:${userId}`, 1800, JSON.stringify({ ...session, livenessCallback: normalized }));
    return { received: true };
  }

  async function certificationSessionStatus(userId) {
    const raw = await cache.get(`certification:${userId}`);
    assert(raw, 400, 'CERTIFICATION_SESSION_EXPIRED', '认证会话已过期，请重新上传行驶证');
    const session = JSON.parse(raw);
    const liveness = session.livenessCallback && session.livenessCallback.resolved
      ? session.livenessCallback
      : await providers.identity.queryLiveness(session.livenessToken);
    return { passed: liveness.passed === true || liveness.status === 'passed', liveness };
  }

  async function submitCertification(userId, payload) {
    const raw = await cache.get(`certification:${userId}`);
    assert(raw, 400, 'CERTIFICATION_SESSION_EXPIRED', '认证会话已过期，请重新上传行驶证');
    const session = JSON.parse(raw);
    const liveness = session.livenessCallback && session.livenessCallback.resolved
      ? session.livenessCallback
      : await providers.identity.queryLiveness(session.livenessToken);
    assert(liveness.passed === true || liveness.status === 'passed', 400, 'LIVENESS_NOT_PASSED', '活体检测未通过');
    const ocrPlate = session.ocr.plate || session.ocr.vehicleNo || session.ocr.number;
    if (ocrPlate && payload.plate) assert(ocrPlate === payload.plate, 400, 'PLATE_MISMATCH', '填写的车牌号与行驶证识别结果不一致');
    const realName = String(payload.realName || '').trim();
    const plate = String(payload.plate || ocrPlate || '').trim();
    const vehicleModel = String(payload.vehicleModel || session.ocr.vehicleModel || '').trim();
    assert(realName && plate && vehicleModel, 400, 'CERTIFICATION_FIELDS_REQUIRED', '姓名、车牌号和车型不能为空');
    assert(realName.length <= 80 && plate.length <= 32 && vehicleModel.length <= 120, 400, 'CERTIFICATION_FIELDS_TOO_LONG', '认证资料字段过长');
    const row = await repository.insert('vehicle_certifications', {
      id: id('certification'), user_id: userId, real_name: realName,
      plate, vehicle_model: vehicleModel,
      license_photo: session.licensePhoto, ocr_result: session.ocr, liveness_token: session.livenessToken,
      liveness_result: liveness, status: 'pending', reject_reason: '', reviewed_by: null,
      created_at: common.now(), reviewed_at: null
    });
    await repository.update('users', userId, { owner_cert_status: 'pending', updated_at: common.now() });
    await cache.del(`certification:${userId}`);
    if (session.callbackToken) await cache.del(`certification-callback:${session.callbackToken}`);
    return row;
  }

  async function createInviteShare(userId, token, sourceRef, source = 'link') {
    const user = await common.getUser(userId);
    const normalizedSource = ['qrcode', 'merchant'].includes(source) ? source : 'link';
    const url = `${config.publicBaseUrl.replace(/\/$/, '')}/invite?token=${encodeURIComponent(token)}`;
    await repository.insert('invite_links', {
      id: id('invite_link'), inviter_id: userId, scene: sourceRef, source: normalizedSource,
      expires_at: addTime(clock(), 30, 'days'), created_at: common.now()
    });
    const miniCode = await providers.wechatAuth.createMiniProgramCode({ scene: sourceRef, page: 'pages/login/login' });
    return {
      inviteCode: user.invite_code, sourceRef, url,
      miniProgramPath: `/pages/login/login?inviteToken=${encodeURIComponent(token)}`,
      qrCode: miniCode || await QRCode.toDataURL(url, { width: 480, margin: 2 })
    };
  }

  async function inviteSummary(userId) {
    const records = await repository.find('invites', { inviter_id: userId }, { orderBy: ['bound_at', 'desc'] });
    const rewardSetting = await repository.findOne('system_settings', { setting_key: 'invite_rewards' });
    const items = [];
    for (const record of records) items.push({ ...record, invitee: publicUser(await common.getUser(record.invitee_id), false) });
    return {
      items,
      rewardTiers: rewardSetting && Array.isArray(rewardSetting.value && rewardSetting.value.tiers)
        ? rewardSetting.value.tiers
        : [],
      stats: {
        registered: records.length,
        firstOrders: records.filter(item => ['first_order', 'rewarded'].includes(item.status)).length,
        rewarded: records.filter(item => item.reward_status === 'issued').length
      }
    };
  }

  async function bindInviterByPhone(userId, phone) {
    const user = await common.getUser(userId);
    assert(timestamp(user.created_at) + 7 * 86400000 >= clock(), 400, 'INVITE_BINDING_EXPIRED', '注册超过 7 天，无法补绑邀请关系');
    assert(!(await repository.findOne('invites', { invitee_id: userId })), 409, 'INVITE_ALREADY_BOUND', '邀请关系已经绑定，不能修改');
    const inviter = await repository.findOne('users', { phone: String(phone || '') });
    assert(inviter && inviter.id !== userId, 404, 'INVITER_NOT_FOUND', '未找到可绑定的邀请人');
    const record = await repository.insert('invites', {
      id: id('invite'), inviter_id: inviter.id, invitee_id: userId, source: 'phone_fallback',
      source_ref: phone, status: 'registered', bound_at: common.now(), first_order_at: null,
      reward_status: 'pending', reward_value: 0
    });
    await repository.update('users', userId, { invited_by: inviter.id, updated_at: common.now() });
    await common.awardGrowth(inviter.id, 'invite_register', '邀请新用户注册', 'user', userId);
    return record;
  }

  async function coupons(userId) {
    const rows = await repository.find('user_coupons', { user_id: userId }, { orderBy: ['issued_at', 'desc'] });
    const result = [];
    for (const row of rows) result.push({
      ...row,
      coupon: await repository.get('coupons', row.coupon_id),
      verify_qr_code: row.verify_code && row.status === 'unused'
        ? await QRCode.toDataURL(`TDCOUPON:${row.verify_code}`, { width: 320, margin: 1 })
        : ''
    });
    return result;
  }

  async function userBadges(userId) {
    const awards = await repository.find('user_badges', { user_id: userId });
    const result = [];
    for (const award of awards) result.push({ ...award, badge: await repository.get('badges', award.badge_id) });
    return result;
  }

  async function badgeWall(userId) {
    await common.evaluateBadges(userId);
    const awards = await repository.find('user_badges', { user_id: userId });
    const awardByBadge = new Map(awards.map(item => [item.badge_id, item]));
    return (await repository.find('badges', { enabled: true }, { orderBy: ['created_at', 'asc'] })).map(badge => ({
      ...badge, owned: awardByBadge.has(badge.id), awarded_at: awardByBadge.get(badge.id) && awardByBadge.get(badge.id).awarded_at
    }));
  }

  async function growthLogs(userId) {
    return repository.find('growth_logs', { user_id: userId }, { orderBy: ['created_at', 'desc'], limit: 100 });
  }

  async function toggleFollow(userId, targetType, targetId, enabled) {
    await common.assertCertified(userId);
    assert(['user', 'team'].includes(targetType), 400, 'FOLLOW_TYPE_INVALID', '关注类型不正确');
    if (targetType === 'user') assert(targetId !== userId, 400, 'CANNOT_FOLLOW_SELF', '不能关注自己');
    const target = await repository.get(targetType === 'user' ? 'users' : 'trips', targetId);
    assert(target, 404, targetType === 'user' ? 'USER_NOT_FOUND' : 'TRIP_NOT_FOUND', targetType === 'user' ? '用户不存在' : '车队不存在');
    if (targetType === 'user' && enabled) {
      const blocked = await repository.findOne('blocks', { user_id: userId, target_user_id: targetId })
        || await repository.findOne('blocks', { user_id: targetId, target_user_id: userId });
      assert(!blocked, 409, 'FOLLOW_BLOCKED_USER', '拉黑关系解除后才能关注该用户');
    }
    const existing = await repository.findOne('follows', { follower_id: userId, target_type: targetType, target_id: targetId });
    if (!enabled && existing) await repository.delete('follows', existing.id);
    if (enabled && !existing) return repository.insert('follows', { id: id('follow'), follower_id: userId, target_type: targetType, target_id: targetId, created_at: common.now() });
    return enabled ? existing : null;
  }

  async function setBlocked(userId, targetUserId, blocked) {
    assert(targetUserId !== userId, 400, 'CANNOT_BLOCK_SELF', '不能拉黑自己');
    assert(await repository.get('users', targetUserId), 404, 'USER_NOT_FOUND', '用户不存在');
    const existing = await repository.findOne('blocks', { user_id: userId, target_user_id: targetUserId });
    if (blocked) {
      const row = existing || await repository.insert('blocks', { id: id('block'), user_id: userId, target_user_id: targetUserId, created_at: common.now() });
      for (const follow of await repository.find('follows', { target_type: 'user' })) {
        if (follow.follower_id === userId && follow.target_id === targetUserId || follow.follower_id === targetUserId && follow.target_id === userId) {
          await repository.delete('follows', follow.id);
        }
      }
      return row;
    }
    if (!blocked && existing) await repository.delete('blocks', existing.id);
    return blocked ? existing : null;
  }

  async function social(userId) {
    const [following, followers, blocked] = await Promise.all([
      repository.find('follows', { follower_id: userId }),
      repository.find('follows', { target_type: 'user', target_id: userId }),
      repository.find('blocks', { user_id: userId })
    ]);
    return { following, followers, blocked };
  }

  async function createTicket(userId, payload) {
    assert(String(payload.title || '').trim(), 400, 'TICKET_TITLE_REQUIRED', '请填写问题标题');
    const targetType = payload.targetType || null;
    const targetId = payload.targetId || null;
    assert(!targetType || ['order', 'user', 'poi_topic'].includes(targetType), 400, 'TICKET_TARGET_INVALID', '工单关联对象类型不正确');
    assert(!targetType || targetId, 400, 'TICKET_TARGET_REQUIRED', '工单关联对象不能为空');
    const orderId = payload.orderId || (targetType === 'order' ? targetId : null);
    if (orderId) {
      const order = await repository.get('orders', orderId);
      assert(order && order.user_id === userId, 404, 'ORDER_NOT_FOUND', '订单不存在');
    }
    if (targetType === 'user') assert(await repository.get('users', targetId), 404, 'USER_NOT_FOUND', '被投诉用户不存在');
    if (targetType === 'poi_topic') {
      assert(await repository.get('poi_topics', targetId), 404, 'TOPIC_NOT_FOUND', '地点话题不存在');
      if (payload.messageId) {
        const message = await repository.get('messages', payload.messageId);
        assert(message && message.conversation_type === 'poi' && message.conversation_id === targetId, 404, 'MESSAGE_NOT_FOUND', '举报消息不存在');
      }
    }
    assert(!payload.messageId || targetType === 'poi_topic', 400, 'TICKET_MESSAGE_TARGET_INVALID', '消息举报必须关联地点话题');
    const ticket = await repository.insert('support_tickets', {
      id: id('ticket'), user_id: userId, order_id: orderId,
      target_type: targetType, target_id: targetId, message_id: payload.messageId || null,
      category: String(payload.category || '其他').slice(0, 80), title: String(payload.title || '').trim().slice(0, 200),
      status: 'open', priority: payload.priority || 'normal', assigned_to: null,
      created_at: common.now(), updated_at: common.now(), closed_at: null
    });
    if (payload.content) await addTicketMessage(ticket.id, 'user', userId, payload.content, payload.mediaUrls || []);
    const autoReply = await repository.findOne('system_settings', { setting_key: 'support_auto_reply' });
    if (autoReply && autoReply.value.enabled) await addTicketMessage(ticket.id, 'system', null, autoReply.value.text, []);
    return ticket;
  }

  async function addTicketMessage(ticketId, senderType, senderId, content, mediaUrls = []) {
    assert(String(content || '').trim(), 400, 'MESSAGE_REQUIRED', '回复内容不能为空');
    return repository.insert('support_messages', {
      id: id('support_message'), ticket_id: ticketId, sender_type: senderType, sender_id: senderId,
      content: String(content).trim(), media_urls: mediaUrls, created_at: common.now()
    });
  }

  async function tickets(userId) {
    return repository.find('support_tickets', { user_id: userId }, { orderBy: ['updated_at', 'desc'] });
  }

  async function ticketDetail(userId, ticketId) {
    const ticket = await repository.get('support_tickets', ticketId);
    assert(ticket && ticket.user_id === userId, 404, 'TICKET_NOT_FOUND', '工单不存在');
    return { ticket, messages: await repository.find('support_messages', { ticket_id: ticketId }, { orderBy: ['created_at', 'asc'] }) };
  }

  async function replyTicket(userId, ticketId, content, mediaUrls = []) {
    const { ticket } = await ticketDetail(userId, ticketId);
    const message = await addTicketMessage(ticket.id, 'user', userId, content, mediaUrls);
    await repository.update('support_tickets', ticket.id, {
      status: 'open', updated_at: common.now(), closed_at: null
    });
    return message;
  }

  async function emergency(userId, payload) {
    assert(validCoordinate(payload), 400, 'LOCATION_REQUIRED', 'SOS 必须携带有效当前位置');
    if (payload.tripId) assert(
      await repository.findOne('trip_members', { trip_id: payload.tripId, user_id: userId, status: ['active', 'leave_pending'] }),
      403, 'TRIP_MEMBER_REQUIRED', '只有车队成员可以向该车队发出 SOS'
    );
    const event = await repository.insert('emergency_events', {
      id: id('emergency'), user_id: userId, trip_id: payload.tripId || null,
      lng: Number(payload.lng), lat: Number(payload.lat), status: 'triggered',
      contacts_notified: false, team_notified: false, created_at: common.now(), resolved_at: null
    });
    if (payload.tripId) {
      await common.addMessage({ type: 'team', conversationId: payload.tripId, senderId: null, messageType: 'system', content: '紧急提醒：有队员触发 SOS，请立即确认其位置。', metadata: { emergencyId: event.id, lng: event.lng, lat: event.lat } });
      const members = await repository.find('trip_members', { trip_id: payload.tripId, status: ['active', 'leave_pending'] });
      const sourceUser = await common.getUser(userId);
      for (const member of members) if (member.user_id !== userId) await common.notify(
        member.user_id, 'emergency', '车队成员触发 SOS', `${sourceUser.nickname}正在紧急求助，请立即确认位置。`,
        { emergencyId: event.id, tripId: payload.tripId, lng: event.lng, lat: event.lat }, 'high'
      );
      await repository.update('emergency_events', event.id, { team_notified: true });
    }
    let contactDeliveryError = null;
    const userSettings = await settings(userId);
    if (userSettings && userSettings.emergency_phone) {
      try {
        const user = await common.getUser(userId);
        await providers.sms.sendEmergency(userSettings.emergency_phone, user.nickname, `${event.lng},${event.lat}`);
        await repository.update('emergency_events', event.id, { contacts_notified: true });
      } catch (error) {
        contactDeliveryError = { code: error.code || 'EMERGENCY_SMS_FAILED', message: error.message };
      }
    } else contactDeliveryError = { code: 'EMERGENCY_CONTACT_MISSING', message: '尚未设置紧急联系人手机号' };
    return { ...(await repository.get('emergency_events', event.id)), contact_delivery_error: contactDeliveryError };
  }

  async function reportSafety(userId, payload) {
    await common.assertCertified(userId);
    const types = {
      accident: ['交通事故', 3], closure: ['道路封闭', 3], construction: ['道路施工', 2], hazard: ['道路风险', 2]
    };
    const selected = types[payload.eventType];
    assert(selected, 400, 'SAFETY_EVENT_TYPE_INVALID', '请选择正确的路况类型');
    assert(validCoordinate(payload), 400, 'LOCATION_REQUIRED', '安全上报必须携带有效当前位置');
    const description = String(payload.description || '').trim();
    assert(description, 400, 'SAFETY_DESCRIPTION_REQUIRED', '请填写现场情况');
    const event = await repository.insert('traffic_events', {
      id: id('traffic'), provider_id: null, source: 'user', reporter_id: userId,
      event_type: payload.eventType, title: selected[0], description: description.slice(0, 1000),
      lng: Number(payload.lng), lat: Number(payload.lat), severity: selected[1], starts_at: common.now(),
      ends_at: addTime(clock(), 12, 'hours'), status: 'pending', reviewed_by: null,
      review_reason: '', reviewed_at: null, topic_id: null, created_at: common.now()
    });
    if (payload.tripId) {
      const member = await repository.findOne('trip_members', { trip_id: payload.tripId, user_id: userId, status: 'active' });
      if (member) await common.addMessage({
        type: 'team', conversationId: payload.tripId, senderId: userId, messageType: 'traffic',
        content: `待核实路况：${event.title}，${event.description}`,
        metadata: { eventId: event.id, lng: event.lng, lat: event.lat, status: 'pending' }
      });
    }
    await common.notify(userId, 'safety_report', '安全上报已提交', '运营确认后会同步到地图，并发放同路值。', { eventId: event.id });
    return event;
  }

  async function notifications(userId) {
    return repository.find('notifications', { user_id: userId }, { orderBy: ['created_at', 'desc'] });
  }

  async function markNotificationRead(userId, notificationId) {
    const item = await repository.get('notifications', notificationId);
    assert(item && item.user_id === userId, 404, 'NOTIFICATION_NOT_FOUND', '通知不存在');
    return repository.update('notifications', item.id, { read_at: common.now() });
  }

  async function relationFor(from, to) {
    const outbound = await repository.findOne('follows', { follower_id: from, target_type: 'user', target_id: to });
    const inbound = await repository.findOne('follows', { follower_id: to, target_type: 'user', target_id: from });
    if (outbound && inbound) return 'mutual';
    if (outbound) return 'following';
    return 'stranger';
  }

  return {
    profile, home, updateProfile, settings, updateSettings, certification, startCertification, applyLivenessCallback, certificationSessionStatus,
    submitCertification, createInviteShare, inviteSummary, bindInviterByPhone, coupons, userBadges, badgeWall, growthLogs,
    toggleFollow, setBlocked, social, createTicket, addTicketMessage, tickets, ticketDetail, replyTicket,
    emergency, reportSafety, notifications, markNotificationRead, relationFor
  };
}

function publicUser(user, self) {
  const value = pick(user, ['id', 'nickname', 'avatar', 'role', 'owner_cert_status', 'vehicle_model', 'bio', 'growth', 'level', 'credit_score', 'discoverable', 'created_at']);
  if (self) Object.assign(value, pick(user, ['phone', 'vehicle_no', 'invite_code', 'invited_by', 'last_login_at']));
  return value;
}

module.exports = { createUserService, publicUser };
