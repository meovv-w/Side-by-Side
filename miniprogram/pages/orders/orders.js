const api = require('../../utils/api');

const statusText = {
  paid: '待核销',
  used: '已核销',
  refunded: '已退款'
};

Page({
  data: {
    filters: [{ key: 'all', label: '全部' }, { key: 'paid', label: '待使用' }, { key: 'refund', label: '退款/售后' }, { key: 'used', label: '已完成' }],
    current: 'all',
    allOrders: [],
    orders: []
  },

  onShow() {
    api.listOrders().then(res => {
      if (!res.ok) return;
      const allOrders = res.data.map(item => ({
        ...item,
        statusText: item.refundStatus === 'pending' ? '退款审核中' : statusText[item.status] || item.status,
        statusClass: item.refundStatus === 'pending' ? 'warning' : item.status === 'used' ? 'success' : item.status === 'refunded' ? 'neutral' : 'danger'
      }));
      this.setData({ allOrders }, this.applyFilter);
    });
  },

  change(event) {
    this.setData({ current: event.currentTarget.dataset.key }, this.applyFilter);
  },

  applyFilter() {
    const current = this.data.current;
    const orders = this.data.allOrders.filter(item => {
      if (current === 'refund') return item.refundStatus !== 'none' || item.status === 'refunded';
      if (current === 'paid') return item.status === 'paid' && item.refundStatus === 'none';
      if (current === 'used') return item.status === 'used';
      return true;
    });
    this.setData({ orders });
  },

  open(event) {
    wx.navigateTo({ url: `/pages/orderDetail/orderDetail?id=${event.currentTarget.dataset.id}` });
  },

  groupbuys() {
    wx.navigateTo({ url: '/pages/groupbuyList/groupbuyList' });
  },

  support() {
    wx.navigateTo({ url: '/pages/support/support?category=订单问题' });
  }
});
