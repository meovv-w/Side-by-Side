const api = require('../../utils/api');

Page({
  data: {
    filters: [
      { key: 'all', label: '全部' },
      { key: 'team', label: '车队' },
      { key: 'poi', label: '地点' },
      { key: 'private', label: '私信' }
    ],
    current: 'all',
    conversations: []
  },

  onShow() {
    this.load();
  },

  load() {
    api.listConversations(this.data.current).then(res => {
      if (res.ok) this.setData({ conversations: res.data });
    });
  },

  change(event) {
    this.setData({ current: event.currentTarget.dataset.key }, () => this.load());
  },

  open(event) {
    const item = this.data.conversations.find(row => row._id === event.currentTarget.dataset.id);
    if (!item) return;
    if (item.type === 'team') wx.navigateTo({ url: `/pages/chatGroup/chatGroup?id=${item.targetId}` });
    else if (item.type === 'poi') wx.navigateTo({ url: `/pages/poiChat/poiChat?id=${item.targetId}` });
    else wx.showToast({ title: 'Mock 会话已打开', icon: 'none' });
  }
});
