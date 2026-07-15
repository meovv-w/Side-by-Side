const { buildApp } = require('./app');
const { runJobs } = require('./routes/system');

async function start() {
  const app = await buildApp();
  await app.listen({ host: app.config.host, port: app.config.port });
  const timer = setInterval(() => runJobs(app).catch(error => app.log.error(error)), 60000);
  timer.unref();
  const shutdown = async () => {
    clearInterval(timer);
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
