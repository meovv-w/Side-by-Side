const crypto = require('crypto');
const { assert } = require('../lib/errors');

async function merchantRoutes(app) {
  const merchant = app.services.merchant;
  const commerce = app.services.commerce;

  app.post('/api/merchant/apply', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await merchant.apply(request.actor.sub, request.body || {})));

  app.get('/api/merchant/dashboard', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.dashboard(request.actor)));
  app.get('/api/merchant/profile', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.resolveMerchant(request.actor)));
  app.post('/api/merchant/profile/changes', { preHandler: app.requireMerchant }, async (request, reply) => {
    const body = request.body || {};
    return reply.code(201).ok(await merchant.requestProfileChange(request.actor, {
      name: body.name, phone: body.phone, address: body.address, lng: body.lng, lat: body.lat,
      description: body.description, business_hours: body.businessHours, license_photo: body.licensePhoto, qualification_files: body.qualificationFiles
    }));
  });
  app.put('/api/merchant/bank', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.updateBank(request.actor, request.body || {})));

  app.get('/api/merchant/products', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.products(request.actor)));
  app.post('/api/merchant/products', { preHandler: app.requireMerchant }, async (request, reply) => reply.code(201).ok(await merchant.createProduct(request.actor, request.body || {})));
  app.patch('/api/merchant/products/:productId', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.updateProduct(request.actor, request.params.productId, request.body || {})));
  app.put('/api/merchant/products/:productId/status', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.setProductStatus(request.actor, request.params.productId, request.body.status)));

  app.get('/api/merchant/orders', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.orders(request.actor, request.query.status)));
  app.post('/api/merchant/verify/order', { preHandler: app.requireMerchant }, async (request, reply) => {
    const shop = await merchant.resolveMerchant(request.actor);
    return reply.ok(await commerce.verifyOrder({ id: request.actor.sub, merchant_id: shop.id }, request.body.code, request.body));
  });
  app.post('/api/merchant/verify/coupon', { preHandler: app.requireMerchant }, async (request, reply) => {
    const shop = await merchant.resolveMerchant(request.actor);
    return reply.ok(await commerce.redeemCoupon({ id: request.actor.sub, merchant_id: shop.id }, request.body.code, request.body));
  });
  app.get('/api/merchant/settlements', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.settlements(request.actor)));

  app.get('/api/merchant/coupons', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.coupons(request.actor)));
  app.post('/api/merchant/coupons', { preHandler: app.requireMerchant }, async (request, reply) => reply.code(201).ok(await merchant.createCoupon(request.actor, request.body || {})));
  app.patch('/api/merchant/coupons/:couponId', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.updateCoupon(request.actor, request.params.couponId, request.body || {})));
  app.put('/api/merchant/promotion/settings', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.updatePromotionSettings(request.actor, request.body || {})));
  app.get('/api/merchant/promotion', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.promotion(request.actor)));
  app.post('/api/merchant/promotion/share', { preHandler: app.requireMerchant }, async (request, reply) => {
    const shop = await merchant.resolveMerchant(request.actor);
    assert(shop.status === 'approved' && shop.owner_user_id, 409, 'MERCHANT_PROMOTION_UNAVAILABLE', '商家审核通过并关联用户后才能生成推广卡');
    const sourceRef = crypto.randomBytes(10).toString('hex');
    const token = app.jwt.sign({
      kind: 'invite', inviterId: shop.owner_user_id, source: 'merchant', sourceRef, merchantId: shop.id
    }, { expiresIn: '30d' });
    const share = await app.services.users.createInviteShare(shop.owner_user_id, token, sourceRef, 'merchant');
    return reply.ok({ ...share, merchantId: shop.id, merchantName: shop.name });
  });
  app.put('/api/merchant/rescue', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.updateRescue(request.actor, request.body || {})));
  app.get('/api/merchant/assessment', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.assessment(request.actor)));
  app.get('/api/merchant/notifications', { preHandler: app.requireMerchant }, async (request, reply) => reply.ok(await merchant.notifications(request.actor)));
}

module.exports = merchantRoutes;
