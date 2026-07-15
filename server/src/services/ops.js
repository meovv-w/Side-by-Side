const { assert } = require('../lib/errors');
const { id } = require('../lib/ids');
const { addTime } = require('../lib/time');
const { merchantView, publicMerchant } = require('./merchant');

function createOpsService({ repository, providers, common, commerce }) {
  async function dashboard() {
    const [users, merchants, sessions, orders, refunds, certs, tickets, settlements, couponRedemptions, trafficEvents] = await Promise.all([
      repository.find('users'), repository.find('merchants'), repository.find('groupbuy_sessions'),
      repository.find('orders'), repository.find('refunds'), repository.find('vehicle_certifications'),
      repository.find('support_tickets'), repository.find('settlements'), repository.find('coupon_redemptions'), repository.find('traffic_events')
    ]);
    const paidOrders = orders.filter(item => ['paid', 'verified', 'refund_pending'].includes(item.status));
    const successful = sessions.filter(item => item.status === 'success').length;
    const ended = sessions.filter(item => ['success', 'failed'].includes(item.status)).length;
    return {
      stats: {
        registeredUsers: users.filter(item => item.role === 'user').length,
        approvedMerchants: merchants.filter(item => item.status === 'approved').length,
        groupbuys: sessions.length,
        groupbuySuccessRate: ended ? successful / ended : 0,
        paidOrders: paidOrders.length,
        verifiedOrders: orders.filter(item => item.status === 'verified').length,
        gmv: sum(paidOrders, 'paid_amount'),
        commissionIncome: sum(settlements, 'commission_amount')
      },
      todo: {
        certifications: certs.filter(item => item.status === 'pending').length,
        merchants: merchants.filter(item => item.status === 'pending').length,
        refunds: refunds.filter(item => item.status === 'pending_review').length,
        tickets: tickets.filter(item => ['open', 'processing'].includes(item.status)).length,
        settlements: settlements.filter(item => item.status === 'pending').length,
        couponSettlements: couponRedemptions.filter(item => item.status === 'pending').length,
        safetyReports: trafficEvents.filter(item => item.source === 'user' && item.status === 'pending').length
      }
    };
  }

  async function users(query = {}) {
    const criteria = {};
    if (query.certStatus) criteria.owner_cert_status = query.certStatus;
    const rows = await repository.find('users', criteria, { orderBy: ['created_at', 'desc'] });
    return rows.filter(row => !query.keyword || `${row.nickname}${row.phone || ''}${row.vehicle_no || ''}`.includes(query.keyword));
  }

  async function certifications(status) {
    const criteria = status && status !== 'all' ? { status } : {};
    const rows = await repository.find('vehicle_certifications', criteria, { orderBy: ['created_at', 'asc'] });
    const result = [];
    for (const row of rows) result.push({ ...row, user: await repository.get('users', row.user_id) });
    return result;
  }

  async function reviewCertification(adminId, certificationId, approved, reason = '') {
    const certification = await repository.get('vehicle_certifications', certificationId);
    assert(certification && certification.status === 'pending', 404, 'CERTIFICATION_NOT_FOUND', '待审核认证不存在');
    assert(approved || String(reason).trim(), 400, 'REJECTION_REASON_REQUIRED', '拒绝认证时必须填写原因');
    const status = approved ? 'approved' : 'rejected';
    await repository.transaction(async tx => {
      await tx.update('vehicle_certifications', certification.id, { status, reject_reason: approved ? '' : String(reason).slice(0, 500), reviewed_by: adminId, reviewed_at: common.now() });
      await tx.update('users', certification.user_id, {
        owner_cert_status: status, vehicle_model: approved ? certification.vehicle_model : (await tx.get('users', certification.user_id)).vehicle_model,
        vehicle_no: approved ? certification.plate : (await tx.get('users', certification.user_id)).vehicle_no, updated_at: common.now()
      });
    });
    await common.notify(certification.user_id, 'certification', approved ? '车主认证已通过' : '车主认证未通过', approved ? '你现在可以发布行程、聊天和参团' : reason, { certificationId });
    return repository.get('vehicle_certifications', certification.id);
  }

  async function merchants(status) {
    const criteria = status && status !== 'all' ? { status } : {};
    return (await repository.find('merchants', criteria, { orderBy: ['created_at', 'desc'] })).map(merchantView);
  }

  async function reviewMerchant(adminId, merchantId, approved, reason = '') {
    const merchant = await repository.get('merchants', merchantId);
    assert(merchant && merchant.status === 'pending', 404, 'MERCHANT_NOT_PENDING', '待审核商家不存在');
    assert(approved || String(reason).trim(), 400, 'REJECTION_REASON_REQUIRED', '拒绝商家时必须填写原因');
    const status = approved ? 'approved' : 'rejected';
    const updated = await repository.update('merchants', merchant.id, { status, reject_reason: approved ? '' : String(reason).slice(0, 500), updated_at: common.now() });
    if (merchant.owner_user_id) {
      if (approved) await repository.update('users', merchant.owner_user_id, { role: 'merchant', updated_at: common.now() });
      await common.notify(merchant.owner_user_id, 'merchant_review', approved ? '商家入驻审核通过' : '商家入驻审核未通过', approved ? '现在可以在商家中心发布商品' : reason, { merchantId });
    }
    return updated;
  }

  async function reviewMerchantChange(adminId, requestId, approved, reason = '') {
    const request = await repository.get('merchant_change_requests', requestId);
    assert(request && request.status === 'pending', 404, 'MERCHANT_CHANGE_NOT_FOUND', '待审核资料变更不存在');
    if (approved) await repository.update('merchants', request.merchant_id, { ...request.changes, updated_at: common.now() });
    return repository.update('merchant_change_requests', request.id, {
      status: approved ? 'approved' : 'rejected', reviewed_by: adminId, review_reason: String(reason).slice(0, 500), reviewed_at: common.now()
    });
  }

  async function setMerchantLevel(adminId, merchantId, level, score) {
    const merchant = await repository.get('merchants', merchantId);
    assert(merchant, 404, 'MERCHANT_NOT_FOUND', '商家不存在');
    assert(['bronze', 'silver', 'gold', 'diamond'].includes(level), 400, 'MERCHANT_LEVEL_INVALID', '商家等级不正确');
    const rules = await setting('merchant_assessment');
    const rate = rules.value[level] ? Number(rules.value[level].commissionRate) : Number(merchant.commission_rate);
    const updated = await repository.update('merchants', merchant.id, { level, score: Number(score == null ? merchant.score : score), commission_rate: rate, updated_at: common.now() });
    if (merchant.owner_user_id) await common.notify(merchant.owner_user_id, 'merchant_level', '商家等级已调整', `当前等级：${level}，佣金率：${rate * 100}%`, { merchantId, level });
    return { ...updated, adjustedBy: adminId };
  }

  async function groupbuys(status) {
    const criteria = status && status !== 'all' ? { status } : {};
    const rows = await repository.find('groupbuy_sessions', criteria, { orderBy: ['created_at', 'desc'] });
    const result = [];
    for (const row of rows) result.push({ ...row, product: await repository.get('products', row.product_id), creator: await repository.get('users', row.creator_id) });
    return result;
  }

  async function orders(query = {}) {
    const criteria = query.status && query.status !== 'all' ? { status: query.status } : {};
    const rows = await repository.find('orders', criteria, { orderBy: ['created_at', 'desc'] });
    const result = [];
    for (const row of rows) {
      const item = { ...row, user: await repository.get('users', row.user_id), merchant: publicMerchant(await repository.get('merchants', row.merchant_id)), product: await repository.get('products', row.product_id) };
      if (!query.keyword || `${row.order_no}${item.user.nickname}${item.product.name}`.includes(query.keyword)) result.push(item);
    }
    return result;
  }

  async function refunds(status) {
    const criteria = status && status !== 'all' ? { status } : {};
    const rows = await repository.find('refunds', criteria, { orderBy: ['created_at', 'desc'] });
    const result = [];
    for (const row of rows) result.push({ ...row, order: await repository.get('orders', row.order_id), user: await repository.get('users', row.user_id) });
    return result;
  }

  async function settlements(status) {
    const criteria = status && status !== 'all' ? { status } : {};
    const rows = await repository.find('settlements', criteria, { orderBy: ['created_at', 'desc'] });
    const result = [];
    for (const row of rows) result.push({ ...row, merchant: publicMerchant(await repository.get('merchants', row.merchant_id)) });
    return result;
  }

  async function triggerSettlement(adminId, settlementId) {
    const settlement = await repository.get('settlements', settlementId);
    assert(settlement && ['pending', 'failed'].includes(settlement.status), 404, 'SETTLEMENT_NOT_PENDING', '待处理结算单不存在');
    const [merchant, order] = await Promise.all([repository.get('merchants', settlement.merchant_id), repository.get('orders', settlement.order_id)]);
    assert(order && order.payment_transaction_id, 409, 'SETTLEMENT_ORDER_INVALID', '结算单未关联有效支付订单');
    const receiver = merchant.bank_info && merchant.bank_info.wechatReceiver;
    assert(receiver, 409, 'MERCHANT_RECEIVER_REQUIRED', '商家尚未配置微信分账接收方');
    const result = await providers.pay.profitShare({
      transactionId: order.payment_transaction_id, outOrderNo: settlement.provider_id || `PS_${order.order_no}`,
      receivers: [{ account: receiver, amountFen: Math.round(Number(settlement.net_amount) * 100), description: `${merchant.name}订单结算` }]
    });
    const updated = await repository.update('settlements', settlement.id, {
      status: result.state === 'FINISHED' ? 'completed' : 'processing', provider_id: result.out_order_no || settlement.provider_id,
      triggered_by: adminId, completed_at: result.state === 'FINISHED' ? common.now() : null
    });
    if (merchant.owner_user_id) await common.notify(
      merchant.owner_user_id, 'merchant_settlement', result.state === 'FINISHED' ? '结算已到账' : '结算处理中',
      `订单 ${order.order_no} 应结算 ¥${settlement.net_amount}`, { settlementId: settlement.id, orderId: order.id }
    );
    return updated;
  }

  async function couponRedemptions(status) {
    const criteria = status && status !== 'all' ? { status } : {};
    const rows = await repository.find('coupon_redemptions', criteria, { orderBy: ['created_at', 'desc'] });
    const result = [];
    for (const row of rows) {
      const instance = await repository.get('user_coupons', row.user_coupon_id);
      result.push({
        ...row,
        merchant: publicMerchant(await repository.get('merchants', row.merchant_id)),
        coupon: await repository.get('coupons', row.coupon_id),
        user: instance ? await repository.get('users', instance.user_id) : null
      });
    }
    return result;
  }

  async function settleCouponRedemption(adminId, redemptionId, providerId = '') {
    const redemption = await repository.get('coupon_redemptions', redemptionId);
    assert(redemption && ['pending', 'failed'].includes(redemption.status), 404, 'COUPON_REDEMPTION_NOT_PENDING', '待结算券核销记录不存在');
    const [coupon, merchant] = await Promise.all([
      repository.get('coupons', redemption.coupon_id),
      repository.get('merchants', redemption.merchant_id)
    ]);
    assert(coupon && merchant, 409, 'COUPON_SETTLEMENT_DATA_INVALID', '券或商家结算资料不完整');
    const reference = coupon.owner_type === 'merchant'
      ? `MERCHANT_FUNDED_${redemption.id}`
      : String(providerId || '').trim();
    assert(reference, 400, 'COUPON_PAYOUT_REFERENCE_REQUIRED', '平台券结算必须填写财务付款流水号');
    const updated = await repository.update('coupon_redemptions', redemption.id, {
      status: 'settled', provider_id: reference.slice(0, 128), settled_at: common.now()
    });
    if (merchant.owner_user_id) await common.notify(
      merchant.owner_user_id, 'merchant_coupon_settlement', '优惠券结算完成',
      `${coupon.name} 核销款 ¥${redemption.amount} 已结算`, { redemptionId: redemption.id, providerId: reference, settledBy: adminId }
    );
    return updated;
  }

  async function coupons() {
    const rows = await repository.find('coupons', {}, { orderBy: ['created_at', 'desc'] });
    const budget = await setting('coupon_budget');
    return { items: rows, budget: budget.value, issued: rows.reduce((sumValue, row) => sumValue + Number(row.issued), 0), used: rows.reduce((sumValue, row) => sumValue + Number(row.used), 0) };
  }

  async function createPlatformCoupon(payload) {
    assert(String(payload.name || '').trim() && Number(payload.total) > 0, 400, 'COUPON_FIELDS_REQUIRED', '优惠券名称和库存不能为空');
    return repository.insert('coupons', {
      id: id('coupon'), owner_type: 'platform', owner_id: null, name: String(payload.name).trim().slice(0, 160),
      type: payload.type || 'cash', amount: Number(payload.amount || 0), threshold_amount: Number(payload.thresholdAmount || 0),
      discount_rate: payload.discountRate == null ? null : Number(payload.discountRate), total: Number(payload.total), issued: 0, used: 0,
      valid_days: Number(payload.validDays || 30), budget_amount: Number(payload.budgetAmount || 0), status: 'active', created_at: common.now(), updated_at: common.now()
    });
  }

  async function updateSetting(adminId, key, value) {
    const row = await repository.findOne('system_settings', { setting_key: key });
    if (row) return repository.update('system_settings', row.id, { value, updated_by: adminId, updated_at: common.now() });
    return repository.insert('system_settings', { id: id('system_setting'), setting_key: key, value, updated_by: adminId, updated_at: common.now() });
  }

  async function inviteLeaderboard() {
    const invites = await repository.find('invites');
    const grouped = new Map();
    for (const invite of invites) {
      if (!grouped.has(invite.inviter_id)) grouped.set(invite.inviter_id, []);
      grouped.get(invite.inviter_id).push(invite);
    }
    const result = [];
    for (const [inviterId, records] of grouped) result.push({
      inviter: await repository.get('users', inviterId), records,
      registered: records.length, firstOrders: records.filter(item => ['first_order', 'rewarded'].includes(item.status)).length,
      pendingReward: sum(records.filter(item => item.reward_status === 'pending'), 'reward_value')
    });
    result.sort((a, b) => b.firstOrders - a.firstOrders || b.registered - a.registered);
    return result;
  }

  async function issueInviteReward(adminId, inviteId) {
    const invite = await repository.get('invites', inviteId);
    assert(invite && invite.reward_status === 'pending' && Number(invite.reward_value) > 0, 404, 'INVITE_REWARD_NOT_PENDING', '没有待发放的邀请奖励');
    let coupon = await repository.findOne('coupons', { owner_type: 'platform', type: 'reward', amount: invite.reward_value, status: 'active' });
    if (!coupon) coupon = await repository.insert('coupons', {
      id: id('coupon'), owner_type: 'platform', owner_id: null, name: `邀请奖励¥${invite.reward_value}`, type: 'reward',
      amount: invite.reward_value, threshold_amount: 0, discount_rate: null, total: 100000, issued: 0, used: 0,
      valid_days: 30, budget_amount: null, status: 'active', created_at: common.now(), updated_at: common.now()
    });
    let partnerCoupon = null;
    let partnerMerchant = null;
    const rewardMerchants = await repository.find('merchants', { reward_pool_enabled: true, status: 'approved', business_open: true });
    for (const merchant of rewardMerchants) {
      const candidates = await repository.find('coupons', { owner_type: 'merchant', owner_id: merchant.id, status: 'active' }, { orderBy: ['created_at', 'asc'] });
      partnerCoupon = candidates.find(item => ['invite', 'reward'].includes(item.type) && Number(item.issued) < Number(item.total));
      if (partnerCoupon) { partnerMerchant = merchant; break; }
    }
    await repository.transaction(async tx => {
      await tx.insert('user_coupons', {
        id: id('user_coupon'), coupon_id: coupon.id, user_id: invite.inviter_id, source: 'invite_reward', source_ref: invite.id,
        status: 'unused', issued_at: common.now(), expires_at: addTime(Date.now(), coupon.valid_days, 'days'), used_at: null,
        order_id: null, verify_code: `CP${Math.floor(100000 + Math.random() * 900000)}`
      });
      await tx.increment('coupons', coupon.id, { issued: 1 });
      if (partnerCoupon) {
        await tx.insert('user_coupons', {
          id: id('user_coupon'), coupon_id: partnerCoupon.id, user_id: invite.inviter_id,
          source: 'reward_pool', source_ref: invite.id, status: 'unused', issued_at: common.now(),
          expires_at: addTime(Date.now(), partnerCoupon.valid_days, 'days'), used_at: null, order_id: null,
          verify_code: `CP${Math.floor(100000 + Math.random() * 900000)}`
        });
        await tx.increment('coupons', partnerCoupon.id, { issued: 1 });
      }
      await tx.update('invites', invite.id, { status: 'rewarded', reward_status: 'issued' });
    });
    const partnerText = partnerCoupon ? `，另获${partnerMerchant.name}“${partnerCoupon.name}”` : '';
    await common.notify(invite.inviter_id, 'invite_reward', '邀请奖励已到账', `¥${invite.reward_value} 奖励券已放入券包${partnerText}`, { inviteId: invite.id, partnerCouponId: partnerCoupon && partnerCoupon.id });
    return { invite: await repository.get('invites', invite.id), partnerCoupon, issuedBy: adminId };
  }

  async function growthRules() {
    return repository.find('growth_rules', {}, { orderBy: ['rule_key', 'asc'] });
  }

  async function updateGrowthRule(adminId, ruleId, payload) {
    const rule = await repository.get('growth_rules', ruleId);
    assert(rule, 404, 'GROWTH_RULE_NOT_FOUND', '成长规则不存在');
    return repository.update('growth_rules', rule.id, {
      points: Number(payload.points == null ? rule.points : payload.points),
      daily_limit: payload.dailyLimit === undefined ? rule.daily_limit : payload.dailyLimit,
      enabled: payload.enabled === undefined ? rule.enabled : Boolean(payload.enabled), updated_by: adminId, updated_at: common.now()
    });
  }

  async function topics(status) {
    const criteria = status && status !== 'all' ? { status } : {};
    return repository.find('poi_topics', criteria, { orderBy: ['last_message_at', 'desc'] });
  }

  async function moderateTopic(adminId, topicId, action) {
    const topic = await repository.get('poi_topics', topicId);
    assert(topic, 404, 'TOPIC_NOT_FOUND', '地点话题不存在');
    const statuses = { remove: 'removed', archive: 'archived', restore: 'active' };
    assert(statuses[action], 400, 'TOPIC_ACTION_INVALID', '话题操作不正确');
    const updated = await repository.update('poi_topics', topic.id, { status: statuses[action], archived_at: action === 'archive' ? common.now() : null });
    return { ...updated, moderatedBy: adminId };
  }

  async function tickets(status) {
    const criteria = status && status !== 'all' ? { status } : {};
    const rows = await repository.find('support_tickets', criteria, { orderBy: [['priority', 'desc'], ['created_at', 'asc']] });
    const result = [];
    for (const row of rows) result.push({ ...row, user: await repository.get('users', row.user_id), messages: await repository.find('support_messages', { ticket_id: row.id }, { orderBy: ['created_at', 'asc'] }) });
    return result;
  }

  async function replyTicket(adminId, ticketId, content, close = false) {
    const ticket = await repository.get('support_tickets', ticketId);
    assert(ticket, 404, 'TICKET_NOT_FOUND', '工单不存在');
    assert(String(content || '').trim(), 400, 'REPLY_REQUIRED', '回复内容不能为空');
    await repository.insert('support_messages', {
      id: id('support_message'), ticket_id: ticket.id, sender_type: 'ops', sender_id: adminId,
      content: String(content || '').trim(), media_urls: [], created_at: common.now()
    });
    const updated = await repository.update('support_tickets', ticket.id, {
      status: close ? 'resolved' : 'processing', assigned_to: adminId, updated_at: common.now(), closed_at: close ? common.now() : null
    });
    await common.notify(ticket.user_id, 'support', '客服已回复', content, { ticketId: ticket.id });
    return updated;
  }

  async function rescueMerchants() {
    return (await repository.find('merchants', {}, { orderBy: ['score', 'desc'] }))
      .filter(item => item.rescue_enabled || (item.rescue_services || []).length)
      .map(publicMerchant);
  }

  async function setRescueStatus(adminId, merchantId, enabled) {
    const merchant = await repository.get('merchants', merchantId);
    assert(merchant && (merchant.rescue_enabled || (merchant.rescue_services || []).length), 404, 'RESCUE_MERCHANT_NOT_FOUND', '救援服务商不存在');
    assert(merchant.status === 'approved' || !enabled, 409, 'RESCUE_MERCHANT_NOT_APPROVED', '商家审核通过后才能启用救援服务');
    const updated = await repository.update('merchants', merchant.id, { rescue_enabled: Boolean(enabled), updated_at: common.now() });
    if (merchant.owner_user_id) await common.notify(
      merchant.owner_user_id, 'rescue_review', enabled ? '救援服务已启用' : '救援服务已暂停',
      enabled ? '你的救援服务已恢复在地图展示' : '运营已暂停你的救援服务，请联系平台核实', { merchantId, enabled, reviewedBy: adminId }
    );
    return publicMerchant(updated);
  }

  async function trafficEvents(status) {
    const criteria = status && status !== 'all' ? { status } : {};
    const rows = await repository.find('traffic_events', criteria, { orderBy: ['created_at', 'desc'] });
    const result = [];
    for (const row of rows) result.push({ ...row, reporter: row.reporter_id ? await repository.get('users', row.reporter_id) : null });
    return result;
  }

  async function reviewTrafficEvent(adminId, eventId, approved, reason = '') {
    const event = await repository.get('traffic_events', eventId);
    assert(event && event.source === 'user' && event.status === 'pending', 404, 'SAFETY_REPORT_NOT_PENDING', '待审核安全上报不存在');
    assert(approved || String(reason).trim(), 400, 'REJECTION_REASON_REQUIRED', '驳回安全上报时必须填写原因');
    const updated = await repository.update('traffic_events', event.id, {
      status: approved ? 'active' : 'rejected', reviewed_by: adminId,
      review_reason: approved ? '' : String(reason).slice(0, 500), reviewed_at: common.now()
    });
    if (event.reporter_id) {
      if (approved) await common.awardGrowth(event.reporter_id, 'safety_report', '有效安全上报', 'traffic_event', event.id);
      await common.notify(
        event.reporter_id, 'safety_report', approved ? '安全上报已确认' : '安全上报未通过',
        approved ? '路况已同步到地图，同路值奖励已到账。' : String(reason), { eventId: event.id }
      );
    }
    return { ...updated, reporter: event.reporter_id ? await repository.get('users', event.reporter_id) : null };
  }

  async function setting(key) {
    const row = await repository.findOne('system_settings', { setting_key: key });
    assert(row, 404, 'SETTING_NOT_FOUND', '配置项不存在');
    return row;
  }

  return {
    dashboard, users, certifications, reviewCertification, merchants, reviewMerchant,
    reviewMerchantChange, setMerchantLevel, groupbuys, orders, refunds, settlements,
    triggerSettlement, couponRedemptions, settleCouponRedemption, coupons, createPlatformCoupon, updateSetting, inviteLeaderboard,
    issueInviteReward, growthRules, updateGrowthRule, topics, moderateTopic, tickets,
    replyTicket, rescueMerchants, setRescueStatus, trafficEvents, reviewTrafficEvent
  };
}

function sum(rows, field) {
  return Math.round(rows.reduce((total, row) => total + Number(row[field] || 0), 0) * 100) / 100;
}

module.exports = { createOpsService };
