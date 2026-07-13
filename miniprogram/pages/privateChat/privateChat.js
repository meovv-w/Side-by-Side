const api = require('../../utils/api');

const relationText = { mutual: '已互关，可无限畅聊', teammate: '同队成员，可直接畅聊', following: '对方未回关，可发送 3 条消息', stranger: '关注后可发送消息' };

Page({
  data: { id: '', target: {}, currentUserId: '', relation: 'stranger', relationText: '', blocked: false, canSend: false, remaining: null, messages: [], content: '', scrollTarget: '' },

  onLoad(options) {
    this.setData({ id: options.id || '' });
  },

  onShow() { this.load(); },

  load() {
    api.getPrivateChat(this.data.id).then(res => {
      if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
      const messages = res.data.messages.map(item => ({ ...item, isMine: item.fromUserId === res.data.currentUserId, anchor: `pm-${item._id}` }));
      this.setData({ ...res.data, target: { ...res.data.target, avatarText: (res.data.target.nickname || '同').slice(0, 1) }, relationText: relationText[res.data.relation], messages, scrollTarget: messages.length ? messages[messages.length - 1].anchor : '' });
      api.markConversationRead(this.data.id, 'private');
      wx.setNavigationBarTitle({ title: res.data.target.nickname });
    });
  },

  input(event) { this.setData({ content: event.detail.value }); },

  send() {
    const content = this.data.content.trim();
    if (!content) return;
    api.sendPrivateMessage(this.data.id, content).then(res => {
      if (!res.ok) return wx.showToast({ title: res.message, icon: 'none' });
      this.setData({ content: '' });
      this.load();
    });
  },

  follow() {
    api.toggleFollow('user', this.data.id).then(res => {
      wx.showToast({ title: res.data.following ? '已关注' : '已取消关注' });
      this.load();
    });
  },

  block() {
    const blocked = !this.data.blocked;
    api.setBlocked(this.data.id, blocked).then(() => {
      wx.showToast({ title: blocked ? '已加入黑名单' : '已解除黑名单' });
      this.load();
    });
  },

  profile() { wx.navigateTo({ url: `/pages/userProfile/userProfile?id=${this.data.id}` }); }
});
