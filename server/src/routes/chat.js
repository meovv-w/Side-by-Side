async function chatRoutes(app) {
  const chat = app.services.chat;

  app.get('/api/conversations', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await chat.conversations(request.actor.sub, request.query.type || 'all')));
  app.get('/api/conversations/:type/:conversationId/messages', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await chat.messages(request.actor.sub, request.params.type, request.params.conversationId, request.query.before)));
  app.post('/api/trips/:tripId/messages', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await chat.sendTeam(request.actor.sub, request.params.tripId, request.body || {})));

  app.get('/api/private/:userId', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await chat.privateThread(request.actor.sub, request.params.userId)));
  app.post('/api/private/:userId/messages', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await chat.sendPrivate(request.actor.sub, request.params.userId, request.body || {})));

  app.get('/api/poi-topics', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await chat.listTopics(request.actor.sub, request.query || {})));
  app.post('/api/poi-topics', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await chat.createTopic(request.actor.sub, request.body || {})));
  app.get('/api/poi-topics/:topicId', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await chat.topicDetail(request.actor.sub, request.params.topicId)));
  app.put('/api/poi-topics/:topicId/follow', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await chat.followTopic(request.actor.sub, request.params.topicId, request.body.enabled !== false)));
  app.post('/api/poi-topics/:topicId/messages', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await chat.sendTopic(request.actor.sub, request.params.topicId, request.body || {})));
  app.post('/api/traffic-events/:eventId/forward', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await chat.forwardTraffic(request.actor.sub, request.params.eventId, request.body.tripId)));

  app.get('/ws', { websocket: true }, (socket, request) => {
    try {
      const actor = app.jwt.verify(request.query.token);
      if (actor.kind !== 'user') throw new Error('user token required');
      app.hub.add(actor.sub, socket);
      socket.send(JSON.stringify({ event: 'connected', data: { userId: actor.sub } }));
      socket.on('message', raw => {
        if (String(raw) === 'ping') socket.send(JSON.stringify({ event: 'pong', data: { at: Date.now() } }));
      });
    } catch (_) {
      socket.close(1008, 'invalid token');
    }
  });
}

module.exports = chatRoutes;
