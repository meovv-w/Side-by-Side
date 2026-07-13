const api = require('../../utils/api');

const levelTitles = ['新手同行', '可靠旅伴', '路线达人', '同路达人', '五星领队'];

Page({
  data: {
    user: {},
    trips: [],
    orders: [],
    coupons: [],
    growthLogs: [],
    nextTrips: [],
    social: {},
    avatarText: '同',
    growthProgress: 0,
    levelTitle: '新手同行',
    currentTrip: null
  },

  onShow() {
    this.load();
  },

  load() {
    api.getMine().then(res => {
      if (!res.ok) return;
      const user = res.data.user;
      const currentTrip = (res.data.trips || []).find(item => item.status !== 'done') || null;
      this.setData({
        user,
        trips: res.data.trips || [],
        orders: res.data.orders || [],
        coupons: res.data.coupons || [],
        growthLogs: res.data.growthLogs || [],
        nextTrips: res.data.nextTrips || [],
        social: res.data.social || {},
        currentTrip,
        avatarText: (user.nickname || '同').slice(0, 1),
        growthProgress: Math.min(100, Math.round(Number(user.growth || 0) / 10000 * 100)),
        levelTitle: levelTitles[Math.max(0, Math.min(levelTitles.length - 1, Number(user.level || 1) - 1))]
      });
    });
  },

  openProfile() {
    wx.navigateTo({ url: `/pages/userProfile/userProfile?id=${this.data.user._id}&self=1` });
  },

  openTrip() {
    if (this.data.currentTrip) wx.navigateTo({ url: `/pages/tripDetail/tripDetail?id=${this.data.currentTrip._id}` });
  },

  nav(event) {
    const url = event.currentTarget.dataset.url;
    if (url === '/pages/trips/trips' || url === '/pages/messages/messages') wx.switchTab({ url });
    else wx.navigateTo({ url });
  }
});
