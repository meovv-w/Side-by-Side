const api = require('../../utils/api');

Page({
  data: {
    inviteCode: '',
    qrcode: '',
    records: []
  },

  onShow() {
    api.listInvites().then(res => {
      if (res.ok) this.setData(res.data);
    });
  },

  share() {
    wx.showToast({ title: '已生成邀请分享卡', icon: 'none' });
  }
});
