const api = require('../../utils/api');

Page({
  data: {
    filters: [{ key: 'nearby', label: '离我最近' }, { key: 'route', label: '当前路线' }, { key: 'hot', label: '人气最高' }],
    current: 'nearby',
    routeLabel: '附近路线',
    allItems: [],
    items: []
  },

  onShow() {
    Promise.all([api.listGroupbuys(), api.getHome()]).then(([res, home]) => {
      if (!res.ok) return;
      const allItems = res.data.map(item => ({
        ...item,
        progress: Math.min(100, Math.round(Number(item.joined || 0) / Number(item.targetPeople || item.minPeople || 1) * 100)),
        save: Number((Number(item.originPrice || 0) - Number(item.currentPrice || item.price || 0)).toFixed(1))
      }));
      const trip = home.ok && home.data.currentTrip;
      this.setData({ allItems, routeLabel: trip ? `${trip.from} → ${trip.to}` : '附近路线' }, this.sortItems);
    });
  },

  change(event) {
    this.setData({ current: event.currentTarget.dataset.key }, this.sortItems);
  },

  sortItems() {
    const current = this.data.current;
    const items = this.data.allItems.slice().sort((a, b) => {
      if (current === 'hot') return Number(b.joined) - Number(a.joined);
      if (current === 'route') return Number(a.distanceKm) - Number(b.distanceKm);
      return Number(a.distanceKm) - Number(b.distanceKm);
    });
    this.setData({ items });
  },

  open(event) {
    wx.navigateTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${event.currentTarget.dataset.id}` });
  }
});
