const api = require('../../utils/api');

Page({
  data: {
    items: []
  },

  onShow() {
    api.listGroupbuys().then(res => {
      if (res.ok) {
        this.setData({
          items: res.data.map(item => ({
            ...item,
            progress: Math.min(100, Math.round((item.joined / item.minPeople) * 100)),
            remain: Math.max(0, item.minPeople - item.joined)
          }))
        });
      }
    });
  },

  open(event) {
    wx.navigateTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${event.currentTarget.dataset.id}` });
  }
});
