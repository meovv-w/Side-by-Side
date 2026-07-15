async function tripRoutes(app) {
  const trips = app.services.trips;

  app.get('/api/trips', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await trips.list(request.actor.sub, request.query || {})));
  app.post('/api/trips', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await trips.create(request.actor.sub, request.body || {})));
  app.get('/api/trips/:tripId', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await trips.detail(request.actor.sub, request.params.tripId)));
  app.patch('/api/trips/:tripId', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await trips.update(request.actor.sub, request.params.tripId, request.body || {})));
  app.post('/api/trips/:tripId/applications', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await trips.apply(request.actor.sub, request.params.tripId, request.body && request.body.message)));
  app.put('/api/trip-applications/:applicationId', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await trips.reviewApplication(request.actor.sub, request.params.applicationId, request.body.approved === true)));
  app.post('/api/trips/:tripId/leave', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await trips.leave(request.actor.sub, request.params.tripId, request.body && request.body.reason)));
  app.put('/api/trip-members/:memberId/leave', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await trips.reviewLeave(request.actor.sub, request.params.memberId, request.body.approved === true)));
  app.delete('/api/trips/:tripId/members/:memberId', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await trips.removeByOwner(request.actor.sub, request.params.tripId, request.params.memberId, request.body && request.body.reason)));
  app.post('/api/trips/:tripId/state', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await trips.transition(request.actor.sub, request.params.tripId, request.body.action)));
  app.post('/api/locations', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await trips.reportLocation(request.actor.sub, request.body || {})));
  app.post('/api/presence', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await trips.reportPresence(request.actor.sub, request.body || {})));

  app.get('/api/trip-drafts', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await trips.drafts(request.actor.sub)));
  app.post('/api/trip-drafts', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await trips.createDraft(request.actor.sub, request.body || {})));
  app.get('/api/trip-drafts/:draftId/matches', { preHandler: app.requireUser }, async (request, reply) => reply.ok(await trips.draftMatches(request.actor.sub, request.params.draftId)));
  app.post('/api/trip-drafts/:draftId/convert', { preHandler: app.requireUser }, async (request, reply) => reply.code(201).ok(await trips.convertDraft(request.actor.sub, request.params.draftId, request.body || {})));
}

module.exports = tripRoutes;
