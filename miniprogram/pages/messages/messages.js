const api = require('../../utils/api');

const labels = {
  team: { icon: '车', color: 'blue' },
  poi: { icon: '地', color: 'green' },
  private: { icon: '私', color: 'violet' },
  system: { icon: '通', color: 'amber' }
};

Page({
  data: {
    filters: [
      { key: 'all', label: '全部' },
      { key: 'team', label: '车队' },
      { key: 'poi', label: '地点' },
      { key: 'private', label: '私信' }
    ],
    current: 'all',
    conversations: [],
    history: [],
    unreadCount: 0
  },

  onLoad() {
    this.unsubscribeRealtime = api.subscribeRealtime(event => {
      if (event.event === 'message' || event.event === 'notification') this.load();
    });
  },

  onUnload() {
    if (this.unsubscribeRealtime) this.unsubscribeRealtime();
  },

  onShow() {
    this.load();
  },

  load() {
    api.listConversations(this.data.current).then(res => {
      if (!res.ok) return;
      const all = res.data.map(item => ({ ...item, ...(labels[item.type] || labels.private) }));
      this.setData({
        conversations: all.filter(item => !item.archived),
        history: all.filter(item => item.archived),
        unreadCount: all.reduce((sum, item) => sum + Number(item.unread || 0), 0)
      });
      wx.removeTabBarBadge({ index: 1 });
    });
  },

  change(event) {
    this.setData({ current: event.currentTarget.dataset.key }, () => this.load());
  },

  open(event) {
    const item = [...this.data.conversations, ...this.data.history].find(row => row._id === event.currentTarget.dataset.id);
    if (!item) return;
    api.markConversationRead(item.targetId, item.type).then(() => {
      if (item.type === 'team') wx.navigateTo({ url: `/pages/chatGroup/chatGroup?id=${item.targetId}` });
      else if (item.type === 'poi') wx.navigateTo({ url: `/pages/poiChat/poiChat?id=${item.targetId}` });
      else if (item.type === 'system') this.openNotification(item);
      else wx.navigateTo({ url: `/pages/privateChat/privateChat?id=${item.targetId}` });
    });
  },

  openNotification(item) {
    const data = item.data || {};
    if (data.orderId) return wx.navigateTo({ url: `/pages/orderDetail/orderDetail?id=${data.orderId}` });
    if (data.tripId) return wx.navigateTo({ url: `/pages/tripDetail/tripDetail?id=${data.tripId}` });
    if (item.notificationType === 'certification') return wx.navigateTo({ url: '/pages/certify/certify' });
    wx.showModal({ title: item.title, content: item.lastMessage, showCancel: false });
  },

  replyPrivate(event) {
    wx.navigateTo({ url: `/pages/privateChat/privateChat?id=${event.currentTarget.dataset.user}` });
  },

  ignore(event) {
    const userId = event.currentTarget.dataset.user;
    api.markConversationRead(userId, 'private').then(() => {
      wx.showToast({ title: '已忽略并标为已读' });
      this.load();
    });
  },

  block(event) {
    const userId = event.currentTarget.dataset.user;
    wx.showModal({
      title: '屏蔽这位用户？',
      content: '屏蔽后对方不能继续向你发送私信，可在“我的 - 黑名单”中解除。',
      success: result => {
        if (!result.confirm) return;
        api.setBlocked(userId, true).then(() => wx.showToast({ title: '已加入黑名单' }));
      }
    });
  }
});
