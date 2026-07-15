const api = require('../../utils/api');

Page({
  data: {
    id: '',
    item: null,
    checkoutOpen: false,
    selectedCouponId: '',
    selectedCoupon: null,
    payable: 0,
    countdown: '--:--:--'
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.load();
    this.timer = setInterval(() => this.updateCountdown(), 1000);
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
  },

  load() {
    api.getGroupbuy(this.data.id).then(res => {
      if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
      const raw = res.data;
      const target = Number(raw.targetPeople || raw.minPeople || 1);
      const item = {
        ...raw,
        progress: Math.min(100, Math.round(Number(raw.joined || 0) / target * 100)),
        remain: Math.max(0, target - Number(raw.joined || 0)),
        saved: Number((Number(raw.originPrice) - Number(raw.currentPrice)).toFixed(1)),
        tiers: (raw.tiers || []).map(tier => ({ ...tier, save: Number((Number(raw.originPrice) - Number(tier.price)).toFixed(1)), reached: Number(raw.joined) >= Number(tier.people), next: Number(raw.joined) < Number(tier.people) })) ,
        participantAvatars: (raw.participants || []).map(name => ({ name, text: name.slice(0, 1) }))
      };
      this.setData({ item, payable: item.currentPrice }, this.updateCountdown);
    });
  },

  updateCountdown() {
    if (!this.data.item) return;
    const remain = Math.max(0, new Date(this.data.item.validUntil.replace(/-/g, '/')).getTime() - Date.now());
    const days = Math.floor(remain / 86400000);
    const hours = Math.floor(remain % 86400000 / 3600000);
    const minutes = Math.floor(remain % 3600000 / 60000);
    const seconds = Math.floor(remain % 60000 / 1000);
    const pad = value => `${value}`.padStart(2, '0');
    this.setData({ countdown: `${days}天 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}` });
  },

  openCheckout() {
    this.setData({ checkoutOpen: true });
  },

  closeCheckout() {
    this.setData({ checkoutOpen: false });
  },

  selectCoupon(event) {
    const couponId = event.currentTarget.dataset.id || '';
    const selectedCoupon = (this.data.item.coupons || []).find(item => item._id === couponId) || null;
    this.setData({ selectedCouponId: couponId, selectedCoupon, payable: Math.max(0, Number((this.data.item.currentPrice - Number(selectedCoupon && selectedCoupon.amount || 0)).toFixed(2))) });
  },

  pay() {
    wx.showLoading({ title: '正在创建订单' });
    api.createOrder(this.data.id, { couponId: this.data.selectedCouponId }).then(res => {
      wx.hideLoading();
      if (!res.ok) return wx.showToast({ title: res.message || '下单失败', icon: 'none' });
      this.setData({ checkoutOpen: false });
      if (res.data.existing) {
        wx.showToast({ title: '已有待核销订单', icon: 'none' });
        return wx.navigateTo({ url: `/pages/orderDetail/orderDetail?id=${res.data._id}` });
      }
      wx.showModal({
        title: '支付成功 · 又砍一刀',
        content: `参团人数已更新，本档已省 ¥${this.data.item.saved}。实付 ¥${res.data.amount}，核销码已放入订单。`,
        showCancel: false,
        confirmText: '查看订单',
        success: () => wx.redirectTo({ url: `/pages/orderDetail/orderDetail?id=${res.data._id}` })
      });
    });
  },

  shareTeam() {
    api.getHome().then(home => {
      if (!home.ok || !home.data.currentTrip) return wx.showToast({ title: '请先加入车队', icon: 'none' });
      api.sendMessage(home.data.currentTrip._id, `${this.data.item.title} · 车队价 ¥${this.data.item.currentPrice}`, 'groupbuy').then(() => wx.showToast({ title: '已发到车队群' }));
    });
  },

  startGroupbuy() {
    const targets = (this.data.item.tiers || []).map(item => Number(item.people)).filter(value => value > 1);
    if (!targets.length) return wx.showToast({ title: '商家未设置可选人数', icon: 'none' });
    wx.showActionSheet({
      itemList: targets.map(value => `${value} 人目标`),
      success: selection => {
        api.getHome().then(home => {
          const tripId = home.ok && home.data.currentTrip && home.data.currentTrip._id;
          api.createGroupbuySession(this.data.item.productId || this.data.item._id, { targetPeople: targets[selection.tapIndex], tripId }).then(response => {
            if (!response.ok) return wx.showToast({ title: response.message, icon: 'none' });
            wx.showToast({ title: '新拼团已发起' });
            wx.redirectTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${response.data._id}` });
          });
        });
      }
    });
  },

  support() {
    wx.navigateTo({ url: '/pages/support/support?category=支付问题' });
  },

  navigate() {
    wx.openLocation({ latitude: 29.63, longitude: 119.06, name: this.data.item.merchantName, address: this.data.item.address || '' });
  },

  openMerchant() {
    wx.navigateTo({ url: `/pages/merchantDetail/merchantDetail?id=${this.data.item.merchantId}` });
  },

  onShareAppMessage() {
    return { title: `${this.data.item.title}，一起拼更便宜`, path: `/pages/groupbuyDetail/groupbuyDetail?id=${this.data.id}` };
  },

  onShareTimeline() {
    return { title: `${this.data.item.title}，一起拼更便宜`, query: `id=${this.data.id}` };
  }
});
