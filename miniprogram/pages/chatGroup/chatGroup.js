const api = require('../../utils/api');

Page({
  data: {
    id: '',
    currentUserId: '',
    trip: {},
    members: [],
    messages: [],
    content: '',
    scrollTarget: '',
    recording: false,
    recordSeconds: 0,
    playingVoiceId: ''
  },

  onLoad(options) {
    this.setData({ id: options.id || options.tripId || 'trip_001' });
    this.initRecorder();
    this.unsubscribeRealtime = api.subscribeRealtime(event => {
      const message = event.data || {};
      if (event.event === 'message' && (message.conversation_id === this.data.id || message.conversationId === this.data.id)) this.load();
    });
    this.load();
  },

  onUnload() {
    this.unloading = true;
    if (this.unsubscribeRealtime) this.unsubscribeRealtime();
    this.clearRecordTimer();
    if (this.data.recording && this.recorder) this.recorder.stop();
    if (this.audio) this.audio.destroy();
    if (this.recorder) {
      if (this.recorder.offStart) this.recorder.offStart(this.handleRecorderStart);
      if (this.recorder.offStop) this.recorder.offStop(this.handleRecorderStop);
      if (this.recorder.offError) this.recorder.offError(this.handleRecorderError);
    }
  },

  initRecorder() {
    if (!wx.getRecorderManager) return;
    this.recorder = wx.getRecorderManager();
    this.handleRecorderStart = () => {
      this.recordStartedAt = Date.now();
      this.setData({ recording: true, recordSeconds: 0 });
      this.recordTimer = setInterval(() => {
        this.setData({ recordSeconds: Math.min(60, Math.floor((Date.now() - this.recordStartedAt) / 1000)) });
      }, 500);
    };
    this.handleRecorderStop = result => {
      this.clearRecordTimer();
      if (!this.unloading) this.setData({ recording: false, recordSeconds: 0 });
      if (this.unloading) return;
      const durationMs = Number(result.duration || Date.now() - this.recordStartedAt);
      if (durationMs < 600) return wx.showToast({ title: '录音时间太短', icon: 'none' });
      this.persistAndSendVoice(result.tempFilePath, Math.max(1, Math.round(durationMs / 1000)));
    };
    this.handleRecorderError = error => {
      this.clearRecordTimer();
      if (!this.unloading) {
        this.setData({ recording: false, recordSeconds: 0 });
        wx.showToast({ title: error.errMsg || '录音失败', icon: 'none' });
      }
    };
    this.recorder.onStart(this.handleRecorderStart);
    this.recorder.onStop(this.handleRecorderStop);
    this.recorder.onError(this.handleRecorderError);
  },

  clearRecordTimer() {
    if (this.recordTimer) clearInterval(this.recordTimer);
    this.recordTimer = null;
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

  sendContent(content, type, options = {}) {
    const media = ['image', 'voice'].includes(type);
    if (media) wx.showLoading({ title: '发送中', mask: true });
    api.sendMessage(this.data.id, content, type, options).then(res => {
      if (media) wx.hideLoading();
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

  previewImage(event) {
    const src = event.currentTarget.dataset.src;
    if (src) wx.previewImage({ current: src, urls: [src] });
  },

  chooseLocation() {
    wx.chooseLocation({
      success: location => this.sendContent(`${location.name} · ${location.address}`, 'location', {
        latitude: location.latitude, longitude: location.longitude, name: location.name, address: location.address
      })
    });
  },

  openMessageLocation(event) {
    const metadata = event.currentTarget.dataset.metadata || {};
    const latitude = Number(metadata.latitude);
    const longitude = Number(metadata.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return wx.showToast({ title: '该位置没有可用坐标', icon: 'none' });
    wx.openLocation({ latitude, longitude, name: metadata.name || '共享位置', address: metadata.address || '' });
  },

  shareGroupbuy() {
    api.listGroupbuys().then(res => {
      if (!res.ok || !res.data.length) return;
      const titles = res.data.map(item => `${item.title} ¥${item.price}`);
      wx.showActionSheet({
        itemList: titles,
        success: result => {
          const item = res.data[result.tapIndex];
          this.sendContent(`${item.title} · 车队价 ¥${item.price} · ${item.merchantName}`, 'groupbuy', {
            sessionId: item._id, productId: item.productId, merchantId: item.merchantId
          });
        }
      });
    });
  },

  openGroupbuy(event) {
    const sessionId = event.currentTarget.dataset.id;
    if (!sessionId) return wx.showToast({ title: '该拼团链接已失效', icon: 'none' });
    wx.navigateTo({ url: `/pages/groupbuyDetail/groupbuyDetail?id=${sessionId}` });
  },

  toggleVoice() {
    if (!this.recorder) return wx.showToast({ title: '当前微信版本不支持录音', icon: 'none' });
    if (this.data.recording) return this.recorder.stop();
    wx.authorize({
      scope: 'scope.record',
      success: () => this.recorder.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3'
      }),
      fail: () => wx.showModal({
        title: '需要麦克风权限',
        content: '开启麦克风后才能发送车队语音。',
        confirmText: '去设置',
        success: result => { if (result.confirm) wx.openSetting(); }
      })
    });
  },

  persistAndSendVoice(tempFilePath, duration) {
    if (api.isRemote() || !wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) {
      return this.sendContent(tempFilePath, 'voice', { duration });
    }
    const filePath = `${wx.env.USER_DATA_PATH}/voice-${Date.now()}.mp3`;
    wx.getFileSystemManager().saveFile({
      tempFilePath,
      filePath,
      success: result => this.sendContent(result.savedFilePath || filePath, 'voice', { duration }),
      fail: () => this.sendContent(tempFilePath, 'voice', { duration })
    });
  },

  playVoice(event) {
    const voiceId = event.currentTarget.dataset.id;
    const src = event.currentTarget.dataset.src;
    if (!src) return wx.showToast({ title: '语音文件不可用', icon: 'none' });
    if (this.audio && this.data.playingVoiceId === voiceId) {
      this.audio.stop();
      this.audio.destroy();
      this.audio = null;
      return this.setData({ playingVoiceId: '' });
    }
    if (this.audio) this.audio.destroy();
    const audio = wx.createInnerAudioContext();
    this.audio = audio;
    audio.src = src;
    audio.onPlay(() => this.setData({ playingVoiceId: voiceId }));
    audio.onEnded(() => {
      audio.destroy();
      if (this.audio === audio) this.audio = null;
      this.setData({ playingVoiceId: '' });
    });
    audio.onError(error => {
      audio.destroy();
      if (this.audio === audio) this.audio = null;
      this.setData({ playingVoiceId: '' });
      wx.showToast({ title: error.errMsg || '语音播放失败', icon: 'none' });
    });
    audio.play();
  },

  openMember(event) {
    const userId = event.currentTarget.dataset.user;
    if (userId && userId !== 'system') wx.navigateTo({ url: `/pages/userProfile/userProfile?id=${userId}` });
  }
});
