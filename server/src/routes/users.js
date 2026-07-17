const crypto = require('crypto');
const { timestamp } = require('../lib/time');

async function userRoutes(app) {
  const users = app.services.users;

  app.get('/api/home', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.home(request.actor.sub)));
  app.get('/api/users/me', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.profile(request.actor.sub)));
  app.patch('/api/users/me', { preHandler: app.requireUser }, async (request, reply) => {
    const body = request.body || {};
    return reply.ok(await users.updateProfile(request.actor.sub, {
      nickname: body.nickname, avatar: body.avatar, vehicle_model: body.vehicleModel,
      vehicle_no: body.vehicleNo, bio: body.bio, discoverable: body.discoverable
    }));
  });
  app.get('/api/users/:userId', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.profile(request.params.userId, request.actor.sub)));

  app.get('/api/settings', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.settings(request.actor.sub)));
  app.patch('/api/settings', { preHandler: app.requireUser }, async (request, reply) => {
    const body = request.body || {};
    return reply.ok(await users.updateSettings(request.actor.sub, {
      allow_team_message: body.allowTeamMessage, allow_marketing: body.allowMarketing,
      share_location: body.shareLocation, sentinel_mode: body.sentinelMode,
      emergency_name: body.emergencyName, emergency_phone: body.emergencyPhone
    }));
  });

  app.get('/api/certifications/me', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.certification(request.actor.sub)));
  app.post('/api/certifications/session', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.startCertification(request.actor.sub, request.body.licensePhoto)));
  app.post('/api/certifications/liveness/callback', async (request, reply) => reply.ok(await users.applyLivenessCallback(request.query.token, request.body || {})));
  app.get('/api/certifications/session/status', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.certificationSessionStatus(request.actor.sub)));
  app.post('/api/certifications', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await users.submitCertification(request.actor.sub, request.body || {})));

  app.post('/api/invites/share', { preHandler: app.requireUser }, async (request, reply) => {
    const sourceRef = crypto.randomBytes(10).toString('hex');
    const source = request.body && request.body.source === 'qrcode' ? 'qrcode' : 'link';
    const token = app.jwt.sign({ kind: 'invite', inviterId: request.actor.sub, source, sourceRef }, { expiresIn: '30d' });
    return reply.ok(await users.createInviteShare(request.actor.sub, token, sourceRef, source));
  });
  app.get('/api/invites/resolve', async (request, reply) => {
    const link = await app.repository.findOne('invite_links', { scene: request.query.scene });
    if (!link || timestamp(link.expires_at) <= timestamp(app.services.common.now())) return reply.code(404).send({ ok: false, error: { code: 'INVITE_SCENE_INVALID', message: '邀请二维码无效或已过期' } });
    const merchant = link.source === 'merchant'
      ? await app.repository.findOne('merchants', { owner_user_id: link.inviter_id, status: 'approved' })
      : null;
    const token = app.jwt.sign({
      kind: 'invite', inviterId: link.inviter_id, source: link.source, sourceRef: link.scene,
      merchantId: merchant && merchant.id || null
    }, { expiresIn: '30d' });
    return reply.ok({ token });
  });
  app.get('/api/invites/me', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.inviteSummary(request.actor.sub)));
  app.post('/api/invites/bind-by-phone', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.bindInviterByPhone(request.actor.sub, request.body.phone)));

  app.get('/api/coupons/me', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.coupons(request.actor.sub)));
  app.get('/api/badges/me', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.userBadges(request.actor.sub)));
  app.get('/api/badges/wall', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.badgeWall(request.actor.sub)));
  app.get('/api/growth/me', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.growthLogs(request.actor.sub)));

  app.put('/api/follows/:type/:targetId', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.toggleFollow(request.actor.sub, request.params.type, request.params.targetId, request.body.enabled !== false)));
  app.put('/api/blocks/:userId', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.setBlocked(request.actor.sub, request.params.userId, request.body.blocked !== false)));
  app.get('/api/social/me', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.social(request.actor.sub)));

  app.post('/api/support/tickets', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await users.createTicket(request.actor.sub, request.body || {})));
  app.get('/api/support/tickets', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.tickets(request.actor.sub)));
  app.get('/api/support/tickets/:ticketId', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.ticketDetail(request.actor.sub, request.params.ticketId)));
  app.post('/api/support/tickets/:ticketId/messages', { preHandler: app.requireUser }, async (request, reply) => {
    return reply.code(201).ok(await users.replyTicket(request.actor.sub, request.params.ticketId, request.body.content, request.body.mediaUrls || []));
  });

  app.post('/api/emergencies', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await users.emergency(request.actor.sub, request.body || {})));
  app.post('/api/safety-reports', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await users.reportSafety(request.actor.sub, request.body || {})));
  app.get('/api/notifications', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.notifications(request.actor.sub)));
  app.put('/api/notifications/:notificationId/read', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await users.markNotificationRead(request.actor.sub, request.params.notificationId)));
}

module.exports = userRoutes;
