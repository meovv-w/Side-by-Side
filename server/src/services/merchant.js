const { assert } = require('../lib/errors');
const { id } = require('../lib/ids');
const { pick } = require('../lib/format');
const { encryptText, maskCard } = require('../lib/crypto');
const { timestamp, dateKey } = require('../lib/time');

function createMerchantService({ repository, common, config, clock = () => Date.now() }) {
  async function apply(userId, payload) {
    assert(!(await repository.findOne('merchants', { owner_user_id: userId, status: ['pending', 'approved'] })), 409, 'MERCHANT_ALREADY_EXISTS', '你已经提交过商家入驻申请');
    for (const field of ['name', 'phone', 'address', 'licensePhoto']) assert(String(payload[field] || '').trim(), 400, 'MERCHANT_FIELDS_REQUIRED', '店铺名称、电话、地址和营业执照不能为空');
    assertPhone(payload.phone, 'MERCHANT_PHONE_INVALID');
    const location = coordinatePair(payload.lng, payload.lat, 'MERCHANT_LOCATION_REQUIRED', '请选择准确的店铺地图位置');
    const qualificationFiles = payload.qualificationFiles || [];
    const rescueServices = payload.rescueServices || [];
    assert(Array.isArray(qualificationFiles), 400, 'MERCHANT_QUALIFICATIONS_INVALID', '商家资质附件格式不正确');
    assert(Array.isArray(rescueServices), 400, 'MERCHANT_RESCUE_SERVICES_INVALID', '救援服务格式不正确');
    const rescueEnabled = Boolean(payload.rescueEnabled);
    const rescueRadius = Number(payload.rescueRadiusKm || 0);
    if (rescueEnabled) validateRescue(rescueServices, rescueRadius, payload.rescuePhone);
    return repository.insert('merchants', {
      id: id('merchant'), owner_user_id: userId, name: String(payload.name).trim().slice(0, 160),
      phone: String(payload.phone).trim(), address: String(payload.address).trim().slice(0, 500), description: String(payload.description || '').slice(0, 1000),
      lng: location.lng, lat: location.lat,
      business_hours: String(payload.businessHours || '').slice(0, 120), license_photo: payload.licensePhoto,
      qualification_files: qualificationFiles.slice(0, 20), bank_info: protectBankInfo(payload.bankInfo || {}, config), status: 'pending',
      reject_reason: '', level: 'bronze', score: 60, commission_rate: 0.12, reward_pool_enabled: false,
      rescue_enabled: rescueEnabled, rescue_services: rescueServices.slice(0, 12), rescue_radius_km: rescueRadius,
      rescue_phone: String(payload.rescuePhone || ''), business_open: true, created_at: common.now(), updated_at: common.now()
    });
  }

  async function resolveMerchant(actor) {
    let merchant = null;
    if (actor.merchantId) merchant = await repository.get('merchants', actor.merchantId);
    if (!merchant && actor.kind === 'user') merchant = await repository.findOne('merchants', { owner_user_id: actor.sub }, { orderBy: ['created_at', 'desc'] });
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
        productCount: products.length, todayOrders: orders.filter(item => sameDay(item.created_at, new Date(clock()))).length,
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
    const mapped = {
      name: payload.name, phone: payload.phone, address: payload.address, description: payload.description,
      lng: payload.lng, lat: payload.lat,
      business_hours: payload.businessHours === undefined ? payload.business_hours : payload.businessHours,
      license_photo: payload.licensePhoto === undefined ? payload.license_photo : payload.licensePhoto,
      qualification_files: payload.qualificationFiles === undefined ? payload.qualification_files : payload.qualificationFiles
    };
    const changes = Object.fromEntries(Object.entries(mapped).filter(([, value]) => value !== undefined));
    assert(Object.keys(changes).length, 400, 'NO_CHANGES', '没有需要提交的资料变更');
    for (const field of ['name', 'phone', 'address']) if (changes[field] !== undefined) {
      changes[field] = String(changes[field]).trim();
      assert(changes[field], 400, 'MERCHANT_FIELDS_REQUIRED', '店铺名称、电话和地址不能为空');
    }
    if (changes.phone !== undefined) assertPhone(changes.phone, 'MERCHANT_PHONE_INVALID');
    if (changes.description !== undefined) changes.description = String(changes.description || '').slice(0, 1000);
    if (changes.business_hours !== undefined) changes.business_hours = String(changes.business_hours || '').slice(0, 120);
    if (changes.qualification_files !== undefined) {
      assert(Array.isArray(changes.qualification_files), 400, 'MERCHANT_QUALIFICATIONS_INVALID', '商家资质附件格式不正确');
      changes.qualification_files = changes.qualification_files.slice(0, 20);
    }
    if (changes.lng !== undefined || changes.lat !== undefined) {
      const location = coordinatePair(changes.lng === undefined ? merchant.lng : changes.lng, changes.lat === undefined ? merchant.lat : changes.lat, 'MERCHANT_LOCATION_INVALID', '店铺地图位置不正确');
      changes.lng = location.lng;
      changes.lat = location.lat;
    }
    return repository.insert('merchant_change_requests', {
      id: id('merchant_change'), merchant_id: merchant.id, changes, status: 'pending', reviewed_by: null,
      review_reason: '', created_at: common.now(), reviewed_at: null
    });
  }

  async function updateBank(actor, bankInfo) {
    const merchant = await resolveMerchant(actor);
    const stored = await repository.get('merchants', merchant.id);
    const previous = stored.bank_info || {};
    const next = {
      bank: bankInfo.bank === undefined ? previous.bank : String(bankInfo.bank || '').trim(),
      wechatReceiver: bankInfo.wechatReceiver === undefined ? previous.wechatReceiver : String(bankInfo.wechatReceiver || '').trim(),
      maskedCard: previous.maskedCard || '', cardEncrypted: previous.cardEncrypted || ''
    };
    const card = String(bankInfo.card || '').replace(/\s/g, '');
    if (card) {
      assert(/^\d{12,30}$/.test(card), 400, 'BANK_CARD_INVALID', '银行卡号格式不正确');
      next.card = card;
    }
    assert(next.card || next.cardEncrypted || next.wechatReceiver, 400, 'BANK_INFO_REQUIRED', '请填写收款账户信息');
    return merchantView(await repository.update('merchants', merchant.id, { bank_info: protectBankInfo(next, config), updated_at: common.now() }));
  }

  async function products(actor) {
    const merchant = await resolveMerchant(actor);
    return repository.find('products', { merchant_id: merchant.id }, { orderBy: ['created_at', 'desc'] });
  }

  async function createProduct(actor, payload) {
    const merchant = await resolveMerchant(actor);
    assert(merchant.status === 'approved', 403, 'MERCHANT_NOT_APPROVED', '商家审核通过后才能发布商品');
    const tiers = validateProduct(payload);
    const location = coordinatePair(payload.lng == null ? merchant.lng : payload.lng, payload.lat == null ? merchant.lat : payload.lat, 'PRODUCT_LOCATION_INVALID', '商品位置坐标不正确');
    return repository.insert('products', {
      id: id('product'), merchant_id: merchant.id, name: String(payload.name).trim().slice(0, 200),
      cover_photo: payload.coverPhoto, photos: payload.photos || [], description: String(payload.description || ''),
      category: String(payload.category || '其他').slice(0, 80), origin_price: Number(payload.originPrice), tiers,
      stock: Number(payload.stock), sold: 0, reserved: 0, valid_hours: Number(payload.validHours || 24),
      max_group_size: Number(payload.maxGroupSize || tiers[tiers.length - 1].people), max_quantity: Number(payload.maxQuantity || payload.stock),
      status: payload.publish ? 'on' : 'draft', lng: location.lng,
      lat: location.lat, address: String(payload.address || merchant.address),
      created_at: common.now(), updated_at: common.now()
    });
  }

  async function updateProduct(actor, productId, payload) {
    const merchant = await resolveMerchant(actor);
    const product = await ownedProduct(merchant.id, productId);
    const candidate = {
      name: payload.name === undefined ? product.name : payload.name,
      coverPhoto: payload.coverPhoto === undefined ? product.cover_photo : payload.coverPhoto,
      originPrice: payload.originPrice === undefined ? product.origin_price : payload.originPrice,
      stock: payload.stock === undefined ? product.stock : payload.stock,
      tiers: payload.tiers === undefined ? product.tiers : payload.tiers,
      validHours: payload.validHours === undefined ? product.valid_hours : payload.validHours,
      maxGroupSize: payload.maxGroupSize === undefined ? product.max_group_size : payload.maxGroupSize,
      maxQuantity: payload.maxQuantity === undefined ? product.max_quantity : payload.maxQuantity
    };
    const validatedTiers = validateProduct(candidate);
    const mapped = {
      name: payload.name, cover_photo: payload.coverPhoto, photos: payload.photos,
      description: payload.description, category: payload.category, origin_price: payload.originPrice,
      stock: payload.stock, valid_hours: payload.validHours, max_group_size: payload.maxGroupSize,
      max_quantity: payload.maxQuantity, lng: payload.lng, lat: payload.lat, address: payload.address
    };
    const changes = Object.fromEntries(Object.entries(mapped).filter(([, value]) => value !== undefined));
    if (changes.name !== undefined) changes.name = String(changes.name).trim().slice(0, 200);
    if (changes.description !== undefined) changes.description = String(changes.description).slice(0, 5000);
    if (changes.category !== undefined) changes.category = String(changes.category).slice(0, 80);
    for (const key of ['origin_price', 'stock', 'valid_hours', 'max_group_size', 'max_quantity']) if (changes[key] !== undefined) changes[key] = Number(changes[key]);
    if (payload.tiers !== undefined || payload.originPrice !== undefined) changes.tiers = validatedTiers;
    if (changes.photos !== undefined) assert(Array.isArray(changes.photos), 400, 'PRODUCT_PHOTOS_INVALID', '商品图片格式不正确');
    if (changes.stock !== undefined) assert(changes.stock >= Number(product.sold) + Number(product.reserved || 0), 400, 'STOCK_BELOW_SOLD', '库存不能小于已售和预占数量');
    if (changes.lng !== undefined || changes.lat !== undefined) {
      const lng = Number(changes.lng === undefined ? product.lng : changes.lng);
      const lat = Number(changes.lat === undefined ? product.lat : changes.lat);
      assert(Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90, 400, 'PRODUCT_LOCATION_INVALID', '商品位置坐标不正确');
      changes.lng = lng;
      changes.lat = lat;
    }
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
    const values = validateCoupon(payload);
    return repository.insert('coupons', {
      id: id('coupon'), owner_type: 'merchant', owner_id: merchant.id, name: String(payload.name || '').trim().slice(0, 160),
      type: payload.type || 'invite', amount: values.amount, threshold_amount: values.thresholdAmount,
      discount_rate: payload.discountRate == null ? null : Number(payload.discountRate), total: values.total, issued: 0, used: 0,
      valid_days: values.validDays, budget_amount: values.amount * values.total,
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
      assert(Number.isInteger(Number(payload.total)) && Number(payload.total) >= Number(coupon.issued), 400, 'COUPON_TOTAL_BELOW_ISSUED', '优惠券库存必须是且不能小于已发放数量的整数');
      changes.total = Number(payload.total);
    }
    if (payload.thresholdAmount !== undefined) {
      assert(Number.isFinite(Number(payload.thresholdAmount)) && Number(payload.thresholdAmount) >= 0, 400, 'COUPON_THRESHOLD_INVALID', '优惠券使用门槛不能小于0');
      changes.threshold_amount = Number(payload.thresholdAmount);
    }
    if (payload.validDays !== undefined) {
      assert(Number.isInteger(Number(payload.validDays)) && Number(payload.validDays) >= 1 && Number(payload.validDays) <= 3650, 400, 'COUPON_VALID_DAYS_INVALID', '优惠券有效期必须为1至3650天');
      changes.valid_days = Number(payload.validDays);
    }
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
    const invites = owner ? await repository.find('invites', { inviter_id: owner.id, source: 'merchant' }) : [];
    return { merchant, promotionCode: owner ? owner.invite_code : null, registered: invites.length, firstOrders: invites.filter(item => ['first_order', 'rewarded'].includes(item.status)).length };
  }

  async function updateRescue(actor, payload) {
    const merchant = await resolveMerchant(actor);
    const enabled = Boolean(payload.enabled);
    const services = Array.isArray(payload.services) ? payload.services.map(value => String(value).trim()).filter(Boolean).slice(0, 12) : merchant.rescue_services || [];
    const radiusKm = Number(payload.radiusKm || 0);
    const phone = String(payload.phone || '').trim();
    if (enabled) validateRescue(services, radiusKm, phone);
    const changes = {
      rescue_enabled: enabled,
      rescue_services: services,
      rescue_radius_km: radiusKm, rescue_phone: phone,
      business_open: payload.businessOpen !== false, updated_at: common.now()
    };
    if (changes.rescue_enabled && !merchant.rescue_enabled) {
      const requests = await repository.find('merchant_change_requests', { merchant_id: merchant.id, status: 'pending' });
      const pending = requests.find(item => item.changes && Object.prototype.hasOwnProperty.call(item.changes, 'rescue_enabled'));
      const request = pending
        ? await repository.update('merchant_change_requests', pending.id, { changes, created_at: common.now() })
        : await repository.insert('merchant_change_requests', {
          id: id('merchant_change'), merchant_id: merchant.id, changes, status: 'pending', reviewed_by: null,
          review_reason: '', created_at: common.now(), reviewed_at: null
        });
      return { ...merchant, rescueReviewStatus: 'pending', rescueRequestId: request.id };
    }
    return repository.update('merchants', merchant.id, changes);
  }

  async function assessment(actor) {
    const merchant = await resolveMerchant(actor);
    const rules = await repository.findOne('system_settings', { setting_key: 'merchant_assessment' });
    const orders = await repository.find('orders', { merchant_id: merchant.id });
    const verified = orders.filter(item => item.status === 'verified').length;
    const complaints = (await repository.find('support_tickets')).filter(item => item.order_id && orders.some(order => order.id === item.order_id)).length;
    const value = rules ? rules.value : {};
    const levels = ['bronze', 'silver', 'gold', 'diamond'];
    const currentIndex = Math.max(0, levels.indexOf(merchant.level));
    const currentLevel = levels[currentIndex];
    const nextLevel = levels[currentIndex + 1] || null;
    const currentRule = value[currentLevel] || {};
    const nextRule = nextLevel ? value[nextLevel] || {} : null;
    const currentMin = Number(currentRule.minScore || 0);
    const nextMin = nextRule ? Number(nextRule.minScore || 100) : 100;
    const progress = nextRule
      ? Math.max(0, Math.min(100, (Number(merchant.score) - currentMin) / Math.max(1, nextMin - currentMin) * 100))
      : 100;
    return {
      level: merchant.level, score: merchant.score, commissionRate: merchant.commission_rate,
      verificationRate: orders.length ? verified / orders.length : 1,
      complaintRate: orders.length ? complaints / orders.length : 0,
      rules: value, currentRule, nextLevel, nextRule, progress
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
  const originPrice = Number(payload.originPrice);
  const stock = Number(payload.stock);
  assert(Number.isFinite(originPrice) && originPrice > 0 && Number.isInteger(stock) && stock > 0, 400, 'PRODUCT_PRICE_STOCK_INVALID', '原价必须大于0，库存必须为正整数');
  const tiers = validateTiers(payload.tiers, originPrice);
  const validHours = Number(payload.validHours || 24);
  const maxGroupSize = Number(payload.maxGroupSize || tiers[tiers.length - 1].people);
  const maxQuantity = Number(payload.maxQuantity || stock);
  assert(Number.isInteger(validHours) && validHours >= 1 && validHours <= 720, 400, 'PRODUCT_VALID_HOURS_INVALID', '拼团有效期必须为1至720小时');
  assert(Number.isInteger(maxGroupSize) && maxGroupSize >= tiers[tiers.length - 1].people && maxGroupSize <= 20, 400, 'PRODUCT_GROUP_SIZE_INVALID', '最大成团人数必须覆盖全部阶梯且不超过20人');
  assert(Number.isInteger(maxQuantity) && maxQuantity >= 1 && maxQuantity <= stock, 400, 'PRODUCT_MAX_QUANTITY_INVALID', '最大可拼数量必须为1至商品库存');
  return tiers;
}

function validateTiers(input, originPrice) {
  assert(Array.isArray(input) && input.length >= 1 && input.length <= 5, 400, 'PRODUCT_TIERS_INVALID', '阶梯价格需设置1至5档');
  const tiers = input.map(item => ({ people: Number(item.people), price: Number(item.price) })).sort((a, b) => a.people - b.people);
  assert(tiers[0].people === 1, 400, 'PRODUCT_FIRST_TIER_INVALID', '第一档必须为1人价格');
  let previousPeople = 0;
  let previousPrice = originPrice + 0.01;
  for (const tier of tiers) {
    assert(Number.isInteger(tier.people) && tier.people > previousPeople && tier.people <= 20, 400, 'PRODUCT_TIER_PEOPLE_INVALID', '阶梯人数必须递增且不超过20');
    assert(tier.price > 0 && tier.price < previousPrice && tier.price <= originPrice, 400, 'PRODUCT_TIER_PRICE_INVALID', '阶梯价格必须随人数递减且不高于原价');
    previousPeople = tier.people;
    previousPrice = tier.price;
  }
  return tiers;
}

function validateCoupon(payload) {
  const amount = Number(payload.amount);
  const total = Number(payload.total);
  const thresholdAmount = Number(payload.thresholdAmount || 0);
  const validDays = Number(payload.validDays == null ? 14 : payload.validDays);
  assert(String(payload.name || '').trim(), 400, 'COUPON_NAME_REQUIRED', '优惠券名称不能为空');
  assert(Number.isFinite(amount) && amount > 0, 400, 'COUPON_AMOUNT_INVALID', '优惠券面额必须大于0');
  assert(Number.isInteger(total) && total > 0, 400, 'COUPON_TOTAL_INVALID', '优惠券库存必须为正整数');
  assert(Number.isFinite(thresholdAmount) && thresholdAmount >= 0, 400, 'COUPON_THRESHOLD_INVALID', '优惠券使用门槛不能小于0');
  assert(Number.isInteger(validDays) && validDays >= 1 && validDays <= 3650, 400, 'COUPON_VALID_DAYS_INVALID', '优惠券有效期必须为1至3650天');
  return { amount, total, thresholdAmount, validDays };
}

function coordinatePair(lngValue, latValue, code, message) {
  const lng = Number(lngValue);
  const lat = Number(latValue);
  assert(Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90, 400, code, message);
  return { lng, lat };
}

function assertPhone(value, code) {
  assert(/^[0-9+()\-\s]{6,30}$/.test(String(value || '').trim()), 400, code, '联系电话格式不正确');
}

function validateRescue(services, radiusKm, phone) {
  assert(Array.isArray(services) && services.length, 400, 'RESCUE_SERVICES_REQUIRED', '启用救援时至少选择一项服务');
  assert(Number.isFinite(radiusKm) && radiusKm > 0 && radiusKm <= 1000, 400, 'RESCUE_RADIUS_INVALID', '救援服务半径必须大于0且不超过1000公里');
  assertPhone(phone, 'RESCUE_PHONE_INVALID');
}

function sum(rows, field) {
  return Math.round(rows.reduce((total, row) => total + Number(row[field] || 0), 0) * 100) / 100;
}

function sameDay(value, date) {
  return dateKey(value) === dateKey(date);
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
