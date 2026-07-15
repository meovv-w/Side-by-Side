const { AppError, assert } = require('../lib/errors');

async function authRoutes(app) {
  const service = app.services.auth;

  app.post('/api/auth/sms/send', async (request, reply) => reply.ok(await service.sendSmsCode(request.body.phone)));

  app.post('/api/auth/sms/login', async (request, reply) => {
    const body = request.body || {};
    const user = await service.loginWithSms(body.phone, body.code, body.profile || {}, inviteClaim(app, body.inviteToken));
    return reply.ok(session(app, user));
  });

  app.post('/api/auth/wechat', async (request, reply) => {
    const body = request.body || {};
    const user = await service.loginWithWechat(body.code, body.profile || {}, inviteClaim(app, body.inviteToken));
    return reply.ok(session(app, user));
  });

  app.post('/api/auth/demo', async (request, reply) => {
    assert(app.config.providerMode === 'demo', 404, 'NOT_FOUND', '接口不存在');
    const user = await app.repository.get('users', request.body && request.body.userId || 'u_demo');
    assert(user, 404, 'USER_NOT_FOUND', '演示用户不存在');
    return reply.ok(session(app, user));
  });

  app.post('/api/admin/auth/login', async (request, reply) => {
    const admin = await service.adminLogin(request.body.account, request.body.password);
    const token = app.jwt.sign({ sub: admin.id, kind: 'admin', role: admin.role, merchantId: admin.merchant_id || null });
    return reply.ok({ token, actor: { id: admin.id, role: admin.role, merchantId: admin.merchant_id } });
  });

  app.get('/api/auth/me', { preHandler: app.authenticate }, async (request, reply) => {
    if (request.actor.kind === 'admin') return reply.ok(await app.repository.get('admins', request.actor.sub));
    return reply.ok(await app.services.users.profile(request.actor.sub));
  });

  app.get('/api/auth/im-sig', { preHandler: app.requireUser }, async (request, reply) => {
    return reply.ok({ sdkAppId: app.config.tencent.imSdkAppId, userId: request.actor.sub, userSig: app.providers.im.userSig(request.actor.sub, 86400) });
  });
}

function session(app, user) {
  return { token: app.jwt.sign({ sub: user.id, kind: 'user', role: user.role }), user };
}

function inviteClaim(app, token) {
  if (!token) return null;
  try {
    const claim = app.jwt.verify(token);
    assert(claim.kind === 'invite' && claim.inviterId, 400, 'INVITE_TOKEN_INVALID', '邀请链接无效');
    return { inviterId: claim.inviterId, source: claim.source, sourceRef: claim.sourceRef };
  } catch (error) {
    if (error.statusCode) throw error;
    throw new AppError(400, 'INVITE_TOKEN_INVALID', '邀请链接无效或已过期');
  }
}

module.exports = authRoutes;
