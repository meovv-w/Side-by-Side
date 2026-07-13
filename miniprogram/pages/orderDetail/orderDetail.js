const api = require('../../utils/api');

Page({
  data: { id: '', order: null, codeDigits: [] },

  onLoad(options) {
    this.setData({ id: options.id || '' });
  },

  onShow() {
    api.getOrder(this.data.id).then(res => {
      if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
      const statusMap = { paid: '待核销', used: '已核销', refunded: '已退款' };
      const order = { ...res.data, statusText: res.data.refundStatus === 'pending' ? '退款审核中' : statusMap[res.data.status] || res.data.status };
      this.setData({ order, codeDigits: `${order.verifyCode || ''}`.split('') });
    });
  },

  copyCode() {
    wx.setClipboardData({ data: `${this.data.order.verifyCode}` });
  },

  refund() {
    wx.showModal({
      title: '申请退款',
      content: '请填写退款原因，运营将在审核后原路退回。',
      editable: true,
      placeholderText: '退款原因',
      confirmText: '提交申请',
      success: result => {
        if (!result.confirm) return;
        api.requestRefund(this.data.id, result.content).then(res => {
          if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
          wx.showToast({ title: '退款申请已提交' });
          this.onShow();
        });
      }
    });
  },

  navigate() {
    wx.openLocation({ latitude: 29.63, longitude: 119.06, name: this.data.order.merchantName, address: '沿途服务商家' });
  },

  support() {
    wx.navigateTo({ url: `/pages/support/support?category=订单问题&orderId=${this.data.id}` });
  }
});
