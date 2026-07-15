const { WechatAuthProvider } = require('./wechat-auth');
const { TencentSmsProvider } = require('./tencent-sms');
const { AMapProvider } = require('./amap');
const { TencentImProvider } = require('./tencent-im');
const { WechatPayProvider } = require('./wechat-pay');
const { IdentityProvider } = require('./identity');
const { ObjectStorageProvider } = require('./storage');
const { createDemoProviders } = require('./demo');

function createProviders(config) {
  if (config.providerMode === 'demo') return createDemoProviders(config);
  return {
    wechatAuth: new WechatAuthProvider(config.wechat),
    sms: new TencentSmsProvider(config.tencent),
    amap: new AMapProvider(config.amap),
    im: new TencentImProvider(config.tencent),
    pay: new WechatPayProvider(config.wechat),
    identity: new IdentityProvider(config.identity),
    storage: new ObjectStorageProvider(config.storage)
  };
}

module.exports = { createProviders };
