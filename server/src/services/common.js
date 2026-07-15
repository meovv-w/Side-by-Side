const { assert } = require('../lib/errors');
const { id } = require('../lib/ids');
const { dateTime } = require('../lib/time');

function createCommonService({ repository, hub, clock = () => Date.now() }) {
  const now = () => dateTime(clock());

  async function getUser(userId) {
    const user = await repository.get('users', userId);
    assert(user, 404, 'USER_NOT_FOUND', '用户不存在');
    return user;
  }

  async function assertCertified(userId) {
    const user = await getUser(userId);
    assert(user.owner_cert_status === 'approved', 403, 'OWNER_CERT_REQUIRED', '完成车主认证后才能使用此功能');
    return user;
  }

  async function notify(userId, type, title, content, data = {}, priority = 'normal') {
    const notification = await repository.insert('notifications', {
      id: id('notification'), user_id: userId, type, title, content, data,
      priority, read_at: null, created_at: now()
    });
    if (hub) await hub.send(userId, { event: 'notification', data: notification });
    return notification;
  }

  async function awardGrowth(userId, ruleKey, reason, refType, refId) {
    const rule = await repository.findOne('growth_rules', { rule_key: ruleKey, enabled: true });
    if (!rule) return null;
    if (refType && refId) {
      const existing = await repository.findOne('growth_logs', { user_id: userId, rule_key: ruleKey, ref_type: refType, ref_id: refId });
      if (existing) return existing;
    }
    const log = await repository.insert('growth_logs', {
      id: id('growth'), user_id: userId, rule_key: ruleKey, delta: Number(rule.points),
      reason, ref_type: refType || null, ref_id: refId || null, created_at: now()
    });
    const user = await repository.increment('users', userId, { growth: Number(rule.points) });
    const level = Math.max(1, Math.min(10, Math.floor(Number(user.growth) / 1500) + 1));
    if (level !== Number(user.level)) await repository.update('users', userId, { level, updated_at: now() });
    await evaluateBadges(userId);
    return log;
  }

  async function evaluateBadges(userId) {
    const user = await getUser(userId);
    const memberships = await repository.find('trip_members', { user_id: userId });
    let completedTrips = 0;
    for (const membership of memberships) {
      const trip = await repository.get('trips', membership.trip_id);
      if (trip && trip.status === 'completed') completedTrips += 1;
    }
    const safetyReports = await repository.count('growth_logs', { user_id: userId, rule_key: 'safety_report' });
    const awarded = [];
    for (const badge of await repository.find('badges', { enabled: true })) {
      if (await repository.findOne('user_badges', { user_id: userId, badge_id: badge.id })) continue;
      const rule = badge.rule || {};
      if (rule.completedTrips != null && completedTrips < Number(rule.completedTrips)) continue;
      if (rule.minCredit != null && Number(user.credit_score) < Number(rule.minCredit)) continue;
      if (rule.safetyReports != null && safetyReports < Number(rule.safetyReports)) continue;
      const award = await repository.insert('user_badges', { id: id('user_badge'), user_id: userId, badge_id: badge.id, awarded_at: now() });
      awarded.push(award);
      await notify(userId, 'badge', '解锁新勋章', `你已获得“${badge.name}”勋章`, { badgeId: badge.id });
    }
    return awarded;
  }

  async function ensureConversationMember(type, conversationId, userId, role = 'member') {
    let member = await repository.findOne('conversation_members', {
      conversation_type: type, conversation_id: conversationId, user_id: userId
    });
    if (member) {
      if (member.left_at) member = await repository.update('conversation_members', member.id, { left_at: null, joined_at: now(), unread_count: 0 });
      return member;
    }
    return repository.insert('conversation_members', {
      id: id('conversation_member'), conversation_type: type, conversation_id: conversationId,
      user_id: userId, role, unread_count: 0, joined_at: now(), left_at: null, last_read_at: null
    });
  }

  async function addMessage({ type, conversationId, senderId, messageType = 'text', content = '', mediaUrl = '', metadata = {} }) {
    const message = await repository.insert('messages', {
      id: id('message'), conversation_type: type, conversation_id: conversationId,
      sender_id: senderId || null, message_type: messageType, content, media_url: mediaUrl,
      metadata, created_at: now(), deleted_at: null
    });
    const members = await repository.find('conversation_members', { conversation_type: type, conversation_id: conversationId, left_at: null });
    for (const member of members) {
      if (member.user_id === senderId) continue;
      await repository.increment('conversation_members', member.id, { unread_count: 1 });
      if (hub) await hub.send(member.user_id, { event: 'message', data: message });
    }
    return message;
  }

  function privateConversationId(first, second) {
    return `private:${[first, second].sort().join(':')}`;
  }

  return { now, getUser, assertCertified, notify, awardGrowth, evaluateBadges, ensureConversationMember, addMessage, privateConversationId };
}

module.exports = { createCommonService };
