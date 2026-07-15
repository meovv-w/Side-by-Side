const { AppError, assert } = require('../lib/errors');

class IdentityProvider {
  constructor(config, request = fetch) {
    this.config = config;
    this.request = request;
  }

  async ocrVehicleLicense(imageUrl) {
    assert(imageUrl, 400, 'LICENSE_IMAGE_REQUIRED', '请先上传行驶证照片');
    return this.#post(this.config.ocrUrl, { imageUrl }, 'OCR_NOT_CONFIGURED');
  }

  async createLivenessSession(userId, callbackUrl) {
    return this.#post(this.config.livenessUrl, { action: 'create', userId, callbackUrl }, 'LIVENESS_NOT_CONFIGURED');
  }

  async queryLiveness(token) {
    assert(token, 400, 'LIVENESS_TOKEN_REQUIRED', '缺少活体检测凭证');
    return this.#post(this.config.livenessUrl, { action: 'query', token }, 'LIVENESS_NOT_CONFIGURED');
  }

  async #post(endpoint, payload, code) {
    if (!endpoint || !this.config.apiKey) throw new AppError(503, code, '身份认证服务尚未配置');
    const response = await this.request(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || result.success === false) {
      throw new AppError(502, 'IDENTITY_PROVIDER_ERROR', result.message || '身份认证服务调用失败', {
        providerCode: result.code
      });
    }
    return result.data || result;
  }
}

module.exports = { IdentityProvider };
