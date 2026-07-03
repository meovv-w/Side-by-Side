const api = require('../../utils/api');

Page({
  data: {
    form: { from: '', to: '', departAt: '2026-07-12 09:00' },
    drafts: []
  },

  onShow() {
    this.load();
  },

  load() {
    api.getMine().then(res => {
      if (res.ok) this.setData({ drafts: res.data.nextTrips || [] });
    });
  },

  input(event) {
    this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value });
  },

  submit() {
    const { from, to, departAt } = this.data.form;
    if (!from || !to || !departAt) {
      wx.showToast({ title: '请补全草稿', icon: 'none' });
      return;
    }
    api.createNextTrip(this.data.form).then(res => {
      if (res.ok) {
        wx.showToast({ title: '已保存草稿' });
        this.load();
      }
    });
  }
});
