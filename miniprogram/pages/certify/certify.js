const api = require('../../utils/api');

const statusText = { approved: '认证已通过', pending: '资料审核中', rejected: '认证未通过', none: '尚未认证' };

Page({
  data: { cert: {}, statusText: '', form: { name: '', plate: '', vehicleModel: '', licensePhoto: '', faceVerified: false } },
  onShow() { api.getCertification().then(res => { if (res.ok) this.setData({ cert: res.data, statusText: statusText[res.data.status] || res.data.status, form: { name: res.data.name || '', plate: res.data.plate || '', vehicleModel: res.data.vehicleModel || '', licensePhoto: res.data.licensePhoto && !res.data.licensePhoto.startsWith('mock') ? res.data.licensePhoto : '', faceVerified: Boolean(res.data.faceVerified) } }); }); },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  chooseLicense() {
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['camera', 'album'], success: result => {
      const tempFilePath = result.tempFiles[0].tempFilePath;
      wx.getFileSystemManager().saveFile({ tempFilePath, success: saved => this.setData({ 'form.licensePhoto': saved.savedFilePath }), fail: () => this.setData({ 'form.licensePhoto': tempFilePath }) });
    } });
  },
  verifyFace() { wx.showModal({ title: '人脸活体检测', content: '请正对手机并保持光线充足。正式上线时由微信认证服务完成活体校验。', confirmText: '开始检测', success: result => { if (result.confirm) { wx.showLoading({ title: '检测中' }); setTimeout(() => { wx.hideLoading(); this.setData({ 'form.faceVerified': true }); wx.showToast({ title: '活体检测通过' }); }, 800); } } }); },
  submit() { const form = this.data.form; if (!form.name || !form.plate || !form.vehicleModel || !form.licensePhoto || !form.faceVerified) return wx.showToast({ title: '请完成全部认证资料', icon: 'none' }); api.submitCertification(form).then(res => { if (res.ok) { this.setData({ cert: res.data, statusText: statusText.pending }); wx.showModal({ title: '资料已提交', content: '审核结果会通过消息通知，审核前可以继续浏览，发布行程和支付功能将受限。', showCancel: false }); } }); }
});
