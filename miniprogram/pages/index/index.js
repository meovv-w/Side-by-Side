const api = require('../../utils/api');

const defaultLayers = {
  teammate: true,
  groupbuy: true,
  poi: true,
  safe: true,
  traffic: true,
  poiChat: true,
  team: true
};

const markerIcons = {
  teammate: '/images/markers/default.png',
  groupbuy: '/images/markers/groupbuy.png',
  poi: '/images/markers/gas.png',
  safe: '/images/markers/safety.png',
  traffic: '/images/markers/safety.png',
  team: '/images/markers/car.png',
  poiChat: '/images/markers/poi_chat.png'
};

Page({
  data: {
    user: {},
    trips: [],
    currentTrip: null,
    groupbuys: [],
    mapLayers: [],
    poiChats: [],
    activeLayers: { ...defaultLayers },
    layerPanelOpen: false,
    markers: [],
    markerTargets: [],
    selected: null,
    polyline: [],
    latitude: 30.2741,
    longitude: 120.1551,
    sharingLocation: true,
    stats: { unreadCount: 0 },
    weather: { altitude: 3200, text: '晴', temperature: 22 }
  },

  onShow() {
    this.load();
  },

  load() {
    api.getHome().then(res => {
      if (!res.ok) return;
      const currentTrip = res.data.currentTrip;
      const route = currentTrip && currentTrip.route || [];
      this.setData({
        user: res.data.user,
        trips: res.data.trips || [],
        currentTrip,
        groupbuys: res.data.groupbuys || [],
        mapLayers: res.data.mapLayers || [],
        poiChats: res.data.poiChats || [],
        stats: res.data.stats || {},
        sharingLocation: res.data.settings.shareLocation !== false,
        latitude: route[0] ? route[0].latitude : this.data.latitude,
        longitude: route[0] ? route[0].longitude : this.data.longitude,
        polyline: route.length ? [{ points: route, color: '#1F6FEB', width: 7, arrowLine: true }] : []
      }, this.buildMarkers);
    });
  },

  buildMarkers() {
    const markers = [];
    const markerTargets = [];
    const trip = this.data.currentTrip || this.data.trips[0] || {};
    const route = trip.route || [];

    if (this.data.activeLayers.teammate) {
      (trip.teammates || []).forEach((item, index) => {
        const id = index + 1;
        markers.push({
          id,
          latitude: item.latitude,
          longitude: item.longitude,
          iconPath: markerIcons.teammate,
          width: 34,
          height: 34,
          callout: { content: item.nickname, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: '#FFFFFF', color: '#17202A', fontSize: 11 }
        });
        markerTargets.push({ id, type: 'teammate', title: item.nickname, userId: item.userId, subtitle: '本队队友', desc: '距你 8km · 车速 62km/h · 1分钟前更新', latitude: item.latitude, longitude: item.longitude });
      });
    }

    if (route.length) {
      markers.push({
        id: 90,
        latitude: route[route.length - 1].latitude,
        longitude: route[route.length - 1].longitude,
        iconPath: '/images/markers/default.png',
        width: 32,
        height: 32,
        callout: { content: `终点 · ${trip.to}`, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: '#E4F6EF', color: '#087F5B', fontSize: 11 }
      });
      markerTargets.push({ id: 90, type: 'destination', title: trip.to, subtitle: '行程终点', desc: `距终点 ${trip.remainingKm || '--'}km`, latitude: route[route.length - 1].latitude, longitude: route[route.length - 1].longitude });
    }

    (this.data.mapLayers || []).forEach((item, index) => {
      if (!this.data.activeLayers[item.type]) return;
      const id = index + 100;
      markers.push({
        id,
        latitude: item.latitude,
        longitude: item.longitude,
        iconPath: markerIcons[item.type] || markerIcons.poi,
        width: 32,
        height: 32,
        callout: { content: item.title, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: item.type === 'traffic' ? '#FFF4D6' : '#FFFFFF', color: '#17202A', fontSize: 11 }
      });
      markerTargets.push({ id, ...item });
    });

    if (this.data.activeLayers.groupbuy) {
      (this.data.groupbuys || []).slice(0, 2).forEach((item, index) => {
        const id = index + 300;
        const latitude = 29.63 + index * .14;
        const longitude = 119.06 + index * .2;
        markers.push({ id, latitude, longitude, iconPath: markerIcons.groupbuy, width: 34, height: 34, callout: { content: `拼团 ¥${item.price}`, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: '#FFEBE9', color: '#C83C32', fontSize: 11 } });
        markerTargets.push({ id, type: 'groupbuy', targetId: item._id, title: item.merchantName, subtitle: item.title, desc: `${item.joined}人已拼 · 距离 ${item.distanceKm}km`, price: item.price, latitude, longitude });
      });
    }

    if (this.data.activeLayers.poiChat) {
      (this.data.poiChats || []).filter(item => item.status !== 'archived').forEach((item, index) => {
        const id = index + 400;
        const latitude = 29.61 + index * .1;
        const longitude = 119.04 + index * .12;
        markers.push({ id, latitude, longitude, iconPath: markerIcons.poiChat, width: 34, height: 34, callout: { content: `${item.online}人在聊`, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: '#EAF2FF', color: '#1558B0', fontSize: 11 } });
        markerTargets.push({ id, type: 'poiChat', targetId: item._id, title: item.name, subtitle: `${item.online}人在线`, desc: item.lastMessage, latitude, longitude });
      });
    }
    this.setData({ markers, markerTargets });
  },

  onMarkerTap(event) {
    const selected = this.data.markerTargets.find(item => item.id === event.detail.markerId);
    if (selected) this.setData({ selected });
  },

  closeSelected() {
    this.setData({ selected: null });
  },

  toggleLayerPanel() {
    this.setData({ layerPanelOpen: !this.data.layerPanelOpen, selected: null });
  },

  toggleLayer(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`activeLayers.${key}`]: event.detail.value }, this.buildMarkers);
  },

  resetLayers() {
    this.setData({ activeLayers: { ...defaultLayers } }, this.buildMarkers);
  },

  centerOnMe() {
    wx.getLocation({
      type: 'gcj02',
      success: location => this.setData({ latitude: location.latitude, longitude: location.longitude }),
      fail: () => wx.showToast({ title: '请允许位置权限', icon: 'none' })
    });
  },

  goMessages() {
    wx.switchTab({ url: '/pages/messages/messages' });
  },

  goTrips() {
    wx.switchTab({ url: '/pages/trips/trips' });
  },

  goGroupbuys() {
    wx.navigateTo({ url: '/pages/groupbuyList/groupbuyList' });
  },

  createTopic() {
    wx.navigateTo({ url: '/pages/createPoiChat/createPoiChat' });
  },

  openSelected() {
    const item = this.data.selected;
    if (!item) return;
    if (item.type === 'groupbuy') wx.navigateTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${item.targetId}` });
    else if (item.type === 'poiChat') wx.navigateTo({ url: `/pages/poiChat/poiChat?id=${item.targetId}` });
    else if (item.type === 'teammate' || item.leaderId) wx.navigateTo({ url: `/pages/userProfile/userProfile?id=${item.userId || item.leaderId}` });
    else this.navigateSelected();
  },

  messageSelected() {
    const item = this.data.selected;
    const userId = item && (item.userId || item.leaderId);
    if (!userId) return;
    wx.navigateTo({ url: `/pages/privateChat/privateChat?id=${userId}` });
  },

  followSelected() {
    const item = this.data.selected;
    if (!item) return;
    const targetType = item.type === 'team' ? 'team' : 'user';
    const targetId = item.type === 'team' ? item.targetId : (item.userId || item.leaderId);
    if (!targetId) return;
    api.toggleFollow(targetType, targetId).then(res => {
      if (res.ok) wx.showToast({ title: res.data.following ? '已关注' : '已取消关注' });
    });
  },

  navigateSelected() {
    const item = this.data.selected;
    if (!item || !item.latitude) return;
    wx.openLocation({ latitude: item.latitude, longitude: item.longitude, name: item.title, address: item.address || item.desc || '' });
  },

  callSelected() {
    const phone = this.data.selected && this.data.selected.phone;
    if (phone) wx.makePhoneCall({ phoneNumber: phone });
  },

  shareSelected() {
    const item = this.data.selected;
    const trip = this.data.currentTrip;
    if (!item || !trip) return;
    api.sendMessage(trip._id, `分享：${item.title} · ${item.desc || item.subtitle}`, item.type === 'traffic' ? 'traffic' : 'share').then(res => {
      if (res.ok) wx.showToast({ title: '已发到车队群' });
    });
  },

  reportLocation() {
    const trip = this.data.currentTrip;
    if (!trip) return wx.showToast({ title: '请先加入或创建行程', icon: 'none' });
    api.shareLocation(trip._id).then(res => {
      if (res.ok) wx.showToast({ title: '位置已发到群聊' });
    });
  },

  toggleSharing() {
    const sharingLocation = !this.data.sharingLocation;
    api.updateSettings({ shareLocation: sharingLocation }).then(() => this.setData({ sharingLocation }));
  },

  sos() {
    wx.showModal({
      title: '确认发出 SOS？',
      content: '将通知当前车队和紧急联系人，并展示最近医院与派出所。',
      confirmText: '确认求助',
      confirmColor: '#D94841',
      success: result => {
        if (!result.confirm) return;
        api.recordEmergency({ tripId: this.data.currentTrip && this.data.currentTrip._id }).then(() => {
          wx.showModal({ title: '求助已发出', content: '车队成员和紧急联系人已收到位置。紧急情况请立即拨打 110 或 120。', showCancel: false });
        });
      }
    });
  },

  resetDemo() {
    api.resetDemo().then(() => {
      wx.showToast({ title: '演示数据已恢复' });
      this.setData({ activeLayers: { ...defaultLayers }, layerPanelOpen: false, selected: null });
      this.load();
    });
  }
});
