const { AppError, assert } = require('../lib/errors');

class AMapProvider {
  constructor(config, request = fetch) {
    this.config = config;
    this.request = request;
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

  async trafficAround({ lng, lat, radius = 5000 }) {
    return this.#get('https://restapi.amap.com/v3/traffic/status/circle', {
      location: `${Number(lng)},${Number(lat)}`,
      radius: String(Math.min(Number(radius), 5000)),
      extensions: 'all'
    });
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
