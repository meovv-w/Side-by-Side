const api = require('../../utils/api');

function decorate(item) {
  const statusMap = { open: '招募中', full: '已满员', started: '行进中', done: '已结束' };
  return {
    ...item,
    avatarText: (item.owner && item.owner.nickname || item.ownerName || '同').slice(0, 1),
    ownerCreditScore: item.owner && (item.owner.creditScore || item.owner.credit_score) || '-',
    statusText: statusMap[item.status] || item.status,
    plansText: (item.plans || []).join(' · '),
    equipmentText: (item.equipment || []).join(' · ')
  };
}

Page({
  data: {
    trips: [],
    allTrips: [],
    currentTrip: null,
    filters: [
      { key: 'recommend', label: '顺路推荐' },
      { key: 'joined', label: '我的行程' },
      { key: 'pending', label: '申请中' }
    ],
    currentFilter: 'recommend',
    sortModes: [{ key: 'match', label: '顺路' }, { key: 'distance', label: '距离' }, { key: 'time', label: '时间' }],
    sortMode: 'match'
  },

  onShow() {
    this.load();
  },

  load() {
    api.listTrips(this.data.sortMode).then(res => {
      if (!res.ok) return;
      const allTrips = res.data.map(decorate);
      const currentTrip = allTrips.find(item => item.joined && item.status !== 'done') || null;
      this.setData({ allTrips, currentTrip }, this.applyFilter);
    });
  },

  changeFilter(event) {
    this.setData({ currentFilter: event.currentTarget.dataset.key }, this.applyFilter);
  },

  changeSort(event) {
    this.setData({ sortMode: event.currentTarget.dataset.key }, () => this.load());
  },

  applyFilter() {
    const current = this.data.currentFilter;
    const trips = this.data.allTrips.filter(item => {
      if (current === 'joined') return item.participated || item.joined || item.owned;
      if (current === 'pending') return item.requestStatus === 'pending';
      return !item.joined && !item.owned && item.status === 'open';
    });
    this.setData({ trips });
  },

  publish() {
    wx.navigateTo({ url: '/pages/publishTrip/publishTrip' });
  },

  openTrip(event) {
    wx.navigateTo({ url: `/pages/tripDetail/tripDetail?id=${event.currentTarget.dataset.id}` });
  },

  greet(event) {
    wx.navigateTo({ url: `/pages/privateChat/privateChat?id=${event.currentTarget.dataset.owner}` });
  },

  apply(event) {
    const tripId = event.currentTarget.dataset.id;
    wx.showModal({
      title: '申请加入车队',
      content: '提交后由队长审批，通过后会自动进入车队群聊。',
      editable: true,
      placeholderText: '向队长介绍一下自己和车辆',
      confirmText: '提交申请',
      success: result => {
        if (!result.confirm) return;
        api.applyTrip(tripId, result.content).then(res => {
          if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
          wx.showToast({ title: res.data.status === 'joined' ? '已在车队中' : '申请已提交' });
          this.load();
        });
      }
    });
  }
});
