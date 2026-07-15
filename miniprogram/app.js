App({
  globalData: {
    envId: '',
    apiBaseUrl: '',
    user: null
  },

  onLaunch() {
    const configuredApi = wx.getStorageSync('tongdao_api_base_url');
    const system = wx.getSystemInfoSync();
    this.globalData.apiBaseUrl = configuredApi || (system.platform === 'devtools' ? 'http://127.0.0.1:8790' : '');
    if (wx.cloud) {
      wx.cloud.init({
        env: this.globalData.envId || undefined,
        traceUser: true
      });
    }
  }
});
