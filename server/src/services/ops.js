const { assert } = require('../lib/errors');
const { id, sixDigitCode } = require('../lib/ids');
const { addTime, dateTime, timestamp } = require('../lib/time');
const { validCoordinate } = require('../lib/geo');
const { merchantView, publicMerchant } = require('./merchant');

function createOpsService({ repository, providers, common, commerce, chat, clock = () => Date.now() }) {
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
        commissionIncome: sum(settlements.filter(item => item.status === 'completed'), 'commission_amount')
      },
      todo: {
        certifications: certs.filter(item => item.status === 'pending').length,
        merchants: merchants.filter(item => item.status === 'pending').length,
        refunds: refunds.filter(item => item.status === 'pending_review').length,
        tickets: tickets.filter(item => ['open', 'processing'].includes(item.status)).length,
        settlements: settlements.filter(item => ['pending', 'processing', 'failed'].includes(item.status)).length,
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
    const updated = await repository.update('merchant_change_requests', request.id, {
      status: approved ? 'approved' : 'rejected', reviewed_by: adminId, review_reason: String(reason).slice(0, 500), reviewed_at: common.now()
    });
    const merchant = await repository.get('merchants', request.merchant_id);
    if (merchant && merchant.owner_user_id) {
      const rescue = request.changes && Object.prototype.hasOwnProperty.call(request.changes, 'rescue_enabled');
      await common.notify(
        merchant.owner_user_id, rescue ? 'rescue_review' : 'merchant_change',
        approved ? (rescue ? '救援服务审核通过' : '商家资料变更通过') : (rescue ? '救援服务审核未通过' : '商家资料变更未通过'),
        approved ? '提交的变更已生效' : String(reason || '请修改后重新提交'),
        { merchantId: merchant.id, requestId: request.id }
      );
    }
    return updated;
  }

  async function setMerchantLevel(adminId, merchantId, level, score) {
    const merchant = await repository.get('merchants', merchantId);
    assert(merchant, 404, 'MERCHANT_NOT_FOUND', '商家不存在');
    assert(['bronze', 'silver', 'gold', 'diamond'].includes(level), 400, 'MERCHANT_LEVEL_INVALID', '商家等级不正确');
    const normalizedScore = Number(score == null ? merchant.score : score);
    assert(Number.isFinite(normalizedScore) && normalizedScore >= 0 && normalizedScore <= 100, 400, 'MERCHANT_SCORE_INVALID', '商家得分必须在0至100之间');
    const rules = await setting('merchant_assessment');
    const rate = rules.value[level] ? Number(rules.value[level].commissionRate) : Number(merchant.commission_rate);
    const updated = await repository.update('merchants', merchant.id, { level, score: normalizedScore, commission_rate: rate, updated_at: common.now() });
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
    assert(settlement && ['pending', 'processing', 'failed'].includes(settlement.status), 404, 'SETTLEMENT_NOT_PENDING', '待处理结算单不存在');
    const [merchant, order] = await Promise.all([repository.get('merchants', settlement.merchant_id), repository.get('orders', settlement.order_id)]);
    assert(order && order.payment_transaction_id, 409, 'SETTLEMENT_ORDER_INVALID', '结算单未关联有效支付订单');
    if (settlement.status === 'processing') return refreshSettlement(settlement, order, adminId);
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

  async function reconcileSettlements() {
    const rows = await repository.find('settlements', { status: 'processing' });
    const completed = [];
    const pending = [];
    const failed = [];
    for (const settlement of rows) {
      const order = await repository.get('orders', settlement.order_id);
      try {
        const updated = await refreshSettlement(settlement, order, null);
        (updated.status === 'completed' ? completed : pending).push(updated.id);
      } catch (error) {
        failed.push({ id: settlement.id, code: error.code || 'PROFIT_SHARE_QUERY_FAILED' });
      }
    }
    return { completed, pending, failed };
  }

  async function refreshSettlement(settlement, order, adminId) {
    assert(order && order.payment_transaction_id && settlement.provider_id, 409, 'SETTLEMENT_REFERENCE_INVALID', '结算查询资料不完整');
    const result = await providers.pay.queryProfitShare({ transactionId: order.payment_transaction_id, outOrderNo: settlement.provider_id });
    const completed = result.state === 'FINISHED';
    const updated = await repository.update('settlements', settlement.id, {
      status: completed ? 'completed' : result.state === 'PROCESSING' ? 'processing' : 'failed',
      triggered_by: adminId || settlement.triggered_by,
      completed_at: completed ? common.now() : settlement.completed_at
    });
    if (completed) {
      const merchant = await repository.get('merchants', settlement.merchant_id);
      if (merchant && merchant.owner_user_id) await common.notify(
        merchant.owner_user_id, 'merchant_settlement', '结算已到账',
        `订单 ${order.order_no} 已结算 ¥${settlement.net_amount}`, { settlementId: settlement.id, orderId: order.id }
      );
    }
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
    const currentMonth = common.now().slice(0, 7);
    let committed = 0;
    let spent = 0;
    for (const instance of await repository.find('user_coupons')) {
      if (!String(instance.issued_at || '').startsWith(currentMonth)) continue;
      const coupon = await repository.get('coupons', instance.coupon_id);
      if (!coupon || coupon.owner_type !== 'platform') continue;
      committed += Number(coupon.amount || 0);
      if (instance.status === 'used') spent += Number(coupon.amount || 0);
    }
    return {
      items: rows, budget: budget.value,
      budgetUsage: { month: currentMonth, committed: money(committed), spent: money(spent) },
      issued: rows.reduce((sumValue, row) => sumValue + Number(row.issued), 0),
      used: rows.reduce((sumValue, row) => sumValue + Number(row.used), 0)
    };
  }

  async function createPlatformCoupon(payload) {
    const amount = Number(payload.amount);
    const total = Number(payload.total);
    const thresholdAmount = Number(payload.thresholdAmount || 0);
    const validDays = Number(payload.validDays == null ? 30 : payload.validDays);
    assert(String(payload.name || '').trim(), 400, 'COUPON_NAME_REQUIRED', '优惠券名称不能为空');
    assert(Number.isFinite(amount) && amount > 0, 400, 'COUPON_AMOUNT_INVALID', '优惠券面额必须大于0');
    assert(Number.isInteger(total) && total > 0, 400, 'COUPON_TOTAL_INVALID', '优惠券库存必须为正整数');
    assert(Number.isFinite(thresholdAmount) && thresholdAmount >= 0, 400, 'COUPON_THRESHOLD_INVALID', '使用门槛不能小于0');
    assert(Number.isInteger(validDays) && validDays >= 1 && validDays <= 3650, 400, 'COUPON_VALID_DAYS_INVALID', '有效期必须为1至3650天');
    return repository.insert('coupons', {
      id: id('coupon'), owner_type: 'platform', owner_id: null, name: String(payload.name).trim().slice(0, 160),
      type: payload.type || 'cash', amount, threshold_amount: thresholdAmount,
      discount_rate: payload.discountRate == null ? null : Number(payload.discountRate), total, issued: 0, used: 0,
      valid_days: validDays, budget_amount: amount * total, status: 'active', created_at: common.now(), updated_at: common.now()
    });
  }

  async function updateSetting(adminId, key, value) {
    const normalized = validateSetting(key, value);
    const row = await repository.findOne('system_settings', { setting_key: key });
    if (row) return repository.update('system_settings', row.id, { value: normalized, updated_by: adminId, updated_at: common.now() });
    return repository.insert('system_settings', { id: id('system_setting'), setting_key: key, value: normalized, updated_by: adminId, updated_at: common.now() });
  }

  async function inviteLeaderboard() {
    const invites = await repository.find('invites');
    const grouped = new Map();
    for (const invite of invites) {
      if (!grouped.has(invite.inviter_id)) grouped.set(invite.inviter_id, []);
      grouped.get(invite.inviter_id).push(invite);
    }
    const result = [];
    for (const [inviterId, records] of grouped) {
      const enrichedRecords = [];
      for (const record of records) enrichedRecords.push({ ...record, invitee: await repository.get('users', record.invitee_id) });
      result.push({
        inviter: await repository.get('users', inviterId), records: enrichedRecords,
        registered: records.length, firstOrders: records.filter(item => ['first_order', 'rewarded'].includes(item.status)).length,
        pendingReward: sum(records.filter(item => item.reward_status === 'pending'), 'reward_value')
      });
    }
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
    assert(Number(coupon.issued) < Number(coupon.total), 409, 'PLATFORM_COUPON_STOCK_EXHAUSTED', '平台奖励券库存不足');
    let partnerCoupon = null;
    let partnerMerchant = null;
    const rewardMerchants = await repository.find('merchants', { reward_pool_enabled: true, status: 'approved', business_open: true });
    for (const merchant of rewardMerchants) {
      const candidates = await repository.find('coupons', { owner_type: 'merchant', owner_id: merchant.id, status: 'active' }, { orderBy: ['created_at', 'asc'] });
      partnerCoupon = candidates.find(item => ['invite', 'reward'].includes(item.type) && Number(item.issued) < Number(item.total));
      if (partnerCoupon) { partnerMerchant = merchant; break; }
    }
    await repository.transaction(async tx => {
      await assertPlatformCouponBudget(tx, invite.inviter_id, Number(invite.reward_value));
      await tx.insert('user_coupons', {
        id: id('user_coupon'), coupon_id: coupon.id, user_id: invite.inviter_id, source: 'invite_reward', source_ref: invite.id,
        status: 'unused', issued_at: common.now(), expires_at: addTime(clock(), coupon.valid_days, 'days'), used_at: null,
        order_id: null, verify_code: `CP${sixDigitCode()}`
      });
      await tx.increment('coupons', coupon.id, { issued: 1 });
      if (partnerCoupon) {
        await tx.insert('user_coupons', {
          id: id('user_coupon'), coupon_id: partnerCoupon.id, user_id: invite.inviter_id,
          source: 'reward_pool', source_ref: invite.id, status: 'unused', issued_at: common.now(),
          expires_at: addTime(clock(), partnerCoupon.valid_days, 'days'), used_at: null, order_id: null,
          verify_code: `CP${sixDigitCode()}`
        });
        await tx.increment('coupons', partnerCoupon.id, { issued: 1 });
      }
      await tx.update('invites', invite.id, { status: 'rewarded', reward_status: 'issued' });
    });
    const partnerText = partnerCoupon ? `，另获${partnerMerchant.name}“${partnerCoupon.name}”` : '';
    await common.notify(invite.inviter_id, 'invite_reward', '邀请奖励已到账', `¥${invite.reward_value} 奖励券已放入券包${partnerText}`, { inviteId: invite.id, partnerCouponId: partnerCoupon && partnerCoupon.id });
    return { invite: await repository.get('invites', invite.id), partnerCoupon, issuedBy: adminId };
  }

  async function assertPlatformCouponBudget(tx, userId, amount) {
    const budgetRow = await tx.findOne('system_settings', { setting_key: 'coupon_budget' });
    const budget = budgetRow && budgetRow.value || {};
    const month = common.now().slice(0, 7);
    let total = 0;
    let userTotal = 0;
    for (const instance of await tx.find('user_coupons')) {
      if (!String(instance.issued_at || '').startsWith(month)) continue;
      const coupon = await tx.get('coupons', instance.coupon_id);
      if (!coupon || coupon.owner_type !== 'platform') continue;
      total += Number(coupon.amount || 0);
      if (instance.user_id === userId) userTotal += Number(coupon.amount || 0);
    }
    const monthlyTotal = Number(budget.monthlyTotal);
    const monthlyUserLimit = Number(budget.monthlyUserLimit);
    if (Number.isFinite(monthlyTotal)) assert(total + amount <= monthlyTotal, 409, 'PLATFORM_COUPON_BUDGET_EXCEEDED', '本月平台券总预算不足');
    if (Number.isFinite(monthlyUserLimit)) assert(userTotal + amount <= monthlyUserLimit, 409, 'PLATFORM_COUPON_USER_LIMIT_EXCEEDED', '该用户本月平台券额度已满');
  }

  async function growthRules() {
    return repository.find('growth_rules', {}, { orderBy: ['rule_key', 'asc'] });
  }

  async function updateGrowthRule(adminId, ruleId, payload) {
    const rule = await repository.get('growth_rules', ruleId);
    assert(rule, 404, 'GROWTH_RULE_NOT_FOUND', '成长规则不存在');
    const points = Number(payload.points == null ? rule.points : payload.points);
    const dailyLimit = payload.dailyLimit === undefined ? rule.daily_limit : payload.dailyLimit;
    assert(Number.isInteger(points) && points >= 0 && points <= 100000, 400, 'GROWTH_POINTS_INVALID', '同路值必须为0至100000的整数');
    assert(dailyLimit == null || (Number.isInteger(Number(dailyLimit)) && Number(dailyLimit) >= 0 && Number(dailyLimit) <= 1000000), 400, 'GROWTH_DAILY_LIMIT_INVALID', '每日上限必须为空或非负整数');
    return repository.update('growth_rules', rule.id, {
      points,
      daily_limit: dailyLimit == null ? null : Number(dailyLimit),
      enabled: payload.enabled === undefined ? rule.enabled : Boolean(payload.enabled), updated_by: adminId, updated_at: common.now()
    });
  }

  async function topics(status) {
    const criteria = status && status !== 'all' ? { status } : {};
    const rows = await repository.find('poi_topics', criteria, { orderBy: ['last_message_at', 'desc'] });
    const result = [];
    for (const topic of rows) {
      const messages = await repository.find('messages', { conversation_type: 'poi', conversation_id: topic.id, deleted_at: null }, { orderBy: ['created_at', 'asc'], limit: 100 });
      const reportRows = (await repository.find('support_tickets', { target_type: 'poi_topic', target_id: topic.id }))
        .filter(item => !['resolved', 'closed'].includes(item.status));
      const reports = [];
      for (const report of reportRows) reports.push({
        ...report,
        user: await repository.get('users', report.user_id),
        messages: await repository.find('support_messages', { ticket_id: report.id }, { orderBy: ['created_at', 'asc'] })
      });
      const enrichedMessages = [];
      for (const message of messages) enrichedMessages.push({
        ...message, sender: message.sender_id ? await repository.get('users', message.sender_id) : null
      });
      result.push({
        ...topic,
        participantCount: await repository.count('poi_topic_members', { topic_id: topic.id }),
        onlineCount: await repository.count('poi_topic_presence', {
          topic_id: topic.id, last_seen_at: { op: 'gte', value: dateTime(clock() - 90 * 1000) }
        }),
        messages: enrichedMessages,
        reports
      });
    }
    return result;
  }

  async function moderateTopic(adminId, topicId, action) {
    const topic = await repository.get('poi_topics', topicId);
    assert(topic, 404, 'TOPIC_NOT_FOUND', '地点话题不存在');
    const statuses = { remove: 'removed', archive: 'archived', restore: 'active' };
    assert(statuses[action], 400, 'TOPIC_ACTION_INVALID', '话题操作不正确');
    const updated = await repository.update('poi_topics', topic.id, { status: statuses[action], archived_at: action === 'archive' ? common.now() : null });
    if (['remove', 'archive'].includes(action)) {
      const reports = await repository.find('support_tickets', { target_type: 'poi_topic', target_id: topic.id });
      for (const report of reports.filter(item => !['resolved', 'closed'].includes(item.status))) {
        const content = action === 'remove' ? '运营已核实并下架相关地点话题。' : '运营已核实并归档相关地点话题。';
        await repository.insert('support_messages', {
          id: id('support_message'), ticket_id: report.id, sender_type: 'ops', sender_id: adminId,
          content, media_urls: [], created_at: common.now()
        });
        await repository.update('support_tickets', report.id, { status: 'resolved', assigned_to: adminId, updated_at: common.now(), closed_at: common.now() });
        await common.notify(report.user_id, 'support', '举报处理完成', content, { ticketId: report.id, topicId: topic.id });
      }
    }
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
    if (approved) await chat.createTrafficTopics();
    return { ...updated, reporter: event.reporter_id ? await repository.get('users', event.reporter_id) : null };
  }

  async function createTrafficEvent(adminId, payload) {
    const eventTypes = ['accident', 'closure', 'construction', 'hazard', 'traffic'];
    const eventType = String(payload.eventType || 'traffic');
    const title = String(payload.title || '').trim();
    const severity = Number(payload.severity == null ? 1 : payload.severity);
    const startsAt = payload.startsAt || common.now();
    const endsAt = payload.endsAt || null;
    assert(title, 400, 'TRAFFIC_EVENT_TITLE_REQUIRED', '路况标题不能为空');
    assert(validCoordinate(payload), 400, 'TRAFFIC_EVENT_LOCATION_INVALID', '路况位置坐标不正确');
    assert(eventTypes.includes(eventType), 400, 'TRAFFIC_EVENT_TYPE_INVALID', '路况类型不正确');
    assert(Number.isInteger(severity) && severity >= 1 && severity <= 5, 400, 'TRAFFIC_EVENT_SEVERITY_INVALID', '路况严重程度必须为1至5的整数');
    assert(Number.isFinite(timestamp(startsAt)), 400, 'TRAFFIC_EVENT_START_INVALID', '路况开始时间不正确');
    assert(!endsAt || Number.isFinite(timestamp(endsAt)) && timestamp(endsAt) > timestamp(startsAt), 400, 'TRAFFIC_EVENT_END_INVALID', '路况结束时间必须晚于开始时间');
    const event = await repository.insert('traffic_events', {
      id: id('traffic'), provider_id: payload.providerId || null, source: 'ops', reporter_id: null, event_type: eventType,
      title: title.slice(0, 200), description: String(payload.description || '').trim().slice(0, 1000),
      lng: Number(payload.lng), lat: Number(payload.lat), severity, starts_at: startsAt,
      ends_at: endsAt, status: 'active', reviewed_by: adminId, review_reason: '',
      reviewed_at: common.now(), topic_id: null, created_at: common.now()
    });
    await chat.createTrafficTopics();
    return repository.get('traffic_events', event.id);
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
    replyTicket, rescueMerchants, setRescueStatus, trafficEvents, reviewTrafficEvent, createTrafficEvent, reconcileSettlements
  };
}

