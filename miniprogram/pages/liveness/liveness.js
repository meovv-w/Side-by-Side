Page({
  data: { url: '' },
  onLoad(options) { this.setData({ url: decodeURIComponent(options.url || '') }); },
  onUnload() { wx.setStorageSync('tongdao_liveness_returned', true); }
});
