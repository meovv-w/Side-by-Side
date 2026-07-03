const api = require('../../utils/api');

Page({
  data: {
    id: '',
    room: {},
    messages: [],
    content: ''
  },

  onLoad(options) {
    this.setData({ id: options.id || 'poi_001' });
    this.load();
  },

  load() {
    api.getPoiChat(this.data.id).then(res => {
      if (res.ok) this.setData({ room: res.data.room, messages: res.data.messages });
    });
  },

  onInput(event) {
    this.setData({ content: event.detail.value });
  },

  send() {
    const content = this.data.content.trim();
    if (!content) return;
    api.sendPoiMessage(this.data.id, content).then(res => {
      if (!res.ok) {
        wx.showToast({ title: res.message || '发送失败', icon: 'none' });
        return;
      }
      this.setData({ content: '' });
      this.load();
    });
  }
});
