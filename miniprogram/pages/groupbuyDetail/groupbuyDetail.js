const api = require('../../utils/api');

Page({
  data: {
    id: '',
    item: null
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.load();
  },

  load() {
    api.getGroupbuy(this.data.id).then(res => {
      if (res.ok) {
        const item = res.data;
        this.setData({
          item: {
            ...item,
            progress: Math.min(100, Math.round((item.joined / item.minPeople) * 100)),
            remain: Math.max(0, item.minPeople - item.joined)
          }
        });
      }
    });
  },

  pay() {
    api.createOrder(this.data.id).then(res => {
      if (!res.ok) {
        wx.showToast({ title: res.message || '下单失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已生成订单' });
      wx.navigateTo({ url: '/pages/orders/orders' });
    });
  }
});
