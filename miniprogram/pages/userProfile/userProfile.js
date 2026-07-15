const api = require('../../utils/api');

Page({
  data: {
    id: '', self: false, user: {}, trips: [], following: false, relation: 'stranger', avatarText: '同',
    trajectoryPolylines: [], trajectoryPoints: [], trajectoryLatitude: 30.2741, trajectoryLongitude: 120.1551
  },
  onLoad(options) { this.setData({ id: options.id || '', self: options.self === '1' }); },
  onShow() { this.load(); },
  load() {
    api.getUserProfile(this.data.id).then(res => {
      if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
      const routes = (res.data.trips || []).map(item => item.route || []).filter(route => route.length > 1);
      const colors = ['#1F6FEB', '#087F5B', '#C66A10', '#C83C32'];
      const trajectoryPoints = routes.reduce((points, route) => points.concat(route), []);
      this.setData({
        ...res.data, avatarText: (res.data.user.nickname || '同').slice(0, 1), trajectoryPoints,
        trajectoryPolylines: routes.map((points, index) => ({ points, color: colors[index % colors.length], width: 6, arrowLine: true })),
        trajectoryLatitude: trajectoryPoints[0] ? trajectoryPoints[0].latitude : this.data.trajectoryLatitude,
        trajectoryLongitude: trajectoryPoints[0] ? trajectoryPoints[0].longitude : this.data.trajectoryLongitude
      });
      wx.setNavigationBarTitle({ title: res.data.user.nickname });
    });
  },
  follow() { api.toggleFollow('user', this.data.id).then(() => this.load()); },
  message() { wx.navigateTo({ url: `/pages/privateChat/privateChat?id=${this.data.id}` }); },
  edit() { wx.navigateTo({ url: '/pages/settings/settings?section=profile' }); },
  openTrip(event) { wx.navigateTo({ url: `/pages/tripDetail/tripDetail?id=${event.currentTarget.dataset.id}` }); }
});
