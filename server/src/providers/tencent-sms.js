const crypto = require('crypto');
const { AppError } = require('../lib/errors');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

class TencentSmsProvider {
  constructor(config, request = fetch, now = () => Date.now()) {
    this.config = config;
    this.request = request;
    this.now = now;
  }

  async sendCode(phone, code) {
    this.#assertConfigured();
    return this.#sendTemplate(phone, this.config.smsTemplateId, [String(code), '5']);
  }

  async sendEmergency(phone, nickname, locationText) {
    this.#assertConfigured('smsEmergencyTemplateId');
    return this.#sendTemplate(phone, this.config.smsEmergencyTemplateId, [String(nickname).slice(0, 20), String(locationText).slice(0, 64)]);
  }

  async #sendTemplate(phone, templateId, parameters) {
    const payload = {
      PhoneNumberSet: [phone.startsWith('+') ? phone : `+86${phone}`],
      SmsSdkAppId: this.config.smsAppId,
      SignName: this.config.smsSignName,
      TemplateId: templateId,
      TemplateParamSet: parameters
    };
    const result = await this.#call('SendSms', payload);
    const status = result.Response && result.Response.SendStatusSet && result.Response.SendStatusSet[0];
    if (!status || status.Code !== 'Ok') {
      throw new AppError(502, 'SMS_SEND_FAILED', (status && status.Message) || '短信发送失败', {
        providerCode: status && status.Code
      });
    }
    return { requestId: result.Response.RequestId, serialNo: status.SerialNo };
  }

  async #call(action, payload) {
    const service = 'sms';
    const host = 'sms.tencentcloudapi.com';
    const timestamp = Math.floor(this.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const body = JSON.stringify(payload);
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
    const signedHeaders = 'content-type;host;x-tc-action';
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256(body)}`;
    const credentialScope = `${date}/${service}/tc3_request`;
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256(canonicalRequest)}`;
    const secretDate = hmac(`TC3${this.config.secretKey}`, date);
    const secretService = hmac(secretDate, service);
    const secretSigning = hmac(secretService, 'tc3_request');
    const signature = hmac(secretSigning, stringToSign, 'hex');
    const authorization = `TC3-HMAC-SHA256 Credential=${this.config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await this.request(`https://${host}`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        Host: host,
        'X-TC-Action': action,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': '2021-01-11',
        'X-TC-Region': this.config.smsRegion || 'ap-guangzhou'
      },
      body
    });
    const result = await response.json();
    if (!response.ok || (result.Response && result.Response.Error)) {
      const error = result.Response && result.Response.Error;
      throw new AppError(502, 'TENCENT_SMS_ERROR', (error && error.Message) || '腾讯云短信调用失败', {
        providerCode: error && error.Code
      });
    }
    return result;
  }

  #assertConfigured(templateField = 'smsTemplateId') {
    const required = ['secretId', 'secretKey', 'smsAppId', 'smsSignName', templateField];
    if (required.some(key => !this.config[key])) {
      throw new AppError(503, 'SMS_NOT_CONFIGURED', '腾讯云短信尚未配置');
    }
  }
}

module.exports = { TencentSmsProvider };
