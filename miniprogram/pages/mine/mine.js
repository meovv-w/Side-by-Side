const api = require('../../utils/api');

Page({
  data: {
    user: {},
    trips: [],
    orders: [],
    coupons: [],
    invites: [],
    growthLogs: [],
    nextTrips: [],
    avatarText: '同'
  },

  onShow() {
    this.load();
  },

  load() {
    api.getMine().then(res => {
      if (!res.ok) return;
      const nickname = res.data.user.nickname || '同';
      this.setData({
        user: res.data.user,
        trips: res.data.trips,
        orders: res.data.orders,
        coupons: res.data.coupons || [],
        invites: res.data.invites || [],
        growthLogs: res.data.growthLogs || [],
        nextTrips: res.data.nextTrips || [],
        avatarText: nickname.slice(0, 1)
      });
    });
  },

  login() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  openTrip(event) {
    wx.navigateTo({ url: `/pages/tripDetail/tripDetail?id=${event.currentTarget.dataset.id}` });
  },

  nav(event) {
    wx.navigateTo({ url: event.currentTarget.dataset.url });
  }
});
