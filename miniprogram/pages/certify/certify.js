const api = require('../../utils/api');

const statusText = { approved: '认证已通过', pending: '资料审核中', rejected: '认证未通过', none: '尚未认证' };

Page({
  data: {
    cert: {}, statusText: '', loaded: false, checking: false, sessionStarted: false,
    form: { name: '', plate: '', vehicleModel: '', licensePhoto: '', faceVerified: false }
  },
  onShow() {
    if (wx.getStorageSync('tongdao_liveness_returned')) {
      wx.removeStorageSync('tongdao_liveness_returned');
      this.setData({ 'form.faceVerified': true });
    }
    if (this.data.loaded) return;
    api.getCertification().then(result => {
      if (!result.ok) return;
      const cert = result.data;
      this.setData({
        loaded: true, cert, statusText: statusText[cert.status] || cert.status,
        form: {
          name: cert.name || '', plate: cert.plate || '', vehicleModel: cert.vehicleModel || '',
          licensePhoto: cert.licensePhoto && !cert.licensePhoto.startsWith('mock') ? cert.licensePhoto : '',
          faceVerified: Boolean(cert.faceVerified)
        }
      });
    });
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  chooseLicense() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['camera', 'album'],
      success: result => this.setData({ 'form.licensePhoto': result.tempFiles[0].tempFilePath, sessionStarted: false, 'form.faceVerified': false })
    });
  },
  verifyFace() {
    const form = this.data.form;
    if (!form.name || !form.plate || !form.vehicleModel || !form.licensePhoto) return wx.showToast({ title: '请先填写资料并上传行驶证', icon: 'none' });
    this.setData({ checking: true });
    wx.showLoading({ title: '识别行驶证' });
    api.startCertification(form).then(result => {
      wx.hideLoading();
      this.setData({ checking: false });
      if (!result.ok) return wx.showToast({ title: result.message, icon: 'none' });
      const liveness = result.data.liveness || {};
      this.setData({ sessionStarted: true });
      if (liveness.demo || !liveness.url || liveness.url.startsWith('demo:')) {
        this.setData({ 'form.faceVerified': true });
        return wx.showToast({ title: '活体检测通过' });
      }
      wx.navigateTo({ url: `/pages/liveness/liveness?url=${encodeURIComponent(liveness.url)}` });
    });
  },
  submit() {
    const form = this.data.form;
    if (!form.name || !form.plate || !form.vehicleModel || !form.licensePhoto || !form.faceVerified || !this.data.sessionStarted) return wx.showToast({ title: '请完成全部认证资料', icon: 'none' });
    api.submitCertification(form).then(result => {
      if (!result.ok) return wx.showToast({ title: result.message, icon: 'none' });
      this.setData({ cert: result.data, statusText: statusText.pending });
      wx.showModal({ title: '资料已提交', content: '审核结果会通过消息通知，审核前可以继续浏览。', showCancel: false });
    });
  }
});
