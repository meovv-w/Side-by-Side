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
  teammate: '/images/markers/teammate.png',
  groupbuy: '/images/markers/groupbuy.png',
  poi: '/images/markers/gas.png',
  gas: '/images/markers/gas.png',
  food: '/images/markers/food.png',
  hotel: '/images/markers/hotel.png',
  safe: '/images/markers/safety.png',
  traffic: '/images/markers/safety.png',
  team: '/images/markers/car.png',
  oppositeTeam: '/images/markers/car_gray.png',
  driver: '/images/markers/driver.png',
  destination: '/images/markers/destination.png',
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
    weather: { altitude: 0, text: '--', temperature: '--', icon: '☀' },
    energyReminder: null,
    apiMode: api.isRemote() ? 'remote' : 'offline',
    sosHolding: false,
    sosProgress: 0
  },

  onLoad() {
    this.shownHighPriorityIds = new Set();
    this.highPriorityModalOpen = false;
    this.unsubscribeRealtime = api.subscribeRealtime(event => {
      const notification = event && event.data || {};
      if (!event || event.event !== 'notification') return;
      this.showHighPriorityNotification(notification);
      this.load();
    });
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
    this.stopLocationTracking();
  },

  onUnload() {
    this.stopLocationTracking();
    if (this.unsubscribeRealtime) this.unsubscribeRealtime();
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
      const location = res.data.location || {};
      this.setData({
        user: res.data.user,
        trips: res.data.trips || [],
        currentTrip,
        groupbuys: res.data.groupbuys || [],
        mapLayers: res.data.mapLayers || [],
        poiChats: res.data.poiChats || [],
        stats: res.data.stats || {},
        weather: { ...(res.data.weather || this.data.weather), icon: weatherIcon(res.data.weather && res.data.weather.text) },
        energyReminder: res.data.energyReminder || null,
        sharingLocation: res.data.settings.shareLocation !== false,
        latitude: Number.isFinite(Number(location.latitude)) ? Number(location.latitude) : route[0] ? route[0].latitude : this.data.latitude,
        longitude: Number.isFinite(Number(location.longitude)) ? Number(location.longitude) : route[0] ? route[0].longitude : this.data.longitude,
        polyline: route.length ? [{ points: route, color: '#1F6FEB', width: 7, arrowLine: true }] : []
      }, () => {
        this.buildMarkers();
        this.syncUnreadBadge(Number(this.data.stats.unreadCount || 0));
        if (this.data.sharingLocation) this.startLocationTracking();
        this.showHighPriorityNotification(res.data.highPriorityNotification);
      });
    });
  },

  showHighPriorityNotification(notification) {
    if (!notification || !['high', 'urgent'].includes(notification.priority)) return;
    const notificationId = notification.id || notification._id;
    if (this.highPriorityModalOpen || notificationId && this.shownHighPriorityIds.has(notificationId)) return;
    if (notificationId) this.shownHighPriorityIds.add(notificationId);
    this.highPriorityModalOpen = true;
    wx.showModal({
      title: notification.title || '安全提醒',
      content: notification.content || '收到一条高优先级安全通知，请立即确认。',
      showCancel: false,
      confirmText: '我知道了',
      success: result => {
        this.highPriorityModalOpen = false;
        if (!result.confirm || !notificationId) return;
        api.markConversationRead(notificationId, 'system').then(() => this.load());
      },
      fail: () => {
        this.highPriorityModalOpen = false;
        if (notificationId) this.shownHighPriorityIds.delete(notificationId);
      }
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
          iconPath: item.isLeader ? markerIcons.team : (item.avatar || markerIcons.teammate),
          width: 34,
          height: 34,
          callout: { content: `${item.offline ? '离线 · ' : ''}${item.isLeader ? '队长 · ' : ''}${item.nickname}${item.latestMessage ? ' · 💬' : ''}`, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: item.offline ? '#EDF1F4' : '#FFFFFF', color: item.offline ? '#71808F' : '#17202A', fontSize: 11 }
        });
        const distance = item.distanceMeters == null ? '--' : `${(Number(item.distanceMeters) / 1000).toFixed(1)}km`;
        const speed = item.speed == null ? '--' : `${Math.round(Number(item.speed))}km/h`;
        markerTargets.push({ id, type: 'teammate', title: item.nickname, userId: item.userId, subtitle: `${item.isLeader ? '队长 · 动态集合基准' : '本队队友'} · Lv.${item.level || 1}${item.ownerCertStatus === 'approved' ? ' · 车主已认证' : ''}${item.offline ? ' · 离线' : ''}`, desc: `距你 ${distance} · 车速 ${speed} · ${item.reportedAt || '等待位置更新'}`, preview: item.latestMessage || '', latitude: item.latitude, longitude: item.longitude });
      });
    }

    if (route.length) {
      markers.push({
        id: 90,
        latitude: route[route.length - 1].latitude,
        longitude: route[route.length - 1].longitude,
        iconPath: markerIcons.destination,
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
        iconPath: item.subtype === 'rescue' ? markerIcons.safe : item.type === 'driver' && item.avatar ? item.avatar : markerIcons[item.markerKind] || markerIcons[item.type] || markerIcons.poi,
        width: 32,
        height: 32,
        joinCluster: true,
        callout: { content: item.unread ? `💬${item.unread} · ${item.title}` : item.title, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: item.type === 'traffic' ? '#FFF4D6' : '#FFFFFF', color: '#17202A', fontSize: 11 }
      });
      markerTargets.push({ id, ...item });
    });

    if (this.data.activeLayers.groupbuy) {
      (this.data.groupbuys || []).slice(0, 50).forEach((item, index) => {
        const id = index + 300;
        const latitude = Number(item.latitude);
        const longitude = Number(item.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        markers.push({ id, latitude, longitude, iconPath: markerIcons.groupbuy, width: 34, height: 34, joinCluster: true, callout: { content: `拼团 ¥${item.price}`, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: '#FFEBE9', color: '#C83C32', fontSize: 11 } });
        markerTargets.push({ id, type: 'groupbuy', targetId: item._id, title: item.merchantName, subtitle: item.title, desc: `${item.joined}人已拼 · 距离 ${item.distanceKm}km`, price: item.price, latitude, longitude });
      });
    }

    if (this.data.activeLayers.poiChat) {
      const groupedTopics = new Map();
      (this.data.poiChats || []).filter(item => item.status !== 'archived').forEach(item => {
        const latitude = Number(item.latitude);
        const longitude = Number(item.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        const key = `${latitude.toFixed(3)}:${longitude.toFixed(3)}:${item.locationName || ''}`;
        if (!groupedTopics.has(key)) groupedTopics.set(key, { latitude, longitude, topics: [] });
        groupedTopics.get(key).topics.push(item);
      });
      [...groupedTopics.values()].forEach((group, index) => {
        const id = index + 400;
        const online = group.topics.reduce((sum, item) => sum + Number(item.online || 0), 0);
        const first = group.topics[0];
        markers.push({ id, latitude: group.latitude, longitude: group.longitude, iconPath: markerIcons.poiChat, width: 34, height: 34, joinCluster: true, callout: { content: `${group.topics.length}个话题 · ${online}人在聊`, display: 'ALWAYS', padding: 5, borderRadius: 5, bgColor: '#EAF2FF', color: '#1558B0', fontSize: 11 } });
        markerTargets.push({ id, type: 'poiChatGroup', targetId: first._id, title: first.locationName || first.name, subtitle: `${group.topics.length}个话题 · ${online}人在线`, desc: first.lastMessage, topics: group.topics, latitude: group.latitude, longitude: group.longitude });
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

  goTeamChat() {
    if (!this.data.currentTrip) return;
    wx.navigateTo({ url: `/pages/chatGroup/chatGroup?id=${this.data.currentTrip._id}` });
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
    else if (item.type === 'poi' && item.targetId) wx.navigateTo({ url: `/pages/merchantDetail/merchantDetail?id=${item.targetId}` });
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
    const latitude = Number(item && item.latitude);
    const longitude = Number(item && item.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return wx.showToast({ title: '该位置暂不可导航', icon: 'none' });
    wx.openLocation({ latitude, longitude, name: item.title, address: item.address || item.desc || '' });
  },

  syncUnreadBadge(count) {
    if (count > 0) wx.setTabBarBadge({ index: 1, text: `${Math.min(99, count)}` });
    else wx.removeTabBarBadge({ index: 1 });
  },

  avoidSelected() {
    const route = this.data.currentTrip && this.data.currentTrip.route || [];
    const destination = route[route.length - 1];
    if (!destination) return wx.showToast({ title: '当前没有可导航的行程', icon: 'none' });
    wx.openLocation({ latitude: destination.latitude, longitude: destination.longitude, name: this.data.currentTrip.to, address: '请在地图应用中选择避开拥堵路线' });
  },

  callSelected() {
    const phone = this.data.selected && this.data.selected.phone;
    const phoneNumber = String(phone || '').split(/[;,|]/).map(value => value.trim()).find(Boolean);
    if (phoneNumber) wx.makePhoneCall({ phoneNumber });
  },

  shareSelected() {
    const item = this.data.selected;
    const trip = this.data.currentTrip;
    if (!item || !trip) return;
    const type = item.type === 'traffic' ? 'traffic' : item.type === 'groupbuy' ? 'groupbuy' : 'text';
    api.sendMessage(trip._id, `分享：${item.title} · ${item.desc || item.subtitle}`, type, {
      eventId: item.type === 'traffic' ? item.targetId : undefined,
      sessionId: item.type === 'groupbuy' ? item.targetId : undefined,
      latitude: item.latitude, longitude: item.longitude
    }).then(res => {
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
    api.updateSettings({ shareLocation: sharingLocation }).then(response => {
      if (!response.ok) return wx.showToast({ title: response.message, icon: 'none' });
      this.setData({ sharingLocation });
      if (sharingLocation) this.startLocationTracking();
      else this.stopLocationTracking();
    });
  },

  startLocationTracking() {
    if (this.locationTracking || !wx.startLocationUpdate || !wx.onLocationChange) return;
    this.locationHandler = location => {
      this.setData({
        latitude: Number(location.latitude), longitude: Number(location.longitude),
        'weather.altitude': Math.round(Number(location.altitude || this.data.weather.altitude || 0))
      });
      if (Date.now() - Number(this.lastLocationReportAt || 0) < 15000) return;
      this.lastLocationReportAt = Date.now();
      api.reportLiveLocation(this.data.currentTrip && this.data.currentTrip._id, location).then(() => {});
    };
    wx.startLocationUpdate({
      success: () => {
        this.locationTracking = true;
        wx.onLocationChange(this.locationHandler);
      },
      fail: () => { this.locationHandler = null; }
    });
  },

  stopLocationTracking() {
    if (this.locationHandler && wx.offLocationChange) wx.offLocationChange(this.locationHandler);
    if (this.locationTracking && wx.stopLocationUpdate) wx.stopLocationUpdate();
    this.locationHandler = null;
    this.locationTracking = false;
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

function weatherIcon(text) {
  const value = String(text || '');
  if (/雷|暴雨/.test(value)) return '⚡';
  if (/雨/.test(value)) return '☂';
  if (/雪/.test(value)) return '❄';
  if (/雾|霾/.test(value)) return '≋';
  if (/阴|云/.test(value)) return '☁';
  return '☀';
}
