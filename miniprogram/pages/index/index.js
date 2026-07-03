const api = require('../../utils/api');

Page({
  data: {
    trips: [],
    groupbuys: [],
    conversations: [],
    mapLayers: [],
    poiChats: [],
    activeLayers: {
      teammate: true,
      groupbuy: true,
      poi: true,
      safe: true,
      traffic: true,
      poiChat: true,
      team: true
    },
    markers: [],
    polyline: [],
    stats: {
      tripCount: 0,
      joinedTripCount: 0,
      orderCount: 0
    }
  },

  onShow() {
    this.load();
  },

  load() {
    api.getHome().then(res => {
      if (!res.ok) return;
      const trips = (res.data.trips || []).map(item => ({
        ...item,
        statusText: item.status === 'full' ? '已满员' : item.status === 'done' ? '已结束' : '可加入'
      }));
      this.setData({
        trips,
        groupbuys: res.data.groupbuys,
        conversations: res.data.conversations || [],
        mapLayers: res.data.mapLayers || [],
        poiChats: res.data.poiChats || [],
        stats: res.data.stats || this.data.stats,
        polyline: (trips[0] || {}).route ? [{
          points: trips[0].route,
          color: '#176B5B',
          width: 4
        }] : []
      }, this.buildMarkers);
    });
  },

  buildMarkers() {
    const firstTrip = this.data.trips[0] || {};
    const markers = [];
    if (this.data.activeLayers.teammate) {
      (firstTrip.teammates || []).forEach((item, index) => {
        markers.push({
          id: index + 1,
          latitude: item.latitude,
          longitude: item.longitude,
          title: item.nickname,
          callout: { content: `队友 ${item.nickname}`, display: 'ALWAYS', padding: 6, borderRadius: 4 }
        });
      });
    }
    (this.data.mapLayers || []).forEach((item, index) => {
      if (!this.data.activeLayers[item.type]) return;
      markers.push({
        id: index + 100,
        latitude: item.latitude,
        longitude: item.longitude,
        title: item.title,
        callout: { content: item.title, display: 'ALWAYS', padding: 6, borderRadius: 4 }
      });
    });
    if (this.data.activeLayers.groupbuy) {
      markers.push({
        id: 300,
        latitude: 29.63,
        longitude: 119.06,
        title: '拼团中',
        callout: { content: '🔥 拼团中', display: 'ALWAYS', padding: 6, borderRadius: 4 }
      });
    }
    if (this.data.activeLayers.poiChat) {
      (this.data.poiChats || []).forEach((item, index) => {
        markers.push({
          id: index + 400,
          latitude: 29.61 + index * 0.06,
          longitude: 119.04 + index * 0.08,
          title: item.name,
          callout: { content: `💬 ${item.online} ${item.name}`, display: 'ALWAYS', padding: 6, borderRadius: 4 }
        });
      });
    }
    this.setData({ markers });
  },

  toggleLayer(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`activeLayers.${key}`]: !this.data.activeLayers[key] }, this.buildMarkers);
  },

  openTrip(event) {
    wx.navigateTo({ url: `/pages/tripDetail/tripDetail?id=${event.currentTarget.dataset.id}` });
  },

  openGroupbuy(event) {
    wx.navigateTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${event.currentTarget.dataset.id}` });
  },

  openLayer(event) {
    const item = this.data.mapLayers.find(row => row._id === event.currentTarget.dataset.id);
    if (!item) return;
    wx.showModal({
      title: item.title,
      content: item.desc,
      showCancel: false
    });
  },

  openPoiChat(event) {
    wx.navigateTo({ url: `/pages/poiChat/poiChat?id=${event.currentTarget.dataset.id}` });
  },

  goTrips() {
    wx.switchTab({ url: '/pages/trips/trips' });
  },

  goGroupbuys() {
    wx.navigateTo({ url: '/pages/groupbuyList/groupbuyList' });
  },

  goMessages() {
    wx.switchTab({ url: '/pages/messages/messages' });
  },

  goSupport() {
    wx.navigateTo({ url: '/pages/support/support' });
  },

  sos() {
    wx.showModal({
      title: 'SOS 已触发',
      content: 'Mock：已通知车队成员，并推荐最近医院/派出所安全 POI。',
      showCancel: false
    });
  },

  resetDemo() {
    api.resetDemo().then(() => {
      wx.showToast({ title: '已重置' });
      this.load();
    });
  }
});
