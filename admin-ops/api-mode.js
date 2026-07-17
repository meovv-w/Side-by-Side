(() => {
  const params = new URLSearchParams(location.search);
  const fallbackBase = location.protocol.startsWith('http') ? location.origin : 'http://127.0.0.1:8790';
  const API_BASE = (params.get('api') || localStorage.getItem('tongdao_api_base') || fallbackBase).replace(/\/$/, '');
  const TOKEN_KEY = 'tongdao_ops_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let growthRules = [];
  let merchantChanges = [];
  let groupbuyRows = [];
  let users = [];
  let assessmentRules = {};
  let autoReply = {};

  async function call(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      const error = new Error(result.error && result.error.message || `请求失败（${response.status}）`);
      error.code = result.error && result.error.code;
      throw error;
    }
    return result.data;
  }

  function text(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function time(value) {
    if (!value) return '-';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return text(raw);
    const source = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw) && !/[zZ]|[+-]\d\d:?\d\d$/.test(raw)
      ? `${raw.replace(' ', 'T')}Z`
      : raw;
    const date = new Date(source);
    if (!Number.isFinite(date.getTime())) return text(raw.replace('T', ' ').replace(/\.\d{3}Z$|Z$/g, ''));
    const pad = number => String(number).padStart(2, '0');
    return text(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`);
  }

  function orderTier(order) {
    const unitPrice = Number(order.originAmount || 0) / Math.max(1, Number(order.quantity || 1));
    const tier = (order.product && order.product.tiers || []).find(item => Math.abs(Number(item.price) - unitPrice) < 0.011);
    return tier ? `${tier.people}人档 · ¥${Number(tier.price)}` : `成交单价 ¥${unitPrice.toFixed(2)}`;
  }

  async function login(account, password) {
    const result = await call('/api/admin/auth/login', { method: 'POST', body: { account, password } });
    token = result.token;
    localStorage.setItem(TOKEN_KEY, token);
  }

  async function demoLogin() {
    const result = await call('/api/admin/auth/demo', { method: 'POST', body: { role: 'ops' } });
    token = result.token;
    localStorage.setItem(TOKEN_KEY, token);
  }

  function openApp() {
    document.querySelector('#login').classList.add('hidden');
    document.querySelector('#app').classList.remove('hidden');
  }

  function showLogin(message) {
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    document.querySelector('#login').classList.remove('hidden');
    document.querySelector('#app').classList.add('hidden');
    if (message) toast(message);
  }

  async function loadRemote() {
    const [dashboard, userRows, certs, merchants, changes, groupbuys, orders, refunds, settlements, couponRedemptions, coupons, invites, growth, chats, tickets, rescue, trafficEvents, auditLogs, assessmentSetting, autoReplySetting] = await Promise.all([
      call('/api/ops/dashboard'), call('/api/ops/users'), call('/api/ops/certifications'), call('/api/ops/merchants'),
      call('/api/ops/merchant-changes?status=pending'), call('/api/ops/groupbuys'), call('/api/ops/orders'),
      call('/api/ops/refunds'), call('/api/ops/settlements'), call('/api/ops/coupon-redemptions'), call('/api/ops/coupons'), call('/api/ops/invites'),
      call('/api/ops/growth-rules'), call('/api/ops/poi-topics'), call('/api/ops/support/tickets'),
      call('/api/ops/rescue-merchants'), call('/api/ops/traffic-events'), call('/api/ops/audit-logs?limit=200'),
      call('/api/ops/settings/merchant_assessment'), call('/api/ops/settings/support_auto_reply')
    ]);
    users = userRows;
    merchantChanges = changes;
    groupbuyRows = groupbuys;
    growthRules = growth;
    assessmentRules = assessmentSetting && assessmentSetting.value || {};
    autoReply = autoReplySetting && autoReplySetting.value || {};
    state = {
      users: Number(dashboard.stats.registeredUsers), gmv: Number(dashboard.stats.gmv),
      certs: certs.map(item => ({ id: item.id, user: text(item.user.nickname), phone: text(item.user.phone), plate: text(item.plate), vehicle: text(item.vehicleModel), licensePhoto: item.licensePhoto || '', face: Boolean(item.livenessResult && (item.livenessResult.passed || item.livenessResult.status === 'passed')), status: item.status, time: time(item.createdAt) })),
      merchants: merchants.map(item => ({ id: item.id, name: text(item.name), license: item.licensePhoto ? '已上传' : '缺失', licensePhoto: item.licensePhoto || '', level: item.level, score: Number(item.score), status: item.status, settle: 0, rescue: Boolean(item.rescueEnabled), radius: Number(item.rescueRadiusKm || 0) })),
      orders: orders.map(item => ({
        id: text(item.orderNo), rowId: item.id, user: text(item.user.nickname), userPhone: text(item.user.phone || '-'),
        merchant: text(item.merchant.name), merchantPhone: text(item.merchant.phone || '-'), title: text(item.product.name), productId: item.productId,
        tier: orderTier(item),
        quantity: Number(item.quantity || 1), originAmount: Number(item.originAmount), discountAmount: Number(item.discountAmount), amount: Number(item.paidAmount),
        paymentProvider: text(item.paymentProvider || '-'), transactionId: text(item.paymentTransactionId || '-'), verifyCode: text(item.verifyCode || '-'),
        status: item.status === 'verified' ? 'used' : item.status === 'refund_pending' ? 'paid' : item.status,
        time: time(item.createdAt), paidAt: time(item.paidAt), expiresAt: time(item.expiresAt), verifiedAt: time(item.verifiedAt),
        verifiedBy: text(item.verifiedBy || '-'), verifiedLng: item.verifiedLng, verifiedLat: item.verifiedLat
      })),
      refunds: refunds.map(item => ({ id: item.id, orderId: text(item.order.orderNo), user: text(item.user.nickname), amount: Number(item.amount), reason: text(item.reason), status: item.status === 'pending_review' ? 'pending' : item.status, time: time(item.createdAt) })),
      settlements: settlements.map(item => ({ id: item.id, merchant: text(item.merchant.name), period: `${time(item.periodStart)} 至 ${time(item.periodEnd)}`, gross: Number(item.grossAmount), rate: Number(item.commissionRate), net: Number(item.netAmount), status: item.status === 'completed' ? 'settled' : item.status })),
      couponRedemptions: couponRedemptions.map(item => ({
        id: item.id, merchant: text(item.merchant && item.merchant.name || item.merchantId),
        coupon: text(item.coupon && item.coupon.name || item.couponId), ownerType: item.coupon && item.coupon.ownerType,
        user: text(item.user && item.user.nickname || '-'), amount: Number(item.amount), status: item.status,
        providerId: text(item.providerId || '-'), time: time(item.createdAt), settledAt: time(item.settledAt)
      })),
      budget: {
        budget: Number(coupons.budget.monthlyTotal || 0), userLimit: Number(coupons.budget.monthlyUserLimit || 0),
        committed: Number(coupons.budgetUsage && coupons.budgetUsage.committed || 0),
        spent: Number(coupons.budgetUsage && coupons.budgetUsage.spent || 0),
        month: coupons.budgetUsage && coupons.budgetUsage.month || ''
      },
      coupons: coupons.items.map(item => ({ id: item.id, title: text(item.name), owner: item.ownerType === 'platform' ? '平台' : text(item.ownerId), issued: Number(item.issued), used: Number(item.used), amount: Number(item.amount), status: item.status })),
      invites: invites.map(item => {
        const pending = item.records.find(record => record.rewardStatus === 'pending');
        const records = item.records.map(record => ({
          id: record.id, invitee: text(record.invitee && record.invitee.nickname || record.inviteeId),
          source: record.source, status: record.status, rewardStatus: record.rewardStatus,
          rewardValue: Number(record.rewardValue || 0), boundAt: time(record.boundAt), firstOrderAt: time(record.firstOrderAt)
        }));
        const issued = records.filter(record => record.rewardStatus === 'issued').reduce((total, record) => total + record.rewardValue, 0);
        return {
          id: item.inviter.id, pendingId: pending && pending.id, name: text(item.inviter.nickname),
          invited: item.registered, registered: item.registered, ordered: item.firstOrders,
          reward: pending ? `待发放 ¥${pending.rewardValue}` : `已发放 ¥${issued}`, pending: Boolean(pending), records
        };
      }),
      growth: Object.fromEntries(growth.map(item => [text(item.name), Number(item.points)])),
      chats: chats.map(item => ({
        id: item.id, name: text(item.name), location: text(item.locationName), online: Number(item.onlineCount || 0),
        status: item.status, reports: (item.reports || []).length,
        messages: (item.messages || []).map(message => ({
          id: message.id, sender: text(message.sender && message.sender.nickname || (message.senderId ? '同路用户' : '系统')),
          type: message.messageType, content: text(message.content || message.mediaUrl || ''), time: time(message.createdAt)
        })),
        reportItems: (item.reports || []).map(report => ({
          id: report.id, user: text(report.user && report.user.nickname || report.userId), title: text(report.title),
          messageId: report.messageId || '', status: report.status, time: time(report.createdAt),
          evidence: (report.messages || []).filter(message => message.senderType === 'user').map(message => text(message.content)).join('；')
        }))
      })),
      safetyReports: trafficEvents.map(item => ({
        id: item.id, reporter: text(item.reporter && item.reporter.nickname || (item.source === 'provider' ? '高德数据' : '运营录入')),
        title: text(item.title), description: text(item.description), lng: Number(item.lng), lat: Number(item.lat),
        status: item.status, source: item.source, time: time(item.createdAt)
      })),
      auditLogs: auditLogs.map(item => ({
        id: item.id, actor: text(item.actorId || '-'), actorType: text(item.actorType), method: text(item.method),
        path: text(item.path), statusCode: Number(item.statusCode), ip: text(item.ip || '-'), time: time(item.createdAt)
      })),
      tickets: tickets.map(item => ({
        id: item.id, type: text(item.category), user: text(item.user.nickname), userPhone: text(item.user.phone || '-'),
        title: text(item.title), priority: item.priority, orderId: item.orderId || (item.targetType === 'order' ? item.targetId : ''),
        targetType: item.targetType || '', targetId: item.targetId || '', messageId: item.messageId || '',
        status: ['resolved', 'closed'].includes(item.status) ? 'replied' : 'open', time: time(item.createdAt),
        messages: (item.messages || []).map(message => ({ senderType: message.senderType, content: text(message.content), time: time(message.createdAt) }))
      })),
      rescue: rescue.map(item => ({ id: item.id, name: text(item.name), license: item.licensePhoto ? '已上传' : '缺失', level: item.level, score: item.score, status: item.status, rescue: Boolean(item.rescueEnabled), services: item.rescueServices || [], radius: item.rescueRadiusKm, phone: item.rescuePhone, open: item.businessOpen !== false })),
      dashboard
    };
    openApp(); render(); renderUsers(); renderMerchantChanges(); renderGroupbuys(); renderSettings();
  }

  function renderSettings() {
    const form = document.querySelector('#assessmentRuleForm');
    for (const level of ['bronze', 'silver', 'gold', 'diamond']) {
      const rule = assessmentRules[level] || {};
      form[`${level}Score`].value = rule.minScore == null ? '' : Number(rule.minScore);
      form[`${level}Rate`].value = rule.commissionRate == null ? '' : Number(rule.commissionRate) * 100;
      form[`${level}Benefit`].value = rule.benefit || '';
    }
    document.querySelector('#autoReplyForm [name=text]').value = autoReply.text || '';
    document.querySelector('#autoReplyForm [name=enabled]').checked = autoReply.enabled === true;
  }

  window.renderUsers = () => {
    const query = (document.querySelector('#userSearch').value || '').toLowerCase();
    const rows = users.filter(user => `${user.nickname}${user.phone || ''}${user.vehicleNo || ''}`.toLowerCase().includes(query));
    document.querySelector('#userTable').innerHTML = `<table><thead><tr><th>用户</th><th>手机号</th><th>车辆</th><th>认证</th><th>等级/同路值</th><th>注册时间</th></tr></thead><tbody>${rows.map(user => `<tr><td>${text(user.nickname)}<br><span class="muted">${text(user.id)}</span></td><td>${text(user.phone || '-')}</td><td>${text(user.vehicleModel || '-')}<br>${text(user.vehicleNo || '')}</td><td>${tags[user.ownerCertStatus] || text(user.ownerCertStatus)}</td><td>Lv.${user.level} / ${user.growth}</td><td>${time(user.createdAt)}</td></tr>`).join('')}</tbody></table>`;
  };

  renderCerts = function renderRemoteCertifications() {
    const filter = document.querySelector('#certFilter').value || 'all';
    const rows = state.certs.filter(item => filter === 'all' || item.status === filter);
    document.querySelector('#certTable').innerHTML = `<table><thead><tr><th>用户</th><th>手机号</th><th>车辆</th><th>车牌</th><th>行驶证</th><th>活体</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows.map(item => `<tr><td>${item.user}</td><td>${item.phone}</td><td>${item.vehicle}</td><td>${item.plate}</td><td>${item.licensePhoto ? `<button class="btn secondary small" data-url="${text(item.licensePhoto)}" data-title="${text(item.user)}的行驶证" onclick="openDocumentViewer(this.dataset.url,this.dataset.title)">查看原图</button>` : '<span class="tag danger">缺失</span>'}</td><td>${item.face ? '<span class="tag success">已通过</span>' : '<span class="tag danger">未完成</span>'}</td><td>${item.time}</td><td>${tags[item.status] || text(item.status)}</td><td>${item.status === 'pending' ? `<div class="actions"><button class="btn success small" onclick="reviewCert('${item.id}','approved')">通过</button><button class="btn danger small" onclick="reviewCert('${item.id}','rejected')">拒绝</button></div>` : '查看记录'}</td></tr>`).join('')}</tbody></table>`;
  };

  renderMerchants = function renderRemoteMerchants() {
    document.querySelector('#merchantTable').innerHTML = `<table><thead><tr><th>商家</th><th>营业执照</th><th>等级</th><th>得分</th><th>服务类型</th><th>状态</th><th>操作</th></tr></thead><tbody>${state.merchants.map(item => `<tr><td>${item.name}<br><span class="muted">${item.id}</span></td><td>${item.licensePhoto ? `<button class="btn secondary small" data-url="${text(item.licensePhoto)}" data-title="${text(item.name)}营业执照" onclick="openDocumentViewer(this.dataset.url,this.dataset.title)">查看原图</button>` : '<span class="tag danger">缺失</span>'}</td><td>${text(item.level)}</td><td>${item.score}</td><td>${item.rescue ? '修车/救援' : '沿途商家'}</td><td>${tags[item.status] || text(item.status)}</td><td><div class="actions">${item.status === 'pending' ? `<button class="btn success small" onclick="reviewMerchant('${item.id}',true)">通过</button><button class="btn danger small" onclick="reviewMerchant('${item.id}',false)">拒绝</button>` : `<button class="btn secondary small" onclick="adjustLevel('${item.id}')">调整等级</button>`}</div></td></tr>`).join('')}</tbody></table>`;
  };

  window.openDocumentViewer = (url, title) => {
    if (!url) return toast('资质文件不存在');
    document.querySelector('#documentViewerTitle').textContent = title || '资质文件';
    document.querySelector('#documentViewerImage').src = url;
    document.querySelector('#documentViewerModal').classList.remove('hidden');
  };

  window.closeDocumentViewer = () => {
    document.querySelector('#documentViewerModal').classList.add('hidden');
    document.querySelector('#documentViewerImage').removeAttribute('src');
  };

  renderDashboard = function renderRemoteDashboard() {
    const data = state.dashboard || { stats: {}, todo: {} };
    const stats = data.stats || {};
    const todo = data.todo || {};
    document.querySelector('#stats').innerHTML = `<div class="stat">注册用户<b>${Number(stats.registeredUsers || 0)}</b></div><div class="stat">已入驻商家<b>${Number(stats.approvedMerchants || 0)}</b></div><div class="stat">拼团活动<b>${Number(stats.groupbuys || 0)}</b></div><div class="stat">拼团成功率<b>${Math.round(Number(stats.groupbuySuccessRate || 0) * 100)}%</b></div><div class="stat">支付订单<b>${Number(stats.paidOrders || 0)}</b></div><div class="stat">已核销订单<b>${Number(stats.verifiedOrders || 0)}</b></div><div class="stat">累计 GMV<b>¥${Number(stats.gmv || 0).toLocaleString()}</b></div><div class="stat">佣金收入<b>¥${Number(stats.commissionIncome || 0).toLocaleString()}</b></div>`;
    document.querySelector('#todo').innerHTML = `<div class="queue"><span>车主认证待审核</span><b>${Number(todo.certifications || 0)}</b></div><div class="queue"><span>商家资质待审核</span><b>${Number(todo.merchants || 0)}</b></div><div class="queue"><span>退款申请待处理</span><b>${Number(todo.refunds || 0)}</b></div><div class="queue"><span>安全上报待审核</span><b>${Number(todo.safetyReports || 0)}</b></div><div class="queue"><span>客服工单待处理</span><b>${Number(todo.tickets || 0)}</b></div>`;
    document.querySelector('#risk').innerHTML = `<div class="queue"><span>订单分账待处理</span><span class="tag warning">${Number(todo.settlements || 0)} 笔</span></div><div class="queue"><span>优惠券结算待处理</span><span class="tag warning">${Number(todo.couponSettlements || 0)} 笔</span></div><div class="queue"><span>安全上报待核实</span><span class="tag ${Number(todo.safetyReports || 0) ? 'danger' : 'success'}">${Number(todo.safetyReports || 0)} 条</span></div><div class="queue"><span>地点聊天室内容治理</span><span class="tag">${state.chats.length} 个话题</span></div>`;
  };

  renderSettlements = function renderRemoteSettlements() {
    const orderRows = state.settlements || [];
    const couponRows = state.couponRedemptions || [];
    document.querySelector('#settlementTable').innerHTML = `<table><thead><tr><th>类型</th><th>编号</th><th>商家</th><th>结算依据</th><th>金额</th><th>佣金率</th><th>应结算</th><th>状态</th><th>操作</th></tr></thead><tbody>${orderRows.map(item => `<tr><td><span class="tag">订单分账</span></td><td>${text(item.id)}</td><td>${text(item.merchant)}</td><td>${text(item.period)}</td><td>¥${item.gross}</td><td>${item.rate * 100}%</td><td>¥${item.net}</td><td>${tags[item.status] || text(item.status)}</td><td>${['pending','failed','processing'].includes(item.status) ? `<button class="btn small" onclick="settle('${item.id}')">${item.status === 'processing' ? '刷新状态' : '触发分账'}</button>` : '查看流水'}</td></tr>`).join('')}${couponRows.map(item => `<tr><td><span class="tag warning">券结算</span></td><td>${text(item.id)}</td><td>${text(item.merchant)}</td><td>${text(item.coupon)} · ${text(item.user)}</td><td>¥${item.amount}</td><td>独立核算</td><td>¥${item.amount}</td><td><span class="tag ${item.status === 'settled' ? 'success' : 'warning'}">${item.status === 'settled' ? '已结算' : '待结算'}</span></td><td>${item.status === 'pending' ? `<button class="btn small" onclick="settleCoupon('${item.id}')">触发券结算</button>` : text(item.providerId)}</td></tr>`).join('')}</tbody></table>`;
  };

  renderCoupons = function renderRemoteCoupons() {
    document.querySelector('#budgetForm [name=budget]').value = state.budget.budget;
    document.querySelector('#budgetForm [name=userLimit]').value = state.budget.userLimit;
    const issued = state.coupons.reduce((total, item) => total + item.issued, 0);
    const used = state.coupons.reduce((total, item) => total + item.used, 0);
    document.querySelector('#couponIssued').textContent = issued;
    document.querySelector('#couponUsed').textContent = used;
    document.querySelector('#couponSpend').textContent = `¥${state.budget.spent}（已承诺 ¥${state.budget.committed} / 预算 ¥${state.budget.budget}）`;
    document.querySelector('#couponTable').innerHTML = `<table><thead><tr><th>券</th><th>归属</th><th>面额</th><th>已发放</th><th>已核销</th><th>核销率</th><th>状态</th></tr></thead><tbody>${state.coupons.map(item => `<tr><td>${item.title}</td><td>${item.owner}</td><td>¥${item.amount}</td><td>${item.issued}</td><td>${item.used}</td><td>${item.issued ? Math.round(item.used / item.issued * 100) : 0}%</td><td>${tags[item.status] || text(item.status)}</td></tr>`).join('')}</tbody></table>`;
  };

  renderOrders = function renderRemoteOrders() {
    const query = (document.querySelector('#orderSearch').value || '').toLowerCase();
    const filter = document.querySelector('#orderFilter').value || 'all';
    const rows = state.orders.filter(item => (filter === 'all' || item.status === filter) && `${item.id}${item.user}${item.title}`.toLowerCase().includes(query));
    document.querySelector('#orderTable').innerHTML = `<table><thead><tr><th>订单</th><th>用户</th><th>商家</th><th>商品</th><th>金额</th><th>时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows.map(item => `<tr><td>${text(item.id)}</td><td>${text(item.user)}</td><td>${text(item.merchant)}</td><td>${text(item.title)}</td><td>¥${item.amount}</td><td>${text(item.time)}</td><td>${tags[item.status] || text(item.status)}</td><td><button class="btn secondary small" onclick="viewOpsOrder('${text(item.rowId || item.id)}')">查看详情</button></td></tr>`).join('')}</tbody></table>`;
  };

  renderRefunds = function renderRemoteRefunds() {
    const statusText = { pending: '待审核', processing: '退款处理中', completed: '退款成功', failed: '退款失败', rejected: '已拒绝' };
    document.querySelector('#refundTable').innerHTML = `<table><thead><tr><th>申请</th><th>订单</th><th>用户</th><th>金额</th><th>原因</th><th>时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${state.refunds.map(item => `<tr><td>${text(item.id)}</td><td>${text(item.orderId)}</td><td>${text(item.user)}</td><td>¥${item.amount}</td><td>${text(item.reason)}</td><td>${text(item.time)}</td><td><span class="tag ${item.status === 'failed' ? 'danger' : item.status === 'completed' ? 'success' : 'warning'}">${text(statusText[item.status] || item.status)}</span></td><td>${item.status === 'pending' ? `<div class="actions"><button class="btn success small" onclick="reviewRefund('${text(item.id)}',true)">同意</button><button class="btn danger small" onclick="reviewRefund('${text(item.id)}',false)">拒绝</button></div>` : ['failed', 'processing'].includes(item.status) ? `<button class="btn secondary small" onclick="retryRefund('${text(item.id)}')">重试退款</button>` : '已处理'}</td></tr>`).join('')}</tbody></table>`;
  };

  window.viewOpsOrder = orderId => {
    const order = state.orders.find(item => (item.rowId || item.id) === orderId);
    if (!order) return toast('订单不存在');
    const rows = [
      ['订单编号', order.id], ['订单状态', order.status], ['用户', order.user], ['用户手机号', order.userPhone || '-'],
      ['商家', order.merchant], ['商家电话', order.merchantPhone || '-'], ['商品', order.title], ['商品 ID', order.productId || '-'],
      ['成交档位', order.tier], ['数量', order.quantity || 1], ['商品金额', `¥${Number(order.originAmount || order.amount).toFixed(2)}`],
      ['优惠抵扣', `¥${Number(order.discountAmount || 0).toFixed(2)}`], ['实付金额', `¥${Number(order.amount || 0).toFixed(2)}`],
      ['支付渠道', order.paymentProvider || '-'], ['支付流水', order.transactionId || '-'], ['下单时间', order.time || '-'],
      ['支付时间', order.paidAt || '-'], ['有效期', order.expiresAt || '-'], ['核销时间', order.verifiedAt || '-'], ['核销码', order.verifyCode || '-'],
      ['核销人员', order.verifiedBy || '-'], ['核销坐标', order.verifiedLng == null ? '-' : `${order.verifiedLng}, ${order.verifiedLat}`]
    ];
    document.querySelector('#opsOrderDetailBody').innerHTML = `<div class="detail-grid">${rows.map(([label, value], index) => `<div class="detail-row ${index === 6 || index === 13 ? 'full' : ''}"><label>${text(label)}</label><b>${text(value)}</b></div>`).join('')}</div>`;
    document.querySelector('#opsOrderDetailModal').classList.remove('hidden');
  };

  window.closeOpsOrder = () => document.querySelector('#opsOrderDetailModal').classList.add('hidden');

  function renderMerchantChanges() {
    document.querySelector('#merchantChangeTable').innerHTML = `<table><thead><tr><th>申请</th><th>商家</th><th>变更内容</th><th>提交时间</th><th>操作</th></tr></thead><tbody>${merchantChanges.map(item => `<tr><td>${text(item.id)}</td><td>${text(item.merchantId)}</td><td>${text(JSON.stringify(item.changes))}</td><td>${time(item.createdAt)}</td><td><div class="actions"><button class="btn success small" onclick="reviewMerchantChange('${item.id}',true)">通过</button><button class="btn danger small" onclick="reviewMerchantChange('${item.id}',false)">拒绝</button></div></td></tr>`).join('') || '<tr><td colspan="5">暂无待复核资料</td></tr>'}</tbody></table>`;
  }

  function renderGroupbuys() {
    document.querySelector('#groupbuyTable').innerHTML = `<table><thead><tr><th>活动</th><th>商品</th><th>进度</th><th>当前价</th><th>到期时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${groupbuyRows.map(item => `<tr><td>${text(item.id)}</td><td>${text(item.product && item.product.name)}</td><td>${item.joinedPeople}/${item.targetPeople}</td><td>¥${item.currentPrice}</td><td>${time(item.expiresAt)}</td><td>${tags[item.status] || text(item.status)}</td><td>${item.status === 'forming' ? `<div class="actions"><button class="btn success small" onclick="interveneGroupbuy('${item.id}','success')">设为成功</button><button class="btn danger small" onclick="interveneGroupbuy('${item.id}','failed')">结束并退款</button></div>` : '已结束'}</td></tr>`).join('')}</tbody></table>`;
  }

  render = function renderRemote() {
    renderDashboard(); renderUsers(); renderCerts(); renderMerchants(); renderMerchantChanges(); renderGroupbuys();
    renderOrders(); renderRefunds(); renderSettlements(); renderCoupons(); renderInvites(); renderGrowth();
    renderChats(); renderSafetyReports(); renderSupport(); renderRescue(); renderAuditLogs(); renderSettings();
  };

  renderRescue = function renderRemoteRescue() {
    const rescueRows = state.rescue || (state.merchants || []).filter(item => item.rescue).map(item => ({ ...item, services: ['搭电', '拖车', '应急维修'], radius: 30, phone: '-', open: true }));
    document.querySelector('#rescueTable').innerHTML = `<table><thead><tr><th>服务商</th><th>资质</th><th>等级</th><th>评分</th><th>服务范围</th><th>电话</th><th>营业</th><th>平台状态</th><th>操作</th></tr></thead><tbody>${rescueRows.map(item => `<tr><td>${item.name}</td><td>${item.license}</td><td>${text(item.level)}</td><td>${item.score}</td><td>${item.radius}km · ${text((item.services || []).join('/') || '救援服务')}</td><td>${text(item.phone || '-')}</td><td>${item.open ? '<span class="tag success">营业中</span>' : '<span class="tag">暂停营业</span>'}</td><td>${item.rescue ? '<span class="tag success">已启用</span>' : '<span class="tag danger">已暂停</span>'}</td><td><button class="btn secondary small" onclick="setRescueStatus('${item.id}',${!item.rescue})">${item.rescue ? '暂停服务' : '恢复服务'}</button></td></tr>`).join('')}</tbody></table>`;
  };

  window.setRescueStatus = async (id, enabled) => {
    if (!confirm(enabled ? '确认恢复该商家的救援服务？' : '确认暂停该商家的救援服务？')) return;
    try { await call(`/api/ops/rescue-merchants/${id}`, { method: 'PUT', body: { enabled } }); await loadRemote(); toast('救援服务状态已更新'); } catch (error) { toast(error.message); }
  };

  renderInvites = function renderRemoteInvites() {
    document.querySelector('#inviteTable').innerHTML = `<table><thead><tr><th>排名</th><th>邀请人</th><th>邀请</th><th>注册</th><th>完成首单</th><th>奖励</th><th>操作</th></tr></thead><tbody>${state.invites.sort((a, b) => b.registered - a.registered).map((item, index) => `<tr><td>${index + 1}</td><td>${item.name}</td><td>${item.invited}</td><td>${item.registered}</td><td>${item.ordered}</td><td>${text(item.reward)}</td><td><div class="actions"><button class="btn secondary small" onclick="viewInviteRecords('${item.id}')">查看记录</button>${item.pending ? `<button class="btn small" onclick="grant('${item.pendingId}')">发放奖励</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`;
  };

  window.viewInviteRecords = inviterId => {
    const item = state.invites.find(row => row.id === inviterId);
    if (!item) return toast('邀请记录不存在');
    const sourceNames = { link: '分享链接', qrcode: '邀请二维码', phone: '手机号兜底', merchant: '商家推广' };
    const statusNames = { pending: '待发放', issued: '已发放', none: '无奖励' };
    document.querySelector('#inviteDetailTitle').textContent = `${item.name} · 邀请奖励记录`;
    document.querySelector('#inviteDetailBody').innerHTML = (item.records || []).map(record => `<div class="invite-record"><b>${record.invitee}</b> · ${text(sourceNames[record.source] || record.source)}<div class="muted">绑定 ${record.boundAt} · 首单 ${record.firstOrderAt}</div><div>邀请状态：${text(record.status)} · 奖励：${text(statusNames[record.rewardStatus] || record.rewardStatus)} ¥${record.rewardValue}</div></div>`).join('') || '<div class="muted">暂无邀请记录</div>';
    document.querySelector('#inviteDetailModal').classList.remove('hidden');
  };

  window.closeInviteDetail = () => document.querySelector('#inviteDetailModal').classList.add('hidden');

  renderGrowth = function renderRemoteGrowth() {
    document.querySelector('#growthFields').innerHTML = growthRules.map(rule => `<div class="growth-rule"><div><b>${text(rule.name)}</b><div class="muted">${text(rule.ruleKey)}</div></div><div class="field"><label>分值/权重</label><input class="control" name="points_${text(rule.id)}" type="number" min="0" value="${Number(rule.points)}"></div><div class="field"><label>每日奖励上限（分）</label><input class="control" name="limit_${text(rule.id)}" type="number" min="0" value="${rule.dailyLimit == null ? '' : Number(rule.dailyLimit)}" placeholder="不限"></div><div class="field"><label><input name="enabled_${text(rule.id)}" type="checkbox" ${rule.enabled ? 'checked' : ''}> 启用</label></div></div>`).join('');
  };

  renderChats = function renderRemoteChats() {
    document.querySelector('#chatTable').innerHTML = `<table><thead><tr><th>话题</th><th>地点</th><th>参与人数</th><th>消息</th><th>待处理举报</th><th>状态</th><th>操作</th></tr></thead><tbody>${state.chats.map(item => `<tr><td>${item.name}<br><span class="muted">${text(item.id)}</span></td><td>${item.location}</td><td>${item.online}</td><td>${item.messages.length}</td><td><span class="tag ${item.reports ? 'danger' : ''}">${item.reports}</span></td><td>${tags[item.status] || text(item.status)}</td><td><button class="btn ${item.reports ? '' : 'secondary'} small" onclick="viewTopicDetail('${item.id}')">查看内容</button></td></tr>`).join('')}</tbody></table>`;
  };

  window.viewTopicDetail = topicId => {
    const topic = state.chats.find(item => item.id === topicId);
    if (!topic) return toast('话题不存在');
    window.activeTopicId = topicId;
    document.querySelector('#topicDetailTitle').textContent = `${topic.name} · ${topic.location}`;
    const reports = (topic.reportItems || []).map(report => `<div class="report-content"><b>${report.user} 举报 · ${report.time}</b><div>${report.evidence || report.title}</div><div class="muted">工单 ${text(report.id)}${report.messageId ? ` · 关联消息 ${text(report.messageId)}` : ''}</div></div>`).join('') || '<div class="muted">暂无待处理举报</div>';
    const messages = (topic.messages || []).map(message => `<div class="topic-content"><b>${message.sender} · ${message.time} · ${text(message.type)}</b>${message.content}</div>`).join('') || '<div class="muted">暂无话题消息</div>';
    document.querySelector('#topicDetailBody').innerHTML = `<div class="ticket-meta">状态：${text(topic.status)} · 参与 ${topic.online} 人 · 待处理举报 ${topic.reports} 条</div><section class="topic-section"><h4>举报证据</h4>${reports}</section><section class="topic-section"><h4>话题内容</h4>${messages}</section>`;
    document.querySelector('#topicDetailActions').innerHTML = `${topic.status !== 'archived' ? `<button class="btn secondary" onclick="moderateTopicDetail('archived')">归档</button>` : `<button class="btn secondary" onclick="moderateTopicDetail('active')">恢复</button>`}<button class="btn danger" onclick="moderateTopicDetail('removed')">下架违规话题</button>`;
    document.querySelector('#topicDetailModal').classList.remove('hidden');
  };

  window.closeTopicDetail = () => {
    window.activeTopicId = '';
    document.querySelector('#topicDetailModal').classList.add('hidden');
  };

  window.moderateTopicDetail = async status => {
    const id = window.activeTopicId;
    closeTopicDetail();
    await moderateChat(id, status);
  };

  renderSupport = function renderRemoteSupport() {
    document.querySelector('#supportTable').innerHTML = `<table><thead><tr><th>工单</th><th>类型</th><th>用户</th><th>问题</th><th>消息数</th><th>时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${state.tickets.map(item => `<tr><td>${text(item.id)}</td><td>${item.type}</td><td>${item.user}</td><td>${item.title}</td><td>${(item.messages || []).length}</td><td>${item.time}</td><td>${tags[item.status] || text(item.status)}</td><td><button class="btn ${item.status === 'open' ? '' : 'secondary'} small" onclick="viewOpsTicket('${item.id}')">${item.status === 'open' ? '查看并处理' : '查看记录'}</button></td></tr>`).join('')}</tbody></table>`;
  };

  window.viewOpsTicket = ticketId => {
    const ticket = state.tickets.find(item => item.id === ticketId);
    if (!ticket) return toast('工单不存在');
    window.activeOpsTicketId = ticketId;
    document.querySelector('#supportTicketTitle').textContent = `${ticket.type} · ${ticket.title}`;
    const targetNames = { user: '被投诉用户', poi_topic: '地点话题', order: '关联订单' };
    const target = ticket.targetId ? `<br><span class="muted">${text(targetNames[ticket.targetType] || '关联对象')} ${text(ticket.targetId)}${ticket.messageId ? ` · 消息 ${text(ticket.messageId)}` : ''}</span>` : '';
    document.querySelector('#supportTicketBody').innerHTML = `<div class="ticket-meta"><b>${ticket.user}</b> · ${ticket.userPhone || '-'}<br><span class="muted">工单 ${ticket.id}${ticket.orderId ? ` · 订单 ${text(ticket.orderId)}` : ''} · ${ticket.time}</span>${target}</div>${(ticket.messages || []).map(message => `<div class="ticket-message ${message.senderType === 'ops' ? 'ops' : ''}"><b>${message.senderType === 'ops' ? '运营回复' : message.senderType === 'system' ? '系统' : ticket.user} · ${message.time}</b>${message.content}</div>`).join('') || '<div class="muted">暂无对话内容</div>'}`;
    document.querySelector('#supportTicketReply').value = '';
    document.querySelector('#supportTicketModal').classList.remove('hidden');
  };

  window.closeOpsTicket = () => {
    window.activeOpsTicketId = '';
    document.querySelector('#supportTicketModal').classList.add('hidden');
  };

  window.submitOpsTicket = async close => {
    const content = document.querySelector('#supportTicketReply').value.trim();
    if (!content) return toast('请填写处理回复');
    try {
      await call(`/api/ops/support/tickets/${window.activeOpsTicketId}/reply`, { method: 'POST', body: { content, close } });
      await loadRemote();
      closeOpsTicket();
      toast(close ? '工单已回复并关闭' : '回复已发送');
    } catch (error) { toast(error.message); }
  };

  document.querySelector('#loginForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try { await login(form.account, form.password); await loadRemote(); } catch (error) { toast(error.message); }
  };

  window.reviewCert = async (id, status) => {
    const approved = status === 'approved';
    const reason = approved ? '' : prompt('填写拒绝原因');
    if (!approved && !reason) return;
    try { await call(`/api/ops/certifications/${id}`, { method: 'PUT', body: { approved, reason } }); await loadRemote(); toast(approved ? '认证已通过' : '认证已拒绝'); } catch (error) { toast(error.message); }
  };

  window.reviewMerchant = async (id, approved) => {
    const reason = approved ? '' : prompt('填写拒绝原因');
    if (!approved && !reason) return;
    try { await call(`/api/ops/merchants/${id}/review`, { method: 'PUT', body: { approved, reason } }); await loadRemote(); toast(approved ? '商家审核通过' : '已拒绝入驻'); } catch (error) { toast(error.message); }
  };

  window.reviewMerchantChange = async (id, approved) => {
    const reason = approved ? '' : prompt('填写处理说明');
    try { await call(`/api/ops/merchant-changes/${id}`, { method: 'PUT', body: { approved, reason } }); await loadRemote(); toast('资料复核已处理'); } catch (error) { toast(error.message); }
  };

  window.adjustLevel = async id => {
    const level = prompt('输入新等级：bronze / silver / gold / diamond', 'gold');
    if (!['bronze', 'silver', 'gold', 'diamond'].includes(level)) return;
    const merchant = state.merchants.find(item => item.id === id);
    const score = Number(prompt('输入综合得分（0-100）', merchant ? merchant.score : 80));
    if (!Number.isFinite(score) || score < 0 || score > 100) return toast('得分必须在0至100之间');
    try { await call(`/api/ops/merchants/${id}/level`, { method: 'PUT', body: { level, score } }); await loadRemote(); toast('商家等级已调整'); } catch (error) { toast(error.message); }
  };

  window.interveneGroupbuy = async (id, outcome) => {
    const reason = prompt('填写干预原因', outcome === 'failed' ? '活动异常，结束并原路退款' : '运营确认成团');
    if (!reason) return;
    try { await call(`/api/ops/groupbuys/${id}/intervene`, { method: 'POST', body: { outcome, reason } }); await loadRemote(); toast('拼团状态已更新'); } catch (error) { toast(error.message); }
  };

  window.reviewRefund = async (id, approved) => {
    const reason = prompt('填写审核说明', approved ? '符合退款条件' : '不符合退款规则');
    if (!reason) return;
    try { await call(`/api/ops/refunds/${id}`, { method: 'PUT', body: { approved, reason } }); await loadRemote(); toast(approved ? '退款已提交原路退回' : '退款申请已拒绝'); } catch (error) { toast(error.message); }
  };

  window.retryRefund = async id => {
    try { await call(`/api/ops/refunds/${id}/retry`, { method: 'POST', body: {} }); await loadRemote(); toast('退款重试已提交'); } catch (error) { toast(error.message); }
  };

  window.settle = async id => {
    if (!confirm('确认触发该结算单？')) return;
    try { await call(`/api/ops/settlements/${id}/trigger`, { method: 'POST', body: {} }); await loadRemote(); toast('结算已触发'); } catch (error) { toast(error.message); }
  };

  window.settleCoupon = async id => {
    const item = (state.couponRedemptions || []).find(row => row.id === id);
    if (!item) return;
    const providerId = item.ownerType === 'platform' ? prompt('填写财务付款流水号') : '';
    if (item.ownerType === 'platform' && !providerId) return;
    try {
      await call(`/api/ops/coupon-redemptions/${id}/settle`, { method: 'POST', body: { providerId } });
      await loadRemote();
      toast('优惠券独立结算已完成');
    } catch (error) { toast(error.message); }
  };

  document.querySelector('#budgetForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try { await call('/api/ops/settings/coupon_budget', { method: 'PUT', body: { value: { monthlyTotal: Number(form.budget), monthlyUserLimit: Number(form.userLimit) } } }); await loadRemote(); toast('平台券预算已保存'); } catch (error) { toast(error.message); }
  };

  document.querySelector('#platformCouponForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try { await call('/api/ops/coupons', { method: 'POST', body: { name: form.name, amount: Number(form.amount), total: Number(form.total), type: 'cash', validDays: 30 } }); event.target.reset(); await loadRemote(); toast('平台券已创建'); } catch (error) { toast(error.message); }
  };

  window.grant = async inviteId => {
    try { await call(`/api/ops/invites/${inviteId}/reward`, { method: 'POST', body: {} }); await loadRemote(); toast('邀请奖励已发放'); } catch (error) { toast(error.message); }
  };

  document.querySelector('#growthForm').onsubmit = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    try {
      await Promise.all(growthRules.map(rule => {
        const limit = values[`limit_${rule.id}`];
        return call(`/api/ops/growth-rules/${rule.id}`, {
          method: 'PATCH',
          body: {
            points: Number(values[`points_${rule.id}`]),
            dailyLimit: limit === '' || limit === undefined ? null : Number(limit),
            enabled: values[`enabled_${rule.id}`] === 'on'
          }
        });
      }));
      await loadRemote(); toast('同路值规则已保存');
    } catch (error) { toast(error.message); }
  };

  window.moderateChat = async (id, status) => {
    const action = status === 'removed' ? 'remove' : status === 'archived' ? 'archive' : 'restore';
    try { await call(`/api/ops/poi-topics/${id}`, { method: 'PUT', body: { action } }); await loadRemote(); toast('话题状态已更新'); } catch (error) { toast(error.message); }
  };

  window.reviewSafety = async (id, approved) => {
    const reason = approved ? '' : prompt('填写驳回原因');
    if (!approved && !reason) return;
    try {
      await call(`/api/ops/traffic-events/${id}`, { method: 'PUT', body: { approved, reason } });
      await loadRemote();
      toast(approved ? '路况已同步到地图并发放奖励' : '安全上报已驳回');
    } catch (error) { toast(error.message); }
  };

  window.resolveTicket = async id => {
    const content = prompt('填写客服回复', '已核实并处理，结果将通过消息通知。');
    if (!content) return;
    try { await call(`/api/ops/support/tickets/${id}/reply`, { method: 'POST', body: { content, close: true } }); await loadRemote(); toast('处理结果已通知用户'); } catch (error) { toast(error.message); }
  };

  document.querySelector('#assessmentRuleForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    const value = {
      bronze: { minScore: Number(form.bronzeScore), commissionRate: Number(form.bronzeRate) / 100, benefit: form.bronzeBenefit.trim() },
      silver: { minScore: Number(form.silverScore), commissionRate: Number(form.silverRate) / 100, benefit: form.silverBenefit.trim() },
      gold: { minScore: Number(form.goldScore), commissionRate: Number(form.goldRate) / 100, benefit: form.goldBenefit.trim() },
      diamond: { minScore: Number(form.diamondScore), commissionRate: Number(form.diamondRate) / 100, benefit: form.diamondBenefit.trim() }
    };
    const scores = ['bronze', 'silver', 'gold', 'diamond'].map(level => value[level].minScore);
    if (scores.some((score, index) => index && score <= scores[index - 1])) return toast('等级起始分必须逐级递增');
    if (Object.values(value).some(rule => !rule.benefit || rule.commissionRate < 0 || rule.commissionRate > 1)) return toast('请完整填写佣金率和等级权益');
    try { await call('/api/ops/settings/merchant_assessment', { method: 'PUT', body: { value } }); await loadRemote(); toast('商家考核规则已保存'); } catch (error) { toast(error.message); }
  };

  document.querySelector('#autoReplyForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try { await call('/api/ops/settings/support_auto_reply', { method: 'PUT', body: { value: { enabled: event.target.enabled.checked, text: form.text } } }); await loadRemote(); toast('自动回复已保存'); } catch (error) { toast(error.message); }
  };

  window.resetState = () => loadRemote().then(() => toast('数据已刷新')).catch(error => toast(error.message));

  async function boot() {
    try {
      if (!token && params.has('preview')) await demoLogin();
      if (token) await loadRemote();
    } catch (error) {
      if (error.code === 'AUTH_REQUIRED') showLogin('登录已失效，请重新登录');
      else toast(error.message);
    }
  }
  boot();
})();
