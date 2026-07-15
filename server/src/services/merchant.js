const { assert } = require('../lib/errors');
const { id } = require('../lib/ids');
const { pick } = require('../lib/format');
const { encryptText, maskCard } = require('../lib/crypto');
const { timestamp } = require('../lib/time');

function createMerchantService({ repository, common, config }) {
  async function apply(userId, payload) {
    assert(!(await repository.findOne('merchants', { owner_user_id: userId, status: ['pending', 'approved'] })), 409, 'MERCHANT_ALREADY_EXISTS', '你已经提交过商家入驻申请');
    for (const field of ['name', 'phone', 'address', 'licensePhoto']) assert(String(payload[field] || '').trim(), 400, 'MERCHANT_FIELDS_REQUIRED', '店铺名称、电话、地址和营业执照不能为空');
    return repository.insert('merchants', {
      id: id('merchant'), owner_user_id: userId, name: String(payload.name).trim().slice(0, 160),
      phone: String(payload.phone).trim(), address: String(payload.address).trim().slice(0, 500), description: String(payload.description || '').slice(0, 1000),
      lng: payload.lng == null ? null : Number(payload.lng), lat: payload.lat == null ? null : Number(payload.lat),
      business_hours: String(payload.businessHours || '').slice(0, 120), license_photo: payload.licensePhoto,
      qualification_files: payload.qualificationFiles || [], bank_info: protectBankInfo(payload.bankInfo || {}, config), status: 'pending',
      reject_reason: '', level: 'bronze', score: 60, commission_rate: 0.12, reward_pool_enabled: false,
      rescue_enabled: Boolean(payload.rescueEnabled), rescue_services: payload.rescueServices || [], rescue_radius_km: Number(payload.rescueRadiusKm || 0),
      rescue_phone: String(payload.rescuePhone || ''), business_open: true, created_at: common.now(), updated_at: common.now()
    });
  }

  async function resolveMerchant(actor) {
    let merchant = null;
    if (actor.merchantId) merchant = await repository.get('merchants', actor.merchantId);
    if (!merchant && actor.kind === 'user') merchant = await repository.findOne('merchants', { owner_user_id: actor.sub });
    assert(merchant, 403, 'MERCHANT_ACCESS_REQUIRED', '当前账号未关联商家');
    return merchantView(merchant);
  }

  async function dashboard(actor) {
    const merchant = await resolveMerchant(actor);
    const [products, orders, settlements, redemptions, changes] = await Promise.all([
      repository.find('products', { merchant_id: merchant.id }),
      repository.find('orders', { merchant_id: merchant.id }),
      repository.find('settlements', { merchant_id: merchant.id }),
      repository.find('coupon_redemptions', { merchant_id: merchant.id }),
      repository.find('merchant_change_requests', { merchant_id: merchant.id, status: 'pending' })
    ]);
    return {
      merchant,
      stats: {
        productCount: products.length, todayOrders: orders.filter(item => sameDay(item.created_at, new Date())).length,
        pendingVerification: orders.filter(item => item.status === 'paid').length,
        verifiedOrders: orders.filter(item => item.status === 'verified').length,
        grossAmount: sum(orders.filter(item => ['paid', 'verified'].includes(item.status)), 'paid_amount'),
        pendingSettlement: sum(settlements.filter(item => item.status !== 'completed'), 'net_amount'),
        couponRedemptions: redemptions.length,
        pendingProfileChanges: changes.length
      }
    };
  }

  async function requestProfileChange(actor, payload) {
    const merchant = await resolveMerchant(actor);
    const changes = pick(payload, ['name', 'phone', 'address', 'description', 'lng', 'lat', 'business_hours', 'license_photo', 'qualification_files']);
    assert(Object.keys(changes).length, 400, 'NO_CHANGES', '没有需要提交的资料变更');
    return repository.insert('merchant_change_requests', {
      id: id('merchant_change'), merchant_id: merchant.id, changes, status: 'pending', reviewed_by: null,
      review_reason: '', created_at: common.now(), reviewed_at: null
    });
  }

  async function updateBank(actor, bankInfo) {
    const merchant = await resolveMerchant(actor);
    assert(bankInfo && (bankInfo.card || bankInfo.wechatReceiver), 400, 'BANK_INFO_REQUIRED', '请填写收款账户信息');
    return merchantView(await repository.update('merchants', merchant.id, { bank_info: protectBankInfo(bankInfo, config), updated_at: common.now() }));
  }

  async function products(actor) {
    const merchant = await resolveMerchant(actor);
    return repository.find('products', { merchant_id: merchant.id }, { orderBy: ['created_at', 'desc'] });
  }

  async function createProduct(actor, payload) {
    const merchant = await resolveMerchant(actor);
    assert(merchant.status === 'approved', 403, 'MERCHANT_NOT_APPROVED', '商家审核通过后才能发布商品');
    const tiers = validateProduct(payload);
    return repository.insert('products', {
      id: id('product'), merchant_id: merchant.id, name: String(payload.name).trim().slice(0, 200),
      cover_photo: payload.coverPhoto, photos: payload.photos || [], description: String(payload.description || ''),
      category: String(payload.category || '其他').slice(0, 80), origin_price: Number(payload.originPrice), tiers,
      stock: Number(payload.stock), sold: 0, reserved: 0, valid_hours: Number(payload.validHours || 24),
      max_group_size: Number(payload.maxGroupSize || tiers[tiers.length - 1].people), max_quantity: Number(payload.maxQuantity || payload.stock),
      status: payload.publish ? 'on' : 'draft', lng: payload.lng == null ? merchant.lng : Number(payload.lng),
      lat: payload.lat == null ? merchant.lat : Number(payload.lat), address: String(payload.address || merchant.address),
      created_at: common.now(), updated_at: common.now()
    });
  }

  async function updateProduct(actor, productId, payload) {
    const merchant = await resolveMerchant(actor);
    const product = await ownedProduct(merchant.id, productId);
    const mapped = {
      name: payload.name, cover_photo: payload.coverPhoto, photos: payload.photos,
      description: payload.description, category: payload.category, origin_price: payload.originPrice,
      stock: payload.stock, valid_hours: payload.validHours, max_group_size: payload.maxGroupSize,
      max_quantity: payload.maxQuantity, lng: payload.lng, lat: payload.lat, address: payload.address
    };
    const changes = Object.fromEntries(Object.entries(mapped).filter(([, value]) => value !== undefined));
    if (payload.tiers) changes.tiers = validateTiers(payload.tiers, Number(payload.originPrice || product.origin_price));
    if (changes.stock !== undefined) assert(Number(changes.stock) >= Number(product.sold) + Number(product.reserved || 0), 400, 'STOCK_BELOW_SOLD', '库存不能小于已售和预占数量');
    changes.updated_at = common.now();
    return repository.update('products', product.id, changes);
  }

  async function setProductStatus(actor, productId, status) {
    const merchant = await resolveMerchant(actor);
    const product = await ownedProduct(merchant.id, productId);
    assert(['draft', 'on', 'off'].includes(status), 400, 'PRODUCT_STATUS_INVALID', '商品状态不正确');
    assert(merchant.status === 'approved' || status !== 'on', 403, 'MERCHANT_NOT_APPROVED', '商家审核通过后才能上架商品');
    return repository.update('products', product.id, { status, updated_at: common.now() });
  }

  async function orders(actor, status) {
    const merchant = await resolveMerchant(actor);
    const criteria = { merchant_id: merchant.id };
    if (status && status !== 'all') criteria.status = status;
    const rows = await repository.find('orders', criteria, { orderBy: ['created_at', 'desc'] });
    const result = [];
    for (const row of rows) result.push({ ...row, user: await repository.get('users', row.user_id), product: await repository.get('products', row.product_id) });
    return result;
  }

  async function settlements(actor) {
    const merchant = await resolveMerchant(actor);
    const redemptionRows = await repository.find('coupon_redemptions', { merchant_id: merchant.id }, { orderBy: ['created_at', 'desc'] });
    const couponRedemptions = [];
    for (const redemption of redemptionRows) {
      const instance = await repository.get('user_coupons', redemption.user_coupon_id);
      couponRedemptions.push({
        ...redemption,
        coupon: await repository.get('coupons', redemption.coupon_id),
        user: instance ? await repository.get('users', instance.user_id) : null
      });
    }
    return {
      items: await repository.find('settlements', { merchant_id: merchant.id }, { orderBy: ['created_at', 'desc'] }),
      couponRedemptions,
      bankInfo: merchant.bank_info
    };
  }

  async function coupons(actor) {
    const merchant = await resolveMerchant(actor);
    return repository.find('coupons', { owner_type: 'merchant', owner_id: merchant.id }, { orderBy: ['created_at', 'desc'] });
  }

  async function createCoupon(actor, payload) {
    const merchant = await resolveMerchant(actor);
    assert(String(payload.name || '').trim(), 400, 'COUPON_NAME_REQUIRED', '优惠券名称不能为空');
    assert(Number(payload.total) > 0, 400, 'COUPON_TOTAL_INVALID', '优惠券库存必须大于0');
    assert(Number(payload.amount) > 0, 400, 'COUPON_AMOUNT_INVALID', '优惠券面额必须大于0');
    return repository.insert('coupons', {
      id: id('coupon'), owner_type: 'merchant', owner_id: merchant.id, name: String(payload.name || '').trim().slice(0, 160),
      type: payload.type || 'invite', amount: Number(payload.amount), threshold_amount: Number(payload.thresholdAmount || 0),
      discount_rate: payload.discountRate == null ? null : Number(payload.discountRate), total: Number(payload.total), issued: 0, used: 0,
      valid_days: Number(payload.validDays || 14), budget_amount: Number(payload.amount) * Number(payload.total),
      status: 'active', created_at: common.now(), updated_at: common.now()
    });
  }

  async function updateCoupon(actor, couponId, payload) {
    const merchant = await resolveMerchant(actor);
    const coupon = await repository.get('coupons', couponId);
    assert(coupon && coupon.owner_type === 'merchant' && coupon.owner_id === merchant.id, 404, 'COUPON_NOT_FOUND', '商家优惠券不存在');
    const changes = {};
    if (payload.name !== undefined) {
      assert(String(payload.name).trim(), 400, 'COUPON_NAME_REQUIRED', '优惠券名称不能为空');
      changes.name = String(payload.name).trim().slice(0, 160);
    }
    if (payload.amount !== undefined) {
      assert(Number(payload.amount) > 0, 400, 'COUPON_AMOUNT_INVALID', '优惠券面额必须大于0');
      changes.amount = Number(payload.amount);
    }
    if (payload.total !== undefined) {
      assert(Number(payload.total) >= Number(coupon.issued), 400, 'COUPON_TOTAL_BELOW_ISSUED', '优惠券库存不能小于已发放数量');
      changes.total = Number(payload.total);
    }
    if (payload.thresholdAmount !== undefined) changes.threshold_amount = Number(payload.thresholdAmount || 0);
    if (payload.validDays !== undefined) changes.valid_days = Number(payload.validDays || 14);
    if (payload.enabled !== undefined) changes.status = payload.enabled ? 'active' : 'paused';
    const amount = changes.amount == null ? Number(coupon.amount) : changes.amount;
    const total = changes.total == null ? Number(coupon.total) : changes.total;
    changes.budget_amount = amount * total;
    changes.updated_at = common.now();
    return repository.update('coupons', coupon.id, changes);
  }

  async function updatePromotionSettings(actor, payload) {
    const merchant = await resolveMerchant(actor);
    return repository.update('merchants', merchant.id, { reward_pool_enabled: Boolean(payload.rewardPoolEnabled), updated_at: common.now() });
  }

  async function promotion(actor) {
    const merchant = await resolveMerchant(actor);
    const owner = merchant.owner_user_id ? await repository.get('users', merchant.owner_user_id) : null;
    const invites = owner ? await repository.find('invites', { inviter_id: owner.id }) : [];
    return { merchant, promotionCode: owner ? owner.invite_code : null, registered: invites.length, firstOrders: invites.filter(item => ['first_order', 'rewarded'].includes(item.status)).length };
  }

  async function updateRescue(actor, payload) {
    const merchant = await resolveMerchant(actor);
    return repository.update('merchants', merchant.id, {
      rescue_enabled: Boolean(payload.enabled), rescue_services: Array.isArray(payload.services) ? payload.services.slice(0, 12) : merchant.rescue_services || [], rescue_radius_km: Number(payload.radiusKm || 0),
      rescue_phone: String(payload.phone || ''), business_open: payload.businessOpen !== false, updated_at: common.now()
    });
  }

  async function assessment(actor) {
    const merchant = await resolveMerchant(actor);
    const rules = await repository.findOne('system_settings', { setting_key: 'merchant_assessment' });
    const orders = await repository.find('orders', { merchant_id: merchant.id });
    const verified = orders.filter(item => item.status === 'verified').length;
    const complaints = (await repository.find('support_tickets')).filter(item => item.order_id && orders.some(order => order.id === item.order_id)).length;
    return {
      level: merchant.level, score: merchant.score, commissionRate: merchant.commission_rate,
      verificationRate: orders.length ? verified / orders.length : 1,
      complaintRate: orders.length ? complaints / orders.length : 0,
      rules: rules ? rules.value : {}
    };
  }

  async function notifications(actor) {
    const merchant = await resolveMerchant(actor);
    if (!merchant.owner_user_id) return [];
    return repository.find('notifications', { user_id: merchant.owner_user_id }, { orderBy: ['created_at', 'desc'] });
  }

  async function ownedProduct(merchantId, productId) {
    const product = await repository.get('products', productId);
    assert(product && product.merchant_id === merchantId, 404, 'PRODUCT_NOT_FOUND', '商品不存在');
    return product;
  }

  return {
    apply, resolveMerchant, dashboard, requestProfileChange, updateBank, products, createProduct,
    updateProduct, setProductStatus, orders, settlements, coupons, createCoupon, updateCoupon,
    updatePromotionSettings, promotion, updateRescue, assessment, notifications
  };
}

