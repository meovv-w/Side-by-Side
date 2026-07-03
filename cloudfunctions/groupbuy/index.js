const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function ok(data) {
  return { ok: true, data };
}

function fail(message) {
  return { ok: false, message };
}

exports.main = async event => {
  const action = event.action || 'list';

  try {
    if (action === 'list') {
      const res = await db.collection('groupbuys').get();
      return ok(res.data);
    }

    if (action === 'detail') {
      const res = await db.collection('groupbuys').doc(event.groupbuyId).get().catch(() => null);
      return res && res.data ? ok(res.data) : fail('拼团不存在');
    }

    return fail(`未知 groupbuy action: ${action}`);
  } catch (err) {
    console.error('[groupbuy]', action, err);
    return fail(err.message || 'groupbuy 云函数失败');
  }
};
