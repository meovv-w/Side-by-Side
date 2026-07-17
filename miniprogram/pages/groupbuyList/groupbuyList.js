const api = require('../../utils/api');

Page({
  data: {
    filters: [{ key: 'nearby', label: '离我最近' }, { key: 'route', label: '当前路线' }, { key: 'hot', label: '人气最高' }],
    current: 'nearby',
    routeLabel: '附近路线',
    currentTrip: null,
    items: [],
    loading: true
  },

  onShow() {
    api.getHome().then(home => {
      const currentTrip = home.ok ? home.data.currentTrip : null;
      this.setData({
        currentTrip,
        routeLabel: currentTrip ? `${currentTrip.from} → ${currentTrip.to}` : '附近路线'
      });
      this.loadItems();
    });
  },

  loadItems() {
    this.setData({ loading: true });
    api.listGroupbuys({ mode: this.data.current, tripId: this.data.currentTrip && this.data.currentTrip._id }).then(res => {
      if (!res.ok) {
        this.setData({ loading: false });
        return wx.showToast({ title: res.message || '拼团加载失败', icon: 'none' });
      }
      const items = res.data.map(item => ({
        ...item,
        progress: Math.min(100, Math.round(Number(item.joined || 0) / Number(item.targetPeople || item.minPeople || 1) * 100)),
        save: Number((Number(item.originPrice || 0) - Number(item.currentPrice || item.price || 0)).toFixed(1)),
        displayDistance: this.data.current === 'route' && item.routeDistanceKm != null
          ? `沿路线 ${item.routeDistanceKm}km`
          : `${item.distanceKm}km`
      }));
      this.setData({ items, loading: false });
    });
  },

  change(event) {
    const current = event.currentTarget.dataset.key;
    if (current === this.data.current) return;
    if (current === 'route' && !this.data.currentTrip) return wx.showToast({ title: '当前没有进行中的路线', icon: 'none' });
    this.setData({ current }, () => this.loadItems());
  },

  open(event) {
    const item = this.data.items.find(row => row._id === event.currentTarget.dataset.id);
    if (!item) return;
    if (item.availableToStart) return this.startProduct(item);
    wx.navigateTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${item._id}` });
  },

  startProduct(item) {
    const targets = (item.tiers || []).map(tier => Number(tier.people)).filter(value => value > 1);
    if (!targets.length) return wx.showToast({ title: '商家未设置成团人数', icon: 'none' });
    wx.showActionSheet({
      itemList: targets.map(value => `${value} 人目标`),
      success: selection => {
        api.createGroupbuySession(item.productId, {
          targetPeople: targets[selection.tapIndex],
          tripId: this.data.currentTrip && this.data.currentTrip._id
        }).then(response => {
          if (!response.ok) return wx.showToast({ title: response.message, icon: 'none' });
          wx.navigateTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${response.data._id}` });
        });
      }
    });
  }
});
