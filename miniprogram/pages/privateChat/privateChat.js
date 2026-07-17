const api = require('../../utils/api');

const relationText = { mutual: '已互关，可无限畅聊', teammate: '同队成员，可直接畅聊', following: '对方未回关，可发送 3 条消息', incoming: '对方向你发来消息，可回复 1 条', replied: '对方已回复，可继续畅聊', blocked: '当前无法向对方发消息', stranger: '关注后可发送消息' };

Page({
  data: { id: '', target: {}, currentUserId: '', relation: 'stranger', relationText: '', blocked: false, canSend: false, remaining: null, messages: [], content: '', scrollTarget: '' },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.unsubscribeRealtime = api.subscribeRealtime(event => {
      const message = event && event.data || {};
      const type = message.conversation_type || message.conversationType;
      const conversationId = message.conversation_id || message.conversationId || '';
      if (event && event.event === 'message' && type === 'private' && conversationId.split(':').includes(this.data.id)) this.load();
    });
  },

  onUnload() { if (this.unsubscribeRealtime) this.unsubscribeRealtime(); },

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

  menu() {
    wx.showActionSheet({
      itemList: [this.data.blocked ? '解除黑名单' : '加入黑名单', '投诉该用户'],
      success: result => {
        if (result.tapIndex === 0) this.block();
        if (result.tapIndex === 1) this.report();
      }
    });
  },

  report() {
    wx.showModal({
      title: '隐私与骚扰投诉',
      editable: true,
      placeholderText: '请说明骚扰内容、发生时间或其他证据',
      confirmText: '提交投诉',
      success: modal => {
        if (!modal.confirm) return;
        const reason = String(modal.content || '').trim();
        if (!reason) return wx.showToast({ title: '请填写投诉详情', icon: 'none' });
        api.reportUser(this.data.id, reason).then(result => {
          if (!result.ok) return wx.showToast({ title: result.message || '提交失败', icon: 'none' });
          wx.showModal({
            title: '投诉已提交',
            content: '运营会查看投诉详情和关联用户。是否同时加入黑名单？',
            confirmText: '加入黑名单',
            cancelText: '暂不',
            success: choice => { if (choice.confirm && !this.data.blocked) this.block(); }
          });
        });
      }
    });
  },

  profile() { wx.navigateTo({ url: `/pages/userProfile/userProfile?id=${this.data.id}` }); }
});
