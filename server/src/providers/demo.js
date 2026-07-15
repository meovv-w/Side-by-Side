const crypto = require('crypto');

class DemoWechatAuth {
  async exchangeCode(code) {
    return { openid: code === 'new-user' ? `demo-${crypto.randomUUID()}` : 'demo-openid-001', unionid: null, sessionKey: 'demo-session-key' };
  }
  async createMiniProgramCode() { return null; }
}

class DemoSms {
  async sendCode() { return { requestId: 'demo-sms', serialNo: 'demo' }; }
  async sendEmergency() { return { requestId: 'demo-emergency-sms', serialNo: 'demo' }; }
}

class DemoMap {
  async drivingRoute(origin, destination, waypoints = []) {
    const points = [origin, ...waypoints, destination];
    return { status: '1', route: { paths: [{ polyline: points.map(point => `${point.lng},${point.lat}`).join(';'), distance: '0', cost: { duration: '0' } }] } };
  }
  async around() { return { status: '1', pois: [] }; }
  async weather() { return { status: '1', lives: [{ weather: '晴', temperature: '22', winddirection: '东', windpower: '2' }] }; }
  async trafficAround() { return { status: '1', trafficinfo: { description: '演示路况畅通', roads: [] } }; }
  async inputTips(keywords) { return { status: '1', tips: [{ id: 'demo-tip', name: keywords, district: '演示区域', location: '120.1551,30.2741' }] }; }
  async geocode(address) { return { status: '1', geocodes: [{ formatted_address: address, location: '120.1551,30.2741' }] }; }
}

class DemoIm {
  userSig(identifier) { return `demo-usersig-${identifier}`; }
  async importAccount() { return { ActionStatus: 'OK' }; }
  async createGroup() { return { ActionStatus: 'OK' }; }
  async addGroupMember() { return { ActionStatus: 'OK' }; }
  async removeGroupMember() { return { ActionStatus: 'OK' }; }
  async sendPrivate() { return { ActionStatus: 'OK' }; }
  async sendGroup() { return { ActionStatus: 'OK' }; }
}

class DemoPay {
  constructor(config) { this.config = { ...config, notifyUrl: config.notifyUrl || 'http://127.0.0.1:8787/api/payments/wechat/notify' }; }
  async createJsapiPayment({ outTradeNo }) {
    return { demo: true, outTradeNo, timeStamp: `${Math.floor(Date.now() / 1000)}`, nonceStr: 'demo', package: `prepay_id=demo_${outTradeNo}`, signType: 'RSA', paySign: 'DEMO_ONLY' };
  }
  async refund({ outRefundNo }) { return { refund_id: `demo_${outRefundNo}`, out_refund_no: outRefundNo, status: 'SUCCESS' }; }
  async profitShare({ outOrderNo }) { return { out_order_no: outOrderNo, state: 'FINISHED' }; }
  verifyCallback(rawBody) { return JSON.parse(rawBody); }
}

class DemoIdentity {
  async ocrVehicleLicense() { return { plate: '浙A8T520', vehicleModel: '比亚迪唐 DM-i', confidence: 0.99, demo: true }; }
  async createLivenessSession(userId) { return { token: `demo-liveness-${userId}`, url: 'demo://liveness', demo: true }; }
  async queryLiveness() { return { passed: true, confidence: 0.99, demo: true }; }
}

class DemoStorage {
  async upload({ buffer, filename, mimetype }) {
    return { key: `demo/${filename}`, url: `data:${mimetype || 'application/octet-stream'};base64,${buffer.toString('base64')}`, demo: true };
  }
}

function createDemoProviders(config) {
  return {
    wechatAuth: new DemoWechatAuth(), sms: new DemoSms(), amap: new DemoMap(), im: new DemoIm(),
    pay: new DemoPay(config.wechat), identity: new DemoIdentity(), storage: new DemoStorage()
  };
}

module.exports = { createDemoProviders };
