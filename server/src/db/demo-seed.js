const bcrypt = require('bcryptjs');
const { dateTime, addTime } = require('../lib/time');

function createDemoSeed(clock = () => Date.now()) {
  const nowMs = clock();
  const now = dateTime(nowMs);
  const ago = (amount, unit) => addTime(nowMs, -amount, unit);
  const later = (amount, unit) => addTime(nowMs, amount, unit);
  const passwordHash = bcrypt.hashSync('tongdao2026', 10);

  return {
    users: [
      { id: 'u_demo', openid: 'demo-openid-001', phone: '13800000001', nickname: '林小路', avatar: '', role: 'user', owner_cert_status: 'approved', vehicle_model: '比亚迪唐 DM-i', vehicle_no: '浙A8T520', bio: '周末出发，偏爱山路、露营和沿途小店。', growth: 5200, level: 4, credit_score: 4.8, discoverable: true, invite_code: 'TD5200AA', invited_by: 'u_owner', created_at: ago(5, 'days'), updated_at: now, last_login_at: now },
      { id: 'u_owner', openid: 'demo-openid-owner', phone: '13800000002', nickname: '阿成车主', avatar: '', role: 'user', owner_cert_status: 'approved', vehicle_model: '理想 L7', vehicle_no: '浙A6C318', bio: '稳妥驾驶，按计划休息。', growth: 7800, level: 5, credit_score: 4.9, discoverable: true, invite_code: 'TD318AAA', invited_by: null, created_at: ago(40, 'days'), updated_at: now, last_login_at: ago(1, 'hours') },
      { id: 'u_guest', openid: 'demo-openid-guest', phone: '13800000003', nickname: '小北', avatar: '', role: 'user', owner_cert_status: 'pending', vehicle_model: '大众 ID.4', vehicle_no: '浙B2K991', bio: '第一次长途自驾。', growth: 1680, level: 2, credit_score: 4.7, discoverable: true, invite_code: 'TD991AAA', invited_by: null, created_at: ago(20, 'days'), updated_at: now, last_login_at: ago(2, 'hours') },
      { id: 'u_other', openid: 'demo-openid-other', phone: '13800000004', nickname: '南风', avatar: '', role: 'user', owner_cert_status: 'approved', vehicle_model: '坦克 300', vehicle_no: '沪B7F620', bio: '喜欢慢节奏和城市周边路线。', growth: 4260, level: 3, credit_score: 4.9, discoverable: true, invite_code: 'TD620AAA', invited_by: null, created_at: ago(60, 'days'), updated_at: now, last_login_at: ago(3, 'hours') },
      { id: 'u_solo', openid: 'demo-openid-solo', phone: '13800000006', nickname: '山野独行', avatar: '', role: 'user', owner_cert_status: 'approved', vehicle_model: '斯巴鲁森林人', vehicle_no: '浙D6S318', bio: '独自旅行，也愿意认识附近同路人。', growth: 2200, level: 2, credit_score: 4.9, discoverable: true, invite_code: 'TDSOLO01', invited_by: null, created_at: ago(80, 'days'), updated_at: now, last_login_at: ago(20, 'minutes') },
      { id: 'u_near_team', openid: 'demo-openid-near-team', phone: '13800000007', nickname: '晴川', avatar: '', role: 'user', owner_cert_status: 'approved', vehicle_model: '领克 08', vehicle_no: '浙C8Q318', bio: '轻装露营，按限速稳定行驶。', growth: 3500, level: 3, credit_score: 4.9, discoverable: true, invite_code: 'TDNEAR01', invited_by: null, created_at: ago(70, 'days'), updated_at: now, last_login_at: ago(12, 'minutes') },
      { id: 'u_merchant', openid: null, phone: '13800000008', nickname: '湖畔咖啡站', avatar: '', role: 'merchant', owner_cert_status: 'none', vehicle_model: '', vehicle_no: '', bio: '', growth: 0, level: 1, credit_score: 5, discoverable: false, invite_code: 'TDM001AA', invited_by: null, created_at: ago(90, 'days'), updated_at: now, last_login_at: ago(1, 'days') }
    ],
    user_settings: ['u_demo', 'u_owner', 'u_guest', 'u_other', 'u_solo', 'u_near_team'].map((userId, index) => ({
      id: `settings_${index + 1}`, user_id: userId, allow_team_message: true, allow_marketing: false,
      share_location: true, sentinel_mode: true, emergency_name: index === 0 ? '林女士' : '',
      emergency_phone: index === 0 ? '13900000001' : '', created_at: ago(5, 'days'), updated_at: now
    })),
    vehicle_certifications: [
      { id: 'cert_001', user_id: 'u_demo', real_name: '林小路', plate: '浙A8T520', vehicle_model: '比亚迪唐 DM-i', license_photo: 'https://example.invalid/demo-license.jpg', ocr_result: { plate: '浙A8T520', confidence: 0.99 }, liveness_token: 'demo-liveness-1', liveness_result: { passed: true }, status: 'approved', reject_reason: '', reviewed_by: 'admin_ops', created_at: ago(5, 'days'), reviewed_at: ago(4, 'days') },
      { id: 'cert_002', user_id: 'u_guest', real_name: '小北', plate: '浙B2K991', vehicle_model: '大众 ID.4', license_photo: 'https://example.invalid/demo-pending.jpg', ocr_result: { plate: '浙B2K991', confidence: 0.94 }, liveness_token: 'demo-liveness-2', liveness_result: { passed: true }, status: 'pending', reject_reason: '', reviewed_by: null, created_at: ago(2, 'hours'), reviewed_at: null }
    ],
    trip_drafts: [
      { id: 'draft_001', user_id: 'u_demo', start_name: '杭州', start_lng: 120.1551, start_lat: 30.2741, end_name: '黄山', end_lng: 118.3376, end_lat: 29.7147, depart_at: later(14, 'days'), route: [], waypoints: [], note: '希望周末早上出发', status: 'draft', converted_trip_id: null, created_at: ago(1, 'days'), updated_at: ago(1, 'days') }
    ],
    badges: [
      { id: 'badge_reliable', badge_key: 'reliable_teammate', name: '可靠队友', description: '完成 3 次同行且信用分不低于 4.5', icon: '', rule: { completedTrips: 3, minCredit: 4.5 }, enabled: true, created_at: ago(90, 'days'), updated_at: now },
      { id: 'badge_safety', badge_key: 'safety_guard', name: '安全先锋', description: '完成有效安全上报', icon: '', rule: { safetyReports: 1 }, enabled: true, created_at: ago(90, 'days'), updated_at: now }
    ],
    user_badges: [
      { id: 'ub_001', user_id: 'u_demo', badge_id: 'badge_reliable', awarded_at: ago(10, 'days') },
      { id: 'ub_002', user_id: 'u_demo', badge_id: 'badge_safety', awarded_at: ago(3, 'days') }
    ],
    merchants: [
      { id: 'merchant_001', owner_user_id: 'u_merchant', name: '湖畔咖啡站', phone: '057188880001', address: '千岛湖服务区北区', description: '为自驾车队提供咖啡、早餐和短暂停靠服务。', lng: 119.338, lat: 29.72, business_hours: '08:00-22:00', license_photo: 'https://example.invalid/license-m1.jpg', qualification_files: [], bank_info: { bank: '招商银行杭州分行', maskedCard: '6225 **** **** 3188', wechatReceiver: '' }, status: 'approved', reject_reason: '', level: 'gold', score: 92, commission_rate: 0.08, reward_pool_enabled: true, rescue_enabled: false, rescue_services: [], rescue_radius_km: 0, rescue_phone: '', business_open: true, created_at: ago(90, 'days'), updated_at: now },
      { id: 'merchant_002', owner_user_id: null, name: '千岛湖道路救援', phone: '057188881234', address: '千岛湖镇新安大街', description: '24小时道路救援。', lng: 119.05, lat: 29.61, business_hours: '24小时', license_photo: 'https://example.invalid/license-m2.jpg', qualification_files: [], bank_info: {}, status: 'approved', reject_reason: '', level: 'silver', score: 85, commission_rate: 0.1, reward_pool_enabled: false, rescue_enabled: true, rescue_services: ['搭电', '拖车', '应急维修'], rescue_radius_km: 30, rescue_phone: '057188881234', business_open: true, created_at: ago(60, 'days'), updated_at: now }
    ],
    admins: [
      { id: 'admin_ops', account: 'ops@tongdao.cn', password_hash: passwordHash, role: 'ops', merchant_id: null, status: 'active', created_at: ago(90, 'days'), last_login_at: null },
      { id: 'admin_merchant', account: 'merchant@tongdao.cn', password_hash: passwordHash, role: 'merchant', merchant_id: 'merchant_001', status: 'active', created_at: ago(90, 'days'), last_login_at: null }
    ],
    trips: [
      { id: 'trip_001', owner_id: 'u_owner', title: '周六杭州到千岛湖自驾', team_name: '千岛湖周末小队', start_name: '杭州西湖文化广场', start_lng: 120.1551, start_lat: 30.2741, end_name: '千岛湖中心湖区', end_lng: 119.0419, end_lat: 29.6097, route: [{ lng: 120.1551, lat: 30.2741 }, { lng: 119.7, lat: 30.0 }, { lng: 119.0419, lat: 29.6097 }], waypoints: ['富阳服务区'], depart_at: ago(3, 'hours'), days: 1, daily_km: 180, max_cars: 4, current_cars: 2, price_share: 68, depth: 'deep', plans: ['拍照', '美食', 'AA住宿', '互助'], equipment: ['应急药箱', '对讲机'], privacy: 'public', discoverable: true, status: 'started', stage: 'driving', note: '走杭千高速，服务区休息一次。', created_at: ago(7, 'days'), updated_at: ago(3, 'hours'), completed_at: null },
      { id: 'trip_002', owner_id: 'u_other', title: '上海到苏州周末咖啡线', team_name: '苏州咖啡线', start_name: '上海虹桥站', start_lng: 121.327, start_lat: 31.2, end_name: '苏州平江路', end_lng: 120.63, end_lat: 31.31, route: [{ lng: 121.327, lat: 31.2 }, { lng: 120.63, lat: 31.31 }], waypoints: [], depart_at: later(8, 'days'), days: 1, daily_km: 120, max_cars: 3, current_cars: 1, price_share: 45, depth: 'light', plans: ['拼桌', '同逛'], equipment: ['宠物友好'], privacy: 'public', discoverable: true, status: 'recruiting', stage: 'forming', note: '慢节奏咖啡路线。', created_at: ago(2, 'days'), updated_at: now, completed_at: null }
      ,{ id: 'trip_near', owner_id: 'u_near_team', title: '富阳到杭州轻野返程', team_name: '轻野露营队', start_name: '富阳服务区', start_lng: 119.9, start_lat: 30.1, end_name: '杭州奥体中心', end_lng: 120.3, end_lat: 30.35, route: [{ lng: 119.9, lat: 30.1 }, { lng: 120.3, lat: 30.35 }], waypoints: [], depart_at: later(1, 'days'), days: 1, daily_km: 90, max_cars: 4, current_cars: 1, price_share: 35, depth: 'medium', plans: ['拼桌', '露营'], equipment: ['应急电源'], privacy: 'public', discoverable: true, status: 'recruiting', stage: 'forming', note: '与千岛湖方向相反，下午返回杭州。', created_at: ago(1, 'days'), updated_at: now, completed_at: null }
      ,{ id: 'trip_history', owner_id: 'u_demo', title: '杭州到莫干山秋日同行', team_name: '莫干山慢行小队', start_name: '杭州西站', start_lng: 120.026, start_lat: 30.298, end_name: '莫干山风景区', end_lng: 119.88, end_lat: 30.60, route: [{ lng: 120.026, lat: 30.298 }, { lng: 119.95, lat: 30.44 }, { lng: 119.88, lat: 30.60 }], waypoints: ['德清服务区'], depart_at: ago(20, 'days'), days: 2, daily_km: 110, max_cars: 4, current_cars: 1, price_share: 58, depth: 'medium', plans: ['拍照', 'AA住宿'], equipment: ['应急药箱'], privacy: 'public', discoverable: true, status: 'completed', stage: 'completed', note: '历史同行群仍可继续分享照片。', created_at: ago(25, 'days'), updated_at: ago(18, 'days'), completed_at: ago(18, 'days') }
    ],
    trip_applications: [
      { id: 'app_001', trip_id: 'trip_002', user_id: 'u_guest', message: '路线顺路，希望加入。', status: 'pending', reviewed_by: null, created_at: ago(1, 'hours'), reviewed_at: null }
    ],
    trip_members: [
      { id: 'tm_001', trip_id: 'trip_001', user_id: 'u_owner', role: 'owner', status: 'active', joined_at: ago(7, 'days'), left_at: null, leave_reason: '', last_location_at: ago(1, 'minutes'), deviation_started_at: null },
      { id: 'tm_002', trip_id: 'trip_001', user_id: 'u_demo', role: 'member', status: 'active', joined_at: ago(6, 'days'), left_at: null, leave_reason: '', last_location_at: ago(2, 'minutes'), deviation_started_at: null },
      { id: 'tm_003', trip_id: 'trip_002', user_id: 'u_other', role: 'owner', status: 'active', joined_at: ago(2, 'days'), left_at: null, leave_reason: '', last_location_at: ago(10, 'minutes'), deviation_started_at: null }
      ,{ id: 'tm_near', trip_id: 'trip_near', user_id: 'u_near_team', role: 'owner', status: 'active', joined_at: ago(1, 'days'), left_at: null, leave_reason: '', last_location_at: ago(4, 'minutes'), deviation_started_at: null }
      ,{ id: 'tm_history', trip_id: 'trip_history', user_id: 'u_demo', role: 'owner', status: 'active', joined_at: ago(25, 'days'), left_at: null, leave_reason: '', last_location_at: ago(18, 'days'), deviation_started_at: null }
    ],
    locations: [
      { id: 'loc_001', user_id: 'u_owner', trip_id: 'trip_001', lng: 119.72, lat: 30.01, speed: 62, altitude: 83, accuracy: 8, bearing: 245, reported_at: ago(1, 'minutes'), expires_at: later(24, 'hours') },
      { id: 'loc_002', user_id: 'u_demo', trip_id: 'trip_001', lng: 119.78, lat: 30.04, speed: 58, altitude: 79, accuracy: 10, bearing: 240, reported_at: ago(2, 'minutes'), expires_at: later(24, 'hours') },
      { id: 'loc_003', user_id: 'u_other', trip_id: 'trip_002', lng: 121.2, lat: 31.22, speed: 0, altitude: 12, accuracy: 12, bearing: 0, reported_at: ago(10, 'minutes'), expires_at: later(24, 'hours') },
      { id: 'loc_solo', user_id: 'u_solo', trip_id: null, lng: 120.18, lat: 30.30, speed: 0, altitude: 76, accuracy: 8, bearing: 0, reported_at: ago(8, 'minutes'), expires_at: later(52, 'minutes') }
      ,{ id: 'loc_near', user_id: 'u_near_team', trip_id: 'trip_near', lng: 120.20, lat: 30.29, speed: 54, altitude: 72, accuracy: 9, bearing: 45, reported_at: ago(4, 'minutes'), expires_at: later(24, 'hours') }
      ,{ id: 'loc_history_1', user_id: 'u_demo', trip_id: 'trip_history', lng: 120.026, lat: 30.298, speed: 0, altitude: 22, accuracy: 8, bearing: 0, reported_at: ago(20, 'days'), expires_at: ago(19, 'days') }
      ,{ id: 'loc_history_2', user_id: 'u_demo', trip_id: 'trip_history', lng: 119.95, lat: 30.44, speed: 68, altitude: 96, accuracy: 8, bearing: 330, reported_at: ago(19, 'days'), expires_at: ago(18, 'days') }
      ,{ id: 'loc_history_3', user_id: 'u_demo', trip_id: 'trip_history', lng: 119.88, lat: 30.60, speed: 0, altitude: 246, accuracy: 7, bearing: 0, reported_at: ago(18, 'days'), expires_at: ago(17, 'days') }
    ],
    messages: [
      { id: 'msg_001', conversation_type: 'team', conversation_id: 'trip_001', sender_id: 'u_owner', message_type: 'text', content: '前方富阳服务区休息十分钟。', media_url: '', metadata: {}, created_at: ago(18, 'minutes'), deleted_at: null },
      { id: 'msg_002', conversation_type: 'team', conversation_id: 'trip_001', sender_id: 'u_demo', message_type: 'text', content: '收到，我在后方约 8km。', media_url: '', metadata: {}, created_at: ago(15, 'minutes'), deleted_at: null },
      { id: 'msg_003', conversation_type: 'poi', conversation_id: 'poi_001', sender_id: 'u_guest', message_type: 'text', content: '95号有货，排队约15分钟。', media_url: '', metadata: {}, created_at: ago(25, 'minutes'), deleted_at: null }
      ,{ id: 'msg_history', conversation_type: 'team', conversation_id: 'trip_history', sender_id: 'u_demo', message_type: 'image', content: '[图片] 莫干山同行合影', media_url: 'https://example.invalid/moganshan-memory.jpg', metadata: {}, created_at: ago(16, 'days'), deleted_at: null }
    ],
    conversation_members: [
      { id: 'cm_001', conversation_type: 'team', conversation_id: 'trip_001', user_id: 'u_owner', role: 'owner', unread_count: 1, joined_at: ago(7, 'days'), left_at: null, last_read_at: ago(20, 'minutes') },
      { id: 'cm_002', conversation_type: 'team', conversation_id: 'trip_001', user_id: 'u_demo', role: 'member', unread_count: 1, joined_at: ago(6, 'days'), left_at: null, last_read_at: ago(18, 'minutes') },
      { id: 'cm_003', conversation_type: 'poi', conversation_id: 'poi_001', user_id: 'u_guest', role: 'member', unread_count: 0, joined_at: ago(1, 'days'), left_at: null, last_read_at: ago(25, 'minutes') }
      ,{ id: 'cm_history', conversation_type: 'team', conversation_id: 'trip_history', user_id: 'u_demo', role: 'owner', unread_count: 0, joined_at: ago(25, 'days'), left_at: null, last_read_at: ago(15, 'days') }
    ],
    follows: [
      { id: 'follow_001', follower_id: 'u_demo', target_type: 'user', target_id: 'u_other', created_at: ago(2, 'days') }
    ],
    blocks: [],
    poi_topics: [
      { id: 'poi_001', creator_id: 'u_guest', name: '千岛湖服务区补给讨论', location_name: '杭千高速千岛湖服务区', lng: 119.32, lat: 29.75, source: 'user', event_id: null, status: 'active', last_message_at: ago(25, 'minutes'), archived_at: null, created_at: ago(1, 'days') },
      { id: 'poi_history', creator_id: null, name: '二郎山隧道施工', location_name: 'G318二郎山段', lng: 102.34, lat: 29.83, source: 'traffic_event', event_id: 'traffic_old', status: 'archived', last_message_at: ago(3, 'days'), archived_at: ago(2, 'days'), created_at: ago(5, 'days') }
    ],
    poi_topic_members: [
      { id: 'ptm_001', topic_id: 'poi_001', user_id: 'u_guest', role: 'creator', followed: false, participated: true, joined_at: ago(1, 'days') }
    ],
    products: [
      { id: 'product_001', merchant_id: 'merchant_001', name: '千岛湖咖啡双人券', cover_photo: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085', photos: [], description: '双人手冲咖啡，到店出示核销码使用。', category: '餐饮', origin_price: 48, tiers: [{ people: 1, price: 48 }, { people: 3, price: 39.9 }, { people: 6, price: 34.9 }, { people: 10, price: 29.9 }, { people: 20, price: 28.8 }], stock: 50, sold: 18, reserved: 0, valid_hours: 24, max_group_size: 20, max_quantity: 50, status: 'on', lng: 119.338, lat: 29.72, address: '千岛湖服务区北区', created_at: ago(30, 'days'), updated_at: now },
      { id: 'product_002', merchant_id: 'merchant_001', name: '湖景早餐套餐', cover_photo: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666', photos: [], description: '早餐与咖啡套餐。', category: '餐饮', origin_price: 36, tiers: [{ people: 1, price: 36 }, { people: 5, price: 29.9 }, { people: 10, price: 26 }], stock: 30, sold: 12, reserved: 0, valid_hours: 48, max_group_size: 10, max_quantity: 30, status: 'on', lng: 119.338, lat: 29.72, address: '千岛湖服务区北区', created_at: ago(20, 'days'), updated_at: now }
    ],
    groupbuy_sessions: [
      { id: 'session_001', product_id: 'product_001', creator_id: 'u_owner', trip_id: 'trip_001', target_people: 6, joined_people: 1, current_price: 48, status: 'forming', expires_at: later(20, 'hours'), success_at: null, failed_at: null, created_at: ago(4, 'hours') },
      { id: 'session_002', product_id: 'product_002', creator_id: 'u_other', trip_id: null, target_people: 1, joined_people: 1, current_price: 36, status: 'success', expires_at: later(4, 'hours'), success_at: ago(1, 'days'), failed_at: null, created_at: ago(2, 'days') }
    ],
    coupons: [
      { id: 'coupon_platform', owner_type: 'platform', owner_id: null, name: '新用户拼团券', type: 'cash', amount: 10, threshold_amount: 30, discount_rate: null, total: 500, issued: 86, used: 31, valid_days: 30, budget_amount: 5000, status: 'active', created_at: ago(60, 'days'), updated_at: now },
      { id: 'coupon_merchant', owner_type: 'merchant', owner_id: 'merchant_001', name: '湖畔咖啡拉新券', type: 'invite', amount: 8, threshold_amount: 20, discount_rate: null, total: 100, issued: 26, used: 9, valid_days: 14, budget_amount: 800, status: 'active', created_at: ago(30, 'days'), updated_at: now }
    ],
    orders: [
      { id: 'order_001', order_no: 'TD20260713001', user_id: 'u_demo', merchant_id: 'merchant_001', product_id: 'product_001', session_id: 'session_001', coupon_id: null, quantity: 1, origin_amount: 48, discount_amount: 0, paid_amount: 48, status: 'paid', payment_provider: 'wechat', payment_transaction_id: 'demo_tx_001', verify_code: '620318', expires_at: later(24, 'hours'), paid_at: ago(3, 'hours'), verified_at: null, verified_by: null, verified_lng: null, verified_lat: null, created_at: ago(4, 'hours'), updated_at: ago(3, 'hours') },
      { id: 'order_002', order_no: 'TD20260712008', user_id: 'u_other', merchant_id: 'merchant_001', product_id: 'product_002', session_id: 'session_002', coupon_id: null, quantity: 1, origin_amount: 36, discount_amount: 0, paid_amount: 36, status: 'verified', payment_provider: 'wechat', payment_transaction_id: 'demo_tx_002', verify_code: '885201', expires_at: later(20, 'days'), paid_at: ago(2, 'days'), verified_at: ago(1, 'days'), verified_by: 'admin_merchant', verified_lng: 119.338, verified_lat: 29.72, created_at: ago(2, 'days'), updated_at: ago(1, 'days') }
    ],
    groupbuy_members: [
      { id: 'gbm_001', session_id: 'session_001', user_id: 'u_demo', order_id: 'order_001', quantity: 1, paid_amount: 48, status: 'paid', joined_at: ago(3, 'hours') },
      { id: 'gbm_002', session_id: 'session_002', user_id: 'u_other', order_id: 'order_002', quantity: 1, paid_amount: 36, status: 'paid', joined_at: ago(2, 'days') }
    ],
    refunds: [],
    verification_records: [
      { id: 'verify_002', order_id: 'order_002', merchant_id: 'merchant_001', operator_id: 'admin_merchant', code: '885201', lng: 119.338, lat: 29.72, created_at: ago(1, 'days') }
    ],
    settlements: [
      { id: 'settlement_001', merchant_id: 'merchant_001', order_id: 'order_002', period_start: ago(15, 'days'), period_end: ago(1, 'days'), gross_amount: 36, commission_rate: 0.08, commission_amount: 2.88, net_amount: 33.12, status: 'pending', provider_id: null, triggered_by: null, created_at: ago(1, 'days'), completed_at: null }
    ],
    user_coupons: [
      { id: 'uc_001', coupon_id: 'coupon_platform', user_id: 'u_demo', source: 'invite', source_ref: 'invite_001', status: 'unused', issued_at: ago(4, 'days'), expires_at: later(26, 'days'), used_at: null, order_id: null, verify_code: 'CP520001' }
    ],
    invites: [
      { id: 'invite_001', inviter_id: 'u_owner', invitee_id: 'u_demo', source: 'link', source_ref: 'share-demo', status: 'registered', bound_at: ago(5, 'days'), first_order_at: null, reward_status: 'pending', reward_value: 10 }
    ],
    growth_rules: [
      ['complete_trip', '完成行程', 10], ['join_groupbuy', '参与拼团', 20], ['invite_register', '邀请注册', 10], ['invite_first_order', '邀请首单', 20], ['safety_report', '安全上报', 5], ['valid_review', '有效评价', 5]
    ].map(([key, name, points], index) => ({ id: `growth_rule_${index + 1}`, rule_key: key, name, points, daily_limit: null, enabled: true, updated_by: 'admin_ops', updated_at: now })),
    growth_logs: [],
    support_tickets: [
      { id: 'ticket_001', user_id: 'u_demo', order_id: 'order_001', category: '核销问题', title: '核销码无法识别', status: 'open', priority: 'normal', assigned_to: null, created_at: ago(30, 'minutes'), updated_at: ago(30, 'minutes'), closed_at: null }
    ],
    support_messages: [
      { id: 'support_msg_001', ticket_id: 'ticket_001', sender_type: 'user', sender_id: 'u_demo', content: '商家扫码后提示找不到订单。', media_urls: [], created_at: ago(30, 'minutes') }
    ],
    notifications: [
      { id: 'notice_001', user_id: 'u_demo', type: 'team', title: '车队新消息', content: '阿成车主：前方富阳服务区休息十分钟。', data: { tripId: 'trip_001' }, priority: 'normal', read_at: null, created_at: ago(18, 'minutes') }
    ],
    emergency_events: [],
    traffic_events: [
      { id: 'traffic_001', provider_id: 'demo-event-1', source: 'provider', reporter_id: null, event_type: 'construction', title: '前方道路施工', description: '右侧车道封闭，预计缓行 2km。', lng: 119.58, lat: 29.92, severity: 2, starts_at: ago(1, 'hours'), ends_at: later(5, 'hours'), status: 'active', reviewed_by: null, review_reason: '', reviewed_at: null, topic_id: null, created_at: ago(1, 'hours') }
    ],
    system_settings: [
      { id: 'setting_coupon_budget', setting_key: 'coupon_budget', value: { monthlyTotal: 50000, monthlyUserLimit: 50 }, updated_by: 'admin_ops', updated_at: now },
      { id: 'setting_invite_rewards', setting_key: 'invite_rewards', value: { tiers: [{ firstOrders: 1, reward: 5 }, { firstOrders: 3, reward: 10 }, { firstOrders: 5, reward: 20 }, { firstOrders: 10, reward: 50 }] }, updated_by: 'admin_ops', updated_at: now },
      { id: 'setting_assessment', setting_key: 'merchant_assessment', value: {
        bronze: { minScore: 0, commissionRate: 0.12, benefit: '基础展示与标准结算' },
        silver: { minScore: 75, commissionRate: 0.1, benefit: '更低佣金与路线推荐' },
        gold: { minScore: 90, commissionRate: 0.08, benefit: '优先推荐与活动资源位' },
        diamond: { minScore: 98, commissionRate: 0.06, benefit: '最高推荐权重与专属运营支持' }
      }, updated_by: 'admin_ops', updated_at: now },
      { id: 'setting_auto_reply', setting_key: 'support_auto_reply', value: { enabled: true, text: '客服已收到你的问题，将尽快处理。' }, updated_by: 'admin_ops', updated_at: now }
    ],
    audit_logs: [
      { id: 'audit_demo_001', actor_type: 'admin', actor_id: 'admin_ops', method: 'PUT', path: '/api/ops/certifications/:certificationId', status_code: 200, ip: '127.0.0.1', metadata: { params: { certificationId: 'cert_001' } }, created_at: ago(4, 'days') }
    ]
  };
}

module.exports = { createDemoSeed };
