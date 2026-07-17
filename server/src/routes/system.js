const { assert } = require('../lib/errors');

async function systemRoutes(app) {
  app.post('/api/uploads', { preHandler: app.authenticate }, async (request, reply) => {
    const file = await request.file();
    assert(file, 400, 'FILE_REQUIRED', '请选择要上传的文件');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];
    assert(allowed.includes(file.mimetype), 400, 'FILE_TYPE_INVALID', '仅支持 JPG、PNG、WebP、MP3、M4A 和 AAC 文件');
    const buffer = await file.toBuffer();
    assert(buffer.length <= 10 * 1024 * 1024, 413, 'FILE_TOO_LARGE', '文件不能超过10MB');
    const directory = file.fields && file.fields.directory && file.fields.directory.value || 'chat';
    return reply.code(201).ok(await app.providers.storage.upload({ buffer, filename: file.filename, mimetype: file.mimetype, directory }));
  });

  app.post('/api/internal/jobs/run', { preHandler: app.requireJob }, async (request, reply) => reply.ok(await runJobs(app)));
}

async function runJobs(app) {
  const [orders, groupbuys, topics, trafficTopics, dropouts, settlements] = await Promise.all([
    app.services.commerce.closeExpiredOrders(),
    app.services.commerce.expireSessions(),
    app.services.chat.archiveInactiveTopics(),
    app.services.chat.createTrafficTopics(),
    app.services.trips.runDropoutSweep(),
    app.services.ops.reconcileSettlements()
  ]);
  return { orders, groupbuys, topics, trafficTopics, dropouts, settlements };
}

module.exports = systemRoutes;
module.exports.runJobs = runJobs;
