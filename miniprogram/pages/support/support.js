const api = require('../../utils/api');

Page({
  data: { title: '' },

  input(event) {
    this.setData({ title: event.detail.value });
  },

  submit() {
    if (!this.data.title) {
      wx.showToast({ title: '请填写问题', icon: 'none' });
      return;
    }
    api.submitTicket({ title: this.data.title }).then(res => {
      if (res.ok) {
        this.setData({ title: '' });
        wx.showToast({ title: '已提交客服工单' });
      }
    });
  }
});
