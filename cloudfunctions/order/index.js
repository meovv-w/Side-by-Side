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
  const openid = OPENID || 'cloud-local-openid';
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
      const user = await getCurrentUser();
      const orders = await db.collection('orders').where({ userId: user._id }).get();
      return ok(orders.data);
    }

    if (action === 'create') {
      const user = await getCurrentUser();
      const groupbuyRes = await db.collection('groupbuys').doc(event.groupbuyId).get().catch(() => null);
      if (!groupbuyRes || !groupbuyRes.data) return fail('拼团不存在');

      const groupbuy = groupbuyRes.data;
      const existed = await db.collection('orders').where({
        userId: user._id,
        groupbuyId: event.groupbuyId,
        status: 'paid'
      }).limit(1).get();
      if (existed.data.length > 0) return ok(existed.data[0]);

      await db.collection('groupbuys').doc(event.groupbuyId).update({
        data: { joined: Number(groupbuy.joined || 0) + 1 }
      });

      const order = {
        userId: user._id,
        groupbuyId: event.groupbuyId,
        title: groupbuy.title,
        amount: groupbuy.price,
        status: 'paid',
        verifyCode: `${Math.floor(100000 + Math.random() * 900000)}`,
        createdAt: currentTime()
      };
      const addRes = await db.collection('orders').add({ data: order });
      return ok({ _id: addRes._id, ...order });
    }

    return fail(`未知 order action: ${action}`);
  } catch (err) {
    console.error('[order]', action, err);
    return fail(err.message || 'order 云函数失败');
  }
};
