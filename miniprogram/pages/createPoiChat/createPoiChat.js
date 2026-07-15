const api = require('../../utils/api');

Page({
  data: { form: { name: '', location: '', locationName: '', lng: null, lat: null } },
  onLoad(options) {
    const lng = Number(options.lng);
    const lat = Number(options.lat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      this.setData({ 'form.location': '地图长按位置', 'form.locationName': '地图长按位置', 'form.lng': lng, 'form.lat': lat });
    }
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  location() {
    wx.chooseLocation({ success: location => this.setData({
      'form.location': `${location.name} · ${location.address}`,
      'form.locationName': location.name || location.address,
      'form.lng': location.longitude,
      'form.lat': location.latitude
    }) });
  },
  submit() {
    const form = this.data.form;
    if (!form.name || !form.location || !Number.isFinite(Number(form.lng)) || !Number.isFinite(Number(form.lat))) return wx.showToast({ title: '请填写话题和地点', icon: 'none' });
    api.createPoiChat(form).then(result => {
      if (!result.ok) return wx.showToast({ title: result.message, icon: 'none' });
      wx.redirectTo({ url: `/pages/poiChat/poiChat?id=${result.data._id}` });
    });
  }
});
