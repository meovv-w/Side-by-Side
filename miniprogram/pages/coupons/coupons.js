const api = require('../../utils/api');

Page({
  data: { coupons: [] },

  onShow() {
    api.listCoupons().then(res => {
      if (res.ok) this.setData({ coupons: res.data });
    });
  }
});
