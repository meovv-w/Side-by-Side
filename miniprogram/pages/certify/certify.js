const api = require('../../utils/api');

Page({
  data: {
    cert: {},
    form: { name: '', plate: '' }
  },

  onShow() {
    api.getCertification().then(res => {
      if (res.ok) this.setData({ cert: res.data, form: { name: res.data.name || '', plate: res.data.plate || '' } });
    });
  },

  input(event) {
    this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value });
  },

  submit() {
    if (!this.data.form.name || !this.data.form.plate) {
      wx.showToast({ title: '请填写姓名和车牌', icon: 'none' });
      return;
    }
    api.submitCertification(this.data.form).then(res => {
      if (res.ok) {
        this.setData({ cert: res.data });
        wx.showToast({ title: '已提交审核' });
      }
    });
  }
});
