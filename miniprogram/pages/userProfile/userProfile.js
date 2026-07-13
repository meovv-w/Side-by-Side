const api = require('../../utils/api');

Page({
  data: { id: '', self: false, user: {}, trips: [], following: false, relation: 'stranger', avatarText: '同' },
  onLoad(options) { this.setData({ id: options.id || '', self: options.self === '1' }); },
  onShow() { this.load(); },
  load() {
    api.getUserProfile(this.data.id).then(res => {
      if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
      this.setData({ ...res.data, avatarText: (res.data.user.nickname || '同').slice(0, 1) });
      wx.setNavigationBarTitle({ title: res.data.user.nickname });
    });
  },
  follow() { api.toggleFollow('user', this.data.id).then(() => this.load()); },
  message() { wx.navigateTo({ url: `/pages/privateChat/privateChat?id=${this.data.id}` }); },
  edit() { wx.navigateTo({ url: '/pages/settings/settings?section=profile' }); },
  openTrip(event) { wx.navigateTo({ url: `/pages/tripDetail/tripDetail?id=${event.currentTarget.dataset.id}` }); }
});
