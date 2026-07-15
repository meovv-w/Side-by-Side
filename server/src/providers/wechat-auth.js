const { AppError, assert } = require('../lib/errors');

class WechatAuthProvider {
  constructor(config, request = fetch) {
    this.config = config;
    this.request = request;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  async createMiniProgramCode({ scene, page, envVersion = 'release', width = 430 }) {
    const accessToken = await this.#getAccessToken();
    const response = await this.request(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene, page, env_version: envVersion, width, check_path: false })
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('application/json')) {
      let result = {};
      try { result = await response.json(); } catch (_) {}
      throw new AppError(502, 'WECHAT_CODE_FAILED', result.errmsg || '微信小程序码生成失败', { providerCode: result.errcode });
    }
    return `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  }

  async #getAccessToken() {
    this.#assertConfigured();
    if (this.accessToken && this.accessTokenExpiresAt > Date.now() + 60000) return this.accessToken;
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.search = new URLSearchParams({ grant_type: 'client_credential', appid: this.config.appId, secret: this.config.appSecret });
    const response = await this.request(url);
    const result = await response.json();
    if (!response.ok || result.errcode || !result.access_token) {
      throw new AppError(502, 'WECHAT_ACCESS_TOKEN_FAILED', result.errmsg || '微信 access_token 获取失败', { providerCode: result.errcode });
    }
    this.accessToken = result.access_token;
    this.accessTokenExpiresAt = Date.now() + Number(result.expires_in || 7200) * 1000;
    return this.accessToken;
  }

  async exchangeCode(code) {
    assert(code, 400, 'WECHAT_CODE_REQUIRED', '缺少微信登录 code');
    this.#assertConfigured();
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.search = new URLSearchParams({
      appid: this.config.appId,
      secret: this.config.appSecret,
      js_code: code,
      grant_type: 'authorization_code'
    });
    const response = await this.request(url);
    const result = await response.json();
    if (!response.ok || result.errcode) {
      throw new AppError(502, 'WECHAT_LOGIN_FAILED', result.errmsg || '微信登录服务调用失败', {
        providerCode: result.errcode
      });
    }
    return {
      openid: result.openid,
      unionid: result.unionid || null,
      sessionKey: result.session_key
    };
  }

  #assertConfigured() {
    if (!this.config.appId || !this.config.appSecret) {
      throw new AppError(503, 'WECHAT_AUTH_NOT_CONFIGURED', '微信登录尚未配置');
    }
  }
}

module.exports = { WechatAuthProvider };
