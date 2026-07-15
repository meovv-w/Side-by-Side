const Fastify = require('fastify');
const cors = require('@fastify/cors');
const jwt = require('@fastify/jwt');
const multipart = require('@fastify/multipart');
const websocket = require('@fastify/websocket');
const rawBody = require('fastify-raw-body');
const { loadConfig } = require('./config');
const { AppError, assert } = require('./lib/errors');
const { toPublic } = require('./lib/format');
const { id } = require('./lib/ids');
const { MemoryRepository } = require('./db/memory');
const { MySqlRepository, createMySqlPool } = require('./db/mysql');
const { MemoryRedis, RedisBus } = require('./db/redis');
const { createDemoSeed } = require('./db/demo-seed');
const { createProviders } = require('./providers');
const { RealtimeHub } = require('./realtime/hub');
const { createCommonService } = require('./services/common');
const { createAuthService } = require('./services/auth');
const { createUserService } = require('./services/users');
const { createTripService } = require('./services/trips');
const { createChatService } = require('./services/chat');
const { createCommerceService } = require('./services/commerce');
const { createMerchantService } = require('./services/merchant');
const { createOpsService } = require('./services/ops');
const { createMapService } = require('./services/maps');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const tripRoutes = require('./routes/trips');
const chatRoutes = require('./routes/chat');
const mapRoutes = require('./routes/maps');
const commerceRoutes = require('./routes/commerce');
const merchantRoutes = require('./routes/merchant');
const opsRoutes = require('./routes/ops');
const systemRoutes = require('./routes/system');
const webRoutes = require('./routes/web');

async function buildApp(options = {}) {
  const config = options.config || loadConfig(options.env);
  const clock = options.clock || (() => Date.now());
  const app = Fastify({ logger: options.logger === undefined ? config.env !== 'test' : options.logger, bodyLimit: 12 * 1024 * 1024 });

  await app.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map(value => value.trim()), credentials: config.corsOrigin !== '*' });
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: '7d' } });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await app.register(websocket);
  await app.register(rawBody, { field: 'rawBody', global: false, encoding: 'utf8', runFirst: true });

  let pool = null;
  let repository = options.repository;
  if (!repository && config.dbMode === 'memory') repository = new MemoryRepository(options.seed || createDemoSeed(clock));
  if (!repository) {
    pool = createMySqlPool(config.mysqlUrl);
    repository = new MySqlRepository(pool);
  }
  const cache = options.cache || (config.dbMode === 'memory' ? new MemoryRedis() : new RedisBus(config.redisUrl));
  if (cache instanceof RedisBus) await cache.connect();
  const providers = options.providers || createProviders(config);
  const hub = options.hub || new RealtimeHub(cache);
  await hub.start();

  app.decorate('config', config);
  app.decorate('repository', repository);
  app.decorate('cache', cache);
  app.decorate('providers', providers);
  app.decorate('hub', hub);
  app.decorateRequest('actor', null);
  app.decorateReply('ok', function ok(data) {
    return this.send({ ok: true, data: toPublic(data) });
  });

  app.decorate('authenticate', async request => {
    try {
      await request.jwtVerify();
      request.actor = request.user;
    } catch (_) {
      throw new AppError(401, 'AUTH_REQUIRED', '请先登录');
    }
  });
  app.decorate('requireUser', async request => {
    await app.authenticate(request);
    assert(request.actor.kind === 'user', 403, 'USER_ACCESS_REQUIRED', '当前账号不是用户账号');
  });
  app.decorate('requireOps', async request => {
    await app.authenticate(request);
    assert(request.actor.kind === 'admin' && request.actor.role === 'ops', 403, 'OPS_ACCESS_REQUIRED', '需要运营管理员权限');
  });
  app.decorate('requireMerchant', async request => {
    await app.authenticate(request);
    if (request.actor.kind === 'admin') {
      assert(request.actor.role === 'merchant', 403, 'MERCHANT_ACCESS_REQUIRED', '需要商家权限');
      return;
    }
    const merchant = await repository.findOne('merchants', { owner_user_id: request.actor.sub });
    assert(merchant, 403, 'MERCHANT_ACCESS_REQUIRED', '当前账号未关联商家');
  });
  app.decorate('requireJob', async request => {
    assert(config.jobSecret, 503, 'JOB_SECRET_NOT_CONFIGURED', '定时任务密钥尚未配置');
    assert(request.headers['x-job-secret'] === config.jobSecret, 401, 'JOB_AUTH_INVALID', '定时任务认证失败');
  });

  const common = createCommonService({ repository, hub, clock });
  const auth = createAuthService({ repository, cache, providers, config, common });
  const users = createUserService({ repository, cache, providers, config, common });
  const trips = createTripService({ repository, providers, common, clock });
  const chat = createChatService({ repository, providers, common, clock });
  const commerce = createCommerceService({ repository, providers, common, clock });
  const merchant = createMerchantService({ repository, common, config });
  const ops = createOpsService({ repository, providers, common, commerce });
  const maps = createMapService({ providers, trips, config });
  app.decorate('services', { common, auth, users, trips, chat, commerce, merchant, ops, maps });

  app.setNotFoundHandler((request, reply) => reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: '接口不存在' } }));
  app.setErrorHandler((error, request, reply) => {
    if (reply.sent) return;
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    const code = error.code && (error instanceof AppError || statusCode < 500) ? error.code : 'INTERNAL_ERROR';
    const message = statusCode >= 500 && config.env === 'production' ? '服务器内部错误' : error.message;
    if (statusCode >= 500) request.log.error(error);
    reply.code(statusCode).send({ ok: false, error: { code, message, details: error.details } });
  });

  app.addHook('onResponse', async (request, reply) => {
    if (!request.actor || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    try {
      await repository.insert('audit_logs', {
        id: id('audit'), actor_type: request.actor.kind === 'admin' ? 'admin' : 'user', actor_id: request.actor.sub,
        method: request.method, path: request.routeOptions && request.routeOptions.url || request.url,
        status_code: reply.statusCode, ip: request.ip || '', metadata: { params: request.params || {} }, created_at: common.now()
      });
    } catch (error) { request.log.error({ error }, 'failed to write audit log'); }
  });

  app.get('/health', async (request, reply) => reply.ok({ status: 'ok', dbMode: config.dbMode, providerMode: config.providerMode }));
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(tripRoutes);
  await app.register(chatRoutes);
  await app.register(mapRoutes);
  await app.register(commerceRoutes);
  await app.register(merchantRoutes);
  await app.register(opsRoutes);
  await app.register(systemRoutes);
  await app.register(webRoutes);

  app.addHook('onClose', async () => {
    await hub.stop();
    await cache.quit();
    if (pool) await pool.end();
  });

  return app;
}

module.exports = { buildApp };
