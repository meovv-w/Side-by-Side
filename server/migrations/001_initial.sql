CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(255) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  openid VARCHAR(128) UNIQUE,
  phone VARCHAR(32) UNIQUE,
  nickname VARCHAR(80) NOT NULL,
  avatar VARCHAR(1024) NOT NULL DEFAULT '',
  role ENUM('user','merchant','ops') NOT NULL DEFAULT 'user',
  owner_cert_status ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
  vehicle_model VARCHAR(120) NOT NULL DEFAULT '',
  vehicle_no VARCHAR(32) NOT NULL DEFAULT '',
  bio VARCHAR(500) NOT NULL DEFAULT '',
  growth INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,
  credit_score DECIMAL(3,2) NOT NULL DEFAULT 5.00,
  discoverable BOOLEAN NOT NULL DEFAULT TRUE,
  invite_code VARCHAR(16) NOT NULL UNIQUE,
  invited_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  last_login_at DATETIME(3),
  INDEX idx_users_cert (owner_cert_status),
  INDEX idx_users_invited_by (invited_by),
  CONSTRAINT fk_users_inviter FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_settings (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL UNIQUE,
  allow_team_message BOOLEAN NOT NULL DEFAULT TRUE,
  allow_marketing BOOLEAN NOT NULL DEFAULT FALSE,
  share_location BOOLEAN NOT NULL DEFAULT TRUE,
  sentinel_mode BOOLEAN NOT NULL DEFAULT TRUE,
  emergency_name VARCHAR(80) NOT NULL DEFAULT '',
  emergency_phone VARCHAR(32) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vehicle_certifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  real_name VARCHAR(80) NOT NULL,
  plate VARCHAR(32) NOT NULL,
  vehicle_model VARCHAR(120) NOT NULL,
  license_photo VARCHAR(1024) NOT NULL,
  ocr_result JSON,
  liveness_token VARCHAR(255),
  liveness_result JSON,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reject_reason VARCHAR(500) NOT NULL DEFAULT '',
  reviewed_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL,
  reviewed_at DATETIME(3),
  INDEX idx_certs_user (user_id, created_at),
  INDEX idx_certs_status (status, created_at),
  CONSTRAINT fk_certs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trip_drafts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  start_name VARCHAR(255) NOT NULL,
  start_lng DECIMAL(11,7) NOT NULL,
  start_lat DECIMAL(10,7) NOT NULL,
  end_name VARCHAR(255) NOT NULL,
  end_lng DECIMAL(11,7) NOT NULL,
  end_lat DECIMAL(10,7) NOT NULL,
  depart_at DATETIME(3) NOT NULL,
  route JSON,
  waypoints JSON,
  status ENUM('draft','converted','cancelled') NOT NULL DEFAULT 'draft',
  converted_trip_id VARCHAR(64),
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_trip_drafts_user (user_id, status, depart_at),
  CONSTRAINT fk_trip_draft_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE badges (
  id VARCHAR(64) PRIMARY KEY,
  badge_key VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL,
  icon VARCHAR(1024) NOT NULL DEFAULT '',
  rule JSON,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_badges (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  badge_id VARCHAR(64) NOT NULL,
  awarded_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_user_badge (user_id, badge_id),
  CONSTRAINT fk_user_badge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_badge_badge FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE merchants (
  id VARCHAR(64) PRIMARY KEY,
  owner_user_id VARCHAR(64),
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  address VARCHAR(500) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  lng DECIMAL(11,7),
  lat DECIMAL(10,7),
  business_hours VARCHAR(120) NOT NULL DEFAULT '',
  license_photo VARCHAR(1024) NOT NULL DEFAULT '',
  qualification_files JSON,
  bank_info JSON,
  status ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
  reject_reason VARCHAR(500) NOT NULL DEFAULT '',
  level ENUM('bronze','silver','gold','diamond') NOT NULL DEFAULT 'bronze',
  score INT NOT NULL DEFAULT 60,
  commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.1000,
  reward_pool_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rescue_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rescue_radius_km INT NOT NULL DEFAULT 0,
  rescue_phone VARCHAR(32) NOT NULL DEFAULT '',
  business_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_merchants_status (status),
  INDEX idx_merchants_geo (lng, lat),
  CONSTRAINT fk_merchants_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE merchant_change_requests (
  id VARCHAR(64) PRIMARY KEY,
  merchant_id VARCHAR(64) NOT NULL,
  changes JSON NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by VARCHAR(64),
  review_reason VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  reviewed_at DATETIME(3),
  INDEX idx_merchant_changes_status (merchant_id, status, created_at),
  CONSTRAINT fk_merchant_change_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admins (
  id VARCHAR(64) PRIMARY KEY,
  account VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('merchant','ops') NOT NULL,
  merchant_id VARCHAR(64),
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL,
  last_login_at DATETIME(3),
  CONSTRAINT fk_admin_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trips (
  id VARCHAR(64) PRIMARY KEY,
  owner_id VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  team_name VARCHAR(120) NOT NULL,
  start_name VARCHAR(255) NOT NULL,
  start_lng DECIMAL(11,7) NOT NULL,
  start_lat DECIMAL(10,7) NOT NULL,
  end_name VARCHAR(255) NOT NULL,
  end_lng DECIMAL(11,7) NOT NULL,
  end_lat DECIMAL(10,7) NOT NULL,
  route JSON,
  waypoints JSON,
  depart_at DATETIME(3) NOT NULL,
  days INT NOT NULL DEFAULT 1,
  daily_km INT NOT NULL DEFAULT 200,
  max_cars INT NOT NULL DEFAULT 4,
  current_cars INT NOT NULL DEFAULT 1,
  price_share DECIMAL(10,2) NOT NULL DEFAULT 0,
  depth ENUM('light','medium','deep') NOT NULL DEFAULT 'medium',
  plans JSON,
  equipment JSON,
  privacy ENUM('public','private') NOT NULL DEFAULT 'public',
  discoverable BOOLEAN NOT NULL DEFAULT TRUE,
  status ENUM('recruiting','full','started','completed','cancelled') NOT NULL DEFAULT 'recruiting',
  stage ENUM('forming','departed','driving','completed') NOT NULL DEFAULT 'forming',
  note VARCHAR(1000) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3),
  INDEX idx_trips_status_depart (status, depart_at),
  INDEX idx_trips_start_geo (start_lng, start_lat),
  INDEX idx_trips_owner (owner_id),
  CONSTRAINT fk_trips_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trip_applications (
  id VARCHAR(64) PRIMARY KEY,
  trip_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  message VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('pending','approved','rejected','withdrawn') NOT NULL DEFAULT 'pending',
  reviewed_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL,
  reviewed_at DATETIME(3),
  UNIQUE KEY uq_trip_application (trip_id, user_id),
  INDEX idx_applications_status (trip_id, status),
  CONSTRAINT fk_app_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trip_members (
  id VARCHAR(64) PRIMARY KEY,
  trip_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role ENUM('owner','member') NOT NULL DEFAULT 'member',
  status ENUM('active','leave_pending','left','removed','dropped') NOT NULL DEFAULT 'active',
  joined_at DATETIME(3) NOT NULL,
  left_at DATETIME(3),
  leave_reason VARCHAR(255) NOT NULL DEFAULT '',
  last_location_at DATETIME(3),
  deviation_started_at DATETIME(3),
  UNIQUE KEY uq_trip_member (trip_id, user_id),
  INDEX idx_members_user_status (user_id, status),
  CONSTRAINT fk_member_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE locations (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  trip_id VARCHAR(64),
  lng DECIMAL(11,7) NOT NULL,
  lat DECIMAL(10,7) NOT NULL,
  speed DECIMAL(8,2) NOT NULL DEFAULT 0,
  altitude DECIMAL(9,2) NOT NULL DEFAULT 0,
  accuracy DECIMAL(8,2) NOT NULL DEFAULT 0,
  bearing DECIMAL(6,2) NOT NULL DEFAULT 0,
  reported_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  INDEX idx_locations_user_time (user_id, reported_at),
  INDEX idx_locations_trip_time (trip_id, reported_at),
  CONSTRAINT fk_locations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_locations_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
  id VARCHAR(64) PRIMARY KEY,
  conversation_type ENUM('team','private','poi','system') NOT NULL,
  conversation_id VARCHAR(128) NOT NULL,
  sender_id VARCHAR(64),
  message_type ENUM('text','image','voice','location','groupbuy','system','traffic') NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  media_url VARCHAR(1024) NOT NULL DEFAULT '',
  metadata JSON,
  created_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3),
  INDEX idx_messages_conversation (conversation_type, conversation_id, created_at),
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE conversation_members (
  id VARCHAR(64) PRIMARY KEY,
  conversation_type ENUM('team','private','poi') NOT NULL,
  conversation_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'member',
  unread_count INT NOT NULL DEFAULT 0,
  joined_at DATETIME(3) NOT NULL,
  left_at DATETIME(3),
  last_read_at DATETIME(3),
  UNIQUE KEY uq_conversation_member (conversation_type, conversation_id, user_id),
  INDEX idx_conversation_user (user_id, left_at),
  CONSTRAINT fk_conversation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE follows (
  id VARCHAR(64) PRIMARY KEY,
  follower_id VARCHAR(64) NOT NULL,
  target_type ENUM('user','team') NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_follow (follower_id, target_type, target_id),
  CONSTRAINT fk_follow_user FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blocks (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  target_user_id VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_block (user_id, target_user_id),
  CONSTRAINT fk_block_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_block_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE poi_topics (
  id VARCHAR(64) PRIMARY KEY,
  creator_id VARCHAR(64),
  name VARCHAR(200) NOT NULL,
  location_name VARCHAR(500) NOT NULL,
  lng DECIMAL(11,7) NOT NULL,
  lat DECIMAL(10,7) NOT NULL,
  source ENUM('user','traffic_event','platform') NOT NULL DEFAULT 'user',
  event_id VARCHAR(128),
  status ENUM('active','quiet','archived','removed') NOT NULL DEFAULT 'active',
  last_message_at DATETIME(3) NOT NULL,
  archived_at DATETIME(3),
  created_at DATETIME(3) NOT NULL,
  INDEX idx_topics_geo_status (status, lng, lat),
  INDEX idx_topics_last_message (last_message_at),
  CONSTRAINT fk_topic_creator FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE poi_topic_members (
  id VARCHAR(64) PRIMARY KEY,
  topic_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role ENUM('creator','member') NOT NULL DEFAULT 'member',
  followed BOOLEAN NOT NULL DEFAULT FALSE,
  participated BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_topic_member (topic_id, user_id),
  CONSTRAINT fk_topic_member_topic FOREIGN KEY (topic_id) REFERENCES poi_topics(id) ON DELETE CASCADE,
  CONSTRAINT fk_topic_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id VARCHAR(64) PRIMARY KEY,
  merchant_id VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  cover_photo VARCHAR(1024) NOT NULL,
  photos JSON,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL,
  origin_price DECIMAL(10,2) NOT NULL,
  tiers JSON NOT NULL,
  stock INT NOT NULL,
  sold INT NOT NULL DEFAULT 0,
  reserved INT NOT NULL DEFAULT 0,
  valid_hours INT NOT NULL DEFAULT 24,
  max_group_size INT NOT NULL DEFAULT 20,
  max_quantity INT NOT NULL DEFAULT 50,
  status ENUM('draft','on','off','sold_out') NOT NULL DEFAULT 'draft',
  lng DECIMAL(11,7),
  lat DECIMAL(10,7),
  address VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_products_merchant_status (merchant_id, status),
  INDEX idx_products_geo (lng, lat),
  CONSTRAINT chk_product_inventory CHECK (stock >= sold + reserved),
  CONSTRAINT fk_products_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE groupbuy_sessions (
  id VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  creator_id VARCHAR(64) NOT NULL,
  trip_id VARCHAR(64),
  target_people INT NOT NULL,
  joined_people INT NOT NULL DEFAULT 0,
  current_price DECIMAL(10,2) NOT NULL,
  status ENUM('forming','success','failed','cancelled') NOT NULL DEFAULT 'forming',
  expires_at DATETIME(3) NOT NULL,
  success_at DATETIME(3),
  failed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL,
  INDEX idx_sessions_status_expire (status, expires_at),
  CONSTRAINT fk_session_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_session_creator FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_session_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coupons (
  id VARCHAR(64) PRIMARY KEY,
  owner_type ENUM('platform','merchant') NOT NULL,
  owner_id VARCHAR(64),
  name VARCHAR(160) NOT NULL,
  type ENUM('cash','discount','reward','invite') NOT NULL DEFAULT 'cash',
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  threshold_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_rate DECIMAL(5,4),
  total INT NOT NULL,
  issued INT NOT NULL DEFAULT 0,
  used INT NOT NULL DEFAULT 0,
  valid_days INT NOT NULL DEFAULT 30,
  budget_amount DECIMAL(12,2),
  status ENUM('active','paused','ended') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_coupons_owner_status (owner_type, owner_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id VARCHAR(64) PRIMARY KEY,
  order_no VARCHAR(40) NOT NULL UNIQUE,
  user_id VARCHAR(64) NOT NULL,
  merchant_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  coupon_id VARCHAR(64),
  quantity INT NOT NULL DEFAULT 1,
  origin_amount DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending_payment','paid','refund_pending','refunded','verified','closed') NOT NULL DEFAULT 'pending_payment',
  payment_provider VARCHAR(32) NOT NULL DEFAULT 'wechat',
  payment_transaction_id VARCHAR(128),
  verify_code VARCHAR(16) UNIQUE,
  expires_at DATETIME(3),
  paid_at DATETIME(3),
  verified_at DATETIME(3),
  verified_by VARCHAR(64),
  verified_lng DECIMAL(11,7),
  verified_lat DECIMAL(10,7),
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_orders_user_time (user_id, created_at),
  INDEX idx_orders_merchant_status (merchant_id, status),
  INDEX idx_orders_session (session_id),
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_session FOREIGN KEY (session_id) REFERENCES groupbuy_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE groupbuy_members (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  paid_amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','paid','refunded') NOT NULL DEFAULT 'pending',
  joined_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_groupbuy_member (session_id, user_id),
  CONSTRAINT fk_gbm_session FOREIGN KEY (session_id) REFERENCES groupbuy_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_gbm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_gbm_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_events (
  id VARCHAR(64) PRIMARY KEY,
  provider_event_id VARCHAR(128) NOT NULL UNIQUE,
  event_type VARCHAR(80) NOT NULL,
  payload JSON NOT NULL,
  processed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL,
  INDEX idx_payment_events_type (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refunds (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending_review','processing','completed','rejected','failed') NOT NULL DEFAULT 'pending_review',
  provider_refund_id VARCHAR(128),
  reviewed_by VARCHAR(64),
  review_reason VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  reviewed_at DATETIME(3),
  completed_at DATETIME(3),
  INDEX idx_refunds_status_time (status, created_at),
  CONSTRAINT fk_refund_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refund_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE verification_records (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL UNIQUE,
  merchant_id VARCHAR(64) NOT NULL,
  operator_id VARCHAR(64) NOT NULL,
  code VARCHAR(16) NOT NULL,
  lng DECIMAL(11,7),
  lat DECIMAL(10,7),
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_verify_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_verify_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settlements (
  id VARCHAR(64) PRIMARY KEY,
  merchant_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64),
  period_start DATETIME(3) NOT NULL,
  period_end DATETIME(3) NOT NULL,
  gross_amount DECIMAL(12,2) NOT NULL,
  commission_rate DECIMAL(5,4) NOT NULL,
  commission_amount DECIMAL(12,2) NOT NULL,
  net_amount DECIMAL(12,2) NOT NULL,
  status ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  provider_id VARCHAR(128),
  triggered_by VARCHAR(64),
  created_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3),
  INDEX idx_settlements_merchant_status (merchant_id, status),
  CONSTRAINT fk_settlement_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_settlement_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_coupons (
  id VARCHAR(64) PRIMARY KEY,
  coupon_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  source VARCHAR(32) NOT NULL,
  source_ref VARCHAR(128),
  status ENUM('unused','locked','used','expired') NOT NULL DEFAULT 'unused',
  issued_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3),
  order_id VARCHAR(64),
  verify_code VARCHAR(16) UNIQUE,
  INDEX idx_user_coupons_user_status (user_id, status, expires_at),
  CONSTRAINT fk_uc_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE RESTRICT,
  CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uc_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coupon_redemptions (
  id VARCHAR(64) PRIMARY KEY,
  user_coupon_id VARCHAR(64) NOT NULL UNIQUE,
  coupon_id VARCHAR(64) NOT NULL,
  merchant_id VARCHAR(64) NOT NULL,
  operator_id VARCHAR(64) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','processing','settled','failed') NOT NULL DEFAULT 'pending',
  provider_id VARCHAR(128),
  lng DECIMAL(11,7),
  lat DECIMAL(10,7),
  created_at DATETIME(3) NOT NULL,
  settled_at DATETIME(3),
  INDEX idx_coupon_redemption_merchant (merchant_id, status, created_at),
  CONSTRAINT fk_redemption_user_coupon FOREIGN KEY (user_coupon_id) REFERENCES user_coupons(id) ON DELETE RESTRICT,
  CONSTRAINT fk_redemption_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE RESTRICT,
  CONSTRAINT fk_redemption_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invites (
  id VARCHAR(64) PRIMARY KEY,
  inviter_id VARCHAR(64) NOT NULL,
  invitee_id VARCHAR(64) NOT NULL UNIQUE,
  source ENUM('link','qrcode','phone_fallback') NOT NULL,
  source_ref VARCHAR(128),
  status ENUM('registered','first_order','rewarded') NOT NULL DEFAULT 'registered',
  bound_at DATETIME(3) NOT NULL,
  first_order_at DATETIME(3),
  reward_status ENUM('pending','issued','none') NOT NULL DEFAULT 'pending',
  reward_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  INDEX idx_invites_inviter (inviter_id, bound_at),
  CONSTRAINT fk_invite_inviter FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_invite_invitee FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invite_links (
  id VARCHAR(64) PRIMARY KEY,
  inviter_id VARCHAR(64) NOT NULL,
  scene VARCHAR(32) NOT NULL UNIQUE,
  source ENUM('link','qrcode') NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_invite_links_inviter (inviter_id, created_at),
  CONSTRAINT fk_invite_link_inviter FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE growth_rules (
  id VARCHAR(64) PRIMARY KEY,
  rule_key VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  points INT NOT NULL,
  daily_limit INT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE growth_logs (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  rule_key VARCHAR(80) NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  ref_type VARCHAR(40),
  ref_id VARCHAR(64),
  created_at DATETIME(3) NOT NULL,
  INDEX idx_growth_user_time (user_id, created_at),
  CONSTRAINT fk_growth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE support_tickets (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64),
  category VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  status ENUM('open','processing','resolved','closed') NOT NULL DEFAULT 'open',
  priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  assigned_to VARCHAR(64),
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  closed_at DATETIME(3),
  INDEX idx_tickets_status_priority (status, priority, created_at),
  CONSTRAINT fk_ticket_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ticket_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE support_messages (
  id VARCHAR(64) PRIMARY KEY,
  ticket_id VARCHAR(64) NOT NULL,
  sender_type ENUM('user','merchant','ops','system') NOT NULL,
  sender_id VARCHAR(64),
  content TEXT NOT NULL,
  media_urls JSON,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_support_messages (ticket_id, created_at),
  CONSTRAINT fk_support_message_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content VARCHAR(1000) NOT NULL,
  data JSON,
  priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  read_at DATETIME(3),
  created_at DATETIME(3) NOT NULL,
  INDEX idx_notifications_user_read (user_id, read_at, created_at),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE emergency_events (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  trip_id VARCHAR(64),
  lng DECIMAL(11,7) NOT NULL,
  lat DECIMAL(10,7) NOT NULL,
  status ENUM('triggered','acknowledged','resolved') NOT NULL DEFAULT 'triggered',
  contacts_notified BOOLEAN NOT NULL DEFAULT FALSE,
  team_notified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL,
  resolved_at DATETIME(3),
  INDEX idx_emergency_status (status, created_at),
  CONSTRAINT fk_emergency_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_emergency_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE traffic_events (
  id VARCHAR(64) PRIMARY KEY,
  provider_id VARCHAR(128),
  event_type VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  lng DECIMAL(11,7) NOT NULL,
  lat DECIMAL(10,7) NOT NULL,
  severity INT NOT NULL DEFAULT 1,
  starts_at DATETIME(3),
  ends_at DATETIME(3),
  topic_id VARCHAR(64),
  created_at DATETIME(3) NOT NULL,
  INDEX idx_traffic_geo_time (lng, lat, starts_at),
  CONSTRAINT fk_traffic_topic FOREIGN KEY (topic_id) REFERENCES poi_topics(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE system_settings (
  id VARCHAR(64) PRIMARY KEY,
  setting_key VARCHAR(120) NOT NULL UNIQUE,
  value JSON NOT NULL,
  updated_by VARCHAR(64),
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE idempotency_keys (
  id VARCHAR(64) PRIMARY KEY,
  scope VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  response JSON NOT NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_idempotency_scope_key (scope, idempotency_key),
  INDEX idx_idempotency_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_type ENUM('user','admin','system') NOT NULL,
  actor_id VARCHAR(64),
  method VARCHAR(12) NOT NULL,
  path VARCHAR(500) NOT NULL,
  status_code INT NOT NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  metadata JSON,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_audit_actor_time (actor_type, actor_id, created_at),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
