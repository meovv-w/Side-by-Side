const api = require('../../utils/api');

Page({
  data: { mode: 'wechat', form: { nickname: '', phone: '', code: '' }, countdown: 0, inviteToken: '' },
  onLoad(options) {
    if (options.inviteToken) this.setData({ inviteToken: decodeURIComponent(options.inviteToken) });
    if (options.scene && api.isRemote()) {
      wx.request({
        url: `${getApp().globalData.apiBaseUrl}/api/invites/resolve?scene=${encodeURIComponent(options.scene)}`,
        success: response => { if (response.data && response.data.ok) this.setData({ inviteToken: response.data.data.token }); }
      });
    }
  },
  mode(event) { this.setData({ mode: event.currentTarget.dataset.mode }); },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  wechat() {
    wx.getUserProfile({
      desc: '用于展示同路行个人资料',
      success: result => this.finishWechat({ nickname: result.userInfo.nickName, avatar: result.userInfo.avatarUrl }),
      fail: () => this.finishWechat({ nickname: '同路用户' })
    });
  },
  finishWechat(profile) {
    api.loginWechat(profile, this.data.inviteToken).then(result => this.afterLogin(result));
  },
  sendCode() {
    const phone = this.data.form.phone;
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' });
    api.sendSmsCode(phone).then(result => {
      if (!result.ok) return wx.showToast({ title: result.message, icon: 'none' });
      this.setData({ countdown: 60 });
      this.timer = setInterval(() => {
        const countdown = this.data.countdown - 1;
        this.setData({ countdown });
        if (countdown <= 0) clearInterval(this.timer);
      }, 1000);
      if (result.data.devCode) wx.showModal({ title: '演示验证码', content: result.data.devCode, showCancel: false });
      else wx.showToast({ title: '验证码已发送' });
    });
  },
  phone() {
    const form = this.data.form;
    if (!/^1\d{10}$/.test(form.phone) || form.code.length < 4) return wx.showToast({ title: '请填写手机号和验证码', icon: 'none' });
    api.loginWithPhone(form.phone, form.code, { nickname: form.nickname || `用户${form.phone.slice(-4)}` }, this.data.inviteToken).then(result => this.afterLogin(result));
  },
  afterLogin(result) {
    if (!result.ok) return wx.showToast({ title: result.message, icon: 'none' });
    wx.showToast({ title: '登录成功' });
    setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 300);
  },
  onUnload() { if (this.timer) clearInterval(this.timer); }
});
