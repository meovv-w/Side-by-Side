const { assert } = require('../lib/errors');

async function opsRoutes(app) {
  const ops = app.services.ops;
  const commerce = app.services.commerce;

  app.get('/api/ops/dashboard', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.dashboard()));
  app.get('/api/ops/users', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.users(request.query || {})));
  app.get('/api/ops/certifications', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.certifications(request.query.status)));
  app.put('/api/ops/certifications/:certificationId', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.reviewCertification(request.actor.sub, request.params.certificationId, request.body.approved === true, request.body.reason)));

  app.get('/api/ops/merchants', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.merchants(request.query.status)));
  app.put('/api/ops/merchants/:merchantId/review', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.reviewMerchant(request.actor.sub, request.params.merchantId, request.body.approved === true, request.body.reason)));
  app.put('/api/ops/merchants/:merchantId/level', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.setMerchantLevel(request.actor.sub, request.params.merchantId, request.body.level, request.body.score)));
  app.get('/api/ops/merchant-changes', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await app.repository.find('merchant_change_requests', request.query.status ? { status: request.query.status } : {}, { orderBy: ['created_at', 'asc'] })));
  app.put('/api/ops/merchant-changes/:requestId', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.reviewMerchantChange(request.actor.sub, request.params.requestId, request.body.approved === true, request.body.reason)));

  app.get('/api/ops/groupbuys', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.groupbuys(request.query.status)));
  app.post('/api/ops/groupbuys/:sessionId/intervene', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await commerce.interveneSession(request.params.sessionId, request.body.outcome, request.body.reason)));
  app.get('/api/ops/orders', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.orders(request.query || {})));
  app.get('/api/ops/refunds', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.refunds(request.query.status)));
  app.put('/api/ops/refunds/:refundId', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await commerce.reviewRefund(request.actor.sub, request.params.refundId, request.body.approved === true, request.body.reason)));
  app.post('/api/ops/refunds/:refundId/retry', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await commerce.retryRefund(request.params.refundId)));
  app.get('/api/ops/settlements', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.settlements(request.query.status)));
  app.post('/api/ops/settlements/:settlementId/trigger', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.triggerSettlement(request.actor.sub, request.params.settlementId)));
  app.get('/api/ops/coupon-redemptions', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.couponRedemptions(request.query.status)));
  app.post('/api/ops/coupon-redemptions/:redemptionId/settle', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.settleCouponRedemption(request.actor.sub, request.params.redemptionId, request.body && request.body.providerId)));

  app.get('/api/ops/coupons', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.coupons()));
  app.post('/api/ops/coupons', { preHandler: app.requireOps }, async (request, reply) => reply.code(201).ok(await ops.createPlatformCoupon(request.body || {})));
  app.put('/api/ops/settings/:key', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.updateSetting(request.actor.sub, request.params.key, request.body.value)));
  app.get('/api/ops/settings/:key', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await app.repository.findOne('system_settings', { setting_key: request.params.key })));

  app.get('/api/ops/invites', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.inviteLeaderboard()));
  app.post('/api/ops/invites/:inviteId/reward', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.issueInviteReward(request.actor.sub, request.params.inviteId)));
  app.get('/api/ops/growth-rules', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.growthRules()));
  app.patch('/api/ops/growth-rules/:ruleId', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.updateGrowthRule(request.actor.sub, request.params.ruleId, request.body || {})));

  app.get('/api/ops/poi-topics', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.topics(request.query.status)));
  app.put('/api/ops/poi-topics/:topicId', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.moderateTopic(request.actor.sub, request.params.topicId, request.body.action)));
  app.get('/api/ops/traffic-events', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.trafficEvents(request.query.status)));
  app.put('/api/ops/traffic-events/:eventId', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.reviewTrafficEvent(request.actor.sub, request.params.eventId, request.body.approved === true, request.body.reason)));
  app.post('/api/ops/traffic-events', { preHandler: app.requireOps }, async (request, reply) => {
    return reply.code(201).ok(await ops.createTrafficEvent(request.actor.sub, request.body || {}));
  });

  app.get('/api/ops/support/tickets', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.tickets(request.query.status)));
  app.post('/api/ops/support/tickets/:ticketId/reply', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.replyTicket(request.actor.sub, request.params.ticketId, request.body.content, request.body.close === true)));
  app.get('/api/ops/rescue-merchants', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.rescueMerchants()));
  app.put('/api/ops/rescue-merchants/:merchantId', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await ops.setRescueStatus(request.actor.sub, request.params.merchantId, request.body.enabled === true)));

  app.get('/api/ops/emergencies', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await app.repository.find('emergency_events', request.query.status ? { status: request.query.status } : {}, { orderBy: ['created_at', 'desc'] })));
  app.get('/api/ops/audit-logs', { preHandler: app.requireOps }, async (request, reply) => reply.ok(await app.repository.find('audit_logs', {}, { orderBy: ['created_at', 'desc'], limit: Math.min(Number(request.query.limit || 100), 500) })));
  app.put('/api/ops/emergencies/:eventId', { preHandler: app.requireOps }, async (request, reply) => {
    const event = await app.repository.get('emergency_events', request.params.eventId);
    assert(event, 404, 'EMERGENCY_NOT_FOUND', 'SOS 事件不存在');
    const status = request.body.status;
    assert(['acknowledged', 'resolved'].includes(status), 400, 'EMERGENCY_STATUS_INVALID', 'SOS 状态不正确');
    return reply.ok(await app.repository.update('emergency_events', event.id, { status, resolved_at: status === 'resolved' ? app.services.common.now() : null }));
  });
}

module.exports = opsRoutes;
