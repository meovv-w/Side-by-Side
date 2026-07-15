const api = require('../../utils/api');

function dateAfter(days) {
  const value = new Date(Date.now() + days * 86400000);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const date = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${date}`;
}

Page({
  data: {
    id: '',
    step: 1,
    minDate: dateAfter(0),
    depthOptions: ['浅度', '中度', '深度'],
    depthIndex: 1,
    planOptions: [
      { key: 'AA住宿', label: 'AA住宿', checked: true },
      { key: '拼桌', label: '拼桌吃饭', checked: false },
      { key: '同逛', label: '一起游览', checked: false },
      { key: '拍照', label: '沿途拍照', checked: true },
      { key: '互助', label: '车辆互助', checked: true }
    ],
    form: {
      from: '',
      to: '',
      waypointsText: '',
      title: '',
      teamName: '',
      departDate: dateAfter(7),
      departTime: '08:30',
      days: '3',
      dailyKm: '260',
      seatTotal: '4',
      priceShare: '80',
      depth: '中度',
      privacy: 'public',
      discoverable: true,
      note: ''
    },
    route: [
      { latitude: 30.2741, longitude: 120.1551 },
      { latitude: 29.6097, longitude: 119.0419 }
    ],
    polyline: [],
    markers: []
    ,startPoint: null,
    endPoint: null,
    latitude: 30.2741,
    longitude: 120.1551
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id });
      api.getTrip(options.id).then(res => {
        if (!res.ok || !res.data.owned) return;
        const trip = res.data.trip;
        const parts = `${trip.departAt || ''}`.split(' ');
        const depthIndex = Math.max(0, this.data.depthOptions.indexOf(trip.depth));
        const planOptions = this.data.planOptions.map(item => ({ ...item, checked: (trip.plans || []).includes(item.key) }));
        this.setData({
          depthIndex,
          planOptions,
          form: {
            from: trip.from,
            to: trip.to,
            waypointsText: (trip.waypoints || []).join('、'),
            title: trip.title,
            teamName: trip.teamName,
            departDate: parts[0] || dateAfter(7),
            departTime: parts[1] || '08:30',
            days: `${trip.days || 1}`,
            dailyKm: `${trip.dailyKm || 200}`,
            seatTotal: `${trip.seatTotal || 4}`,
            priceShare: `${trip.priceShare || 0}`,
            depth: trip.depth || '中度',
            privacy: trip.privacy || 'public',
            discoverable: trip.discoverable !== false,
            note: trip.note || ''
          },
          route: trip.route || this.data.route
          ,startPoint: trip.route && trip.route[0] ? { lng: trip.route[0].longitude, lat: trip.route[0].latitude } : null,
          endPoint: trip.route && trip.route.length ? { lng: trip.route[trip.route.length - 1].longitude, lat: trip.route[trip.route.length - 1].latitude } : null
        }, this.buildRouteMarkers);
      });
    } else {
      this.buildRouteMarkers();
    }
  },

  buildRouteMarkers() {
    const route = this.data.route;
    this.setData({ polyline: [{ points: route, color: '#1F6FEB', width: 6 }], markers: [
      { id: 1, latitude: route[0].latitude, longitude: route[0].longitude, iconPath: '/images/markers/default.png', width: 30, height: 30, callout: { content: '起点', display: 'ALWAYS', padding: 5, borderRadius: 4 } },
      { id: 2, latitude: route[route.length - 1].latitude, longitude: route[route.length - 1].longitude, iconPath: '/images/markers/default.png', width: 30, height: 30, callout: { content: '终点', display: 'ALWAYS', padding: 5, borderRadius: 4 } }
    ] });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    const changes = { [`form.${field}`]: event.detail.value };
    if (field === 'from') changes.startPoint = null;
    if (field === 'to') changes.endPoint = null;
    this.setData(changes);
  },

  choosePoint(event) {
    const field = event.currentTarget.dataset.field;
    wx.chooseLocation({
      success: location => {
        const point = { lng: location.longitude, lat: location.latitude };
        this.setData({
          [`form.${field}`]: location.name || location.address,
          [field === 'from' ? 'startPoint' : 'endPoint']: point,
          latitude: location.latitude,
          longitude: location.longitude
        });
      }
    });
  },

  onDate(event) {
    this.setData({ 'form.departDate': event.detail.value });
  },

  onTime(event) {
    this.setData({ 'form.departTime': event.detail.value });
  },

  onDepth(event) {
    const depthIndex = Number(event.detail.value);
    this.setData({ depthIndex, 'form.depth': this.data.depthOptions[depthIndex] });
  },

  onPrivacy(event) {
    this.setData({ 'form.privacy': event.detail.value ? 'public' : 'private' });
  },

  onDiscoverable(event) {
    this.setData({ 'form.discoverable': event.detail.value });
  },

  togglePlan(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ planOptions: this.data.planOptions.map(item => item.key === key ? { ...item, checked: !item.checked } : item) });
  },

  next() {
    const form = this.data.form;
    if (this.data.step === 1 && (!form.from || !form.to)) return wx.showToast({ title: '请填写起点和终点', icon: 'none' });
    if (this.data.step === 1) return this.previewRoute(() => this.setData({ step: 2 }));
    if (this.data.step === 2 && (!form.title || !form.teamName || Number(form.seatTotal) < 1 || Number(form.seatTotal) > 20)) return wx.showToast({ title: '请补全行程信息，车队上限为1-20辆', icon: 'none' });
    this.setData({ step: Math.min(3, this.data.step + 1) });
  },

  previewRoute(done) {
    wx.showLoading({ title: '规划路线' });
    api.planRoute({
      from: this.data.form.from, to: this.data.form.to,
      startPoint: this.data.startPoint, endPoint: this.data.endPoint,
      waypoints: this.data.form.waypointsText.split(/[、,，]/).map(item => item.trim()).filter(Boolean).slice(0, 5), route: this.data.route
    }).then(result => {
      wx.hideLoading();
      if (!result.ok) return wx.showToast({ title: result.message || '路线规划失败', icon: 'none' });
      const route = result.data.route && result.data.route.length ? result.data.route : this.data.route;
      this.setData({
        route, startPoint: result.data.start || this.data.startPoint, endPoint: result.data.end || this.data.endPoint,
        latitude: route[0].latitude, longitude: route[0].longitude
      }, () => { this.buildRouteMarkers(); if (done) done(); });
    });
  },

  previous() {
    this.setData({ step: Math.max(1, this.data.step - 1) });
  },

  submit() {
    const form = this.data.form;
    const payload = {
      ...form,
      departAt: `${form.departDate} ${form.departTime}`,
      waypoints: form.waypointsText.split(/[、,，]/).map(item => item.trim()).filter(Boolean).slice(0, 5),
      plans: this.data.planOptions.filter(item => item.checked).map(item => item.key),
      equipment: ['应急药箱', '对讲机']
      ,startPoint: this.data.startPoint,
      endPoint: this.data.endPoint,
      route: this.data.route
    };
    const action = this.data.id ? api.updateTrip(this.data.id, payload) : api.createTrip(payload);
    action.then(res => {
      if (!res.ok) return wx.showToast({ title: res.message || '保存失败', icon: 'none' });
      wx.showToast({ title: this.data.id ? '行程已更新' : '行程已发布' });
      wx.redirectTo({ url: `/pages/tripDetail/tripDetail?id=${res.data._id}` });
    });
  }
});
