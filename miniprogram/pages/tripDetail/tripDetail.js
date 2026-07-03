const api = require('../../utils/api');

Page({
  data: {
    id: '',
    trip: null,
    members: [],
    joined: false,
    center: { latitude: 30.2741, longitude: 120.1551 },
    markers: [],
    polyline: []
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.load();
  },

  load() {
    api.getTrip(this.data.id).then(res => {
      if (!res.ok) {
        wx.showToast({ title: res.message || '行程不存在', icon: 'none' });
        return;
      }
      const trip = res.data.trip;
      const teammates = trip.teammates || [];
      const route = trip.route || [];
      const statusText = trip.status === 'full' ? '已满员' : trip.status === 'done' ? '已结束' : '可加入';
      this.setData({
        trip: { ...trip, statusText },
        members: res.data.members,
        joined: res.data.joined,
        center: route[0] || this.data.center,
        markers: teammates.map((item, index) => ({
          id: index + 1,
          latitude: item.latitude,
          longitude: item.longitude,
          title: item.nickname
        })),
        polyline: route.length > 0 ? [{
          points: route,
          color: '#176B5B',
          width: 4
        }] : []
      });
    });
  },

  join() {
    api.joinTrip(this.data.id).then(res => {
      if (!res.ok) {
        wx.showToast({ title: res.message || '加入失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已加入' });
      this.load();
    });
  },

  openChat() {
    wx.navigateTo({ url: `/pages/chatGroup/chatGroup?id=${this.data.id}` });
  },

  openGroupbuys() {
    wx.switchTab({ url: '/pages/groupbuyList/groupbuyList' });
  }
});
