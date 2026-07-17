const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { assert, AppError } = require('../lib/errors');
const { id, inviteCode, sixDigitCode } = require('../lib/ids');
const { addTime } = require('../lib/time');

function createAuthService({ repository, cache, providers, config, common }) {
  async function sendSmsCode(phone) {
    validatePhone(phone);
    const cooldownKey = `sms:cooldown:${phone}`;
    assert(!(await cache.get(cooldownKey)), 429, 'SMS_TOO_FREQUENT', '验证码发送过于频繁，请稍后再试');
    const code = sixDigitCode();
    await cache.setex(`sms:code:${phone}`, 300, hashCode(phone, code, config.jwtSecret));
    await cache.setex(cooldownKey, 60, '1');
    if (config.allowDevCodes) return { delivery: 'development', expiresIn: 300, devCode: code };
    const delivery = await providers.sms.sendCode(phone, code);
    return { delivery: 'sms', expiresIn: 300, requestId: delivery.requestId };
  }

  async function loginWithSms(phone, code, profile, inviteClaim) {
    validatePhone(phone);
    const stored = await cache.get(`sms:code:${phone}`);
    assert(stored, 400, 'SMS_CODE_EXPIRED', '验证码已失效，请重新获取');
    const actual = hashCode(phone, String(code || ''), config.jwtSecret);
    assert(safeEqual(stored, actual), 400, 'SMS_CODE_INVALID', '验证码不正确');
    await cache.del(`sms:code:${phone}`);
    let user = await repository.findOne('users', { phone });
    if (!user) user = await createUser({ phone, profile, inviteClaim });
    else user = await repository.update('users', user.id, { last_login_at: common.now(), updated_at: common.now() });
    return user;
  }

  async function loginWithWechat(code, profile, inviteClaim) {
    const session = await providers.wechatAuth.exchangeCode(code);
    let user = await repository.findOne('users', { openid: session.openid });
    if (!user) user = await createUser({ openid: session.openid, profile, inviteClaim });
    else user = await repository.update('users', user.id, { last_login_at: common.now(), updated_at: common.now() });
    try { await providers.im.importAccount(user); } catch (error) {
      if (error.code !== 'IM_NOT_CONFIGURED') throw error;
    }
    return user;
  }

  async function bindWechat(userId, code) {
    const user = await common.getUser(userId);
    const session = await providers.wechatAuth.exchangeCode(code);
    const existing = await repository.findOne('users', { openid: session.openid });
    assert(!existing || existing.id === userId, 409, 'WECHAT_ALREADY_BOUND', '该微信账号已绑定其他同路行账号');
    const updated = user.openid === session.openid
      ? user
      : await repository.update('users', userId, { openid: session.openid, updated_at: common.now() });
    try { await providers.im.importAccount(updated); } catch (error) {
      if (error.code !== 'IM_NOT_CONFIGURED') throw error;
    }
    return updated;
  }

  async function createUser({ openid = null, phone = null, profile = {}, inviteClaim = null }) {
    const now = common.now();
    const userId = id('user');
    let created;
    let merchantCouponAward = null;
    await repository.transaction(async tx => {
      const inviter = inviteClaim && inviteClaim.inviterId ? await tx.get('users', inviteClaim.inviterId) : null;
      const inviteSource = inviteClaim && ['qrcode', 'merchant'].includes(inviteClaim.source) ? inviteClaim.source : 'link';
      created = await tx.insert('users', {
        id: userId, openid, phone, nickname: String(profile.nickname || '同路新用户').slice(0, 80),
        avatar: String(profile.avatar || '').slice(0, 1024), role: 'user', owner_cert_status: 'none',
        vehicle_model: '', vehicle_no: '', bio: '', growth: 0, level: 1, credit_score: 5,
        discoverable: true, invite_code: inviteCode(), invited_by: inviter ? inviter.id : null,
        created_at: now, updated_at: now, last_login_at: now
      });
      await tx.insert('user_settings', {
        id: id('settings'), user_id: userId, allow_team_message: true, allow_marketing: false,
        share_location: true, sentinel_mode: true, emergency_name: '', emergency_phone: '', created_at: now, updated_at: now
      });
      if (inviter) {
        await tx.insert('invites', {
          id: id('invite'), inviter_id: inviter.id, invitee_id: userId,
          source: inviteSource, source_ref: inviteClaim.sourceRef || null,
          status: 'registered', bound_at: now, first_order_at: null, reward_status: 'pending', reward_value: 0
        });
        if (inviteSource === 'merchant' && inviteClaim.merchantId) {
          const merchant = await tx.get('merchants', inviteClaim.merchantId);
          if (merchant && merchant.status === 'approved' && merchant.owner_user_id === inviter.id) {
            const coupons = await tx.find('coupons', { owner_type: 'merchant', owner_id: merchant.id, status: 'active' }, { orderBy: ['created_at', 'asc'] });
            const coupon = coupons.find(item => item.type === 'invite' && Number(item.issued) < Number(item.total));
            if (coupon) {
              const instance = await tx.insert('user_coupons', {
                id: id('user_coupon'), coupon_id: coupon.id, user_id: userId, source: 'merchant_promotion',
                source_ref: inviteClaim.sourceRef || merchant.id, status: 'unused', issued_at: now,
                expires_at: addTime(now, Number(coupon.valid_days || 14), 'days'), used_at: null, order_id: null,
                verify_code: `CP${sixDigitCode()}`
              });
              await tx.increment('coupons', coupon.id, { issued: 1 });
              merchantCouponAward = { merchant, coupon, instance };
            }
          }
        }
      }
    });
    if (created.invited_by) {
      await common.awardGrowth(created.invited_by, 'invite_register', '邀请新用户注册', 'user', created.id);
      await common.notify(created.invited_by, 'invite', '邀请成功', `${created.nickname} 已通过你的邀请注册`, { inviteeId: created.id });
    }
    if (merchantCouponAward) await common.notify(
      created.id, 'coupon', '商家拉新券已到账',
      `${merchantCouponAward.merchant.name}“${merchantCouponAward.coupon.name}”已放入券包`,
      { couponId: merchantCouponAward.coupon.id, userCouponId: merchantCouponAward.instance.id, merchantId: merchantCouponAward.merchant.id }
    );
    return created;
  }

  async function adminLogin(account, password) {
    const admin = await repository.findOne('admins', { account: String(account || '').trim() });
    assert(admin && admin.status === 'active', 401, 'ADMIN_LOGIN_INVALID', '账号或密码错误');
    const valid = await bcrypt.compare(String(password || ''), admin.password_hash);
    assert(valid, 401, 'ADMIN_LOGIN_INVALID', '账号或密码错误');
    return repository.update('admins', admin.id, { last_login_at: common.now() });
  }

  function validatePhone(phone) {
    assert(/^1\d{10}$/.test(String(phone || '')), 400, 'PHONE_INVALID', '请输入正确的中国大陆手机号');
  }

  return { sendSmsCode, loginWithSms, loginWithWechat, bindWechat, adminLogin, createUser };
}

function hashCode(phone, code, secret) {
  return crypto.createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

function safeEqual(first, second) {
  try { return crypto.timingSafeEqual(Buffer.from(first), Buffer.from(second)); } catch (_) { return false; }
}

module.exports = { createAuthService };
