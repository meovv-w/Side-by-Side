const crypto = require('crypto');
const { assert } = require('../lib/errors');

async function commerceRoutes(app) {
  const commerce = app.services.commerce;

  app.get('/api/products', async (request, reply) => reply.ok(await commerce.listProducts(request.query || {})));
  app.get('/api/products/:productId', async (request, reply) => reply.ok(await commerce.productDetail(request.params.productId)));
  app.get('/api/merchants/:merchantId', async (request, reply) => reply.ok(await commerce.merchantDetail(request.params.merchantId)));
  app.post('/api/products/:productId/groupbuys', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await commerce.createSession(request.actor.sub, request.params.productId, request.body || {})));
  app.get('/api/groupbuys/:sessionId', async (request, reply) => reply.ok(await commerce.sessionDetail(request.params.sessionId)));
  app.post('/api/groupbuys/:sessionId/orders', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await commerce.createOrder(request.actor.sub, request.params.sessionId, request.body || {})));

  app.get('/api/orders', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await commerce.listOrders(request.actor.sub)));
  app.get('/api/orders/:orderId', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await commerce.orderDetail(request.actor.sub, request.params.orderId)));
  app.post('/api/orders/:orderId/payment', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await commerce.retryPayment(request.actor.sub, request.params.orderId)));
  app.post('/api/orders/:orderId/refunds', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await commerce.requestRefund(request.actor.sub, request.params.orderId, request.body.reason)));

  app.post('/api/payments/wechat/notify', { config: { rawBody: true } }, async (request, reply) => {
    const raw = request.rawBody || JSON.stringify(request.body || {});
    const resource = app.providers.pay.verifyCallback(raw, request.headers);
    const order = await commerce.applyPaymentNotification(resource, resource.transaction_id);
    return reply.send({ code: 'SUCCESS', message: '成功', orderId: order.id });
  });

  app.post('/api/payments/wechat/notify/refund', { config: { rawBody: true } }, async (request, reply) => {
    const raw = request.rawBody || JSON.stringify(request.body || {});
    const resource = app.providers.pay.verifyCallback(raw, request.headers);
    await commerce.applyRefundNotification(resource, resource.refund_id);
    return reply.send({ code: 'SUCCESS', message: '成功' });
  });

  app.post('/api/demo/orders/:orderId/pay', { preHandler: app.requireUser }, async (request, reply) => {
    assert(app.config.providerMode === 'demo', 404, 'NOT_FOUND', '接口不存在');
    const detail = await commerce.orderDetail(request.actor.sub, request.params.orderId);
    assert(detail.status === 'pending_payment', 409, 'ORDER_NOT_PAYABLE', '订单当前不可支付');
    const resource = {
      trade_state: 'SUCCESS', out_trade_no: detail.order_no, transaction_id: `demo_${crypto.randomUUID()}`,
      amount: { total: Math.round(Number(detail.paid_amount) * 100) }, success_time: new Date().toISOString()
    };
    return reply.ok(await commerce.applyPaymentNotification(resource, resource.transaction_id));
  });
}

module.exports = commerceRoutes;
