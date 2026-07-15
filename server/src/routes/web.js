const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

async function webRoutes(app) {
  app.get('/favicon.ico', async (request, reply) => reply.code(204).send());
  app.get('/merchant', async (request, reply) => reply.redirect('/merchant/'));
  app.get('/merchant/', async (request, reply) => sendFile(reply, path.join(ROOT, 'admin-merchant/index.html'), 'text/html; charset=utf-8'));
  app.get('/merchant/api-mode.js', async (request, reply) => sendFile(reply, path.join(ROOT, 'admin-merchant/api-mode.js'), 'application/javascript; charset=utf-8'));
  app.get('/ops', async (request, reply) => reply.redirect('/ops/'));
  app.get('/ops/', async (request, reply) => sendFile(reply, path.join(ROOT, 'admin-ops/index.html'), 'text/html; charset=utf-8'));
  app.get('/ops/api-mode.js', async (request, reply) => sendFile(reply, path.join(ROOT, 'admin-ops/api-mode.js'), 'application/javascript; charset=utf-8'));
  app.get('/invite', async (request, reply) => {
    const token = String(request.query.token || '');
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>同路行邀请</title><style>body{display:grid;min-height:100vh;margin:0;place-items:center;background:#f4f6f8;font:16px sans-serif;color:#1c2732}.box{max-width:420px;padding:28px;background:#fff;border:1px solid #dfe5ea;border-radius:8px;text-align:center}b{display:block;margin-bottom:12px;font-size:24px;color:#176b5b}</style><div class="box"><b>同路行</b><p>请使用微信扫描小程序邀请卡，或由好友从小程序内分享邀请链接。</p><p>邀请凭证已识别：${token ? '有效格式' : '缺失'}</p></div>`;
    return reply.type('text/html; charset=utf-8').send(html);
  });
}

function sendFile(reply, filename, type) {
  if (!fs.existsSync(filename)) return reply.code(404).send('Not found');
  return reply.type(type).send(fs.createReadStream(filename));
}

module.exports = webRoutes;
