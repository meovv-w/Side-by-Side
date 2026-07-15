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
      this.setData({ merchant, groupbuys: merchant.groupbuys || [], scoreText: (Number(merchant.score || 100) / 20).toFixed(1) });
      wx.setNavigationBarTitle({ title: merchant.name });
    });
  },
  openGroupbuy(event) {
    wx.navigateTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${event.currentTarget.dataset.id}` });
  },
  navigate() {
    const merchant = this.data.merchant;
    wx.openLocation({ latitude: Number(merchant.lat || 29.63), longitude: Number(merchant.lng || 119.06), name: merchant.name, address: merchant.address || '' });
  },
  call() {
    const phone = this.data.merchant.rescuePhone || this.data.merchant.phone;
    if (phone) wx.makePhoneCall({ phoneNumber: phone });
  }
});
