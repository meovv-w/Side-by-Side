const { assert } = require('../lib/errors');

function createMapService({ providers, trips, config }) {
  async function context(userId, query) {
    assert(Number.isFinite(Number(query.lng)) && Number.isFinite(Number(query.lat)), 400, 'MAP_LOCATION_REQUIRED', '地图请求缺少当前位置');
    const center = { lng: Number(query.lng), lat: Number(query.lat) };
    const [platform, services, safety, traffic, weather] = await Promise.all([
      trips.mapSnapshot(userId, query),
      providers.amap.around({ ...center, radius: Number(query.radius || 30000), types: '010000|011100|070000|080000|090000|100000|110000|150900|200300', pageSize: 50 }),
      providers.amap.around({ ...center, radius: Number(query.radius || 30000), types: '090100|090200|090300', keywords: '医院|派出所', pageSize: 30 }),
      providers.amap.trafficAround({ ...center, radius: Math.min(Number(query.radius || 5000), 5000) }),
      query.city ? providers.amap.weather(query.city) : Promise.resolve(null)
    ]);
    const servicePois = normalizePois(services.pois || []);
    return {
      ...platform,
      amap: {
        services: servicePois,
        safety: normalizePois(safety.pois || []),
        traffic,
        weather: weather && weather.lives ? weather.lives[0] : null
      },
      energyReminder: platform.isTripOwner ? energyReminder(servicePois) : null,
      providerMode: config.providerMode
    };
  }

  async function route(payload) {
    return providers.amap.drivingRoute(payload.origin, payload.destination, payload.waypoints || []);
  }

  async function tips(keywords, city) {
    return providers.amap.inputTips(keywords, city);
  }

  async function geocode(address, city) {
    return providers.amap.geocode(address, city);
  }

  function publicConfig() {
    return { amapJsKey: config.amap.jsKey, amapSecurityCode: config.amap.securityCode, providerMode: config.providerMode };
  }

  return { context, route, tips, geocode, publicConfig };
}

function normalizePois(pois) {
  return pois.map(poi => {
    const [lng, lat] = String(poi.location || ',').split(',').map(Number);
    return {
      id: poi.id, name: poi.name, type: poi.type, typecode: poi.typecode, address: poi.address,
      lng, lat, distance: Number(poi.distance || 0), tel: poi.tel || (poi.business && poi.business.tel) || '',
      rating: poi.business && poi.business.rating, photos: poi.photos || []
    };
  });
}

function energyReminder(pois) {
  const candidates = pois.filter(poi => /加油|充电/.test(`${poi.name}${poi.type}`)).sort((a, b) => a.distance - b.distance);
  if (!candidates.length) return null;
  const poi = candidates[0];
  return { title: '前方补能建议', message: `距你约 ${(poi.distance / 1000).toFixed(1)}km 有${poi.name}`, poi };
}

module.exports = { createMapService };
