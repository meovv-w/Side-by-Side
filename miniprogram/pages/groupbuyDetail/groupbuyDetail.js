const api = require('../../utils/api');

function payableFor(price, coupon) {
  const amount = Number(price || 0);
  if (!coupon) return amount;
  const discount = coupon.type === 'discount' && Number(coupon.discountRate) > 0
    ? amount * (1 - Number(coupon.discountRate))
    : Number(coupon.amount || 0);
  return Math.max(0.01, Number((amount - Math.min(amount, discount)).toFixed(2)));
}

Page({
  data: {
    id: '',
    item: null,
    checkoutOpen: false,
    selectedCouponId: '',
    selectedCoupon: null,
    payable: 0,
    countdown: '--:--:--',
    cutAnimation: false,
    cutSavings: 0,
    cutDelta: 0
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    this.load();
    this.timer = setInterval(() => this.updateCountdown(), 1000);
    this.refreshTimer = setInterval(() => this.load(true), 5000);
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.cutTimer) clearTimeout(this.cutTimer);
  },

  load(silent = false) {
    if (this.loading) return;
    this.loading = true;
    api.getGroupbuy(this.data.id).then(res => {
      this.loading = false;
      if (!res.ok) {
        if (!silent) wx.showToast({ title: res.message, icon: 'none' });
        return;
      }
      const raw = res.data;
      const previous = this.data.item;
      const target = Number(raw.targetPeople || raw.minPeople || 1);
      const item = {
        ...raw,
        progress: Math.min(100, Math.round(Number(raw.joined || 0) / target * 100)),
        remain: Math.max(0, target - Number(raw.joined || 0)),
        saved: Number((Number(raw.originPrice) - Number(raw.currentPrice)).toFixed(1)),
        tiers: (raw.tiers || []).map(tier => ({ ...tier, save: Number((Number(raw.originPrice) - Number(tier.price)).toFixed(1)), reached: Number(raw.joined) >= Number(tier.people), next: Number(raw.joined) < Number(tier.people) })) ,
        participantAvatars: (raw.participantUsers && raw.participantUsers.length
          ? raw.participantUsers.map(user => ({ name: user.nickname, text: (user.nickname || '同').slice(0, 1), avatar: user.avatar || '' }))
          : (raw.participants || []).map(name => ({ name, text: name.slice(0, 1), avatar: '' })))
      };
      const selectedCoupon = (item.coupons || []).find(coupon => coupon._id === this.data.selectedCouponId) || null;
      const payable = payableFor(item.currentPrice, selectedCoupon);
      this.setData({ item, selectedCoupon, payable }, this.updateCountdown);
      if (previous && Number(item.joined) > Number(previous.joined)) {
        const cutDelta = Number(Math.max(0, Number(previous.currentPrice) - Number(item.currentPrice)).toFixed(1));
        this.setData({ cutAnimation: true, cutDelta, cutSavings: item.saved });
        if (this.cutTimer) clearTimeout(this.cutTimer);
        this.cutTimer = setTimeout(() => this.setData({ cutAnimation: false }), 1200);
      }
    }).catch(() => {
      this.loading = false;
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
    const countdown = this.data.item.status === 'success'
      ? '拼团已成功'
      : this.data.item.status === 'failed' || remain <= 0 ? '拼团已结束' : `${days}天 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    this.setData({ countdown });
  },

  openCheckout() {
    if (!this.data.item || this.data.item.status !== 'forming') return wx.showToast({ title: this.data.item && this.data.item.status === 'success' ? '该拼团已成功' : '该拼团已结束', icon: 'none' });
    this.setData({ checkoutOpen: true });
  },

  closeCheckout() {
    this.setData({ checkoutOpen: false });
  },

  selectCoupon(event) {
    const couponId = event.currentTarget.dataset.id || '';
    const selectedCoupon = (this.data.item.coupons || []).find(item => item._id === couponId) || null;
    this.setData({ selectedCouponId: couponId, selectedCoupon, payable: payableFor(this.data.item.currentPrice, selectedCoupon) });
  },

  pay() {
    wx.showLoading({ title: '正在创建订单' });
    api.createOrder(this.data.id, { couponId: this.data.selectedCouponId }).then(res => {
      wx.hideLoading();
      if (!res.ok) return this.handlePaymentError(res);
      this.setData({ checkoutOpen: false });
      if (res.data.existing) {
        wx.showToast({ title: '已有待核销订单', icon: 'none' });
        return wx.navigateTo({ url: `/pages/orderDetail/orderDetail?id=${res.data._id}` });
      }
      const joined = Number(this.data.item.joined || 0) + 1;
      const priceAt = people => (this.data.item.tiers || []).reduce((price, tier) => people >= Number(tier.people) ? Number(tier.price) : price, Number(this.data.item.originPrice));
      const previousPrice = priceAt(Math.max(1, joined - 1));
      const currentPrice = priceAt(joined);
      const cutDelta = Number(Math.max(0, previousPrice - currentPrice).toFixed(1));
      const cutSavings = Number((Number(this.data.item.originPrice) - currentPrice).toFixed(1));
      this.setData({ cutAnimation: true, cutSavings, cutDelta });
      setTimeout(() => {
        this.setData({ cutAnimation: false });
        wx.showModal({
          title: cutDelta > 0 ? '支付成功 · 又砍一刀' : '支付成功 · 进度已更新',
          content: `参团人数已更新，本档已省 ¥${cutSavings}。实付 ¥${res.data.amount}，核销码已放入订单。`,
          showCancel: false,
          confirmText: '查看订单',
          success: () => wx.redirectTo({ url: `/pages/orderDetail/orderDetail?id=${res.data._id}` })
        });
      }, 900);
    });
  },

  handlePaymentError(result) {
    if (!result.error || result.error.code !== 'WECHAT_BINDING_REQUIRED') return wx.showToast({ title: result.message || '下单失败', icon: 'none' });
    const orderId = result.error.details && result.error.details.orderId;
    wx.showModal({
      title: '绑定微信后支付',
      content: '当前账号由手机号注册，绑定本微信后即可调用微信支付。',
      confirmText: '绑定并继续',
      success: modal => {
        if (!modal.confirm) return;
        api.bindWechat().then(binding => {
          if (!binding.ok) return wx.showToast({ title: binding.message || '绑定失败', icon: 'none' });
          if (!orderId) return wx.showToast({ title: '微信已绑定，请重新参团', icon: 'none' });
          wx.showLoading({ title: '正在调起支付', mask: true });
          api.retryOrderPayment(orderId).then(payment => {
            wx.hideLoading();
            if (!payment.ok) return wx.showToast({ title: payment.message || '支付未完成', icon: 'none' });
            wx.redirectTo({ url: `/pages/orderDetail/orderDetail?id=${orderId}` });
          });
        });
      }
    });
  },

  shareTeam() {
    api.getHome().then(home => {
      if (!home.ok || !home.data.currentTrip) return wx.showToast({ title: '请先加入车队', icon: 'none' });
      api.sendMessage(home.data.currentTrip._id, `${this.data.item.title} · 车队价 ¥${this.data.item.currentPrice}`, 'groupbuy', {
        sessionId: this.data.id, productId: this.data.item.productId, merchantId: this.data.item.merchantId
      }).then(response => wx.showToast({ title: response.ok ? '已发到车队群' : response.message, icon: response.ok ? 'success' : 'none' }));
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
    const latitude = Number(this.data.item.latitude);
    const longitude = Number(this.data.item.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return wx.showToast({ title: '商家暂未提供导航位置', icon: 'none' });
    wx.openLocation({ latitude, longitude, name: this.data.item.merchantName, address: this.data.item.address || '' });
  },

  shareTimeline() {
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    wx.showToast({ title: '朋友圈分享已开启', icon: 'none' });
  },

  openMerchant() {
    wx.navigateTo({ url: `/pages/merchantDetail/merchantDetail?id=${this.data.item.merchantId}` });
  },

  onShareAppMessage() {
    return { title: `${this.data.item && this.data.item.title || '同路行车队拼团'}，一起拼更便宜`, path: `/pages/groupbuyDetail/groupbuyDetail?id=${this.data.id}` };
  },

  onShareTimeline() {
    return { title: `${this.data.item && this.data.item.title || '同路行车队拼团'}，一起拼更便宜`, query: `id=${this.data.id}` };
  }
});
