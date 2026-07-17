const api = require('../../utils/api');

Page({
  data: { id: '', room: {}, messages: [], content: '', scrollTarget: '', readOnlyArchived: false, replyTo: null },
  onLoad(options) {
    this.setData({ id: options.id || 'poi_001' });
    this.unsubscribeRealtime = api.subscribeRealtime(event => {
      const message = event && event.data || {};
      const type = message.conversation_type || message.conversationType;
      const conversationId = message.conversation_id || message.conversationId;
      if (event && event.event === 'message' && type === 'poi' && conversationId === this.data.id) this.load();
    });
    this.load();
  },
  onShow() { this.startPresence(); },
  onHide() { this.stopPresence(); },
  onUnload() { this.stopPresence(); if (this.unsubscribeRealtime) this.unsubscribeRealtime(); },
  startPresence() {
    if (this.presenceTimer || !this.data.id) return;
    this.touchPresence();
    this.presenceTimer = setInterval(() => this.touchPresence(), 30000);
  },
  stopPresence() { if (this.presenceTimer) clearInterval(this.presenceTimer); this.presenceTimer = null; },
  touchPresence() {
    api.touchPoiPresence(this.data.id).then(result => {
      if (result.ok && this.data.room && this.data.room._id) this.setData({ 'room.online': Number(result.data.onlineCount || 0) });
    });
  },
  load() {
    api.getPoiChat(this.data.id).then(result => {
      if (!result.ok) return wx.showToast({ title: result.message, icon: 'none' });
      const messages = result.data.messages.map(message => ({ ...message, avatarText: (message.nickname || '同').slice(0, 1), anchor: `poi-${message._id}` }));
      const room = result.data.room;
      this.setData({
        room,
        messages,
        readOnlyArchived: room.status === 'archived' && Boolean(room.participated || room.followed),
        scrollTarget: messages.length ? messages[messages.length - 1].anchor : ''
      });
      api.markConversationRead(this.data.id, 'poi');
      wx.setNavigationBarTitle({ title: result.data.room.name });
    });
  },
  input(event) { this.setData({ content: event.detail.value }); },
  send() {
    const content = this.data.content.trim();
    if (!content) return;
    const metadata = this.data.replyTo ? { replyTo: this.data.replyTo } : {};
    api.sendPoiMessage(this.data.id, content, 'text', metadata).then(result => {
      if (!result.ok) return wx.showToast({ title: result.message, icon: 'none' });
      this.setData({ content: '', replyTo: null }); this.load();
    });
  },
  image() {
    wx.chooseMedia({ count: 1, mediaType: ['image'], success: result => {
      const metadata = this.data.replyTo ? { replyTo: this.data.replyTo } : {};
      api.sendPoiMessage(this.data.id, result.tempFiles[0].tempFilePath, 'image', metadata).then(response => {
        if (!response.ok) wx.showToast({ title: response.message, icon: 'none' });
        else { this.setData({ replyTo: null }); this.load(); }
      });
    } });
  },
  follow() {
    api.followPoiChat(this.data.id).then(result => {
      if (result.ok) {
        this.setData({
          room: result.data,
          readOnlyArchived: result.data.status === 'archived' && Boolean(result.data.participated || result.data.followed)
        });
        wx.showToast({ title: result.data.followed ? '已关注话题' : '已取消关注' });
      }
    });
  },
  menu() {
    wx.showActionSheet({ itemList: ['举报话题'], success: () => this.report('') });
  },
  messageAction(event) {
    const messageId = event.currentTarget.dataset.id;
    const message = this.data.messages.find(item => item._id === messageId);
    if (!message) return;
    wx.showActionSheet({
      itemList: ['回复此消息', '举报此内容'],
      success: result => {
        if (result.tapIndex === 0) this.setData({ replyTo: { messageId, nickname: message.nickname, content: message.type === 'image' ? '[图片]' : String(message.content || '').slice(0, 120) } });
        else this.report(messageId);
      }
    });
  },
  cancelReply() { this.setData({ replyTo: null }); },
  report(messageId) {
    wx.showModal({
      title: messageId ? '举报违规内容' : '举报地点话题',
      editable: true,
      placeholderText: '请说明违规原因和相关情况',
      confirmText: '提交举报',
      success: modal => {
        if (!modal.confirm) return;
        if (!String(modal.content || '').trim()) return wx.showToast({ title: '请填写举报原因', icon: 'none' });
        api.reportPoiTopic(this.data.id, modal.content, messageId).then(result => {
          wx.showToast({ title: result.ok ? '举报已提交' : result.message || '提交失败', icon: 'none' });
        });
      }
    });
  }
});
