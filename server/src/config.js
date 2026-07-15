const path = require('path');

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function loadConfig(overrides = {}) {
  const env = { ...process.env, ...overrides };
  const config = {
    env: env.NODE_ENV || 'development',
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 8787),
    publicBaseUrl: env.PUBLIC_BASE_URL || 'http://127.0.0.1:8787',
    corsOrigin: env.CORS_ORIGIN || '*',
    jobSecret: env.JOB_SECRET || '',
    jwtSecret: env.JWT_SECRET || 'development-only-secret-change-before-production',
    dataEncryptionKey: env.DATA_ENCRYPTION_KEY || env.JWT_SECRET || 'development-only-data-key',
    dbMode: env.DB_MODE || (env.NODE_ENV === 'test' ? 'memory' : 'mysql'),
    providerMode: env.PROVIDER_MODE || (env.NODE_ENV === 'test' ? 'demo' : 'real'),
    strictProviderConfig: bool(env.STRICT_PROVIDER_CONFIG, env.NODE_ENV === 'production'),
    mysqlUrl: env.MYSQL_URL || 'mysql://tongdao:tongdao_dev@127.0.0.1:3306/tongdao',
    redisUrl: env.REDIS_URL || 'redis://127.0.0.1:6379/0',
    allowDevCodes: bool(env.ALLOW_DEV_CODES, env.NODE_ENV !== 'production'),
    wechat: {
      appId: env.WECHAT_APP_ID || '',
      appSecret: env.WECHAT_APP_SECRET || '',
      mchId: env.WECHAT_MCH_ID || '',
      serialNo: env.WECHAT_MCH_SERIAL_NO || '',
      privateKeyPath: env.WECHAT_MCH_PRIVATE_KEY_PATH ? path.resolve(env.WECHAT_MCH_PRIVATE_KEY_PATH) : '',
      platformCertPath: env.WECHAT_PLATFORM_CERT_PATH ? path.resolve(env.WECHAT_PLATFORM_CERT_PATH) : '',
      platformCertSerial: env.WECHAT_PLATFORM_CERT_SERIAL || '',
      apiV3Key: env.WECHAT_API_V3_KEY || '',
      notifyUrl: env.WECHAT_NOTIFY_URL || ''
    },
    amap: {
      webKey: env.AMAP_WEB_KEY || '',
      jsKey: env.AMAP_JS_KEY || '',
      securityCode: env.AMAP_SECURITY_CODE || ''
    },
    tencent: {
      secretId: env.TENCENT_SECRET_ID || '',
      secretKey: env.TENCENT_SECRET_KEY || '',
      smsAppId: env.TENCENT_SMS_APP_ID || '',
      smsSignName: env.TENCENT_SMS_SIGN_NAME || '',
      smsTemplateId: env.TENCENT_SMS_TEMPLATE_ID || '',
      smsEmergencyTemplateId: env.TENCENT_SMS_EMERGENCY_TEMPLATE_ID || '',
      smsRegion: env.TENCENT_SMS_REGION || 'ap-guangzhou',
      imSdkAppId: env.TENCENT_IM_SDK_APP_ID || '',
      imAdminUser: env.TENCENT_IM_ADMIN_USER || 'administrator',
      imSecretKey: env.TENCENT_IM_SECRET_KEY || ''
    },
    identity: {
      ocrUrl: env.IDENTITY_OCR_URL || '',
      livenessUrl: env.IDENTITY_LIVENESS_URL || '',
      apiKey: env.IDENTITY_API_KEY || ''
    },
    storage: {
      uploadUrl: env.OBJECT_STORAGE_UPLOAD_URL || '',
      publicBaseUrl: env.OBJECT_STORAGE_PUBLIC_BASE_URL || '',
      apiKey: env.OBJECT_STORAGE_API_KEY || ''
    }
  };

  if (config.env === 'production') {
    const missing = [];
    if (config.jwtSecret.length < 32 || config.jwtSecret.includes('development-only')) missing.push('JWT_SECRET');
    if (config.dbMode !== 'mysql') missing.push('DB_MODE=mysql');
    if (!config.mysqlUrl) missing.push('MYSQL_URL');
    if (!config.redisUrl) missing.push('REDIS_URL');
    if (config.providerMode !== 'real') missing.push('PROVIDER_MODE=real');
    if (config.dataEncryptionKey.length < 32 || config.dataEncryptionKey.includes('development-only')) missing.push('DATA_ENCRYPTION_KEY');
    if (!config.jobSecret || config.jobSecret.length < 24) missing.push('JOB_SECRET');
    if (config.corsOrigin === '*') missing.push('CORS_ORIGIN');
    if (config.strictProviderConfig) {
      const required = [
        ['WECHAT_APP_ID', config.wechat.appId], ['WECHAT_APP_SECRET', config.wechat.appSecret],
        ['WECHAT_MCH_ID', config.wechat.mchId], ['WECHAT_MCH_SERIAL_NO', config.wechat.serialNo],
        ['WECHAT_MCH_PRIVATE_KEY_PATH', config.wechat.privateKeyPath], ['WECHAT_PLATFORM_CERT_PATH', config.wechat.platformCertPath],
        ['WECHAT_API_V3_KEY', config.wechat.apiV3Key], ['WECHAT_NOTIFY_URL', config.wechat.notifyUrl],
        ['AMAP_WEB_KEY', config.amap.webKey], ['AMAP_JS_KEY', config.amap.jsKey], ['AMAP_SECURITY_CODE', config.amap.securityCode],
        ['TENCENT_SECRET_ID', config.tencent.secretId], ['TENCENT_SECRET_KEY', config.tencent.secretKey],
        ['TENCENT_SMS_APP_ID', config.tencent.smsAppId], ['TENCENT_SMS_SIGN_NAME', config.tencent.smsSignName], ['TENCENT_SMS_TEMPLATE_ID', config.tencent.smsTemplateId],
        ['TENCENT_SMS_EMERGENCY_TEMPLATE_ID', config.tencent.smsEmergencyTemplateId],
        ['TENCENT_IM_SDK_APP_ID', config.tencent.imSdkAppId], ['TENCENT_IM_SECRET_KEY', config.tencent.imSecretKey],
        ['IDENTITY_OCR_URL', config.identity.ocrUrl], ['IDENTITY_LIVENESS_URL', config.identity.livenessUrl],
        ['IDENTITY_API_KEY', config.identity.apiKey], ['OBJECT_STORAGE_UPLOAD_URL', config.storage.uploadUrl],
        ['OBJECT_STORAGE_PUBLIC_BASE_URL', config.storage.publicBaseUrl], ['OBJECT_STORAGE_API_KEY', config.storage.apiKey]
      ];
      for (const [name, value] of required) if (!value) missing.push(name);
    }
    if (missing.length) throw new Error(`Production configuration missing: ${missing.join(', ')}`);
  }
  return config;
}

module.exports = { loadConfig };
