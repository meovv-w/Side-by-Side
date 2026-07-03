const api = require('../../utils/api');

Page({
  data: {
    trips: [],
    filters: [
      { key: 'all', label: '全部' },
      { key: 'open', label: '可加入' },
      { key: 'joined', label: '我参与' }
    ],
    currentFilter: 'all',
    allTrips: []
  },

  onShow() {
    api.listTrips().then(res => {
      if (res.ok) {
        const trips = res.data.map(item => ({
          ...item,
          statusText: item.status === 'full' ? '已满员' : item.status === 'done' ? '已结束' : '可加入'
        }));
        this.setData({ allTrips: trips }, this.applyFilter);
      }
    });
  },

  changeFilter(event) {
    this.setData({ currentFilter: event.currentTarget.dataset.key }, this.applyFilter);
  },

  applyFilter() {
    const current = this.data.currentFilter;
    const trips = this.data.allTrips.filter(item => {
      if (current === 'open') return item.status === 'open';
      if (current === 'joined') return item.seatJoined > 1;
      return true;
    });
    this.setData({ trips });
  },

  publish() {
    wx.navigateTo({ url: '/pages/publishTrip/publishTrip' });
  },

  openTrip(event) {
    wx.navigateTo({ url: `/pages/tripDetail/tripDetail?id=${event.currentTarget.dataset.id}` });
  }
});