function validateProduct(payload) {
  assert(String(payload.name || '').trim() && payload.coverPhoto, 400, 'PRODUCT_FIELDS_REQUIRED', '商品名称和主图不能为空');
  assert(Number(payload.originPrice) > 0 && Number(payload.stock) > 0, 400, 'PRODUCT_PRICE_STOCK_INVALID', '原价和库存必须大于0');
  return validateTiers(payload.tiers, Number(payload.originPrice));
}

function validateTiers(input, originPrice) {
  assert(Array.isArray(input) && input.length >= 1 && input.length <= 5, 400, 'PRODUCT_TIERS_INVALID', '阶梯价格需设置1至5档');
  const tiers = input.map(item => ({ people: Number(item.people), price: Number(item.price) })).sort((a, b) => a.people - b.people);
  assert(tiers[0].people === 1, 400, 'PRODUCT_FIRST_TIER_INVALID', '第一档必须为1人价格');
  let previousPeople = 0;
  let previousPrice = originPrice + 0.01;
  for (const tier of tiers) {
    assert(Number.isInteger(tier.people) && tier.people > previousPeople && tier.people <= 20, 400, 'PRODUCT_TIER_PEOPLE_INVALID', '阶梯人数必须递增且不超过20');
    assert(tier.price > 0 && tier.price <= previousPrice && tier.price <= originPrice, 400, 'PRODUCT_TIER_PRICE_INVALID', '阶梯价格必须随人数递减且不高于原价');
    previousPeople = tier.people;
    previousPrice = tier.price;
  }
  return tiers;
}

