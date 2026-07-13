const api = require('../../utils/api');

const labels = {
  team: { icon: '车', color: 'blue' },
  poi: { icon: '地', color: 'green' },
  private: { icon: '私', color: 'violet' }
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
      else wx.navigateTo({ url: `/pages/privateChat/privateChat?id=${item.targetId}` });
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
