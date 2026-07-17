const runtimeConfig = require('./config');

App({
  globalData: {
    envId: '',
    apiBaseUrl: '',
    user: null
  },

  onLaunch() {
    let extConfig = {};
    try { extConfig = wx.getExtConfigSync ? wx.getExtConfigSync() || {} : {}; } catch (_) {}
    const configuredApi = wx.getStorageSync('tongdao_api_base_url') || extConfig.apiBaseUrl || runtimeConfig.apiBaseUrl;
    const system = wx.getSystemInfoSync();
    this.globalData.apiBaseUrl = String(configuredApi || (system.platform === 'devtools' ? 'http://127.0.0.1:8790' : '')).trim().replace(/\/$/, '');
    if (wx.cloud) {
      wx.cloud.init({
        env: this.globalData.envId || undefined,
        traceUser: true
      });
    }
  }
});