function sum(rows, field) {
  return Math.round(rows.reduce((total, row) => total + Number(row[field] || 0), 0) * 100) / 100;
}

function sameDay(value, date) {
  return new Date(timestamp(value)).toISOString().slice(0, 10) === date.toISOString().slice(0, 10);
}

function protectBankInfo(bankInfo, config) {
  const result = {
    bank: String(bankInfo.bank || ''),
    wechatReceiver: String(bankInfo.wechatReceiver || ''),
    maskedCard: bankInfo.card ? maskCard(bankInfo.card) : String(bankInfo.maskedCard || '')
  };
  if (bankInfo.card) result.cardEncrypted = encryptText(bankInfo.card, config.dataEncryptionKey);
  else if (bankInfo.cardEncrypted) result.cardEncrypted = bankInfo.cardEncrypted;
  return result;
}

function merchantView(merchant) {
  return { ...merchant, bank_info: merchant.bank_info ? {
    bank: merchant.bank_info.bank || '', maskedCard: merchant.bank_info.maskedCard || '',
    wechatReceiver: merchant.bank_info.wechatReceiver || ''
  } : {} };
}

function publicMerchant(merchant) {
  return pick(merchant, [
    'id', 'name', 'phone', 'address', 'description', 'lng', 'lat', 'business_hours',
    'status', 'level', 'score', 'rescue_enabled', 'rescue_services', 'rescue_radius_km', 'rescue_phone', 'business_open'
  ]);
}

module.exports = { createMerchantService, validateTiers, merchantView, publicMerchant };
