const api = require('../../utils/api');

Page({
  data: { id: '', merchant: null, groupbuys: [], scoreText: '5.0' },
  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.load();
  },
  load() {
    api.getMerchant(this.data.id).then(response => {
      if (!response.ok) return wx.showToast({ title: response.message, icon: 'none' });
      const merchant = response.data;
      this.setData({
        merchant: { ...merchant, rescueServicesText: (merchant.rescueServices || []).join('、') || '请电话咨询服务项目' },
        groupbuys: merchant.groupbuys || [], scoreText: (Number(merchant.score || 100) / 20).toFixed(1)
      });
      wx.setNavigationBarTitle({ title: merchant.name });
    });
  },
  openGroupbuy(event) {
    const item = this.data.groupbuys.find(row => row._id === event.currentTarget.dataset.id);
    if (!item) return;
    if (!item.availableToStart) return wx.navigateTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${item._id}` });
    const targets = (item.tiers || []).map(tier => Number(tier.people)).filter(value => value > 1);
    if (!targets.length) return wx.showToast({ title: '商家未设置成团人数', icon: 'none' });
    wx.showActionSheet({
      itemList: targets.map(value => `${value} 人目标`),
      success: selection => api.getHome().then(home => {
        const tripId = home.ok && home.data.currentTrip && home.data.currentTrip._id;
        api.createGroupbuySession(item.productId, { targetPeople: targets[selection.tapIndex], tripId }).then(response => {
          if (!response.ok) return wx.showToast({ title: response.message, icon: 'none' });
          wx.navigateTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${response.data._id}` });
        });
      })
    });
  },
  navigate() {
    const merchant = this.data.merchant;
    const latitude = Number(merchant.lat);
    const longitude = Number(merchant.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return wx.showToast({ title: '商家暂未提供导航位置', icon: 'none' });
    wx.openLocation({ latitude, longitude, name: merchant.name, address: merchant.address || '' });
  },
  call() {
    const phone = this.data.merchant.rescuePhone || this.data.merchant.phone;
    if (phone) wx.makePhoneCall({ phoneNumber: phone });
  }
});
