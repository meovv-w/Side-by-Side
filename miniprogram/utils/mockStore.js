const STORAGE_KEY = 'tongdao_mvp_store_v1';

const now = '2026-07-01 09:00';

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
      departAt: '2026-07-04 08:30',
      seatTotal: 4,
      seatJoined: 2,
      priceShare: 68,
      status: 'open',
      matchRate: 92,
      days: 1,
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
      departAt: '2026-07-05 10:00',
      seatTotal: 3,
      seatJoined: 1,
      priceShare: 45,
      status: 'open',
      matchRate: 78,
      days: 1,
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
    }
  ],
  trip_members: [
    { _id: 'tm_001', tripId: 'trip_001', userId: 'u_owner_001', nickname: '阿成车主', role: 'owner', joinedAt: now },
    { _id: 'tm_002', tripId: 'trip_001', userId: 'u_guest_001', nickname: '小北', role: 'passenger', joinedAt: now },
    { _id: 'tm_003', tripId: 'trip_002', userId: 'u_owner_002', nickname: '南风', role: 'owner', joinedAt: now }
  ],
  messages: [
    { _id: 'msg_001', tripId: 'trip_001', userId: 'u_owner_001', nickname: '阿成车主', content: '大家周六 8:20 集合，8:30 准时出发。', createdAt: '2026-07-01 09:12' },
    { _id: 'msg_002', tripId: 'trip_001', userId: 'u_guest_001', nickname: '小北', content: '我可以带两瓶水和晕车贴。', createdAt: '2026-07-01 09:18' }
  ],
  conversations: [
    { _id: 'conv_team_001', type: 'team', title: '周六千岛湖车队', lastMessage: '大家周六 8:20 集合', unread: 2, targetId: 'trip_001' },
    { _id: 'conv_poi_001', type: 'poi', title: '千岛湖服务区话题', lastMessage: '今天咖啡店排队 5 分钟', unread: 1, targetId: 'poi_001' },
    { _id: 'conv_private_001', type: 'private', title: '南风', lastMessage: '苏州线可以带宠物吗？', unread: 0, targetId: 'u_owner_002' }
  ],
  poi_chats: [
    { _id: 'poi_001', name: '千岛湖服务区补给讨论', location: '杭千高速服务区', online: 6, status: 'active', lastMessage: '咖啡双人券还有名额', createdAt: now },
    { _id: 'poi_002', name: '苏州平江路停车位', location: '苏州平江路', online: 3, status: 'quiet', lastMessage: '东侧停车场还有空位', createdAt: now }
  ],
  poi_messages: [
    { _id: 'poim_001', poiChatId: 'poi_001', userId: 'u_owner_001', nickname: '阿成车主', content: '服务区北区停车位充足，咖啡店不用排队。', createdAt: '2026-07-01 09:30' },
    { _id: 'poim_002', poiChatId: 'poi_001', userId: 'u_mock_001', nickname: '林小路', content: '我 10 分钟后到，帮大家看一下补给。', createdAt: '2026-07-01 09:36' },
    { _id: 'poim_003', poiChatId: 'poi_002', userId: 'u_owner_002', nickname: '南风', content: '平江路东侧停车场还有空位。', createdAt: '2026-07-01 10:00' }
  ],
  private_messages: [
    { _id: 'pm_001', fromUserId: 'u_owner_002', toUserId: 'u_mock_001', nickname: '南风', content: '苏州线可以带宠物吗？', createdAt: '2026-07-01 10:20' }
  ],
  groupbuys: [
    {
      _id: 'gb_001',
      title: '千岛湖服务区咖啡双人券',
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
      validUntil: '2026-07-10 23:59',
      description: '美式/拿铁任选两杯，到店出示核销码使用。'
    },
    {
      _id: 'gb_002',
      title: '高速补给零食包',
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
      validUntil: '2026-07-08 23:59',
      description: '坚果、能量棒、湿巾组合，适合车队路上共享。'
    }
  ],
  orders: [],
  invites: [
    { _id: 'inv_001', inviterId: 'u_mock_001', inviteeName: '小北', source: 'qrcode', bonus: 10, status: 'registered', createdAt: now },
    { _id: 'inv_002', inviterId: 'u_mock_001', inviteeName: '阿洛', source: 'link', bonus: 20, status: 'ordered', createdAt: now }
  ],
  coupons: [
    { _id: 'cp_001', title: '新用户拼团券', type: 'platform', amount: 10, threshold: 30, status: 'unused', expireAt: '2026-07-10' },
    { _id: 'cp_002', title: '湖畔咖啡拉新券', type: 'merchant', amount: 8, threshold: 29, status: 'unused', expireAt: '2026-07-08' }
  ],
  growth_logs: [
    { _id: 'gl_001', userId: 'u_mock_001', delta: 10, reason: '邀请好友注册', createdAt: now },
    { _id: 'gl_002', userId: 'u_mock_001', delta: 20, reason: '完成拼团订单', createdAt: now }
  ],
  next_trips: [
    { _id: 'draft_001', userId: 'u_mock_001', from: '杭州', to: '黄山', departAt: '2026-07-12 09:00', status: 'draft' }
  ],
  merchants: [
    { _id: 'm_001', name: '湖畔咖啡站', phone: '0571-88880001', address: '千岛湖服务区北区', status: 'approved', level: 'A', score: 92, verifyCount: 18, settleAmount: 1256.8 },
    { _id: 'm_002', name: '同路补给铺', phone: '0571-88880002', address: '杭千高速补给点', status: 'pending', level: 'B', score: 78, verifyCount: 7, settleAmount: 428.5 }
  ],
  refunds: [
    { _id: 'rf_001', orderId: 'order_mock_001', userName: '小北', amount: 29.9, status: 'pending', reason: '行程取消' }
  ],
  service_tickets: [
    { _id: 'ticket_001', userName: '林小路', title: '核销码无法识别', status: 'open', createdAt: now },
    { _id: 'ticket_002', userName: '南风', title: '商家营业时间变更', status: 'replied', createdAt: now }
  ],
  map_layers: [
    { _id: 'layer_001', type: 'poi', title: '加油站', desc: '前方 12km，中石化', latitude: 30.23, longitude: 120.02 },
    { _id: 'layer_002', type: 'safe', title: '医院', desc: '千岛湖镇人民医院', latitude: 29.62, longitude: 119.05 },
    { _id: 'layer_003', type: 'traffic', title: '施工提醒', desc: '杭千高速 K122 施工，建议减速', latitude: 30.01, longitude: 119.65 },
    { _id: 'layer_004', type: 'team', title: '318经典车队', desc: '同向 8km，仅显示队长位置', latitude: 30.31, longitude: 120.18 }
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
  resetStore
};
