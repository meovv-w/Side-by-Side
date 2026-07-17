const api = require('../../utils/api');

Page({
  data: {
    categories: ['订单问题', '支付问题', '行程与车队', '认证问题', '安全与投诉', '其他问题'],
    categoryIndex: 0,
    selectedCategory: '订单问题',
    title: '',
    content: '',
    targetType: '',
    targetId: '',
    tickets: [],
    ticketOpen: false,
    activeTicket: null,
    replyContent: '',
    faqs: [
      { q: '如何申请加入车队？', a: '在行程详情提交申请，队长审批后自动加入群聊。', open: false },
      { q: '拼团订单如何退款？', a: '待核销订单可在订单详情申请退款，审核后原路返回。', open: false },
      { q: '退出车队后还能看群聊吗？', a: '退出或被移除后会自动退出群聊；正常完成的成员可永久保留。', open: false }
    ]
  },

  onLoad(options) {
    const categoryIndex = this.data.categories.indexOf(options.category);
    const data = {};
    if (categoryIndex >= 0) Object.assign(data, { categoryIndex, selectedCategory: this.data.categories[categoryIndex] });
    if (options.orderId) Object.assign(data, { title: `订单 ${options.orderId} 咨询`, targetType: 'order', targetId: options.orderId });
    this.setData(data);
  },

  onShow() { this.load(); },

  load() {
    api.listTickets().then(result => {
      if (!result.ok) return;
      this.setData({ tickets: result.data.map(item => this.decorateTicket(item)) });
    });
  },

  decorateTicket(ticket) {
    const messages = (ticket.messages || []).map(message => ({
      ...message,
      senderType: message.senderType || message.sender || 'user',
      senderText: (message.senderType || message.sender) === 'ops' ? '客服' : '我'
    }));
    const lastReply = [...messages].reverse().find(message => message.senderType === 'ops');
    const statusText = { open: '待处理', processing: '处理中', replied: '已回复', resolved: '已解决', closed: '已关闭' }[ticket.status] || ticket.status;
    return { ...ticket, messages, lastReply: lastReply && lastReply.content || '', statusText };
  },

  category(event) {
    const categoryIndex = Number(event.detail.value);
    this.setData({ categoryIndex, selectedCategory: this.data.categories[categoryIndex] });
  },

  input(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },

  faq(event) {
    const selected = Number(event.currentTarget.dataset.index);
    this.setData({ faqs: this.data.faqs.map((item, index) => index === selected ? { ...item, open: !item.open } : item) });
  },

  submit() {
    if (!this.data.title || !this.data.content) return wx.showToast({ title: '请填写问题标题和详细描述', icon: 'none' });
    api.submitTicket({
      category: this.data.selectedCategory,
      title: this.data.title,
      content: this.data.content,
      targetType: this.data.targetType,
      targetId: this.data.targetId
    }).then(result => {
      if (!result.ok) return wx.showToast({ title: result.message || '提交失败', icon: 'none' });
      this.setData({ title: '', content: '', targetType: '', targetId: '' });
      wx.showToast({ title: '工单已提交' });
      this.load();
    });
  },

  openTicket(event) {
    const ticketId = event.currentTarget.dataset.id;
    api.getTicket(ticketId).then(result => {
      if (!result.ok) return wx.showToast({ title: result.message || '工单加载失败', icon: 'none' });
      this.setData({ ticketOpen: true, activeTicket: this.decorateTicket(result.data), replyContent: '' });
    });
  },

  closeTicket() { this.setData({ ticketOpen: false, activeTicket: null, replyContent: '' }); },

  reply() {
    const content = this.data.replyContent.trim();
    if (!content || !this.data.activeTicket) return wx.showToast({ title: '请输入回复内容', icon: 'none' });
    api.replyTicket(this.data.activeTicket._id, content).then(result => {
      if (!result.ok) return wx.showToast({ title: result.message || '回复失败', icon: 'none' });
      wx.showToast({ title: '已发送' });
      api.getTicket(this.data.activeTicket._id).then(detail => {
        if (detail.ok) this.setData({ activeTicket: this.decorateTicket(detail.data), replyContent: '' });
      });
      this.load();
    });
  }
});
