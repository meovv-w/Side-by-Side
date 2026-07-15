const path = require('path');
const { AppError, assert } = require('../lib/errors');

class ObjectStorageProvider {
  constructor(config, request = fetch) {
    this.config = config;
    this.request = request;
  }

  async upload({ buffer, filename, mimetype, directory = 'uploads' }) {
    assert(buffer && buffer.length, 400, 'EMPTY_UPLOAD', '上传文件不能为空');
    if (!this.config.uploadUrl || !this.config.publicBaseUrl) {
      throw new AppError(503, 'STORAGE_NOT_CONFIGURED', '对象存储尚未配置');
    }
    const safeName = `${Date.now()}-${path.basename(filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const key = `${directory.replace(/^\/+|\/+$/g, '')}/${safeName}`;
    const form = new FormData();
    form.append('key', key);
    form.append('file', new Blob([buffer], { type: mimetype || 'application/octet-stream' }), safeName);
    const response = await this.request(this.config.uploadUrl, {
      method: 'POST', body: form,
      headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : undefined
    });
    let result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok) {
      throw new AppError(502, 'STORAGE_UPLOAD_FAILED', result.message || '文件上传失败');
    }
    return {
      key: result.key || key,
      url: result.url || `${this.config.publicBaseUrl.replace(/\/$/, '')}/${result.key || key}`
    };
  }
}

module.exports = { ObjectStorageProvider };
