const api = require('../../utils/api');

Page({
  data: {
    form: {
      from: '',
      to: '',
      departAt: '2026-07-04 08:30',
      seatTotal: '3',
      priceShare: '50',
      note: ''
    }
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  submit() {
    const form = this.data.form;
    if (!form.from || !form.to || !form.departAt) {
      wx.showToast({ title: '请补全信息', icon: 'none' });
      return;
    }
    if (Number(form.seatTotal) < 1 || Number(form.priceShare) < 0) {
      wx.showToast({ title: '人数或费用不正确', icon: 'none' });
      return;
    }
    api.createTrip(form).then(res => {
      if (!res.ok) {
        wx.showToast({ title: res.message || '发布失败', icon: 'none' });
        return;
      }
      wx.redirectTo({ url: `/pages/tripDetail/tripDetail?id=${res.data._id}` });
    });
  }
});
