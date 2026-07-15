const api = require('../../utils/api');

const defaultLayers = {
  teammate: true,
  groupbuy: true,
  poi: true,
  safe: true,
  traffic: true,
  poiChat: true,
  team: true,
  driver: true
};

const markerIcons = {
  teammate: '/images/markers/default.png',
  groupbuy: '/images/markers/groupbuy.png',
  poi: '/images/markers/gas.png',
  safe: '/images/markers/safety.png',
  traffic: '/images/markers/safety.png',
  team: '/images/markers/car.png',
  driver: '/images/markers/default.png',
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
    weather: { altitude: 0, text: '--', temperature: '--' },
    energyReminder: null,
    apiMode: api.isRemote() ? 'remote' : 'offline',
    sosHolding: false,
    sosProgress: 0
  },

  onReady() {
    this.mapContext = wx.createMapContext('mainMap', this);
    if (this.mapContext.initMarkerCluster) this.mapContext.initMarkerCluster({ enableDefaultStyle: true, zoomOnClick: true, gridSize: 60 });
  },

  onShow() {
    this.load();
  },

  onHide() {
    if (this.data.sosHolding) this.cancelSosHold();
  },

  load() {
    api.getHome().then(res => {
      if (!res.ok) return;
      const currentTrip = res.data.currentTrip;
      if (currentTrip) {
        const departAt = new Date(String(currentTrip.departAt || '').replace(/-/g, '/')).getTime();
        currentTrip.currentDay = Number.isFinite(departAt) ? Math.max(1, Math.min(Number(currentTrip.days || 1), Math.floor((Date.now() - departAt) / 86400000) + 1)) : 1;
        currentTrip.remainingDays = Math.max(0, Number(currentTrip.days || 1) - currentTrip.currentDay + 1);
      }
      const route = currentTrip && currentTrip.route || [];
      this.setData({
        user: res.data.user,
        trips: res.data.trips || [],
        currentTrip,
        groupbuys: res.data.groupbuys || [],
        mapLayers: res.data.mapLayers || [],
        poiChats: res.data.poiChats || [],
        stats: res.data.stats || {},
        weather: res.data.weather || this.data.weather,
        energyReminder: res.data.energyReminder || null,
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
          callout: { content: item.latestMessage ? `${item.nickname} · 💬` : item.nickname, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: '#FFFFFF', color: '#17202A', fontSize: 11 }
        });
        const distance = item.distanceMeters == null ? '--' : `${(Number(item.distanceMeters) / 1000).toFixed(1)}km`;
        const speed = item.speed == null ? '--' : `${Math.round(Number(item.speed))}km/h`;
        markerTargets.push({ id, type: 'teammate', title: item.nickname, userId: item.userId, subtitle: `本队队友 · Lv.${item.level || 1}`, desc: `距你 ${distance} · 车速 ${speed} · ${item.reportedAt || '等待位置更新'}`, preview: item.latestMessage || '', latitude: item.latitude, longitude: item.longitude });
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
        joinCluster: true,
        callout: { content: item.unread ? `💬${item.unread} · ${item.title}` : item.title, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: item.type === 'traffic' ? '#FFF4D6' : '#FFFFFF', color: '#17202A', fontSize: 11 }
      });
      markerTargets.push({ id, ...item });
    });

    if (this.data.activeLayers.groupbuy) {
      (this.data.groupbuys || []).slice(0, 2).forEach((item, index) => {
        const id = index + 300;
        const latitude = Number(item.latitude || 29.63 + index * .14);
        const longitude = Number(item.longitude || 119.06 + index * .2);
        markers.push({ id, latitude, longitude, iconPath: markerIcons.groupbuy, width: 34, height: 34, joinCluster: true, callout: { content: `拼团 ¥${item.price}`, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: '#FFEBE9', color: '#C83C32', fontSize: 11 } });
        markerTargets.push({ id, type: 'groupbuy', targetId: item._id, title: item.merchantName, subtitle: item.title, desc: `${item.joined}人已拼 · 距离 ${item.distanceKm}km`, price: item.price, latitude, longitude });
      });
    }

    if (this.data.activeLayers.poiChat) {
      const groupedTopics = new Map();
      (this.data.poiChats || []).filter(item => item.status !== 'archived').forEach(item => {
        const latitude = Number(item.latitude || 29.61);
        const longitude = Number(item.longitude || 119.04);
        const key = `${latitude.toFixed(3)}:${longitude.toFixed(3)}:${item.locationName || ''}`;
        if (!groupedTopics.has(key)) groupedTopics.set(key, { latitude, longitude, topics: [] });
        groupedTopics.get(key).topics.push(item);
      });
      [...groupedTopics.values()].forEach((group, index) => {
        const id = index + 400;
        const online = group.topics.reduce((sum, item) => sum + Number(item.online || 0), 0);
        const first = group.topics[0];
        markers.push({ id, latitude: group.latitude, longitude: group.longitude, iconPath: markerIcons.poiChat, width: 34, height: 34, joinCluster: true, callout: { content: `${group.topics.length}个话题 · ${online}人在聊`, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: '#EAF2FF', color: '#1558B0', fontSize: 11 } });
        markerTargets.push({ id, type: 'poiChatGroup', targetId: first._id, title: first.locationName || first.name, subtitle: `${group.topics.length}个话题 · ${online}人参与`, desc: first.lastMessage, topics: group.topics, latitude: group.latitude, longitude: group.longitude });
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

  toggleOtherDrivers(event) {
    const enabled = event.detail.value;
    this.setData({ 'activeLayers.team': enabled, 'activeLayers.driver': enabled }, this.buildMarkers);
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

  goSupport() {
    wx.navigateTo({ url: '/pages/support/support' });
  },

  createTopic(event) {
    const detail = event && event.detail || {};
    const query = Number.isFinite(Number(detail.latitude)) ? `?lat=${detail.latitude}&lng=${detail.longitude}` : '';
    wx.navigateTo({ url: `/pages/createPoiChat/createPoiChat${query}` });
  },

  openSelected() {
    const item = this.data.selected;
    if (!item) return;
    if (item.type === 'groupbuy') wx.navigateTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${item.targetId}` });
    else if (item.type === 'poiChat' || (item.type === 'poiChatGroup' && item.topics.length === 1)) wx.navigateTo({ url: `/pages/poiChat/poiChat?id=${item.targetId}` });
    else if (item.type === 'team') wx.navigateTo({ url: `/pages/tripDetail/tripDetail?id=${item.targetId}` });
    else if (item.type === 'teammate' || item.type === 'driver' || item.leaderId) wx.navigateTo({ url: `/pages/userProfile/userProfile?id=${item.userId || item.leaderId}` });
    else this.navigateSelected();
  },

  messageSelected() {
    const item = this.data.selected;
    const userId = item && (item.userId || item.leaderId);
    if (!userId) return;
    wx.navigateTo({ url: `/pages/privateChat/privateChat?id=${userId}` });
  },

  openTopic(event) {
    wx.navigateTo({ url: `/pages/poiChat/poiChat?id=${event.currentTarget.dataset.id}` });
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

  avoidSelected() {
    const route = this.data.currentTrip && this.data.currentTrip.route || [];
    const destination = route[route.length - 1];
    if (!destination) return wx.showToast({ title: '当前没有可导航的行程', icon: 'none' });
    wx.openLocation({ latitude: destination.latitude, longitude: destination.longitude, name: this.data.currentTrip.to, address: '请在地图应用中选择避开拥堵路线' });
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
    if (!trip) return api.sharePresence().then(res => wx.showToast({ title: res.ok ? '个人位置已展示1小时' : res.message, icon: res.ok ? 'success' : 'none' }));
    api.shareLocation(trip._id).then(res => {
      if (res.ok) wx.showToast({ title: '位置已发到群聊' });
    });
  },

  reportSafety() {
    const types = [
      { key: 'accident', label: '交通事故' }, { key: 'closure', label: '道路封闭' },
      { key: 'construction', label: '道路施工' }, { key: 'hazard', label: '其他道路风险' }
    ];
    wx.showActionSheet({
      itemList: types.map(item => item.label),
      success: selection => {
        const selected = types[selection.tapIndex];
        wx.showModal({
          title: `上报${selected.label}`, editable: true, placeholderText: '请描述现场位置、方向和影响',
          confirmText: '提交审核',
          success: result => {
            if (!result.confirm) return;
            api.reportSafetyEvent({
              eventType: selected.key, description: result.content,
              tripId: this.data.currentTrip && this.data.currentTrip._id
            }).then(response => {
              if (!response.ok) return wx.showToast({ title: response.message, icon: 'none' });
              wx.showModal({ title: '已提交', content: '运营确认后会同步到地图，并发放同路值。', showCancel: false });
            });
          }
        });
      }
    });
  },

  toggleSharing() {
    const sharingLocation = !this.data.sharingLocation;
    api.updateSettings({ shareLocation: sharingLocation }).then(() => this.setData({ sharingLocation }));
  },

  startSosHold() {
    if (this.data.sosHolding) return;
    this.setData({ sosHolding: true, sosProgress: 0 });
    const startedAt = Date.now();
    this.sosTimer = setInterval(() => {
      const progress = Math.min(100, Math.round((Date.now() - startedAt) / 30));
      this.setData({ sosProgress: progress });
      if (progress >= 100) { this.cancelSosHold(); this.sos(); }
    }, 100);
  },

  cancelSosHold() {
    if (this.sosTimer) clearInterval(this.sosTimer);
    this.sosTimer = null;
    this.setData({ sosHolding: false, sosProgress: 0 });
  },

  sos() {
    wx.showModal({
      title: '确认发出 SOS？',
      content: '将通知当前车队和紧急联系人，并展示最近医院与派出所。',
      confirmText: '确认求助',
      confirmColor: '#D94841',
      success: result => {
        if (!result.confirm) return;
        api.recordEmergency({ tripId: this.data.currentTrip && this.data.currentTrip._id }).then(response => {
          if (!response.ok) return wx.showModal({ title: 'SOS 提交失败', content: response.message, showCancel: false });
          const contactText = response.data.contactsNotified ? '紧急联系人短信已发送。' : `紧急联系人短信未发送：${response.data.contactDeliveryError && response.data.contactDeliveryError.message || '请检查设置'}。`;
          wx.showModal({ title: '求助已发出', content: `车队已收到位置。${contactText} 紧急情况请立即拨打 110 或 120。`, showCancel: false });
        });
      }
    });
  },

  resetDemo() {
    api.resetDemo().then(result => {
      if (!result.ok) return wx.showToast({ title: result.message, icon: 'none' });
      wx.showToast({ title: '演示数据已恢复' });
      this.setData({ activeLayers: { ...defaultLayers }, layerPanelOpen: false, selected: null });
      this.load();
    });
  }
});
