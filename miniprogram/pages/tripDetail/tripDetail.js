const api = require('../../utils/api');

Page({
  data: {
    id: '',
    trip: null,
    members: [],
    requests: [],
    joined: false,
    owned: false,
    requestStatus: 'none',
    center: { latitude: 30.2741, longitude: 120.1551 },
    markers: [],
    polyline: []
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.load();
  },

  onShow() {
    if (this.data.id) this.load();
  },

  load() {
    api.getTrip(this.data.id).then(res => {
      if (!res.ok) return wx.showToast({ title: res.message || '行程不存在', icon: 'none' });
      const trip = res.data.trip;
      const route = trip.route || [];
      const statusMap = { open: '招募中', full: '已满员', done: '已结束' };
      this.setData({
        trip: { ...trip, statusText: statusMap[trip.status] || trip.status, plansText: (trip.plans || []).join(' · '), equipmentText: (trip.equipment || []).join(' · ') },
        members: res.data.members.map(member => ({ ...member, avatarText: (member.nickname || '同').slice(0, 1), level: member.user.level || 1, creditScore: member.user.creditScore || '-' })),
        requests: res.data.requests || [],
        joined: res.data.joined,
        owned: res.data.owned,
        requestStatus: res.data.requestStatus,
        center: route[0] || this.data.center,
        markers: (trip.teammates || []).map((item, index) => ({ id: index + 1, latitude: item.latitude, longitude: item.longitude, iconPath: '/images/markers/default.png', width: 32, height: 32, callout: { content: item.nickname, display: 'ALWAYS', padding: 5, borderRadius: 4 } })),
        polyline: route.length ? [{ points: route, color: '#1F6FEB', width: 7, arrowLine: true }] : []
      });
    });
  },

  apply() {
    wx.showModal({
      title: '申请加入车队',
      content: '队长审批通过后，你会自动加入群聊。',
      editable: true,
      placeholderText: '介绍车辆、驾驶经验或同行偏好',
      confirmText: '提交申请',
      success: result => {
        if (!result.confirm) return;
        api.applyTrip(this.data.id, result.content).then(res => {
          if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
          wx.showToast({ title: res.data.status === 'joined' ? '已在车队中' : '申请已提交' });
          this.load();
        });
      }
    });
  },

  review(event) {
    const requestId = event.currentTarget.dataset.id;
    const approve = event.currentTarget.dataset.approve === 'yes';
    api.approveTripRequest(requestId, approve).then(res => {
      if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
      wx.showToast({ title: approve ? '已同意加入' : '已拒绝申请' });
      this.load();
    });
  },

  edit() {
    wx.navigateTo({ url: `/pages/publishTrip/publishTrip?id=${this.data.id}` });
  },

  end() {
    wx.showModal({
      title: '结束行程？',
      content: '结束后不能再邀请新成员，但群聊和历史消息会永久保留。',
      confirmText: '确认结束',
      success: result => {
        if (!result.confirm) return;
        api.endTrip(this.data.id).then(res => {
          if (res.ok) { wx.showToast({ title: '行程已结束' }); this.load(); }
        });
      }
    });
  },

  leave() {
    wx.showModal({
      title: '退出车队？',
      content: '退出后将自动离开群聊，历史消息也不再显示。',
      confirmText: '退出',
      confirmColor: '#D94841',
      success: result => {
        if (!result.confirm) return;
        api.leaveTrip(this.data.id).then(res => {
          if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
          wx.showToast({ title: '已退出车队' });
          this.load();
        });
      }
    });
  },

  openChat() {
    wx.navigateTo({ url: `/pages/chatGroup/chatGroup?id=${this.data.id}` });
  },

  openGroupbuys() {
    wx.navigateTo({ url: '/pages/groupbuyList/groupbuyList' });
  },

  openMember(event) {
    wx.navigateTo({ url: `/pages/userProfile/userProfile?id=${event.currentTarget.dataset.id}` });
  },

  greetOwner() {
    wx.navigateTo({ url: `/pages/privateChat/privateChat?id=${this.data.trip.ownerId}` });
  },

  onShareAppMessage() {
    return { title: `${this.data.trip.teamName}邀请你一起走${this.data.trip.from}到${this.data.trip.to}`, path: `/pages/tripDetail/tripDetail?id=${this.data.id}` };
  }
});
