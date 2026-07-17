(() => {
  const params = new URLSearchParams(location.search);
  const fallbackBase = location.protocol.startsWith('http') ? location.origin : 'http://127.0.0.1:8790';
  const API_BASE = (params.get('api') || localStorage.getItem('tongdao_api_base') || fallbackBase).replace(/\/$/, '');
  const TOKEN_KEY = 'tongdao_merchant_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let merchant = null;
  let dashboard = null;
  let promotion = null;
  let promotionShare = null;
  let assessment = null;
  let editingProductId = null;

  async function call(path, options = {}) {
    const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET', headers,
      body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      const error = new Error(result.error && result.error.message || `请求失败（${response.status}）`);
      error.code = result.error && result.error.code;
      throw error;
    }
    return result.data;
  }

  async function upload(file, directory) {
    const form = new FormData();
    form.append('directory', directory);
    form.append('file', file);
    return call('/api/uploads', { method: 'POST', body: form });
  }

  async function authenticate(phone, code) {
    const result = await call('/api/auth/sms/login', { method: 'POST', body: { phone, code, profile: { nickname: `商家${phone.slice(-4)}` } } });
    token = result.token;
    localStorage.setItem(TOKEN_KEY, token);
  }

  async function demoAuthenticate() {
    const result = await call('/api/auth/demo', { method: 'POST', body: { userId: 'u_merchant' } });
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
    try {
      dashboard = await call('/api/merchant/dashboard');
    } catch (error) {
      if (error.code === 'MERCHANT_ACCESS_REQUIRED') {
        merchant = null;
        state = clone(seed);
        state.shop = { name: '', phone: '', address: '', hours: '', description: '' };
        openApp(); render(); show('shop', '店铺与入驻'); updateRemoteUi();
        return;
      }
      if (error.code === 'AUTH_REQUIRED') return showLogin('登录已失效，请重新登录');
      throw error;
    }
    const [profile, products, orders, settlementData, coupons, promotionData, rescueAssessment, notices] = await Promise.all([
      call('/api/merchant/profile'), call('/api/merchant/products'), call('/api/merchant/orders'),
      call('/api/merchant/settlements'), call('/api/merchant/coupons'), call('/api/merchant/promotion'),
      call('/api/merchant/assessment'), call('/api/merchant/notifications')
    ]);
    merchant = profile;
    promotion = promotionData;
    assessment = rescueAssessment;
    state = {
      shop: { name: profile.name, phone: profile.phone, address: profile.address, hours: profile.businessHours, description: profile.description || '' },
      products: products.map(product => ({
        id: product.id, title: product.name, origin: Number(product.originPrice),
        tiers: (product.tiers || []).map(tier => `${tier.people}:${tier.price}`).join(', '),
        stock: Number(product.stock), sold: Number(product.sold), status: product.status,
        validUntil: `${product.validHours}小时`, raw: product
      })),
      orders: orders.map(order => ({
        id: order.orderNo, rowId: order.id, user: order.user && order.user.nickname || order.userId,
        userPhone: order.user && order.user.phone || '', userVehicle: order.user && order.user.vehicleModel || '',
        title: order.product && order.product.name || order.productId, amount: Number(order.paidAmount), tier: orderTier(order),
        productId: order.productId, quantity: Number(order.quantity || 1), originAmount: Number(order.originAmount),
        discountAmount: Number(order.discountAmount), paymentProvider: order.paymentProvider || '-',
        status: order.status === 'verified' ? 'used' : order.status === 'refund_pending' ? 'refund' : order.status,
        code: order.verifyCode || '-', time: formatTime(order.createdAt), paidAt: formatTime(order.paidAt),
        expiresAt: formatTime(order.expiresAt), verifiedAt: formatTime(order.verifiedAt), operator: order.verifiedBy,
        verifiedLng: order.verifiedLng, verifiedLat: order.verifiedLat
      })),
      settlements: settlementData.items.map(item => ({
        id: item.id, period: `${formatTime(item.periodStart)} 至 ${formatTime(item.periodEnd)}`,
        amount: Number(item.netAmount), status: item.status === 'completed' ? 'settled' : item.status,
        time: formatTime(item.completedAt)
      })),
      couponRedemptions: settlementData.couponRedemptions.map(item => ({
        id: item.id, title: item.coupon && item.coupon.name || item.couponId,
        user: item.user && item.user.nickname || '-', amount: Number(item.amount), status: item.status,
        time: formatTime(item.createdAt), settledAt: formatTime(item.settledAt), providerId: item.providerId || '-'
      })),
      bank: settlementData.bankInfo || {},
      coupon: coupons[0] ? { id: coupons[0].id, title: coupons[0].name, amount: Number(coupons[0].amount), stock: Number(coupons[0].total), enabled: coupons[0].status === 'active' } : { id: '', title: '', amount: 0, stock: 0, enabled: false },
      rescue: { type: (profile.rescueServices || []).join('/') || '搭电/拖车/应急维修', radius: Number(profile.rescueRadiusKm || 0), phone: profile.rescuePhone || '', open: profile.businessOpen !== false },
      notices: notices.map(item => ({ id: item.id, text: `${item.title}：${item.content}`, time: formatTime(item.createdAt), read: Boolean(item.readAt) }))
    };
    openApp(); render(); updateRemoteUi();
  }

  function updateRemoteUi() {
    const name = merchant ? merchant.name : '待入驻商家';
    document.querySelector('.topbar span').textContent = name;
    document.querySelector('.sidebar-foot').innerHTML = `${escapeHtml(name)}<br>客服 400-820-3180`;
    const statusMap = { pending: '审核中', approved: '审核通过', rejected: '审核未通过', suspended: '已暂停' };
    document.querySelector('.merchant-state').textContent = merchant ? statusMap[merchant.status] || merchant.status : '尚未入驻';
    const review = document.querySelector('#merchantReviewStatus');
    review.textContent = merchant ? statusMap[merchant.status] || merchant.status : '尚未提交';
    review.className = `tag ${merchant && merchant.status === 'approved' ? 'success' : 'warning'}`;
    if (promotion) {
      document.querySelector('#promotionCode').textContent = promotion.promotionCode || '--';
      document.querySelector('#promotionStats').textContent = `累计拉新 ${promotion.registered} 人 · 完成首单 ${promotion.firstOrders} 人`;
    }
    const promotionQr = document.querySelector('#promotionQr');
    const promotionPath = document.querySelector('#promotionPath');
    const copyPromotion = document.querySelector('#copyPromotionLink');
    if (promotionShare) {
      promotionQr.src = promotionShare.qrCode || '';
      promotionQr.classList.toggle('hidden', !promotionShare.qrCode);
      promotionPath.textContent = promotionShare.miniProgramPath || promotionShare.url || '';
      copyPromotion.classList.remove('hidden');
    } else {
      promotionQr.classList.add('hidden');
      promotionQr.removeAttribute('src');
      promotionPath.textContent = '';
      copyPromotion.classList.add('hidden');
    }
    if (assessment) {
      const values = document.querySelectorAll('#assessment .stat b');
      const names = { bronze: '铜牌', silver: '银牌', gold: '金牌', diamond: '钻石' };
      values[0].textContent = names[assessment.level] || assessment.level;
      values[1].textContent = assessment.score;
      values[2].textContent = `${Math.round(assessment.verificationRate * 100)}%`;
      values[3].textContent = `${(assessment.complaintRate * 100).toFixed(1)}%`;
      const progress = document.querySelector('#assessment progress');
      const description = document.querySelector('#assessment .panel p');
      progress.value = Math.max(0, Math.min(100, Number(assessment.progress || 0)));
      const currentBenefit = assessment.currentRule && assessment.currentRule.benefit || '标准商家权益';
      const nextName = assessment.nextLevel && names[assessment.nextLevel];
      const nextScore = assessment.nextRule && Number(assessment.nextRule.minScore);
      description.textContent = nextName
        ? `当前权益：${currentBenefit}；平台佣金率 ${(Number(assessment.commissionRate || 0) * 100).toFixed(1)}%。达到 ${nextScore} 分可晋升${nextName}，还差 ${Math.max(0, nextScore - Number(assessment.score))} 分。`
        : `当前为最高等级，权益：${currentBenefit}；平台佣金率 ${(Number(assessment.commissionRate || 0) * 100).toFixed(1)}%。`;
    }
    const rewardPool = document.querySelector('#couponForm [name=rewardPool]');
    if (rewardPool) rewardPool.checked = Boolean(merchant && merchant.rewardPoolEnabled);
    const couponEnabled = document.querySelector('#couponForm [name=enabled]');
    if (couponEnabled) couponEnabled.checked = Boolean(state.coupon && state.coupon.enabled);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function formatTime(value) {
    if (!value) return '-';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const source = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw) && !/[zZ]|[+-]\d\d:?\d\d$/.test(raw)
      ? `${raw.replace(' ', 'T')}Z`
      : raw;
    const date = new Date(source);
    if (!Number.isFinite(date.getTime())) return raw.replace('T', ' ').replace(/\.\d{3}Z$|Z$/g, '');
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function orderTier(order) {
    const unitPrice = Number(order.originAmount || 0) / Math.max(1, Number(order.quantity || 1));
    const tier = (order.product && order.product.tiers || []).find(item => Math.abs(Number(item.price) - unitPrice) < 0.011);
    return tier ? `${tier.people}人档 · ¥${Number(tier.price)}` : `成交单价 ¥${unitPrice.toFixed(2)}`;
  }

  parseTiers = function parseRemoteTiers(value, origin) {
    const tiers = value.split(/[,，]/).map(item => item.trim().split(':').map(Number));
    if (!tiers.length || tiers.length > 5 || tiers.some(item => item.length < 2 || !item[0] || !item[1])) throw new Error('阶梯价格格式不正确');
    if (tiers[0][0] !== 1) throw new Error('第一档必须是1人价格');
    for (let index = 1; index < tiers.length; index += 1) if (tiers[index][0] <= tiers[index - 1][0] || tiers[index][1] >= tiers[index - 1][1]) throw new Error('人数需递增，价格必须递减');
    if (tiers[0][1] > origin) throw new Error('首档价格不能高于原价');
    return tiers;
  };

  renderDashboard = function renderRemoteDashboard() {
    const paid = state.orders.filter(order => order.status === 'paid').length;
    const used = state.orders.filter(order => order.status === 'used').length;
    const revenue = state.orders.filter(order => order.status !== 'refund').reduce((total, order) => total + order.amount, 0);
    document.querySelector('#stats').innerHTML = `<div class="stat blue">今日订单<b>${dashboard ? dashboard.stats.todayOrders : state.orders.length}</b></div><div class="stat amber">待核销<b>${paid}</b></div><div class="stat green">累计核销<b>${used}</b></div><div class="stat red">订单金额<b>¥${revenue.toFixed(1)}</b></div>`;
    document.querySelector('#todos').innerHTML = `<p><span class="tag warning">${paid}</span> 笔订单等待核销</p><p><span class="tag danger">${state.orders.filter(order => order.status === 'refund').length}</span> 笔退款处理中</p><p><span class="tag">${state.products.filter(product => product.stock - product.sold < 20).length}</span> 个商品库存偏低</p>`;
    document.querySelector('#dashboardNotices').innerHTML = state.notices.slice(0, 3).map(notice => `<div class="notice"><i class="notice-dot"></i><div>${escapeHtml(notice.text)}<div class="muted">${escapeHtml(notice.time)}</div></div></div>`).join('') || '<div class="empty">暂无通知</div>';
  };

  renderProducts = function renderRemoteProducts() {
    document.querySelector('#productTable').innerHTML = `<table><thead><tr><th>商品</th><th>原价</th><th>阶梯价格</th><th>库存/销量</th><th>有效期</th><th>状态</th><th>操作</th></tr></thead><tbody>${state.products.map(product => `<tr><td><b>${escapeHtml(product.title)}</b><br><span class="muted">${escapeHtml(product.id)}</span></td><td>¥${product.origin}</td><td>${escapeHtml(product.tiers)}</td><td>${product.stock} / ${product.sold}</td><td>${escapeHtml(product.validUntil)}</td><td>${product.status === 'on' ? '<span class="tag success">上架中</span>' : '<span class="tag">已下架</span>'}</td><td><div class="actions" style="margin:0"><button class="btn secondary small" onclick="editProduct('${product.id}')">编辑</button><button class="btn secondary small" onclick="toggleProduct('${product.id}')">${product.status === 'on' ? '下架' : '上架'}</button></div></td></tr>`).join('')}</tbody></table>`;
  };

  renderOrders = function renderRemoteOrders() {
    const filter = document.querySelector('#orderFilter').value || 'all';
    const rows = state.orders.filter(order => filter === 'all' || order.status === filter);
    document.querySelector('#orderTable').innerHTML = `<table><thead><tr><th>订单</th><th>用户</th><th>商品</th><th>成交档位</th><th>实付</th><th>时间</th><th>状态</th><th>核销码</th><th>操作</th></tr></thead><tbody>${rows.map(order => `<tr><td>${escapeHtml(order.id)}</td><td>${escapeHtml(order.user)}</td><td>${escapeHtml(order.title)}</td><td>${escapeHtml(order.tier)}</td><td>¥${order.amount}</td><td>${escapeHtml(order.time)}</td><td>${status(order.status)}</td><td>${escapeHtml(order.code)}</td><td><button class="btn secondary small" onclick="viewMerchantOrder('${escapeHtml(order.rowId || order.id)}')">查看详情</button></td></tr>`).join('')}</tbody></table>`;
  };

  window.viewMerchantOrder = orderId => {
    const order = state.orders.find(item => (item.rowId || item.id) === orderId);
    if (!order) return toast('订单不存在');
    const rows = [
      ['订单编号', order.id], ['订单状态', order.status], ['用户', order.user], ['用户手机号', order.userPhone || '-'],
      ['用户车辆', order.userVehicle || '-'], ['商品', order.title], ['商品 ID', order.productId || '-'], ['成交档位', order.tier], ['数量', order.quantity || 1],
      ['商品金额', `¥${Number(order.originAmount || order.amount).toFixed(2)}`], ['优惠抵扣', `¥${Number(order.discountAmount || 0).toFixed(2)}`],
      ['实付金额', `¥${Number(order.amount || 0).toFixed(2)}`], ['支付渠道', order.paymentProvider || '-'],
      ['下单时间', order.time || '-'], ['支付时间', order.paidAt || '-'], ['有效期', order.expiresAt || '-'],
      ['核销时间', order.verifiedAt || '-'], ['核销码', order.code || '-'], ['核销人员', order.operator || '-'],
      ['核销坐标', order.verifiedLng == null ? '-' : `${order.verifiedLng}, ${order.verifiedLat}`]
    ];
    document.querySelector('#orderDetailBody').innerHTML = `<div class="detail-grid">${rows.map(([label, value], index) => `<div class="detail-row ${index === 5 ? 'full' : ''}"><label>${escapeHtml(label)}</label><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
    document.querySelector('#orderDetailModal').classList.remove('hidden');
  };

  window.closeMerchantOrder = () => document.querySelector('#orderDetailModal').classList.add('hidden');

  renderNotices = function renderRemoteNotices() {
    document.querySelector('#noticeList').innerHTML = state.notices.map(notice => `<div class="notice"><i class="notice-dot" style="opacity:${notice.read ? .25 : 1}"></i><div>${escapeHtml(notice.text)}<div class="muted">${escapeHtml(notice.time)} · ${notice.read ? '已读' : '未读'}</div></div></div>`).join('') || '<div class="empty">暂无通知</div>';
  };

  renderVerify = function renderRemoteVerify() {
    const rows = state.orders.filter(order => order.status === 'used');
    const couponRows = state.couponRedemptions || [];
    document.querySelector('#verifyTable').innerHTML = `<table><thead><tr><th>类型</th><th>编号</th><th>商品/优惠券</th><th>用户</th><th>金额</th><th>核销时间</th><th>结算状态</th></tr></thead><tbody>${rows.map(order => `<tr><td><span class="tag">订单</span></td><td>${escapeHtml(order.id)}</td><td>${escapeHtml(order.title)}</td><td>${escapeHtml(order.user)}</td><td>¥${order.amount}</td><td>${escapeHtml(order.verifiedAt || '-')}</td><td><span class="tag success">已分账</span></td></tr>`).join('')}${couponRows.map(item => `<tr><td><span class="tag warning">优惠券</span></td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.user)}</td><td>¥${item.amount}</td><td>${escapeHtml(item.time)}</td><td><span class="tag ${item.status === 'settled' ? 'success' : 'warning'}">${item.status === 'settled' ? '已结算' : '待平台结算'}</span></td></tr>`).join('')}</tbody></table>`;
  };

  renderSettlement = function renderRemoteSettlement() {
    const labels = { pending: '待触发', processing: '处理中', settled: '已结算', completed: '已结算', failed: '失败' };
    document.querySelector('#settlementTable').innerHTML = `<table><thead><tr><th>结算单</th><th>结算周期</th><th>金额</th><th>状态</th><th>到账时间</th></tr></thead><tbody>${state.settlements.map(item => `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.period)}</td><td>¥${item.amount}</td><td><span class="tag ${['settled', 'completed'].includes(item.status) ? 'success' : item.status === 'failed' ? 'danger' : 'warning'}">${escapeHtml(labels[item.status] || item.status)}</span></td><td>${escapeHtml(item.time || '-')}</td></tr>`).join('') || '<tr><td colspan="5">暂无结算记录</td></tr>'}</tbody></table>`;
  };

  document.querySelector('#sendMerchantCode').onclick = async () => {
    const phone = document.querySelector('#loginForm [name=phone]').value;
    try {
      const result = await call('/api/auth/sms/send', { method: 'POST', body: { phone } });
      if (result.devCode) { document.querySelector('#loginForm [name=code]').value = result.devCode; toast(`演示验证码：${result.devCode}`); }
      else toast('验证码已发送');
    } catch (error) { toast(error.message); }
  };

  document.querySelector('#loginForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try { await authenticate(form.phone, form.code); await loadRemote(); } catch (error) { toast(error.message); }
  };

  document.querySelector('#shopForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try {
      const licenseFile = event.target.license.files[0];
      const license = licenseFile ? await upload(licenseFile, 'merchant-licenses') : null;
      const location = await geocodeAddress(form.address);
      if (!merchant) {
        if (!license) throw new Error('首次入驻必须上传营业执照');
        await call('/api/merchant/apply', { method: 'POST', body: { name: form.name, phone: form.phone, address: form.address, description: form.description, businessHours: form.hours, licensePhoto: license.url, qualificationFiles: [], ...location } });
        toast('入驻资料已提交');
      } else {
        const changes = { name: form.name, phone: form.phone, address: form.address, description: form.description, businessHours: form.hours, ...location };
        if (license) changes.licensePhoto = license.url;
        await call('/api/merchant/profile/changes', { method: 'POST', body: changes });
        toast('资料变更已提交运营复核');
      }
      await loadRemote();
    } catch (error) { toast(error.message); }
  };

  async function geocodeAddress(address) {
    const result = await call(`/api/map/geocode?address=${encodeURIComponent(address)}`);
    const first = result.geocodes && result.geocodes[0];
    const values = first && String(first.location || '').split(',').map(Number);
    if (!values || values.length !== 2 || !values.every(Number.isFinite)) throw new Error('无法定位店铺地址，请填写更完整的省市区和门牌号');
    return { lng: values[0], lat: values[1] };
  }

  document.querySelector('#productForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try {
      const tiers = parseTiers(form.tiers, Number(form.origin)).map(([people, price]) => ({ people, price }));
      let coverPhoto;
      if (event.target.cover.files[0]) coverPhoto = (await upload(event.target.cover.files[0], 'products')).url;
      const payload = {
        name: form.title, category: form.category, originPrice: Number(form.origin), stock: Number(form.stock),
        validHours: Number(form.validHours), maxGroupSize: Number(form.maxGroupSize), maxQuantity: Number(form.maxQuantity),
        description: form.description, tiers, coverPhoto, publish: true
      };
      if (editingProductId) await call(`/api/merchant/products/${editingProductId}`, { method: 'PATCH', body: payload });
      else await call('/api/merchant/products', { method: 'POST', body: payload });
      editingProductId = null; event.target.reset(); toggleProductForm(); toast('商品已保存'); await loadRemote();
    } catch (error) { toast(error.message); }
  };

  window.editProduct = productId => {
    const product = state.products.find(item => item.id === productId);
    if (!product) return;
    editingProductId = productId;
    const form = document.querySelector('#productForm');
    form.classList.remove('hidden');
    form.title.value = product.title; form.category.value = product.raw.category; form.origin.value = product.origin;
    form.stock.value = product.stock; form.validHours.value = product.raw.validHours;
    form.maxGroupSize.value = product.raw.maxGroupSize; form.maxQuantity.value = product.raw.maxQuantity;
    form.description.value = product.raw.description; form.tiers.value = product.tiers; form.cover.required = false;
  };

  const originalToggleProductForm = toggleProductForm;
  window.toggleProductForm = () => {
    if (!editingProductId) document.querySelector('#productForm [name=cover]').required = true;
    originalToggleProductForm();
  };

  window.toggleProduct = async productId => {
    const product = state.products.find(item => item.id === productId);
    try { await call(`/api/merchant/products/${productId}/status`, { method: 'PUT', body: { status: product.status === 'on' ? 'off' : 'on' } }); await loadRemote(); toast('商品状态已更新'); } catch (error) { toast(error.message); }
  };

  document.querySelector('#verifyForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try {
      const coupon = form.type === 'coupon';
      await call(coupon ? '/api/merchant/verify/coupon' : '/api/merchant/verify/order', { method: 'POST', body: { code: form.code } });
      event.target.code.value = '';
      toast(coupon ? '优惠券核销成功，已进入独立结算' : '订单核销成功并已触发分账');
      await loadRemote();
    } catch (error) { toast(error.message); }
  };

  document.querySelector('#verifyScanner').onchange = async event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      if (!('BarcodeDetector' in window)) throw new Error('当前浏览器不支持二维码识别，请直接输入券码');
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      bitmap.close();
      if (!codes.length) throw new Error('未识别到二维码，请重新拍摄或输入券码');
      const raw = String(codes[0].rawValue || '').trim();
      const order = raw.match(/^TDORDER:(.+)$/i);
      const coupon = raw.match(/^TDCOUPON:(.+)$/i);
      const value = order ? order[1] : coupon ? coupon[1] : raw;
      const form = document.querySelector('#verifyForm');
      form.code.value = value;
      form.type.value = coupon || /^CP/i.test(value) ? 'coupon' : 'order';
      toast('二维码已识别，请确认核销');
    } catch (error) { toast(error.message); }
    finally { event.target.value = ''; }
  };

  document.querySelector('#bankForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try { await call('/api/merchant/bank', { method: 'PUT', body: form }); toast('收款账户已保存'); await loadRemote(); } catch (error) { toast(error.message); }
  };

  document.querySelector('#couponForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try {
      const enabled = event.target.enabled.checked;
      const payload = { name: form.title, amount: Number(form.amount), total: Number(form.stock), type: 'invite', validDays: 14, enabled };
      if (state.coupon.id) await call(`/api/merchant/coupons/${state.coupon.id}`, { method: 'PATCH', body: payload });
      else if (enabled) await call('/api/merchant/coupons', { method: 'POST', body: payload });
      await call('/api/merchant/promotion/settings', { method: 'PUT', body: { rewardPoolEnabled: event.target.rewardPool.checked } });
      toast('拉新券与奖励池设置已保存'); await loadRemote();
    } catch (error) { toast(error.message); }
  };

  document.querySelector('#rescueForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try {
      const result = await call('/api/merchant/rescue', { method: 'PUT', body: { enabled: true, services: form.type.split('/').filter(Boolean), radiusKm: Number(form.radius), phone: form.phone, businessOpen: form.open === 'true' } });
      toast(result.rescueReviewStatus === 'pending' ? '救援服务已提交运营审核' : '救援服务信息已更新');
      await loadRemote();
    } catch (error) { toast(error.message); }
  };

  document.querySelector('#supportForm').onsubmit = async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try { await call('/api/support/tickets', { method: 'POST', body: { category: '商家咨询', title: form.title, content: form.content } }); event.target.reset(); toast('工单已提交'); } catch (error) { toast(error.message); }
  };

  window.markAllRead = async () => {
    try { await Promise.all(state.notices.filter(item => !item.read).map(item => call(`/api/notifications/${item.id}/read`, { method: 'PUT', body: {} }))); await loadRemote(); toast('已全部标记为已读'); } catch (error) { toast(error.message); }
  };
  window.copyPromo = () => { navigator.clipboard && navigator.clipboard.writeText(promotion && promotion.promotionCode || ''); toast('推广码已复制'); };
  window.generateMerchantPromotion = async () => {
    try {
      promotionShare = await call('/api/merchant/promotion/share', { method: 'POST', body: {} });
      updateRemoteUi();
      toast('商家推广卡已生成');
    } catch (error) { toast(error.message); }
  };
  window.copyPromotionLink = () => {
    const value = promotionShare && (promotionShare.miniProgramPath || promotionShare.url) || '';
    if (navigator.clipboard && value) navigator.clipboard.writeText(value);
    toast(value ? '推广链接已复制' : '请先生成推广卡');
  };
  window.resetState = () => loadRemote().then(() => toast('数据已刷新')).catch(error => toast(error.message));

  const originalRenderForms = renderForms;
  renderForms = function renderRemoteForms() {
    originalRenderForms();
    const card = state.bank || {};
    const bankForm = document.querySelector('#bankForm');
    bankForm.bank.value = card.bank || '';
    bankForm.card.value = '';
    bankForm.card.placeholder = card.maskedCard ? `已绑定 ${card.maskedCard}，留空不修改` : '请输入银行卡号';
    bankForm.wechatReceiver.value = card.wechatReceiver || '';
  };

  async function boot() {
    try {
      if (!token && params.has('preview')) await demoAuthenticate();
      if (token) await loadRemote();
    } catch (error) { showLogin(error.message); }
  }
  boot();
})();
