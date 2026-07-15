const api = require('../../utils/api');
Page({
  data: { current: 'following', tabs: [{key:'following',label:'我的关注'},{key:'followers',label:'粉丝'},{key:'blocked',label:'黑名单'}], following: [], followers: [], blocked: [] },
  onLoad(options) { this.setData({ current: options.tab || 'following' }); },
  onShow() { api.listSocial().then(res => { if (res.ok) this.setData({ following: res.data.following.map(item => ({ ...item, avatarText: item.targetType === 'team' ? '队' : (item.target.nickname || '同').slice(0, 1) })), followers: res.data.followers.map(item => ({ ...item, userId: item.userId || item._id, avatarText: (item.nickname || '同').slice(0, 1) })), blocked: res.data.blocked.map(item => ({ ...item, userId: item.userId || item.targetId || item._id, avatarText: (item.nickname || '同').slice(0, 1) })) }); }); },
  change(event) { this.setData({ current: event.currentTarget.dataset.key }); },
  open(event) { const type=event.currentTarget.dataset.type,id=event.currentTarget.dataset.id; wx.navigateTo({url:type==='team'?`/pages/tripDetail/tripDetail?id=${id}`:`/pages/userProfile/userProfile?id=${id}`}); },
  unfollow(event) { api.toggleFollow(event.currentTarget.dataset.type,event.currentTarget.dataset.id).then(()=>this.onShow()); },
  unblock(event) { api.setBlocked(event.currentTarget.dataset.id,false).then(()=>this.onShow()); }
});
