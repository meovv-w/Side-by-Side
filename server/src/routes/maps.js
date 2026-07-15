async function mapRoutes(app) {
  const maps = app.services.maps;
  app.get('/api/config/public', async (request, reply) => reply.ok(maps.publicConfig()));
  app.get('/api/map/context', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await maps.context(request.actor.sub, request.query || {})));
  app.post('/api/map/route', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await maps.route(request.body || {})));
  app.get('/api/map/tips', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await maps.tips(request.query.keywords, request.query.city)));
  app.get('/api/map/geocode', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await maps.geocode(request.query.address, request.query.city)));
}

module.exports = mapRoutes;
