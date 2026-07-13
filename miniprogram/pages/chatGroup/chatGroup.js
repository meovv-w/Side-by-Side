const api = require('../../utils/api');

Page({
  data: {
    id: '',
    currentUserId: '',
    trip: {},
    members: [],
    messages: [],
    content: '',
    scrollTarget: ''
  },

  onLoad(options) {
    this.setData({ id: options.id || options.tripId || 'trip_001' });
    this.load();
  },

  load() {
    Promise.all([api.getTrip(this.data.id), api.listMessages(this.data.id), api.getMine()]).then(([tripRes, messageRes, mineRes]) => {
      if (!tripRes.ok) return wx.showToast({ title: tripRes.message, icon: 'none' });
      const currentUserId = mineRes.ok ? mineRes.data.user._id : '';
      const messages = (messageRes.data || []).map(item => ({ ...item, avatarText: (item.nickname || '同').slice(0, 1), isMine: item.userId === currentUserId, anchor: `msg-${item._id}` }));
      this.setData({
        currentUserId,
        trip: tripRes.data.trip,
        members: tripRes.data.members,
        messages,
        scrollTarget: messages.length ? messages[messages.length - 1].anchor : ''
      });
      api.markConversationRead(this.data.id, 'team');
    });
  },

  onInput(event) {
    this.setData({ content: event.detail.value });
  },

  send() {
    const content = this.data.content.trim();
    if (!content) return;
    this.sendContent(content, 'text');
  },

  sendContent(content, type) {
    api.sendMessage(this.data.id, content, type).then(res => {
      if (!res.ok) return wx.showToast({ title: res.message || '发送失败', icon: 'none' });
      this.setData({ content: '' });
      this.load();
    });
  },

  attachment() {
    wx.showActionSheet({
      itemList: ['发送图片', '发送位置', '分享沿途拼团'],
      success: result => {
        if (result.tapIndex === 0) this.chooseImage();
        if (result.tapIndex === 1) this.chooseLocation();
        if (result.tapIndex === 2) this.shareGroupbuy();
      }
    });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: result => this.sendContent(result.tempFiles[0].tempFilePath, 'image')
    });
  },

  chooseLocation() {
    wx.chooseLocation({ success: location => this.sendContent(`${location.name} · ${location.address}`, 'location') });
  },

  shareGroupbuy() {
    api.listGroupbuys().then(res => {
      if (!res.ok || !res.data.length) return;
      const titles = res.data.map(item => `${item.title} ¥${item.price}`);
      wx.showActionSheet({
        itemList: titles,
        success: result => {
          const item = res.data[result.tapIndex];
          this.sendContent(`${item.title} · 车队价 ¥${item.price} · ${item.merchantName}`, 'groupbuy');
        }
      });
    });
  },

  voice() {
    this.sendContent('语音消息 · 5秒', 'voice');
  },

  openMember(event) {
    const userId = event.currentTarget.dataset.user;
    if (userId && userId !== 'system') wx.navigateTo({ url: `/pages/userProfile/userProfile?id=${userId}` });
  }
});
