const crypto = require('crypto');
const fs = require('fs');
const { AppError, assert } = require('../lib/errors');

class WechatPayProvider {
  constructor(config, request = fetch, now = () => Date.now()) {
    this.config = config;
    this.request = request;
    this.now = now;
  }

  async createJsapiPayment({ description, outTradeNo, amountFen, payerOpenid, attach = '', expiresAt }) {
    assert(payerOpenid, 400, 'PAYER_OPENID_REQUIRED', '微信支付需要用户 openid');
    assert(this.config.notifyUrl, 503, 'WECHAT_NOTIFY_URL_REQUIRED', '微信支付回调地址尚未配置');
    const result = await this.#call('POST', '/v3/pay/transactions/jsapi', {
      appid: this.config.appId,
      mchid: this.config.mchId,
      description,
      out_trade_no: outTradeNo,
      notify_url: this.config.notifyUrl,
      attach,
      time_expire: expiresAt ? utcDate(expiresAt).toISOString() : undefined,
      amount: { total: Number(amountFen), currency: 'CNY' },
      payer: { openid: payerOpenid },
      settle_info: { profit_sharing: true }
    });
    const timestamp = String(Math.floor(this.now() / 1000));
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const packageValue = `prepay_id=${result.prepay_id}`;
    return {
      prepayId: result.prepay_id,
      timeStamp: timestamp,
      nonceStr,
      package: packageValue,
      signType: 'RSA',
      paySign: this.#sign(`${this.config.appId}\n${timestamp}\n${nonceStr}\n${packageValue}\n`)
    };
  }

  async queryOrder(outTradeNo) {
    return this.#call('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(this.config.mchId)}`);
  }

  async refund({ outRefundNo, transactionId, outTradeNo, reason, refundFen, totalFen, notifyUrl }) {
    assert(transactionId || outTradeNo, 400, 'PAYMENT_REFERENCE_REQUIRED', '退款缺少支付单号');
    return this.#call('POST', '/v3/refund/domestic/refunds', {
      out_refund_no: outRefundNo,
      transaction_id: transactionId || undefined,
      out_trade_no: transactionId ? undefined : outTradeNo,
      reason,
      notify_url: notifyUrl,
      amount: { refund: Number(refundFen), total: Number(totalFen), currency: 'CNY' }
    });
  }

  async profitShare({ transactionId, outOrderNo, receivers, unfreezeUnsplit = true }) {
    return this.#call('POST', '/v3/profitsharing/orders', {
      appid: this.config.appId,
      transaction_id: transactionId,
      out_order_no: outOrderNo,
      receivers: receivers.map(receiver => ({
        type: receiver.type || 'MERCHANT_ID',
        account: receiver.account,
        amount: Number(receiver.amountFen),
        description: receiver.description || '同路行订单结算'
      })),
      unfreeze_unsplit: Boolean(unfreezeUnsplit)
    });
  }

  async queryProfitShare({ transactionId, outOrderNo }) {
    assert(transactionId && outOrderNo, 400, 'PROFIT_SHARE_REFERENCE_REQUIRED', '分账查询缺少支付单号或分账单号');
    return this.#call(
      'GET',
      `/v3/profitsharing/orders/${encodeURIComponent(outOrderNo)}?transaction_id=${encodeURIComponent(transactionId)}`
    );
  }

  verifyCallback(rawBody, headers) {
    this.#assertConfigured(true);
    const timestamp = headers['wechatpay-timestamp'];
    const nonce = headers['wechatpay-nonce'];
    const signature = headers['wechatpay-signature'];
    const serial = headers['wechatpay-serial'];
    assert(timestamp && nonce && signature, 400, 'INVALID_WECHAT_HEADERS', '微信支付回调签名头不完整');
    assert(Math.abs(Math.floor(this.now() / 1000) - Number(timestamp)) <= 300, 401, 'WECHAT_CALLBACK_EXPIRED', '微信支付回调时间戳已过期');
    const certificate = this.#platformCertificate();
    const expectedSerial = normalizeSerial(this.config.platformCertSerial || certificate.serialNumber);
    assert(serial && normalizeSerial(serial) === expectedSerial, 401, 'WECHAT_CERT_SERIAL_MISMATCH', '微信支付回调证书序列号不匹配');
    const valid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${rawBody}\n`),
      certificate,
      Buffer.from(signature, 'base64')
    );
    if (!valid) throw new AppError(401, 'INVALID_WECHAT_SIGNATURE', '微信支付回调签名验证失败');
    const payload = JSON.parse(rawBody);
    return this.decryptResource(payload.resource);
  }

  decryptResource(resource) {
    this.#assertConfigured();
    assert(resource && resource.ciphertext && resource.nonce, 400, 'INVALID_WECHAT_RESOURCE', '微信支付回调密文不完整');
    const encrypted = Buffer.from(resource.ciphertext, 'base64');
    const authTag = encrypted.subarray(encrypted.length - 16);
    const ciphertext = encrypted.subarray(0, encrypted.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(this.config.apiV3Key), Buffer.from(resource.nonce));
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(resource.associated_data || ''));
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext);
  }

  async #call(method, path, payload) {
    this.#assertConfigured();
    const body = payload ? JSON.stringify(payload) : '';
    const timestamp = String(Math.floor(this.now() / 1000));
    const nonce = crypto.randomBytes(16).toString('hex');
    const signature = this.#sign(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`);
    const authorization = 'WECHATPAY2-SHA256-RSA2048 ' + [
      `mchid="${this.config.mchId}"`,
      `nonce_str="${nonce}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${this.config.serialNo}"`,
      `signature="${signature}"`
    ].join(',');
    const response = await this.request(`https://api.mch.weixin.qq.com${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
        'Content-Type': 'application/json',
        'User-Agent': 'TongDao/1.0'
      },
      body: body || undefined
    });
    const text = await response.text();
    let result = {};
    if (text) {
      try { result = JSON.parse(text); } catch (_) { result = { message: text }; }
    }
    if (!response.ok) {
      throw new AppError(502, 'WECHAT_PAY_ERROR', result.message || '微信支付接口调用失败', {
        providerCode: result.code,
        requestId: response.headers.get('request-id')
      });
    }
    return result;
  }

  #sign(message) {
    return crypto.sign('RSA-SHA256', Buffer.from(message), this.#privateKey()).toString('base64');
  }

  #privateKey() {
    try { return fs.readFileSync(this.config.privateKeyPath, 'utf8'); } catch (error) {
      throw new AppError(503, 'WECHAT_PAY_KEY_UNAVAILABLE', '微信支付商户私钥无法读取');
    }
  }

  #platformCertificate() {
    try { return new crypto.X509Certificate(fs.readFileSync(this.config.platformCertPath, 'utf8')); } catch (error) {
      throw new AppError(503, 'WECHAT_PAY_CERT_UNAVAILABLE', '微信支付平台证书无法读取');
    }
  }

  #assertConfigured(requireCert = false) {
    const fields = ['appId', 'mchId', 'serialNo', 'privateKeyPath', 'apiV3Key'];
    if (fields.some(field => !this.config[field]) || (requireCert && !this.config.platformCertPath)) {
      throw new AppError(503, 'WECHAT_PAY_NOT_CONFIGURED', '微信支付尚未完整配置');
    }
    if (Buffer.byteLength(this.config.apiV3Key) !== 32) {
      throw new AppError(503, 'WECHAT_PAY_INVALID_API_V3_KEY', '微信支付 API v3 密钥必须为 32 字节');
    }
  }
}

module.exports = { WechatPayProvider };

function utcDate(value) {
  const text = String(value);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
}

function normalizeSerial(value) {
  return String(value || '').replace(/[^0-9a-f]/gi, '').replace(/^0+/, '').toUpperCase();
}
