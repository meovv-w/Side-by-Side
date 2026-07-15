const api = require('../../utils/api');

Page({
  data: { badges: [], ownedCount: 0 },
  onShow() {
    api.getBadgeWall().then(response => {
      if (!response.ok) return wx.showToast({ title: response.message, icon: 'none' });
      this.setData({ badges: response.data, ownedCount: response.data.filter(item => item.owned).length });
    });
  }
});
