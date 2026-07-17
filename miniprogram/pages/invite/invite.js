const api = require('../../utils/api');

Page({
  data: { inviteCode: '', sharePath: '', records: [], rewards: [], progress: 0, canBindInviter: false },
  onShow() {
    api.listInvites().then(response => {
      if (response.ok) {
        const records = response.data.records.map(item => ({
          ...item,
          avatarText: (item.inviteeName || '同').slice(0, 1),
          sourceText: item.sourceText || ({ qrcode: '扫码注册', link: '分享链接', phone_fallback: '手机号补绑', merchant: '商家推广' }[item.source] || item.source),
          rewardText: item.rewardText || `+${Number(item.bonus || 0)} 同路值`
        }));
        const rewards = response.data.rewards || [];
        const progressValue = response.data.stats && response.data.stats.firstOrders != null
          ? Number(response.data.stats.firstOrders)
          : records.filter(item => item.status === 'ordered').length || records.length;
        const maxTarget = Math.max(1, ...rewards.map(item => Number(item.target || 0)));
        this.setData({ ...response.data, records, rewards, progress: Math.min(100, progressValue / maxTarget * 100) });
      }
    });
  },
  copy() { wx.setClipboardData({ data: this.data.inviteCode }); },
  bindInviter() {
    wx.showModal({
      title: '补绑邀请人', editable: true, placeholderText: '请输入邀请人的手机号', confirmText: '确认绑定',
      success: result => {
        if (!result.confirm) return;
        if (!/^1\d{10}$/.test(result.content || '')) return wx.showToast({ title: '请输入正确手机号', icon: 'none' });
        api.bindInviterByPhone(result.content).then(response => {
          if (!response.ok) return wx.showToast({ title: response.message, icon: 'none' });
          wx.showToast({ title: '邀请关系已绑定' });
          this.onShow();
        });
      }
    });
  },
  onShareAppMessage() { return { title: '和我一起加入同路行，自驾组队更省心', path: this.data.sharePath || '/pages/login/login' }; }
});
