const STORAGE_KEY = 'tongdao_product_store_v2';

function dateAfter(days, time = '09:00') {
  const value = new Date(Date.now() + days * 86400000);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const date = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${date} ${time}`;
}

const now = dateAfter(0);

const seed = {
  currentUserId: 'u_mock_001',
  users: [
    {
      _id: 'u_mock_001',
      openid: 'mock-openid-001',
      nickname: '林小路',
      avatar: '',
      role: 'passenger',
      phone: '13800000001',
      ownerCertStatus: 'approved',
      vehicleModel: '比亚迪唐 DM-i',
      vehicleNo: '浙A8T520',
      growth: 5200,
      level: 4,
      creditScore: 4.8,
      inviteCode: 'TD5200',
      discoverable: true,
      bio: '周末出发，偏爱山路、露营和沿途小店。',
      distanceKm: 12800,
      teamCount: 37,
      companionCount: 8,
      followerCount: 26,
      followingCount: 18,
      badges: ['可靠队友', '补给达人', '安全先锋'],
      createdAt: now
    },
    {
      _id: 'u_owner_001',
      openid: 'mock-owner-001',
      nickname: '阿成车主',
      avatar: '',
      role: 'owner',
      phone: '13800000002',
      ownerCertStatus: 'approved',
      vehicleModel: '理想 L7',
      vehicleNo: '浙A6C318',
      growth: 7800,
      level: 5,
      creditScore: 4.9,
      inviteCode: 'TD318',
      discoverable: true,
      bio: '青318小队队长，稳妥驾驶，按计划休息。',
      distanceKm: 28600,
      teamCount: 62,
      companionCount: 21,
      followerCount: 89,
      followingCount: 34,
      badges: ['五星队长', '川藏领航'],
      createdAt: now
    },
    {
      _id: 'u_owner_002',
      openid: 'mock-owner-002',
      nickname: '南风',
      avatar: '',
      role: 'owner',
      phone: '13800000004',
      ownerCertStatus: 'approved',
      vehicleModel: '坦克 300',
      vehicleNo: '沪B7F620',
      growth: 4260,
      level: 3,
      creditScore: 4.9,
      inviteCode: 'TD620',
      discoverable: true,
      bio: '带宠物旅行，喜欢慢节奏和城市周边路线。',
      distanceKm: 9300,
      teamCount: 24,
      companionCount: 11,
      followerCount: 41,
      followingCount: 29,
      badges: ['友善车主'],
      createdAt: now
    },
    {
      _id: 'u_solo_001',
      openid: 'mock-solo-001',
      nickname: '山野独行',
      avatar: '',
      role: 'owner',
      phone: '13800000006',
      ownerCertStatus: 'approved',
      vehicleModel: '斯巴鲁森林人',
      vehicleNo: '浙D6S318',
      growth: 2200,
      level: 2,
      creditScore: 4.9,
      inviteCode: 'TDSOLO',
      discoverable: true,
      bio: '独自旅行，也愿意认识附近同路人。',
      distanceKm: 5100,
      teamCount: 6,
      companionCount: 3,
      followerCount: 18,
      followingCount: 12,
      badges: ['独行探索'],
      createdAt: now
    },
    {
      _id: 'u_guest_001',
      openid: 'mock-guest-001',
      nickname: '小北',
      avatar: '',
      role: 'passenger',
      phone: '13800000003',
      ownerCertStatus: 'pending',
      vehicleModel: '大众 ID.4',
      vehicleNo: '浙B2K991',
      growth: 1680,
      level: 2,
      creditScore: 4.7,
      inviteCode: 'TD991',
      discoverable: true,
      bio: '第一次长途自驾，愿意分担补给和路线记录。',
      distanceKm: 3200,
      teamCount: 9,
      companionCount: 4,
      followerCount: 12,
      followingCount: 16,
      badges: ['新锐队友'],
      createdAt: now
    }
  ],
  vehicle_certs: [
    { _id: 'cert_001', userId: 'u_mock_001', name: '林小路', plate: '浙A8T520', status: 'approved', licensePhoto: 'mock-license.jpg', createdAt: now, reviewedAt: now },
    { _id: 'cert_002', userId: 'u_guest_001', name: '小北', plate: '浙B2K991', status: 'pending', licensePhoto: 'mock-pending.jpg', createdAt: now }
  ],
  trips: [
    {
      _id: 'trip_001',
      ownerId: 'u_owner_001',
      ownerName: '阿成车主',
      title: '周六杭州到千岛湖自驾',
      from: '杭州西湖文化广场',
      to: '千岛湖中心湖区',
      departAt: dateAfter(5, '08:30'),
      seatTotal: 4,
      seatJoined: 3,
      priceShare: 68,
      status: 'open',
      matchRate: 92,
      days: 1,
      teamName: '千岛湖周末小队',
      stage: 'forming',
      depth: '深度',
      plans: ['拍照', '美食', 'AA住宿', '互助'],
      equipment: ['应急药箱', '对讲机'],
      dailyKm: 180,
      waypoints: ['富阳服务区'],
      remainingKm: 182,
      sharedLocation: true,
      privacy: 'public',
      note: '走杭千高速，服务区休息一次，可带一个 20 寸箱。',
      route: [
        { latitude: 30.2741, longitude: 120.1551 },
        { latitude: 29.6097, longitude: 119.0419 }
      ],
      teammates: [
        { userId: 'u_owner_001', nickname: '阿成车主', latitude: 30.2741, longitude: 120.1551 },
        { userId: 'u_guest_001', nickname: '小北', latitude: 30.12, longitude: 119.86 }
      ],
      createdAt: now
    },
    {
      _id: 'trip_002',
      ownerId: 'u_owner_002',
      ownerName: '南风',
      title: '上海到苏州周末咖啡线',
      from: '上海虹桥站',
      to: '苏州平江路',
      departAt: dateAfter(7, '10:00'),
      seatTotal: 3,
      seatJoined: 1,
      priceShare: 45,
      status: 'open',
      matchRate: 78,
      days: 1,
      teamName: '苏州咖啡线',
      stage: 'forming',
      depth: '轻度',
      plans: ['拼桌', '同逛'],
      equipment: ['宠物友好'],
      dailyKm: 120,
      waypoints: [],
      remainingKm: 86,
      sharedLocation: false,
      privacy: 'public',
      note: '轻松短途，下午回程可商量。',
      route: [
        { latitude: 31.1944, longitude: 121.3188 },
        { latitude: 31.3117, longitude: 120.6285 }
      ],
      teammates: [
        { userId: 'u_owner_002', nickname: '南风', latitude: 31.1944, longitude: 121.3188 }
      ],
      createdAt: now
    },
    {
      _id: 'trip_003',
      ownerId: 'u_mock_001',
      ownerName: '林小路',
      title: '杭州到黄山观景自驾',
      teamName: '黄山晨雾小队',
      from: '杭州奥体中心',
      to: '黄山风景区南门',
      departAt: dateAfter(14, '07:30'),
      seatTotal: 5,
      seatJoined: 1,
      priceShare: 90,
      status: 'open',
      matchRate: 88,
      days: 2,
      stage: 'forming',
      depth: '中度',
      plans: ['拍照', 'AA住宿', '互助'],
      equipment: ['应急药箱', '对讲机'],
      dailyKm: 240,
      waypoints: ['临安服务区'],
      remainingKm: 255,
      sharedLocation: true,
      privacy: 'public',
      discoverable: true,
      note: '早出发避开拥堵，第一天下午到宏村，第二天进山。',
      route: [
        { latitude: 30.2268, longitude: 120.2105 },
        { latitude: 29.7147, longitude: 118.3376 }
      ],
      teammates: [
        { userId: 'u_mock_001', nickname: '林小路', latitude: 30.2268, longitude: 120.2105 }
      ],
      createdAt: now
    }
  ],
  trip_members: [
    { _id: 'tm_001', tripId: 'trip_001', userId: 'u_owner_001', nickname: '阿成车主', role: 'owner', joinedAt: now },
    { _id: 'tm_002', tripId: 'trip_001', userId: 'u_guest_001', nickname: '小北', role: 'passenger', joinedAt: now },
    { _id: 'tm_003', tripId: 'trip_002', userId: 'u_owner_002', nickname: '南风', role: 'owner', joinedAt: now },
    { _id: 'tm_004', tripId: 'trip_001', userId: 'u_mock_001', nickname: '林小路', role: 'passenger', joinedAt: now },
    { _id: 'tm_005', tripId: 'trip_003', userId: 'u_mock_001', nickname: '林小路', role: 'owner', joinedAt: now }
  ],
  trip_requests: [
    { _id: 'request_001', tripId: 'trip_003', userId: 'u_guest_001', nickname: '小北', vehicleModel: '大众 ID.4', message: '我从杭州东出发，可以提前到集合点，也会带应急电源。', status: 'pending', createdAt: dateAfter(-1, '10:18') }
  ],
  messages: [
    { _id: 'msg_000', tripId: 'trip_001', userId: 'system', nickname: '系统', type: 'system', content: '阿成车主创建了千岛湖周末小队', createdAt: '2026-07-01 09:08' },
    { _id: 'msg_001', tripId: 'trip_001', userId: 'u_owner_001', nickname: '阿成车主', type: 'text', content: '大家周六 8:20 集合，8:30 准时出发。', createdAt: '2026-07-01 09:12' },
    { _id: 'msg_002', tripId: 'trip_001', userId: 'u_guest_001', nickname: '小北', type: 'text', content: '我可以带两瓶水和晕车贴。', createdAt: '2026-07-01 09:18' },
    { _id: 'msg_003', tripId: 'trip_001', userId: 'u_mock_001', nickname: '林小路', type: 'location', content: '已共享位置：西湖文化广场东门', createdAt: '2026-07-01 09:22' }
  ],
  conversations: [
    { _id: 'conv_team_001', type: 'team', title: '千岛湖周末小队 · 3人', lastMessage: '林小路：已共享位置', time: '09:22', meta: '位置共享 ON', unread: 2, targetId: 'trip_001' },
    { _id: 'conv_poi_001', type: 'poi', title: '千岛湖服务区补给 · 6人在聊', lastMessage: '咖啡双人券还有名额', time: '09:36', meta: '活跃话题', unread: 1, targetId: 'poi_001' },
    { _id: 'conv_private_001', type: 'private', title: '南风 · ★4.9', lastMessage: '苏州线可以带宠物吗？', time: '10:20', meta: '已互关', relation: 'mutual', unread: 1, targetId: 'u_owner_002' },
    { _id: 'conv_private_002', type: 'private', title: '小北 · 1条可回', lastMessage: '我走慢道，你们到哪了？', time: '10:32', meta: '同队成员', relation: 'teammate', unread: 0, targetId: 'u_guest_001' },
    { _id: 'conv_poi_old', type: 'poi', title: '二郎山隧道施工', lastMessage: '已归档 · 最后消息 3天前', time: '3天前', meta: '历史话题', archived: true, unread: 0, targetId: 'poi_003' }
  ],
  notifications: [
    { _id: 'notice_001', type: 'trip', title: '车队状态更新', content: '千岛湖周末小队已进入行进状态', priority: 'normal', read: false, data: { tripId: 'trip_001' }, createdAt: '2026-07-01 09:25' }
  ],
  poi_chats: [
    { _id: 'poi_001', name: '千岛湖服务区补给讨论', location: '杭千高速服务区', online: 6, status: 'active', lastMessage: '咖啡双人券还有名额', createdAt: now },
    { _id: 'poi_002', name: '苏州平江路停车位', location: '苏州平江路', online: 3, status: 'quiet', lastMessage: '东侧停车场还有空位', followed: false, createdAt: now },
    { _id: 'poi_003', name: '二郎山隧道施工', location: 'G318 二郎山段', online: 0, status: 'archived', lastMessage: '施工已结束，道路恢复通行', followed: true, createdAt: '2026-06-28 10:00' }
  ],
  poi_messages: [
    { _id: 'poim_001', poiChatId: 'poi_001', userId: 'u_owner_001', nickname: '阿成车主', content: '服务区北区停车位充足，咖啡店不用排队。', createdAt: '2026-07-01 09:30' },
    { _id: 'poim_002', poiChatId: 'poi_001', userId: 'u_mock_001', nickname: '林小路', content: '我 10 分钟后到，帮大家看一下补给。', createdAt: '2026-07-01 09:36' },
    { _id: 'poim_003', poiChatId: 'poi_002', userId: 'u_owner_002', nickname: '南风', content: '平江路东侧停车场还有空位。', createdAt: '2026-07-01 10:00' }
  ],
  private_messages: [
    { _id: 'pm_000', fromUserId: 'u_mock_001', toUserId: 'u_owner_002', nickname: '林小路', content: '你好，我在看你发布的苏州路线。', createdAt: '2026-07-01 10:18' },
    { _id: 'pm_001', fromUserId: 'u_owner_002', toUserId: 'u_mock_001', nickname: '南风', content: '苏州线可以带宠物，车上有宠物垫。', createdAt: '2026-07-01 10:20' },
    { _id: 'pm_002', fromUserId: 'u_guest_001', toUserId: 'u_mock_001', nickname: '小北', content: '我走慢道，你们到哪了？', createdAt: '2026-07-01 10:32' }
  ],
  follows: [
    { _id: 'follow_001', followerId: 'u_mock_001', targetType: 'user', targetId: 'u_owner_002', createdAt: now },
    { _id: 'follow_002', followerId: 'u_owner_002', targetType: 'user', targetId: 'u_mock_001', createdAt: now },
    { _id: 'follow_003', followerId: 'u_mock_001', targetType: 'team', targetId: 'trip_001', createdAt: now }
  ],
  blocked_users: [],
  groupbuys: [
    {
      _id: 'gb_001',
      title: '千岛湖服务区咖啡双人券',
      coverPhoto: '/images/products/coffee.jpg',
      merchantName: '湖畔咖啡站',
      price: 29.9,
      originPrice: 48,
      tiers: [
        { people: 1, price: 48 },
        { people: 3, price: 39.9 },
        { people: 6, price: 34.9 },
        { people: 10, price: 29.9 }
      ],
      minPeople: 3,
      joined: 2,
      stock: 50,
      validUntil: dateAfter(10, '23:59'),
      description: '美式/拿铁任选两杯，到店出示核销码使用。'
      ,productId: 'product_mock_001', merchantId: 'm_001', distanceKm: 1.8, category: '餐饮', targetPeople: 10, sold: 18, latitude: 29.72, longitude: 119.338,
      participants: ['阿成车主', '小北', '南风', '晴川'], rating: 4.8, address: '千岛湖服务区北区'
    },
    {
      _id: 'gb_002',
      title: '高速补给零食包',
      coverPhoto: '/images/products/snack.jpg',
      merchantName: '同路补给铺',
      price: 19.9,
      originPrice: 32,
      tiers: [
        { people: 1, price: 32 },
        { people: 4, price: 24.9 },
        { people: 8, price: 19.9 }
      ],
      minPeople: 4,
      joined: 3,
      stock: 80,
      validUntil: dateAfter(8, '23:59'),
      description: '坚果、能量棒、湿巾组合，适合车队路上共享。'
      ,productId: 'product_mock_002', merchantId: 'm_002', distanceKm: 4.6, category: '补给', targetPeople: 8, sold: 32, latitude: 29.81, longitude: 119.51,
      participants: ['南风', '小北', '阿洛'], rating: 4.7, address: '杭千高速补给点'
    }
  ],
  orders: [
    { _id: 'order_001', userId: 'u_mock_001', groupbuyId: 'gb_002', merchantId: 'm_002', merchantName: '同路补给铺', title: '高速补给零食包', originAmount: 24.9, discountAmount: 5, amount: 19.9, status: 'paid', verifyCode: '620318', createdAt: now, expiresAt: dateAfter(8, '23:59'), refundStatus: 'none' },
    { _id: 'order_002', userId: 'u_mock_001', groupbuyId: 'gb_old', merchantId: 'm_001', merchantName: '湖畔咖啡站', title: '湖景早餐套餐', originAmount: 36, discountAmount: 0, amount: 36, status: 'used', verifyCode: '885201', createdAt: '2026-06-20 08:20', verifiedAt: '2026-06-20 09:05', verifyLocation: '湖畔咖啡站', refundStatus: 'none' }
  ],
  invites: [
    { _id: 'inv_001', inviterId: 'u_mock_001', inviteeName: '小北', source: 'qrcode', bonus: 10, status: 'registered', createdAt: now },
    { _id: 'inv_002', inviterId: 'u_mock_001', inviteeName: '阿洛', source: 'link', bonus: 20, status: 'ordered', createdAt: now }
  ],
  coupons: [
    { _id: 'cp_001', userId: 'u_mock_001', title: '新用户拼团券', type: 'platform', amount: 10, threshold: 30, status: 'unused', expireAt: dateAfter(30).slice(0, 10), verifyCode: 'CP520001', scope: '全平台拼团可用' },
    { _id: 'cp_002', userId: 'u_mock_001', merchantId: 'm_001', title: '湖畔咖啡拉新券', type: 'merchant', amount: 8, threshold: 29, status: 'unused', expireAt: dateAfter(14).slice(0, 10), verifyCode: 'CP520002', scope: '仅湖畔咖啡站可用' },
    { _id: 'cp_003', userId: 'u_mock_001', title: '安全补给券', type: 'reward', amount: 5, threshold: 20, status: 'used', expireAt: dateAfter(10).slice(0, 10), usedAt: dateAfter(-20, '08:20'), scope: '补给类商品可用' }
  ],
  growth_logs: [
    { _id: 'gl_001', userId: 'u_mock_001', delta: 10, reason: '邀请好友注册', createdAt: now },
    { _id: 'gl_002', userId: 'u_mock_001', delta: 20, reason: '完成拼团订单', createdAt: now }
  ],
  next_trips: [
    { _id: 'draft_001', userId: 'u_mock_001', from: '杭州西湖文化广场', to: '千岛湖中心湖区', departAt: dateAfter(14), note: '希望找一支周末轻松出发的队伍', status: 'draft' }
  ],
  merchants: [
    { _id: 'm_001', name: '湖畔咖啡站', phone: '0571-88880001', address: '千岛湖服务区北区', status: 'approved', level: 'A', score: 92, verifyCount: 18, settleAmount: 1256.8 },
    { _id: 'm_002', name: '同路补给铺', phone: '0571-88880002', address: '杭千高速补给点', status: 'pending', level: 'B', score: 78, verifyCount: 7, settleAmount: 428.5 }
  ],
  refunds: [
    { _id: 'rf_001', orderId: 'order_mock_001', userName: '小北', amount: 29.9, status: 'pending', reason: '行程取消' }
  ],
  service_tickets: [
    { _id: 'ticket_001', userId: 'u_mock_001', userName: '林小路', category: '订单核销', title: '核销码无法识别', status: 'open', createdAt: now, messages: [{ sender: 'user', content: '商家扫码后提示找不到订单。', createdAt: now }] },
    { _id: 'ticket_002', userId: 'u_owner_002', userName: '南风', category: '商家信息', title: '商家营业时间变更', status: 'replied', createdAt: now, messages: [{ sender: 'ops', content: '已联系商家更新营业时间。', createdAt: now }] }
  ],
  emergency_events: [],
  user_settings: {
    u_mock_001: {
      discoverable: true,
      allowTeamMessage: true,
      allowMarketing: false,
      shareLocation: true,
      sentinelMode: true,
      emergencyName: '林先生',
      emergencyPhone: '13900005200'
    }
  },
  map_layers: [
    { _id: 'layer_001', type: 'poi', icon: 'gas', title: '中石化富阳站', subtitle: '沿途服务', desc: '前方 12km · 95#有货 · 评分 4.6', address: '富阳服务区东区', phone: '0571-96000', distanceKm: 12, latitude: 30.23, longitude: 120.02 },
    { _id: 'layer_002', type: 'safe', icon: 'hospital', title: '千岛湖镇人民医院', subtitle: '安全 POI', desc: '急诊 24 小时 · 距离 2.4km', address: '淳安县环湖北路1869号', phone: '120', distanceKm: 2.4, latitude: 29.62, longitude: 119.05 },
    { _id: 'layer_003', type: 'traffic', icon: 'warning', title: '杭千高速 K122 施工', subtitle: '道路事件', desc: '拥堵 2.1km · 预计通行 18 分钟', distanceKm: 32, latitude: 30.01, longitude: 119.65 },
    { _id: 'layer_004', type: 'team', icon: 'car', title: '318经典车队', subtitle: '同向车队 · 5人', desc: '队长阿杰 · 前方 8km · 成都到拉萨', targetId: 'trip_001', leaderId: 'u_owner_001', distanceKm: 8, latitude: 30.31, longitude: 120.18 },
    { _id: 'layer_driver', type: 'driver', icon: 'car', title: '山野独行', subtitle: '个人自驾者 · Lv.2', desc: '距你 3.2km · 正在附近自驾', userId: 'u_solo_001', distanceKm: 3.2, latitude: 30.29, longitude: 120.17 },
    { _id: 'layer_005', type: 'poi', icon: 'food', title: '湖畔家常菜', subtitle: '沿途餐厅', desc: '评分 4.7 · 可停 12 辆车 · 距离 6.3km', address: '淳安县千岛湖大道88号', phone: '0571-64881234', distanceKm: 6.3, latitude: 29.76, longitude: 119.22 },
    { _id: 'layer_006', type: 'team', icon: 'car', title: '轻野露营队', subtitle: '逆向车队 · 3人', desc: '队长晴川 · 后方 14km · 千岛湖到杭州', leaderId: 'u_guest_001', distanceKm: 14, direction: 'opposite', latitude: 29.91, longitude: 119.48 }
  ]
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDefaults(saved, defaults) {
  if (!saved || typeof saved !== 'object') return clone(defaults);
  const next = { ...clone(defaults), ...saved };
  Object.keys(defaults).forEach(key => {
    if (Array.isArray(defaults[key]) && !Array.isArray(next[key])) next[key] = clone(defaults[key]);
  });
  if (Array.isArray(next.users)) {
    next.users = next.users.map((user, index) => ({
      ...(defaults.users[index] || defaults.users[0]),
      ...user
    }));
  }
  return next;
}

function getStore() {
  const saved = wx.getStorageSync(STORAGE_KEY);
  if (saved) {
    const merged = mergeDefaults(saved, seed);
    wx.setStorageSync(STORAGE_KEY, merged);
    return merged;
  }
  const fresh = clone(seed);
  wx.setStorageSync(STORAGE_KEY, fresh);
  return fresh;
}

function saveStore(store) {
  wx.setStorageSync(STORAGE_KEY, store);
  return store;
}

function resetStore() {
  const fresh = clone(seed);
  wx.setStorageSync(STORAGE_KEY, fresh);
  return fresh;
}

function id(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function currentTime() {
  const d = new Date();
  const pad = n => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  id,
  currentTime,
  getStore,
  saveStore,
  resetStore,
  getSeed: () => clone(seed)
};
