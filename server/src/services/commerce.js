const crypto = require('crypto');
const { AppError, assert } = require('../lib/errors');
const { id, sixDigitCode } = require('../lib/ids');
const { distanceMeters } = require('../lib/geo');
const { addTime, isPast, timestamp } = require('../lib/time');
const { publicUser } = require('./users');
const { publicMerchant } = require('./merchant');

function createCommerceService({ repository, providers, common, clock = () => Date.now() }) {
  async function listProducts(query = {}) {
    const center = query.lng != null ? { lng: Number(query.lng), lat: Number(query.lat) } : null;
    const rows = await repository.find('products', { status: 'on' });
    const items = [];
    for (const product of rows) {
      const merchant = await repository.get('merchants', product.merchant_id);
      if (!merchant || merchant.status !== 'approved' || !merchant.business_open) continue;
      const distance = center ? distanceMeters(center, product) : null;
      const sessions = await repository.find('groupbuy_sessions', { product_id: product.id, status: 'forming' }, { orderBy: ['created_at', 'desc'] });
      items.push({ ...product, merchant: publicMerchant(merchant), sessions, distanceMeters: Number.isFinite(distance) ? Math.round(distance) : null });
    }
    items.sort((a, b) => {
      if (query.sort === 'hot') return b.sessions.reduce((sum, item) => sum + Number(item.joined_people), 0) - a.sessions.reduce((sum, item) => sum + Number(item.joined_people), 0);
      if (center) return Number(a.distanceMeters || Infinity) - Number(b.distanceMeters || Infinity);
      return timestamp(b.created_at) - timestamp(a.created_at);
    });
    return items;
  }

  async function productDetail(productId) {
    const product = await getProduct(productId);
    const merchant = await repository.get('merchants', product.merchant_id);
    const sessions = await repository.find('groupbuy_sessions', { product_id: productId, status: ['forming', 'success'] }, { orderBy: ['created_at', 'desc'] });
    return { product, merchant: publicMerchant(merchant), sessions };
  }

  async function merchantDetail(merchantId) {
    const merchant = await repository.get('merchants', merchantId);
    assert(merchant && merchant.status === 'approved', 404, 'MERCHANT_NOT_FOUND', '商家不存在');
    const products = [];
    for (const product of await repository.find('products', { merchant_id: merchant.id, status: 'on' }, { orderBy: ['created_at', 'desc'] })) products.push({
      ...product,
      sessions: await repository.find('groupbuy_sessions', { product_id: product.id, status: 'forming' }, { orderBy: ['created_at', 'desc'] })
    });
    return { merchant: publicMerchant(merchant), products };
  }

  async function createSession(userId, productId, payload = {}) {
    await common.assertCertified(userId);
    const product = await getProduct(productId);
    assert(product.status === 'on' && Number(product.stock) > Number(product.sold) + Number(product.reserved || 0), 409, 'PRODUCT_UNAVAILABLE', '商品已下架或售罄');
    const target = Number(payload.targetPeople || firstTarget(product));
    assert(target >= 1 && target <= Number(product.max_group_size), 400, 'GROUP_TARGET_INVALID', '目标人数超出商品允许范围');
    if (payload.tripId) {
      const member = await repository.findOne('trip_members', { trip_id: payload.tripId, user_id: userId, status: 'active' });
      assert(member, 403, 'TRIP_MEMBER_REQUIRED', '只有车队成员可以在该群发起拼团');
    }
    return repository.insert('groupbuy_sessions', {
      id: id('groupbuy'), product_id: productId, creator_id: userId, trip_id: payload.tripId || null,
      target_people: target, joined_people: 0, current_price: tierPrice(product, 1), status: 'forming',
      expires_at: addTime(clock(), Number(product.valid_hours), 'hours'), success_at: null, failed_at: null, created_at: common.now()
    });
  }

  async function sessionDetail(sessionId) {
    const session = await getSession(sessionId);
    const product = await getProduct(session.product_id);
    const merchant = await repository.get('merchants', product.merchant_id);
    const members = await repository.find('groupbuy_members', { session_id: sessionId, status: 'paid' }, { orderBy: ['joined_at', 'asc'] });
    const participants = [];
    for (const member of members) participants.push({ ...member, user: publicUser(await common.getUser(member.user_id), false) });
    return {
      session, product, merchant: publicMerchant(merchant), participants,
      remainingPeople: Math.max(0, Number(session.target_people) - Number(session.joined_people)),
      remainingSeconds: Math.max(0, Math.floor((timestamp(session.expires_at) - clock()) / 1000)),
      nextTier: nextTier(product, Number(session.joined_people))
    };
  }

  async function createOrder(userId, sessionId, payload = {}) {
    const user = await common.assertCertified(userId);
    const session = await getSession(sessionId);
    assert(session.status === 'forming' && !isPast(session.expires_at, clock()), 409, 'GROUPBUY_NOT_FORMING', '该拼团已经结束');
    const product = await getProduct(session.product_id);
    assert(product.status === 'on', 409, 'PRODUCT_UNAVAILABLE', '商品已下架');
    assert(!(await repository.findOne('groupbuy_members', { session_id: sessionId, user_id: userId, status: 'paid' })), 409, 'ALREADY_JOINED_GROUPBUY', '你已参加该拼团');
    const pending = await repository.findOne('orders', { session_id: sessionId, user_id: userId, status: 'pending_payment' });
    if (pending && !isPast(pending.expires_at, clock())) return { order: pending, payment: await paymentForOrder(user, pending, product) };
    const quantity = Math.max(1, Math.min(Number(payload.quantity || 1), Number(product.max_quantity)));
    assert(Number(product.sold) + Number(product.reserved || 0) + quantity <= Number(product.stock), 409, 'PRODUCT_STOCK_INSUFFICIENT', '商品库存不足');
    const unitPrice = tierPrice(product, Number(session.joined_people) + 1);
    const originAmount = money(unitPrice * quantity);
    const coupon = payload.userCouponId ? await validateCoupon(userId, payload.userCouponId, product, originAmount) : null;
    const discountAmount = coupon ? couponDiscount(coupon.coupon, originAmount) : 0;
    const paidAmount = Math.max(0.01, money(originAmount - discountAmount));
    const expiresAt = new Date(Math.min(timestamp(session.expires_at), clock() + 15 * 60000));
    const order = await repository.transaction(async tx => {
      assert(await tx.reserveInventory(product.id, quantity), 409, 'PRODUCT_STOCK_INSUFFICIENT', '商品库存不足');
      const row = await tx.insert('orders', {
        id: id('order'), order_no: orderNumber(clock()), user_id: userId, merchant_id: product.merchant_id,
        product_id: product.id, session_id: session.id, coupon_id: coupon ? coupon.coupon.id : null,
        quantity, origin_amount: originAmount, discount_amount: discountAmount, paid_amount: paidAmount,
        status: 'pending_payment', payment_provider: 'wechat', payment_transaction_id: null,
        verify_code: null, expires_at: formatDate(expiresAt), paid_at: null, verified_at: null,
        verified_by: null, verified_lng: null, verified_lat: null, created_at: common.now(), updated_at: common.now()
      });
      if (coupon) await tx.update('user_coupons', coupon.instance.id, { status: 'locked', order_id: row.id });
      return row;
    });
    return { order, payment: await paymentForOrder(user, order, product) };
  }

  async function retryPayment(userId, orderId) {
    const order = await getUserOrder(userId, orderId);
    assert(order.status === 'pending_payment' && !isPast(order.expires_at, clock()), 409, 'ORDER_NOT_PAYABLE', '订单当前不可支付');
    const user = await common.getUser(userId);
    const product = await getProduct(order.product_id);
    return { order, payment: await paymentForOrder(user, order, product) };
  }

  async function applyPaymentNotification(resource, providerEventId) {
    assert(resource && resource.out_trade_no, 400, 'PAYMENT_NOTIFICATION_INVALID', '支付回调缺少商户订单号');
    const order = await repository.findOne('orders', { order_no: resource.out_trade_no });
    assert(order, 404, 'ORDER_NOT_FOUND', '支付回调对应订单不存在');
    assert(resource.trade_state === 'SUCCESS', 409, 'PAYMENT_NOT_SUCCESSFUL', '支付尚未成功');
    const expectedFen = Math.round(Number(order.paid_amount) * 100);
    assert(Number(resource.amount && resource.amount.total) === expectedFen, 400, 'PAYMENT_AMOUNT_MISMATCH', '支付回调金额与订单不一致');
    const eventId = providerEventId || resource.transaction_id;
    const existingEvent = await repository.findOne('payment_events', { provider_event_id: eventId });
    if (existingEvent && existingEvent.processed_at) return repository.get('orders', order.id);
    let updatedOrder;
    let session;
    await repository.transaction(async tx => {
      const current = await tx.get('orders', order.id);
      if (current.status === 'paid' || current.status === 'verified') { updatedOrder = current; return; }
      assert(current.status === 'pending_payment', 409, 'ORDER_STATE_INVALID', '订单状态不允许支付');
      let event = await tx.findOne('payment_events', { provider_event_id: eventId });
      if (!event) event = await tx.insert('payment_events', { id: id('payment_event'), provider_event_id: eventId, event_type: 'TRANSACTION.SUCCESS', payload: resource, processed_at: null, created_at: common.now() });
      updatedOrder = await tx.update('orders', order.id, {
        status: 'paid', payment_transaction_id: resource.transaction_id, verify_code: sixDigitCode(),
        paid_at: resource.success_time ? formatDate(new Date(resource.success_time)) : common.now(), updated_at: common.now()
      });
      await tx.insert('groupbuy_members', {
        id: id('groupbuy_member'), session_id: order.session_id, user_id: order.user_id, order_id: order.id,
        quantity: order.quantity, paid_amount: order.paid_amount, status: 'paid', joined_at: common.now()
      });
      session = await tx.increment('groupbuy_sessions', order.session_id, { joined_people: 1 });
      const product = await tx.commitInventory(order.product_id, Number(order.quantity));
      assert(product, 409, 'INVENTORY_RESERVATION_MISSING', '订单库存预占已失效');
      const people = Number(session.joined_people);
      const sessionChanges = { current_price: tierPrice(product, people) };
      if (people >= Number(session.target_people)) Object.assign(sessionChanges, { status: 'success', success_at: common.now() });
      session = await tx.update('groupbuy_sessions', session.id, sessionChanges);
      if (order.coupon_id) {
        const couponInstance = await tx.findOne('user_coupons', { order_id: order.id, status: 'locked' });
        if (couponInstance) {
          await tx.update('user_coupons', couponInstance.id, { status: 'used', used_at: common.now() });
          await tx.increment('coupons', order.coupon_id, { used: 1 });
        }
      }
      await tx.update('payment_events', event.id, { processed_at: common.now() });
    });
    await common.awardGrowth(order.user_id, 'join_groupbuy', '参与拼团', 'order', order.id);
    await common.notify(order.user_id, 'payment', '支付成功', `订单 ${order.order_no} 支付成功`, { orderId: order.id, sessionId: order.session_id });
    const merchant = await repository.get('merchants', order.merchant_id);
    if (merchant && merchant.owner_user_id) await common.notify(
      merchant.owner_user_id, 'merchant_order', '新的待核销订单',
      `订单 ${order.order_no} 已支付 ¥${order.paid_amount}`, { orderId: order.id, sessionId: order.session_id }
    );
    await processInviteFirstOrder(order.user_id, order.id);
    if (session && session.status === 'success') await notifyGroupSuccess(session);
    return updatedOrder;
  }

  async function listOrders(userId) {
    const rows = await repository.find('orders', { user_id: userId }, { orderBy: ['created_at', 'desc'] });
    const result = [];
    for (const row of rows) result.push(await enrichOrder(row));
    return result;
  }

  async function orderDetail(userId, orderId) {
    return enrichOrder(await getUserOrder(userId, orderId));
  }

  async function requestRefund(userId, orderId, reason) {
    const order = await getUserOrder(userId, orderId);
    assert(order.status === 'paid', 409, 'ORDER_NOT_REFUNDABLE', '订单当前不能申请退款');
    const session = await getSession(order.session_id);
    assert(session.status === 'success', 409, 'REFUND_REVIEW_NOT_REQUIRED', '拼团失败会自动退款，无需手动申请');
    assert(!order.verified_at, 409, 'ORDER_ALREADY_VERIFIED', '已核销订单不能退款');
    assert(String(reason || '').trim(), 400, 'REFUND_REASON_REQUIRED', '请填写退款原因');
    const existing = await repository.findOne('refunds', { order_id: order.id, status: ['pending_review', 'processing'] });
    if (existing) return existing;
    const refund = await repository.insert('refunds', {
      id: id('refund'), order_id: order.id, user_id: userId, reason: String(reason || '').trim().slice(0, 500),
      amount: order.paid_amount, status: 'pending_review', provider_refund_id: null, reviewed_by: null,
      review_reason: '', created_at: common.now(), reviewed_at: null, completed_at: null
    });
    await repository.update('orders', order.id, { status: 'refund_pending', updated_at: common.now() });
    return refund;
  }

  async function reviewRefund(adminId, refundId, approved, reviewReason = '') {
    const refund = await repository.get('refunds', refundId);
    assert(refund && refund.status === 'pending_review', 404, 'REFUND_NOT_FOUND', '待审核退款申请不存在');
    const order = await repository.get('orders', refund.order_id);
    if (!approved) {
      await repository.update('orders', order.id, { status: 'paid', updated_at: common.now() });
      return repository.update('refunds', refund.id, { status: 'rejected', reviewed_by: adminId, review_reason: String(reviewReason).slice(0, 500), reviewed_at: common.now() });
    }
    await repository.update('refunds', refund.id, { status: 'processing', reviewed_by: adminId, review_reason: String(reviewReason).slice(0, 500), reviewed_at: common.now() });
    return issueRefund(await repository.get('refunds', refund.id), order);
  }

  async function applyRefundNotification(resource, providerEventId) {
    assert(resource && resource.out_refund_no, 400, 'REFUND_NOTIFICATION_INVALID', '退款回调缺少退款单号');
    const refund = await repository.get('refunds', resource.out_refund_no.replace(/^RF_/, '')) || await repository.findOne('refunds', { provider_refund_id: resource.refund_id });
    assert(refund, 404, 'REFUND_NOT_FOUND', '退款单不存在');
    const status = resource.refund_status === 'SUCCESS' ? 'completed' : resource.refund_status === 'ABNORMAL' ? 'failed' : 'processing';
    const updated = await repository.update('refunds', refund.id, { status, provider_refund_id: resource.refund_id || refund.provider_refund_id, completed_at: status === 'completed' ? common.now() : null });
    if (status === 'completed') {
      await finalizeRefund(refund, await repository.get('orders', refund.order_id));
      await common.notify(refund.user_id, 'refund', '退款成功', '款项已按原支付路径退回', { orderId: refund.order_id });
    }
    return { refund: updated, providerEventId };
  }

  async function verifyOrder(admin, code, payload = {}) {
    const order = await repository.findOne('orders', { verify_code: String(code || '') });
    assert(order && order.merchant_id === admin.merchant_id, 404, 'VERIFY_CODE_NOT_FOUND', '未找到该核销码对应的本店订单');
    assert(order.status === 'paid', 409, 'ORDER_NOT_VERIFIABLE', order.status === 'verified' ? '该订单已核销' : '订单当前不可核销');
    const session = await getSession(order.session_id);
    assert(session.status === 'success', 409, 'GROUPBUY_NOT_SUCCESSFUL', '拼团尚未成功，暂不能核销');
    const merchant = await repository.get('merchants', order.merchant_id);
    const receiver = merchant.bank_info && merchant.bank_info.wechatReceiver;
    assert(receiver, 409, 'MERCHANT_RECEIVER_REQUIRED', '商家尚未配置微信分账接收方');
    const commission = money(Number(order.paid_amount) * Number(merchant.commission_rate));
    const net = money(Number(order.paid_amount) - commission);
    const outOrderNo = `PS_${order.order_no}`;
    const sharing = await providers.pay.profitShare({
      transactionId: order.payment_transaction_id, outOrderNo,
      receivers: [{ account: receiver, amountFen: Math.round(net * 100), description: `${merchant.name}订单结算` }]
    });
    const settlementId = `settlement_${order.id}`;
    await repository.transaction(async tx => {
      await tx.update('orders', order.id, {
        status: 'verified', verified_at: common.now(), verified_by: admin.id,
        verified_lng: payload.lng == null ? null : Number(payload.lng), verified_lat: payload.lat == null ? null : Number(payload.lat), updated_at: common.now()
      });
      await tx.insert('verification_records', {
        id: id('verification'), order_id: order.id, merchant_id: merchant.id, operator_id: admin.id,
        code: order.verify_code, lng: payload.lng == null ? null : Number(payload.lng), lat: payload.lat == null ? null : Number(payload.lat), created_at: common.now()
      });
      await tx.insert('settlements', {
        id: settlementId, merchant_id: merchant.id, order_id: order.id, period_start: order.paid_at,
        period_end: common.now(), gross_amount: order.paid_amount, commission_rate: merchant.commission_rate,
        commission_amount: commission, net_amount: net,
        status: sharing.state === 'FINISHED' ? 'completed' : 'processing', provider_id: sharing.out_order_no || outOrderNo,
        triggered_by: admin.id, created_at: common.now(), completed_at: sharing.state === 'FINISHED' ? common.now() : null
      });
    });
    await common.notify(order.user_id, 'verification', '订单核销成功', `${merchant.name} 已完成订单核销`, { orderId: order.id });
    if (merchant.owner_user_id) await common.notify(
      merchant.owner_user_id, 'merchant_verification', '核销与分账已完成',
      `订单 ${order.order_no} 已核销，应结算 ¥${net}`, { orderId: order.id, settlementId }
    );
    return { order: await repository.get('orders', order.id), settlement: await repository.get('settlements', settlementId), sharing };
  }

  async function redeemCoupon(admin, code, payload = {}) {
    const instance = await repository.findOne('user_coupons', { verify_code: String(code || '') });
    assert(instance && instance.status === 'unused' && !isPast(instance.expires_at, clock()), 404, 'COUPON_CODE_INVALID', '券码不存在、已使用或已过期');
    const coupon = await repository.get('coupons', instance.coupon_id);
    assert(coupon && coupon.status === 'active', 409, 'COUPON_UNAVAILABLE', '优惠券当前不可用');
    assert(coupon.owner_type === 'platform' || coupon.owner_id === admin.merchant_id, 403, 'COUPON_MERCHANT_MISMATCH', '该优惠券不能在本店核销');
    const redemption = await repository.transaction(async tx => {
      await tx.update('user_coupons', instance.id, { status: 'used', used_at: common.now() });
      await tx.increment('coupons', coupon.id, { used: 1 });
      return tx.insert('coupon_redemptions', {
        id: id('coupon_redemption'), user_coupon_id: instance.id, coupon_id: coupon.id,
        merchant_id: admin.merchant_id, operator_id: admin.id, amount: coupon.amount,
        status: 'pending', provider_id: null, lng: payload.lng == null ? null : Number(payload.lng),
        lat: payload.lat == null ? null : Number(payload.lat), created_at: common.now(), settled_at: null
      });
    });
    await common.notify(instance.user_id, 'coupon', '优惠券已核销', `${coupon.name} 已使用`, { couponId: coupon.id });
    return redemption;
  }

  async function expireSessions() {
    const sessions = await repository.find('groupbuy_sessions', { status: 'forming', expires_at: { op: 'lte', value: common.now() } });
    const results = [];
    for (const session of sessions) {
      await repository.update('groupbuy_sessions', session.id, { status: 'failed', failed_at: common.now() });
      const pendingOrders = await repository.find('orders', { session_id: session.id, status: 'pending_payment' });
      for (const pending of pendingOrders) {
        await repository.update('orders', pending.id, { status: 'closed', updated_at: common.now() });
        await repository.releaseInventory(pending.product_id, Number(pending.quantity));
        const lockedCoupon = await repository.findOne('user_coupons', { order_id: pending.id, status: 'locked' });
        if (lockedCoupon) await repository.update('user_coupons', lockedCoupon.id, { status: 'unused', order_id: null });
      }
      const members = await repository.find('groupbuy_members', { session_id: session.id, status: 'paid' });
      for (const member of members) {
        const order = await repository.get('orders', member.order_id);
        let refund = await repository.findOne('refunds', { order_id: order.id });
        if (!refund) refund = await repository.insert('refunds', {
          id: id('refund'), order_id: order.id, user_id: order.user_id, reason: '拼团到期未达到目标人数', amount: order.paid_amount,
          status: 'processing', provider_refund_id: null, reviewed_by: null, review_reason: '系统自动退款',
          created_at: common.now(), reviewed_at: common.now(), completed_at: null
        });
        await repository.update('orders', order.id, { status: 'refund_pending', updated_at: common.now() });
        try { await issueRefund(refund, order); } catch (error) {
          await repository.update('refunds', refund.id, { status: 'failed', review_reason: `自动退款调用失败：${error.message}` });
        }
      }
      results.push(session.id);
    }
    return { failedSessions: results };
  }

  async function closeExpiredOrders() {
    const rows = await repository.find('orders', { status: 'pending_payment', expires_at: { op: 'lte', value: common.now() } });
    for (const order of rows) {
      await repository.update('orders', order.id, { status: 'closed', updated_at: common.now() });
      await repository.releaseInventory(order.product_id, Number(order.quantity));
      const coupon = await repository.findOne('user_coupons', { order_id: order.id, status: 'locked' });
      if (coupon) await repository.update('user_coupons', coupon.id, { status: 'unused', order_id: null });
    }
    return { closedOrders: rows.map(row => row.id) };
  }

  async function interveneSession(sessionId, outcome, reason = '') {
    const session = await getSession(sessionId);
    assert(session.status === 'forming', 409, 'GROUPBUY_ALREADY_ENDED', '拼团已经结束');
    if (outcome === 'success') {
      assert(Number(session.joined_people) > 0, 409, 'GROUPBUY_HAS_NO_MEMBERS', '无人支付的拼团不能设为成功');
      const updated = await repository.update('groupbuy_sessions', session.id, { status: 'success', success_at: common.now() });
      await notifyGroupSuccess(updated);
      return updated;
    }
    assert(outcome === 'failed', 400, 'GROUPBUY_OUTCOME_INVALID', '干预结果必须为成功或失败');
    await repository.update('groupbuy_sessions', session.id, { expires_at: common.now() });
    await expireSessions();
    const updated = await repository.get('groupbuy_sessions', session.id);
    if (reason) {
      const members = await repository.find('groupbuy_members', { session_id: session.id });
      for (const member of members) await common.notify(member.user_id, 'groupbuy_failed', '拼团已结束', reason, { sessionId: session.id });
    }
    return updated;
  }

  async function paymentForOrder(user, order, product) {
    assert(user.openid, 409, 'WECHAT_BINDING_REQUIRED', '请先绑定微信后再支付');
    try {
      return await providers.pay.createJsapiPayment({
        description: product.name, outTradeNo: order.order_no, amountFen: Math.round(Number(order.paid_amount) * 100),
        payerOpenid: user.openid, attach: JSON.stringify({ orderId: order.id, sessionId: order.session_id }), expiresAt: order.expires_at
      });
    } catch (error) {
      if (error instanceof AppError) error.details = { ...(error.details || {}), orderId: order.id };
      throw error;
    }
  }

  async function issueRefund(refund, order) {
    const result = await providers.pay.refund({
      outRefundNo: `RF_${refund.id}`, transactionId: order.payment_transaction_id,
      outTradeNo: order.order_no, reason: refund.reason, refundFen: Math.round(Number(refund.amount) * 100),
      totalFen: Math.round(Number(order.paid_amount) * 100), notifyUrl: `${providers.pay.config.notifyUrl}/refund`
    });
    const complete = result.status === 'SUCCESS';
    const updated = await repository.update('refunds', refund.id, {
      status: complete ? 'completed' : 'processing', provider_refund_id: result.refund_id || null,
      completed_at: complete ? common.now() : null
    });
    if (complete) {
      await finalizeRefund(refund, order);
    }
    return updated;
  }

  async function notifyGroupSuccess(session) {
    const members = await repository.find('groupbuy_members', { session_id: session.id, status: 'paid' });
    for (const member of members) await common.notify(member.user_id, 'groupbuy_success', '拼团成功', '拼团已达到目标人数，可在订单中查看核销码', { sessionId: session.id, orderId: member.order_id });
    if (session.trip_id) await common.addMessage({ type: 'team', conversationId: session.trip_id, senderId: null, messageType: 'groupbuy', content: '车队拼团已成功，可以到店核销', metadata: { sessionId: session.id } });
  }

  async function finalizeRefund(refund, order) {
    if (!order || order.status === 'refunded') return order;
    await repository.transaction(async tx => {
      await tx.update('orders', order.id, { status: 'refunded', updated_at: common.now() });
      const member = await tx.findOne('groupbuy_members', { order_id: order.id, status: 'paid' });
      if (member) {
        await tx.update('groupbuy_members', member.id, { status: 'refunded' });
        await tx.increment('groupbuy_sessions', order.session_id, { joined_people: -1 });
      }
      await tx.increment('products', order.product_id, { sold: -Number(order.quantity) });
      if (order.coupon_id) {
        const couponInstance = await tx.findOne('user_coupons', { order_id: order.id, status: 'used' });
        if (couponInstance && !isPast(couponInstance.expires_at, clock())) {
          await tx.update('user_coupons', couponInstance.id, { status: 'unused', used_at: null, order_id: null });
          await tx.increment('coupons', order.coupon_id, { used: -1 });
        }
      }
    });
    return repository.get('orders', order.id);
  }

  async function processInviteFirstOrder(userId, orderId) {
    const invite = await repository.findOne('invites', { invitee_id: userId, status: 'registered' });
    if (!invite) return;
    const firstOrders = (await repository.find('invites', { inviter_id: invite.inviter_id })).filter(item => ['first_order', 'rewarded'].includes(item.status)).length + 1;
    const setting = await repository.findOne('system_settings', { setting_key: 'invite_rewards' });
    const tiers = setting ? setting.value.tiers || [] : [];
    const eligible = tiers.filter(tier => firstOrders >= Number(tier.firstOrders)).sort((a, b) => Number(b.firstOrders) - Number(a.firstOrders))[0];
    await repository.update('invites', invite.id, {
      status: 'first_order', first_order_at: common.now(), reward_status: eligible ? 'pending' : 'none', reward_value: eligible ? Number(eligible.reward) : 0
    });
    await common.awardGrowth(invite.inviter_id, 'invite_first_order', '邀请用户完成首单', 'order', orderId);
    await common.notify(invite.inviter_id, 'invite', '邀请用户完成首单', eligible ? `阶梯奖励 ¥${eligible.reward} 待运营发放` : '邀请记录已更新', { inviteId: invite.id });
  }

  async function validateCoupon(userId, instanceId, product, amount) {
    const instance = await repository.get('user_coupons', instanceId);
    assert(instance && instance.user_id === userId && instance.status === 'unused' && !isPast(instance.expires_at, clock()), 400, 'COUPON_INVALID', '优惠券不存在、已使用或已过期');
    const coupon = await repository.get('coupons', instance.coupon_id);
    assert(coupon && coupon.status === 'active', 400, 'COUPON_UNAVAILABLE', '优惠券当前不可用');
    assert(coupon.owner_type === 'platform' || coupon.owner_id === product.merchant_id, 400, 'COUPON_SCOPE_INVALID', '该优惠券不适用于此商品');
    assert(Number(amount) >= Number(coupon.threshold_amount), 400, 'COUPON_THRESHOLD_NOT_MET', '订单金额未达到优惠券使用门槛');
    return { instance, coupon };
  }

  async function enrichOrder(order) {
    return {
      ...order,
      product: await repository.get('products', order.product_id),
      merchant: publicMerchant(await repository.get('merchants', order.merchant_id)),
      session: await repository.get('groupbuy_sessions', order.session_id),
      refund: await repository.findOne('refunds', { order_id: order.id })
    };
  }

  async function getProduct(productId) {
    const product = await repository.get('products', productId);
    assert(product, 404, 'PRODUCT_NOT_FOUND', '拼团商品不存在');
    return product;
  }

  async function getSession(sessionId) {
    const session = await repository.get('groupbuy_sessions', sessionId);
    assert(session, 404, 'GROUPBUY_NOT_FOUND', '拼团不存在');
    return session;
  }

  async function getUserOrder(userId, orderId) {
    const order = await repository.get('orders', orderId);
    assert(order && order.user_id === userId, 404, 'ORDER_NOT_FOUND', '订单不存在');
    return order;
  }

  return {
    listProducts, productDetail, merchantDetail, createSession, sessionDetail, createOrder, retryPayment,
    applyPaymentNotification, listOrders, orderDetail, requestRefund, reviewRefund,
    applyRefundNotification, verifyOrder, redeemCoupon, expireSessions, closeExpiredOrders,
    interveneSession, tierPrice
  };
}

function tierPrice(product, people) {
  const tiers = [...(product.tiers || [])].sort((a, b) => Number(a.people) - Number(b.people));
  let price = Number(product.origin_price);
  for (const tier of tiers) if (people >= Number(tier.people)) price = Number(tier.price); else break;
  return money(price);
}

function nextTier(product, people) {
  return [...(product.tiers || [])].sort((a, b) => Number(a.people) - Number(b.people)).find(tier => Number(tier.people) > people) || null;
}

function firstTarget(product) {
  const tiers = [...(product.tiers || [])].sort((a, b) => Number(a.people) - Number(b.people));
  return Number((tiers.find(tier => Number(tier.people) > 1) || tiers[0] || { people: 1 }).people);
}

function couponDiscount(coupon, amount) {
  if (coupon.type === 'discount' && coupon.discount_rate) return money(amount * (1 - Number(coupon.discount_rate)));
  return Math.min(Number(amount), Number(coupon.amount || 0));
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function orderNumber(now) {
  const day = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
  return `TD${day}${crypto.randomInt(10000000, 100000000)}`;
}

function formatDate(value) {
  return new Date(value).toISOString().slice(0, 23).replace('T', ' ');
}

module.exports = { createCommerceService, tierPrice };
