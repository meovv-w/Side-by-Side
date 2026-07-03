const api = require('../../utils/api');

Page({
  data: {
    nickname: '林小路'
  },

  onInput(event) {
    this.setData({ nickname: event.detail.value });
  },

  submit() {
    api.login({ nickname: this.data.nickname }).then(res => {
      if (!res.ok) {
        wx.showToast({ title: res.message || '登录失败', icon: 'none' });
        return;
      }
      wx.switchTab({ url: '/pages/index/index' });
    });
  }
});
