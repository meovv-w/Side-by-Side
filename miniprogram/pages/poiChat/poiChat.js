const api = require('../../utils/api');

Page({
  data: { id: '', room: {}, messages: [], content: '', scrollTarget: '' },
  onLoad(options) { this.setData({ id: options.id || 'poi_001' }); this.load(); },
  load() {
    api.getPoiChat(this.data.id).then(result => {
      if (!result.ok) return wx.showToast({ title: result.message, icon: 'none' });
      const messages = result.data.messages.map(message => ({ ...message, avatarText: (message.nickname || '同').slice(0, 1), anchor: `poi-${message._id}` }));
      this.setData({ room: result.data.room, messages, scrollTarget: messages.length ? messages[messages.length - 1].anchor : '' });
      api.markConversationRead(this.data.id, 'poi');
      wx.setNavigationBarTitle({ title: result.data.room.name });
    });
  },
  input(event) { this.setData({ content: event.detail.value }); },
  send() {
    const content = this.data.content.trim();
    if (!content) return;
    api.sendPoiMessage(this.data.id, content).then(result => {
      if (!result.ok) return wx.showToast({ title: result.message, icon: 'none' });
      this.setData({ content: '' }); this.load();
    });
  },
  image() {
    wx.chooseMedia({ count: 1, mediaType: ['image'], success: result => {
      api.sendPoiMessage(this.data.id, result.tempFiles[0].tempFilePath, 'image').then(response => {
        if (!response.ok) wx.showToast({ title: response.message, icon: 'none' });
        else this.load();
      });
    } });
  },
  follow() {
    api.followPoiChat(this.data.id).then(result => {
      if (result.ok) { this.setData({ room: result.data }); wx.showToast({ title: result.data.followed ? '已关注话题' : '已取消关注' }); }
    });
  }
});
