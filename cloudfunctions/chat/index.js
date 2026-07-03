const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function currentTime() {
  const d = new Date();
  const pad = n => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ok(data) {
  return { ok: true, data };
}

function fail(message) {
  return { ok: false, message };
}

async function getCurrentUser() {
  const { OPENID } = cloud.getWXContext();
  const openid = OPENID || 'cloud-mock-openid';
  const res = await db.collection('users').where({ openid }).limit(1).get();
  if (res.data.length > 0) return res.data[0];

  const user = {
    openid,
    nickname: '同路用户',
    avatar: '',
    role: 'passenger',
    createdAt: currentTime()
  };
  const addRes = await db.collection('users').add({ data: user });
  return { _id: addRes._id, ...user };
}

exports.main = async event => {
  const action = event.action || 'list';

  try {
    if (action === 'list') {
      const messages = await db.collection('messages').where({ tripId: event.tripId }).get();
      return ok(messages.data);
    }

    if (action === 'send') {
      const content = `${event.content || ''}`.trim();
      if (!content) return fail('消息不能为空');

      const user = await getCurrentUser();
      const message = {
        tripId: event.tripId,
        userId: user._id,
        nickname: user.nickname,
        content,
        createdAt: currentTime()
      };
      const addRes = await db.collection('messages').add({ data: message });
      return ok({ _id: addRes._id, ...message });
    }

    return fail(`未知 chat action: ${action}`);
  } catch (err) {
    console.error('[chat]', action, err);
    return fail(err.message || 'chat 云函数失败');
  }
};
