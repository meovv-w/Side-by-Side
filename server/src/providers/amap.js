const { AppError, assert } = require('../lib/errors');

class AMapProvider {
  constructor(config, request = fetch, clock = () => Date.now()) {
    this.config = config;
    this.request = request;
    this.clock = clock;
  }

  async drivingRoute(origin, destination, waypoints = []) {
    assert(origin && destination, 400, 'ROUTE_POINTS_REQUIRED', '起点和终点不能为空');
    return this.#get('https://restapi.amap.com/v5/direction/driving', {
      origin: this.#point(origin),
      destination: this.#point(destination),
      waypoints: waypoints.map(point => this.#point(point)).join(';'),
      show_fields: 'cost,navi,polyline'
    });
  }

  async around({ lng, lat, radius = 10000, keywords = '', types = '', pageSize = 30 }) {
    return this.#get('https://restapi.amap.com/v5/place/around', {
      location: `${Number(lng)},${Number(lat)}`,
      radius: String(Math.min(Number(radius), 50000)),
      keywords,
      types,
      page_size: String(Math.min(Number(pageSize), 50)),
      show_fields: 'business,photos,indoor,navi'
    });
  }

  async weather(city) {
    assert(city, 400, 'CITY_REQUIRED', '缺少城市编码');
    return this.#get('https://restapi.amap.com/v3/weather/weatherInfo', {
      city,
      extensions: 'base'
    });
  }

  async inputTips(keywords, city = '') {
    assert(keywords, 400, 'KEYWORDS_REQUIRED', '请输入地点关键词');
    return this.#get('https://restapi.amap.com/v3/assistant/inputtips', { keywords, city, datatype: 'all' });
  }

  async geocode(address, city = '') {
    assert(address, 400, 'ADDRESS_REQUIRED', '请输入地址');
    return this.#get('https://restapi.amap.com/v3/geocode/geo', { address, city });
  }

  async reverseGeocode({ lng, lat }) {
    return this.#get('https://restapi.amap.com/v3/geocode/regeo', {
      location: `${Number(lng)},${Number(lat)}`,
      extensions: 'base'
    });
  }

  async trafficAround({ lng, lat, radius = 5000 }) {
    return this.#get('https://restapi.amap.com/v3/traffic/status/circle', {
      location: `${Number(lng)},${Number(lat)}`,
      radius: String(Math.min(Number(radius), 5000)),
      extensions: 'all'
    });
  }

  async trafficIncidents({ adcode, eventTypes, isExpressway } = {}) {
    assert(/^\d{6}$/.test(String(adcode || '')), 400, 'AMAP_ADCODE_REQUIRED', '交通事件查询缺少城市行政区编码');
    if (!this.config.trafficClientKey || !this.config.trafficSignerUrl) {
      return { code: 1, data: [], unavailable: true, reason: 'AMAP_TRAFFIC_NOT_CONFIGURED' };
    }
    const timestamp = String(this.clock());
    const unsigned = {
      adcode: String(adcode),
      clientKey: this.config.trafficClientKey,
      timestamp,
      eventType: eventTypes === undefined ? this.config.trafficEventTypes : String(eventTypes || ''),
      isExpressway: isExpressway === undefined ? this.config.trafficExpressway : String(isExpressway || '')
    };
    const digest = await this.#trafficDigest(unsigned);
    const url = new URL(this.config.trafficEventUrl || 'https://et-api.amap.com/event/queryByAdcode');
    url.search = new URLSearchParams(Object.fromEntries(
      Object.entries({ ...unsigned, digest }).filter(([, value]) => value !== '')
    ));
    const response = await this.request(url);
    const result = await response.json();
    if (!response.ok || ![0, 1, '0', '1'].includes(result.code) || Number(result.code) !== 1) {
      throw new AppError(502, 'AMAP_TRAFFIC_REQUEST_FAILED', result.msg || '高德交通事件服务调用失败', { providerCode: result.code });
    }
    return result;
  }

  async #trafficDigest(unsigned) {
    const headers = { 'content-type': 'application/json' };
    if (this.config.trafficSignerToken) headers.authorization = `Bearer ${this.config.trafficSignerToken}`;
    const response = await this.request(this.config.trafficSignerUrl, {
      method: 'POST', headers,
      body: JSON.stringify({ provider: 'amap-traffic-incident', endpoint: this.config.trafficEventUrl, params: unsigned })
    });
    let result = null;
    try { result = await response.json(); } catch (_) {}
    const digest = result && (result.digest || result.data && result.data.digest);
    if (!response.ok || !digest) {
      throw new AppError(502, 'AMAP_TRAFFIC_SIGN_FAILED', result && result.message || '高德交通事件动态摘要生成失败');
    }
    return String(digest);
  }

  async #get(endpoint, params) {
    if (!this.config.webKey) throw new AppError(503, 'AMAP_NOT_CONFIGURED', '高德 Web 服务 Key 尚未配置');
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ ...params, key: this.config.webKey });
    const response = await this.request(url);
    const result = await response.json();
    const successful = result.status === '1' || result.errcode === 0;
    if (!response.ok || !successful) {
      throw new AppError(502, 'AMAP_REQUEST_FAILED', result.info || result.errmsg || '高德地图服务调用失败', {
        providerCode: result.infocode || result.errcode
      });
    }
    return result;
  }

  #point(point) {
    assert(Number.isFinite(Number(point.lng)) && Number.isFinite(Number(point.lat)), 400, 'INVALID_COORDINATE', '经纬度格式不正确');
    return `${Number(point.lng)},${Number(point.lat)}`;
  }
}

module.exports = { AMapProvider };
