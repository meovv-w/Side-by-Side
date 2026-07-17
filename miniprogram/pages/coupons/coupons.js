const api = require('../../utils/api');

function todayKey() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

Page({
  data: {
    tabs: [{ key: 'unused', label: '可使用' }, { key: 'used', label: '已使用' }, { key: 'expired', label: '已过期' }],
    typeTabs: [{ key: 'all', label: '全部类型' }, { key: 'platform', label: '平台券' }, { key: 'merchant', label: '商家券' }, { key: 'reward', label: '奖励券' }],
    current: 'unused',
    currentType: 'all',
    all: [],
    coupons: []
  },

  onShow() {
    api.listCoupons().then(res => {
      if (!res.ok) return wx.showToast({ title: res.message || '优惠券加载失败', icon: 'none' });
      const all = (res.data || []).map(item => ({
        ...item,
        expireAt: String(item.expireAt || item.expiresAt || '').slice(0, 10),
        scope: item.scope || '平台指定拼团商品可用',
        category: item.category || (['platform', 'merchant', 'reward'].includes(item.type) ? item.type : item.type === 'reward' ? 'reward' : item.merchantId ? 'merchant' : 'platform')
      }));
      this.setData({ all }, this.filter);
    });
  },

  change(event) {
    this.setData({ current: event.currentTarget.dataset.key }, this.filter);
  },

  changeType(event) {
    this.setData({ currentType: event.currentTarget.dataset.key }, this.filter);
  },

  filter() {
    const today = todayKey();
    const coupons = this.data.all.filter(item => {
      if (this.data.currentType !== 'all' && item.category !== this.data.currentType) return false;
      const expired = item.status === 'expired' || (item.status === 'unused' && item.expireAt && item.expireAt < today);
      if (this.data.current === 'expired') return expired;
      if (this.data.current === 'used') return item.status === 'used';
      return item.status === 'unused' && !expired;
    });
    this.setData({ coupons });
  },

  use(event) {
    const merchantId = event.currentTarget.dataset.merchant;
    wx.navigateTo({ url: merchantId ? `/pages/merchantDetail/merchantDetail?id=${merchantId}` : '/pages/groupbuyList/groupbuyList' });
  },

  copyCode(event) {
    const code = event.currentTarget.dataset.code;
    if (code) wx.setClipboardData({ data: String(code) });
  }
});
