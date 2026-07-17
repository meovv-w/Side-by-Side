const api = require('../../utils/api');

Page({
  data: { id: '', order: null, codeDigits: [] },

  onLoad(options) {
    this.setData({ id: options.id || '' });
  },

  onShow() {
    api.getOrder(this.data.id).then(res => {
      if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
      const statusMap = { pending: '待支付', paid: '待核销', used: '已核销', refunded: '已退款', closed: '订单已关闭' };
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

  retryPay() {
    wx.showLoading({ title: '正在调起支付', mask: true });
    api.retryOrderPayment(this.data.id).then(result => {
      wx.hideLoading();
      if (!result.ok && result.error && result.error.code === 'WECHAT_BINDING_REQUIRED') return this.bindAndRetry();
      if (!result.ok) return wx.showToast({ title: result.message || '支付未完成', icon: 'none' });
      wx.showToast({ title: '支付成功' });
      this.onShow();
    });
  },

  bindAndRetry() {
    wx.showModal({
      title: '绑定微信后支付', content: '绑定当前微信账号后即可继续支付。', confirmText: '绑定并继续',
      success: modal => {
        if (!modal.confirm) return;
        api.bindWechat().then(result => {
          if (!result.ok) return wx.showToast({ title: result.message || '绑定失败', icon: 'none' });
          this.retryPay();
        });
      }
    });
  },

  navigate() {
    const latitude = Number(this.data.order.merchantLatitude);
    const longitude = Number(this.data.order.merchantLongitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return wx.showToast({ title: '商家暂未提供导航位置', icon: 'none' });
    wx.openLocation({ latitude, longitude, name: this.data.order.merchantName, address: this.data.order.merchantAddress || '' });
  },

  support() {
    wx.navigateTo({ url: `/pages/support/support?category=订单问题&orderId=${this.data.id}` });
  }
});
