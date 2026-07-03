const api = require('../../utils/api');

Page({
  data: {
    orders: []
  },

  onShow() {
    api.listOrders().then(res => {
      if (res.ok) {
        this.setData({
          orders: res.data.map(item => ({
            ...item,
            statusText: item.status === 'used' ? '已核销' : '待核销'
          }))
        });
      }
    });
  }
});
