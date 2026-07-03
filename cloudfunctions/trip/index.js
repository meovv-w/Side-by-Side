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

async function getTrip(tripId) {
  const tripRes = await db.collection('trips').doc(tripId).get().catch(() => null);
  return tripRes && tripRes.data ? tripRes.data : null;
}

exports.main = async event => {
  const action = event.action || 'list';

  try {
    if (action === 'home') {
      const user = await getCurrentUser();
      const trips = await db.collection('trips').limit(3).get();
      const groupbuys = await db.collection('groupbuys').limit(2).get();
      const allTrips = await db.collection('trips').get();
      const members = await db.collection('trip_members').where({ userId: user._id }).get();
      const orders = await db.collection('orders').where({ userId: user._id }).get();
      return ok({
        user,
        trips: trips.data,
        groupbuys: groupbuys.data,
        stats: {
          tripCount: allTrips.data.length,
          joinedTripCount: members.data.length,
          orderCount: orders.data.length
        }
      });
    }

    if (action === 'list') {
      const trips = await db.collection('trips').get();
      return ok(trips.data);
    }

    if (action === 'detail') {
      const trip = await getTrip(event.tripId);
      if (!trip) return fail('行程不存在');
      const members = await db.collection('trip_members').where({ tripId: event.tripId }).get();
      const user = await getCurrentUser();
      return ok({
        trip,
        members: members.data,
        joined: members.data.some(item => item.userId === user._id)
      });
    }

    if (action === 'create') {
      const payload = event.payload || {};
      const user = await getCurrentUser();
      const trip = {
        ownerId: user._id,
        ownerName: user.nickname,
        title: payload.title || `${payload.from} 到 ${payload.to}`,
        from: payload.from,
        to: payload.to,
        departAt: payload.departAt,
        seatTotal: Number(payload.seatTotal || 3),
        seatJoined: 1,
        priceShare: Number(payload.priceShare || 0),
        status: 'open',
        note: payload.note || '',
        route: [
          { latitude: 30.2741, longitude: 120.1551 },
          { latitude: 29.6097, longitude: 119.0419 }
        ],
        teammates: [
          { userId: user._id, nickname: user.nickname, latitude: 30.2741, longitude: 120.1551 }
        ],
        createdAt: currentTime()
      };
      const addRes = await db.collection('trips').add({ data: trip });
      const created = { _id: addRes._id, ...trip };
      await db.collection('trip_members').add({
        data: {
          tripId: created._id,
          userId: user._id,
          nickname: user.nickname,
          role: 'owner',
          joinedAt: currentTime()
        }
      });
      return ok(created);
    }

    if (action === 'join') {
      const trip = await getTrip(event.tripId);
      if (!trip) return fail('行程不存在');
      const user = await getCurrentUser();
      const memberRes = await db.collection('trip_members').where({ tripId: event.tripId, userId: user._id }).limit(1).get();
      if (memberRes.data.length > 0) return ok({ trip, joined: true });
      if (trip.seatJoined >= trip.seatTotal) return fail('座位已满');

      const teammates = trip.teammates || [];
      teammates.push({ userId: user._id, nickname: user.nickname, latitude: 30.18, longitude: 119.92 });
      const seatJoined = trip.seatJoined + 1;
      const status = seatJoined >= trip.seatTotal ? 'full' : trip.status;
      await db.collection('trips').doc(event.tripId).update({ data: { seatJoined, status, teammates } });
      await db.collection('trip_members').add({
        data: {
          tripId: event.tripId,
          userId: user._id,
          nickname: user.nickname,
          role: 'passenger',
          joinedAt: currentTime()
        }
      });
      return ok({ trip: { ...trip, seatJoined, status, teammates }, joined: true });
    }

    return fail(`未知 trip action: ${action}`);
  } catch (err) {
    console.error('[trip]', action, err);
    return fail(err.message || 'trip 云函数失败');
  }
};