function sum(rows, field) {
  return Math.round(rows.reduce((total, row) => total + Number(row[field] || 0), 0) * 100) / 100;
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function validateSetting(key, value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 400, 'SETTING_VALUE_INVALID', '配置内容格式不正确');
  if (key === 'coupon_budget') {
    const monthlyTotal = Number(value.monthlyTotal);
    const monthlyUserLimit = Number(value.monthlyUserLimit);
    assert(Number.isFinite(monthlyTotal) && monthlyTotal >= 0, 400, 'COUPON_BUDGET_INVALID', '平台券月预算不能小于0');
    assert(Number.isFinite(monthlyUserLimit) && monthlyUserLimit >= 0, 400, 'COUPON_USER_LIMIT_INVALID', '单用户月额度不能小于0');
    return { monthlyTotal: money(monthlyTotal), monthlyUserLimit: money(monthlyUserLimit) };
  }
  if (key === 'invite_rewards') {
    assert(Array.isArray(value.tiers) && value.tiers.length >= 1 && value.tiers.length <= 20, 400, 'INVITE_REWARD_TIERS_INVALID', '邀请奖励需设置1至20档');
    const tiers = value.tiers.map(item => ({ firstOrders: Number(item.firstOrders), reward: money(item.reward) }));
    let previous = 0;
    for (const tier of tiers) {
      assert(Number.isInteger(tier.firstOrders) && tier.firstOrders > previous, 400, 'INVITE_REWARD_ORDER_INVALID', '邀请首单人数必须为递增的正整数');
      assert(Number.isFinite(tier.reward) && tier.reward > 0, 400, 'INVITE_REWARD_AMOUNT_INVALID', '邀请奖励金额必须大于0');
      previous = tier.firstOrders;
    }
    return { tiers };
  }
  if (key === 'merchant_assessment') {
    const levels = ['bronze', 'silver', 'gold', 'diamond'];
    const normalized = {};
    let previous = -1;
    for (const level of levels) {
      const rule = value[level];
      assert(rule && typeof rule === 'object', 400, 'ASSESSMENT_LEVEL_REQUIRED', '必须配置青铜、白银、黄金和钻石四个等级');
      const minScore = Number(rule.minScore);
      const commissionRate = Number(rule.commissionRate);
      const benefit = String(rule.benefit || '').trim();
      assert(Number.isFinite(minScore) && minScore >= 0 && minScore <= 100 && minScore > previous, 400, 'ASSESSMENT_SCORE_INVALID', '等级起始分必须在0至100间逐级递增');
      assert(Number.isFinite(commissionRate) && commissionRate >= 0 && commissionRate <= 1, 400, 'ASSESSMENT_RATE_INVALID', '佣金率必须在0至1之间');
      assert(benefit, 400, 'ASSESSMENT_BENEFIT_REQUIRED', '等级权益不能为空');
      normalized[level] = { minScore, commissionRate, benefit: benefit.slice(0, 300) };
      previous = minScore;
    }
    return normalized;
  }
  if (key === 'support_auto_reply') {
    const enabled = value.enabled === true;
    const replyText = String(value.text || '').trim();
    assert(!enabled || replyText, 400, 'AUTO_REPLY_TEXT_REQUIRED', '启用自动回复时内容不能为空');
    return { enabled, text: replyText.slice(0, 1000) };
  }
  assert(false, 400, 'SETTING_KEY_INVALID', '不支持该配置项');
}

module.exports = { createOpsService };
