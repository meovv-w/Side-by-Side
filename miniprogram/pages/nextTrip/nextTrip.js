const api = require('../../utils/api');

function dateAfter(days) {
  const value = new Date(Date.now() + days * 86400000);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const date = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${date}`;
}

Page({
  data: {
    form: { from: '', to: '', date: '', time: '09:00', note: '' },
    minDate: '', drafts: [], matches: [], matching: false, matchPanelOpen: false, selectedDraft: null
  },
  onLoad() {
    this.setData({ minDate: dateAfter(0), 'form.date': dateAfter(7) });
  },
  onShow() { this.load(); },
  load() {
    api.getMine().then(response => {
      if (response.ok) this.setData({ drafts: response.data.nextTrips || [] });
    });
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  date(event) { this.setData({ 'form.date': event.detail.value }); },
  time(event) { this.setData({ 'form.time': event.detail.value }); },
  submit() {
    const form = this.data.form;
    if (!form.from || !form.to) return wx.showToast({ title: '请填写起点和终点', icon: 'none' });
    api.createNextTrip({ ...form, departAt: `${form.date} ${form.time}` }).then(response => {
      if (!response.ok) return wx.showToast({ title: response.message, icon: 'none' });
      wx.showToast({ title: '草稿已保存' });
      this.setData({ form: { from: '', to: '', date: dateAfter(7), time: '09:00', note: '' } });
      this.load();
    });
  },
  findMatches(event) {
    const draftId = event.currentTarget.dataset.id;
    const selectedDraft = this.data.drafts.find(item => item._id === draftId);
    this.setData({ matching: true, matches: [], matchPanelOpen: true, selectedDraft });
    api.matchNextTrip(draftId).then(response => {
      this.setData({ matching: false });
      if (!response.ok) {
        this.setData({ matchPanelOpen: false });
        return wx.showToast({ title: response.message, icon: 'none' });
      }
      this.setData({ matches: response.data || [] });
    });
  },
  closeMatches() { this.setData({ matchPanelOpen: false, matches: [], selectedDraft: null }); },
  noop() {},
  openMatch(event) {
    wx.navigateTo({ url: `/pages/tripDetail/tripDetail?id=${event.currentTarget.dataset.id}` });
  },
  publish(event) {
    api.publishNextTrip(event.currentTarget.dataset.id).then(response => {
      if (!response.ok) return wx.showToast({ title: response.message, icon: 'none' });
      wx.redirectTo({ url: `/pages/tripDetail/tripDetail?id=${response.data._id}` });
    });
  }
});
