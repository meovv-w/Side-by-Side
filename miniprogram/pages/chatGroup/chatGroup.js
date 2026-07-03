const api = require('../../utils/api');

Page({
  data: {
    id: '',
    messages: [],
    content: ''
  },

  onLoad(options) {
    this.setData({ id: options.id || options.tripId || 'trip_001' });
    this.load();
  },

  load() {
    api.listMessages(this.data.id).then(res => {
      if (res.ok) this.setData({ messages: res.data });
    });
  },

  onInput(event) {
    this.setData({ content: event.detail.value });
  },

  send() {
    const content = this.data.content.trim();
    if (!content) return;
    api.sendMessage(this.data.id, content).then(res => {
      if (!res.ok) {
        wx.showToast({ title: res.message || '发送失败', icon: 'none' });
        return;
      }
      this.setData({ content: '' });
      this.load();
    });
  }
});
