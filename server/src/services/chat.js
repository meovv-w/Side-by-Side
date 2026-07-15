const { assert } = require('../lib/errors');
const { id } = require('../lib/ids');
const { distanceMeters } = require('../lib/geo');
const { timestamp } = require('../lib/time');
const { publicUser } = require('./users');

function createChatService({ repository, providers, common, clock = () => Date.now() }) {
  async function conversations(userId, filter = 'all') {
    let memberships = await repository.find('conversation_members', { user_id: userId, left_at: null });
    if (filter !== 'all') memberships = memberships.filter(item => item.conversation_type === filter);
    const items = [];
    for (const membership of memberships) {
      const latest = await repository.findOne('messages', {
        conversation_type: membership.conversation_type, conversation_id: membership.conversation_id, deleted_at: null
      }, { orderBy: ['created_at', 'desc'] });
      const summary = await conversationSummary(membership, userId);
      if (summary) items.push({ ...membership, ...summary, latestMessage: latest });
    }
    items.sort((a, b) => timestamp(b.latestMessage ? b.latestMessage.created_at : b.joined_at) - timestamp(a.latestMessage ? a.latestMessage.created_at : a.joined_at));
    return items;
  }

  async function messages(userId, type, conversationId, before) {
    const membership = await requireConversationMember(type, conversationId, userId);
    let rows = await repository.find('messages', { conversation_type: type, conversation_id: conversationId, deleted_at: null }, { orderBy: ['created_at', 'asc'] });
    if (before) rows = rows.filter(row => timestamp(row.created_at) < timestamp(before));
    rows = rows.slice(-100);
    const result = [];
    for (const row of rows) result.push({ ...row, sender: row.sender_id ? publicUser(await common.getUser(row.sender_id), row.sender_id === userId) : null });
    await repository.update('conversation_members', membership.id, { unread_count: 0, last_read_at: common.now() });
    return result;
  }

  async function sendTeam(userId, tripId, payload) {
    await common.assertCertified(userId);
    const member = await repository.findOne('trip_members', { trip_id: tripId, user_id: userId, status: ['active', 'leave_pending'] });
    assert(member, 403, 'TRIP_CHAT_FORBIDDEN', '你已不在该车队群聊中');
    const trip = await repository.get('trips', tripId);
    assert(trip, 404, 'TRIP_NOT_FOUND', '行程不存在');
    const message = await createMessage('team', tripId, userId, payload);
    await sendImGroup(tripId, userId, message);
    return message;
  }

  async function privateThread(userId, targetUserId) {
    assert(userId !== targetUserId, 400, 'PRIVATE_SELF_INVALID', '不能给自己发私信');
    const target = await common.getUser(targetUserId);
    const conversationId = common.privateConversationId(userId, targetUserId);
    const relation = await privateRelation(userId, targetUserId, conversationId);
    const rows = await repository.find('messages', { conversation_type: 'private', conversation_id: conversationId, deleted_at: null }, { orderBy: ['created_at', 'asc'] });
    const membership = await repository.findOne('conversation_members', { conversation_type: 'private', conversation_id: conversationId, user_id: userId, left_at: null });
    if (membership) await repository.update('conversation_members', membership.id, { unread_count: 0, last_read_at: common.now() });
    return { target: publicUser(target, false), relation, canSend: relation.canSend, remaining: relation.remaining, messages: rows };
  }

  async function sendPrivate(userId, targetUserId, payload) {
    await common.assertCertified(userId);
    assert(userId !== targetUserId, 400, 'PRIVATE_SELF_INVALID', '不能给自己发私信');
    await common.getUser(targetUserId);
    const conversationId = common.privateConversationId(userId, targetUserId);
    const relation = await privateRelation(userId, targetUserId, conversationId);
    assert(relation.canSend, 403, relation.reasonCode, relation.reason);
    await common.ensureConversationMember('private', conversationId, userId);
    await common.ensureConversationMember('private', conversationId, targetUserId);
    const message = await createMessage('private', conversationId, userId, payload);
    try { await providers.im.sendPrivate(userId, targetUserId, imElements(message)); } catch (error) {
      if (error.code !== 'IM_NOT_CONFIGURED') throw error;
    }
    return message;
  }

  async function listTopics(userId, query = {}) {
    const center = query.lng != null ? { lng: Number(query.lng), lat: Number(query.lat) } : null;
    const radius = Math.min(Number(query.radius || 30000), 100000);
    const memberships = await repository.find('poi_topic_members', { user_id: userId });
    const retained = new Set(memberships.filter(item => item.followed || item.participated || item.role === 'creator').map(item => item.topic_id));
    const rows = await repository.find('poi_topics');
    const result = [];
    for (const topic of rows) {
      const distance = center ? distanceMeters(center, topic) : null;
      const visibleOnMap = ['active', 'quiet'].includes(topic.status) && (!center || distance <= radius);
      if (!visibleOnMap && !retained.has(topic.id)) continue;
      result.push({
        ...topic, distanceMeters: Number.isFinite(distance) ? Math.round(distance) : null,
        retained: retained.has(topic.id), participantCount: await repository.count('poi_topic_members', { topic_id: topic.id }),
        latestMessage: await repository.findOne('messages', { conversation_type: 'poi', conversation_id: topic.id, deleted_at: null }, { orderBy: ['created_at', 'desc'] })
      });
    }
    result.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return timestamp(b.last_message_at) - timestamp(a.last_message_at);
    });
    return result;
  }

  async function createTopic(userId, payload) {
    await common.assertCertified(userId);
    assert(String(payload.name || '').trim(), 400, 'TOPIC_NAME_REQUIRED', '请输入地点话题名称');
    assert(Number.isFinite(Number(payload.lng)) && Number.isFinite(Number(payload.lat)), 400, 'TOPIC_LOCATION_REQUIRED', '请选择话题所在位置');
    const topic = await repository.insert('poi_topics', {
      id: id('poi_topic'), creator_id: userId, name: String(payload.name).trim().slice(0, 200),
      location_name: String(payload.locationName || payload.name).trim().slice(0, 500), lng: Number(payload.lng), lat: Number(payload.lat),
      source: payload.source === 'traffic_event' ? 'traffic_event' : 'user', event_id: payload.eventId || null,
      status: 'active', last_message_at: common.now(), archived_at: null, created_at: common.now()
    });
    await repository.insert('poi_topic_members', {
      id: id('poi_member'), topic_id: topic.id, user_id: userId, role: 'creator', followed: false, participated: true, joined_at: common.now()
    });
    await common.ensureConversationMember('poi', topic.id, userId, 'creator');
    return topic;
  }

  async function topicDetail(userId, topicId) {
    const topic = await getTopic(topicId);
    const membership = await repository.findOne('poi_topic_members', { topic_id: topicId, user_id: userId });
    const rows = await repository.find('messages', { conversation_type: 'poi', conversation_id: topicId, deleted_at: null }, { orderBy: ['created_at', 'asc'] });
    return { topic, membership, participantCount: await repository.count('poi_topic_members', { topic_id: topicId }), messages: rows };
  }

  async function followTopic(userId, topicId, enabled) {
    await getTopic(topicId);
    let member = await repository.findOne('poi_topic_members', { topic_id: topicId, user_id: userId });
    if (!member) {
      member = await repository.insert('poi_topic_members', {
        id: id('poi_member'), topic_id: topicId, user_id: userId, role: 'member', followed: Boolean(enabled), participated: false, joined_at: common.now()
      });
    } else member = await repository.update('poi_topic_members', member.id, { followed: Boolean(enabled) });
    if (enabled) await common.ensureConversationMember('poi', topicId, userId);
    else if (!member.participated && member.role !== 'creator') {
      const conversation = await repository.findOne('conversation_members', { conversation_type: 'poi', conversation_id: topicId, user_id: userId });
      if (conversation) await repository.update('conversation_members', conversation.id, { left_at: common.now(), unread_count: 0 });
    }
    return member;
  }

  async function sendTopic(userId, topicId, payload) {
    await common.assertCertified(userId);
    const topic = await getTopic(topicId);
    assert(topic.status !== 'removed', 403, 'TOPIC_REMOVED', '该话题已被运营下架');
    let member = await repository.findOne('poi_topic_members', { topic_id: topicId, user_id: userId });
    if (!member) {
      member = await repository.insert('poi_topic_members', {
        id: id('poi_member'), topic_id: topicId, user_id: userId, role: 'member', followed: false, participated: true, joined_at: common.now()
      });
    } else if (!member.participated) member = await repository.update('poi_topic_members', member.id, { participated: true });
    await common.ensureConversationMember('poi', topicId, userId, member.role);
    const message = await createMessage('poi', topicId, userId, payload);
    await repository.update('poi_topics', topicId, { status: 'active', last_message_at: common.now(), archived_at: null });
    await sendImGroup(`poi_${topicId}`, userId, message);
    return message;
  }

  async function forwardTraffic(userId, eventId, tripId) {
    const event = await repository.get('traffic_events', eventId);
    assert(event && event.status === 'active', 404, 'TRAFFIC_EVENT_NOT_FOUND', '路况事件不存在');
    return sendTeam(userId, tripId, {
      type: 'traffic', content: `${event.title}：${event.description}`,
      metadata: { eventId: event.id, lng: event.lng, lat: event.lat, severity: event.severity }
    });
  }

  async function archiveInactiveTopics() {
    const cutoff = clock() - 24 * 3600000;
    const topics = await repository.find('poi_topics', { status: ['active', 'quiet'] });
    const archived = [];
    for (const topic of topics) {
      const inactiveSince = timestamp(topic.last_message_at);
      if (inactiveSince <= cutoff) {
        await repository.update('poi_topics', topic.id, { status: 'archived', archived_at: common.now() });
        archived.push(topic.id);
      } else if (inactiveSince <= clock() - 2 * 3600000 && topic.status === 'active') {
        await repository.update('poi_topics', topic.id, { status: 'quiet' });
      }
    }
    return { archived };
  }

  async function createTrafficTopics() {
    const events = await repository.find('traffic_events', { topic_id: null, status: 'active' });
    const created = [];
    for (const event of events) {
      const topic = await repository.insert('poi_topics', {
        id: id('poi_topic'), creator_id: null, name: event.title, location_name: event.description,
        lng: event.lng, lat: event.lat, source: 'traffic_event', event_id: event.id,
        status: 'active', last_message_at: common.now(), archived_at: null, created_at: common.now()
      });
      await repository.update('traffic_events', event.id, { topic_id: topic.id });
      await common.addMessage({ type: 'poi', conversationId: topic.id, senderId: null, messageType: 'traffic', content: `${event.title}：${event.description}`, metadata: { eventId: event.id } });
      created.push(topic.id);
    }
    return { created };
  }

  async function privateRelation(from, to, conversationId) {
    const blockedBySelf = await repository.findOne('blocks', { user_id: from, target_user_id: to });
    const blockedByTarget = await repository.findOne('blocks', { user_id: to, target_user_id: from });
    if (blockedBySelf || blockedByTarget) return { type: 'blocked', canSend: false, remaining: 0, reasonCode: 'PRIVATE_BLOCKED', reason: '当前无法向该用户发送私信' };
    const teammate = await areTeammates(from, to);
    if (teammate) return { type: 'teammate', canSend: true, remaining: null };
    const follows = await repository.findOne('follows', { follower_id: from, target_type: 'user', target_id: to });
    const followsBack = await repository.findOne('follows', { follower_id: to, target_type: 'user', target_id: from });
    if (follows && followsBack) return { type: 'mutual', canSend: true, remaining: null };
    const messages = await repository.find('messages', { conversation_type: 'private', conversation_id: conversationId, deleted_at: null });
    const sentByCurrent = messages.some(item => item.sender_id === from);
    const sentByTarget = messages.some(item => item.sender_id === to);
    if (sentByCurrent && sentByTarget) return { type: 'replied', canSend: true, remaining: null };
    if (!follows && sentByTarget) return { type: 'incoming', canSend: true, remaining: 1 };
    const targetReplied = messages.some(item => item.sender_id === to);
    if (follows && targetReplied) return { type: 'replied', canSend: true, remaining: null };
    if (follows) {
      const sent = messages.filter(item => item.sender_id === from).length;
      const remaining = Math.max(0, 3 - sent);
      return { type: 'following', canSend: remaining > 0, remaining, reasonCode: 'PRIVATE_LIMIT_REACHED', reason: '对方回复前最多发送3条消息' };
    }
    return { type: 'stranger', canSend: false, remaining: 0, reasonCode: 'FOLLOW_REQUIRED', reason: '关注后可发消息' };
  }

  async function areTeammates(first, second) {
    const firstMemberships = await repository.find('trip_members', { user_id: first, status: ['active', 'leave_pending'] });
    for (const membership of firstMemberships) {
      if (await repository.findOne('trip_members', { trip_id: membership.trip_id, user_id: second, status: ['active', 'leave_pending'] })) return true;
    }
    return false;
  }

  async function createMessage(type, conversationId, senderId, payload) {
    const messageType = payload.type || 'text';
    assert(['text', 'image', 'voice', 'location', 'groupbuy', 'system', 'traffic'].includes(messageType), 400, 'MESSAGE_TYPE_INVALID', '消息类型不支持');
    const content = String(payload.content || '').trim();
    assert(content || payload.mediaUrl, 400, 'MESSAGE_EMPTY', '消息不能为空');
    return common.addMessage({ type, conversationId, senderId, messageType, content, mediaUrl: payload.mediaUrl || '', metadata: payload.metadata || {} });
  }

  async function conversationSummary(member, userId) {
    if (member.conversation_type === 'team') {
      const trip = await repository.get('trips', member.conversation_id);
      if (!trip) return null;
      return { title: trip.team_name, status: trip.stage, targetId: trip.id, memberCount: await repository.count('trip_members', { trip_id: trip.id, status: 'active' }) };
    }
    if (member.conversation_type === 'poi') {
      const topic = await repository.get('poi_topics', member.conversation_id);
      if (!topic) return null;
      return { title: topic.name, status: topic.status, targetId: topic.id, memberCount: await repository.count('poi_topic_members', { topic_id: topic.id }) };
    }
    const ids = member.conversation_id.replace(/^private:/, '').split(':');
    const targetId = ids.find(value => value !== userId);
    const target = targetId ? await repository.get('users', targetId) : null;
    return target ? { title: target.nickname, status: 'private', targetId, target: publicUser(target, false) } : null;
  }

  async function requireConversationMember(type, conversationId, userId) {
    const member = await repository.findOne('conversation_members', { conversation_type: type, conversation_id: conversationId, user_id: userId, left_at: null });
    assert(member, 403, 'CONVERSATION_FORBIDDEN', '你无权查看该会话');
    return member;
  }

  async function getTopic(topicId) {
    const topic = await repository.get('poi_topics', topicId);
    assert(topic, 404, 'TOPIC_NOT_FOUND', '地点话题不存在');
    return topic;
  }

  async function sendImGroup(groupId, senderId, message) {
    try { await providers.im.sendGroup(groupId, senderId, imElements(message)); } catch (error) {
      if (error.code !== 'IM_NOT_CONFIGURED') throw error;
    }
  }

  return {
    conversations, messages, sendTeam, privateThread, sendPrivate, listTopics, createTopic,
    topicDetail, followTopic, sendTopic, forwardTraffic, archiveInactiveTopics, createTrafficTopics,
    privateRelation
  };
}

function imElements(message) {
  if (message.message_type === 'text') return [{ MsgType: 'TIMTextElem', MsgContent: { Text: message.content } }];
  return [{ MsgType: 'TIMCustomElem', MsgContent: { Data: JSON.stringify({ type: message.message_type, content: message.content, mediaUrl: message.media_url, metadata: message.metadata }) } }];
}

module.exports = { createChatService };
