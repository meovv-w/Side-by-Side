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

async function getOrCreateUser(profile = {}) {
  const { OPENID } = cloud.getWXContext();
  const openid = OPENID || 'cloud-mock-openid';
  const res = await db.collection('users').where({ openid }).limit(1).get();
  if (res.data.length > 0) {
    const user = res.data[0];
    if (profile.nickname && profile.nickname !== user.nickname) {
      await db.collection('users').doc(user._id).update({
        data: {
          nickname: profile.nickname,
          updatedAt: currentTime()
        }
      });
      user.nickname = profile.nickname;
    }
    return user;
  }

  const user = {
    openid,
    nickname: profile.nickname || '同路用户',
    avatar: profile.avatar || '',
    role: 'passenger',
    createdAt: currentTime()
  };
  const addRes = await db.collection('users').add({ data: user });
  return { _id: addRes._id, ...user };
}

exports.main = async event => {
  const action = event.action || 'mockLogin';

  try {
    if (action === 'mockLogin') {
      return ok(await getOrCreateUser(event.profile || {}));
    }

    if (action === 'mine') {
      const user = await getOrCreateUser();
      const members = await db.collection('trip_members').where({ userId: user._id }).get();
      const tripIds = members.data.map(item => item.tripId);
      const trips = [];

      for (const tripId of tripIds) {
        const tripRes = await db.collection('trips').doc(tripId).get().catch(() => null);
        if (tripRes && tripRes.data) trips.push(tripRes.data);
      }

      const orders = await db.collection('orders').where({ userId: user._id }).get();
      return ok({ user, trips, orders: orders.data });
    }

    return { ok: false, message: `未知 login action: ${action}` };
  } catch (err) {
    console.error('[login]', action, err);
    return { ok: false, message: err.message || 'login 云函数失败' };
  }
};
