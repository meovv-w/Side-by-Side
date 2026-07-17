const { assert } = require('../lib/errors');
const { id } = require('../lib/ids');
const { dateTime, timestamp } = require('../lib/time');
const { distanceMeters } = require('../lib/geo');

const SERVICE_POI_TYPES = '010100|011100|030000|050000|060200|080504|090100|100000|110209|150900|180300|200300';
const SAFETY_POI_TYPES = '090100|090200|090300|130501';

function createMapService({ providers, trips, chat, repository, config, common }) {
  async function context(userId, query) {
    assert(Number.isFinite(Number(query.lng)) && Number.isFinite(Number(query.lat)), 400, 'MAP_LOCATION_REQUIRED', '地图请求缺少当前位置');
    const center = { lng: Number(query.lng), lat: Number(query.lat) };
    let [location, platform] = await Promise.all([
      locationContext(center, query.city),
      trips.mapSnapshot(userId, query)
    ]);
    const currentRoute = platform.ownTrips && platform.ownTrips[0] && platform.ownTrips[0].route || [];
    const [servicePois, safety, traffic, weather, incidents] = await Promise.all([
      servicesAlongRoute(center, currentRoute, query.poiRadius),
      providers.amap.around({ ...center, radius: Number(query.radius || 30000), types: SAFETY_POI_TYPES, keywords: '医院|派出所', pageSize: 30 }),
      providers.amap.trafficAround({ ...center, radius: Math.min(Number(query.radius || 5000), 5000) }),
      location.city ? providers.amap.weather(location.city) : null,
      trafficIncidents(location.adcode)
    ]);
    const synced = await syncTrafficEvents(incidents.data || []);
    if (synced.length) {
      await chat.createTrafficTopics();
      platform = await trips.mapSnapshot(userId, query);
    }
    return {
      ...platform,
      amap: {
        services: servicePois,
        safety: normalizePois(safety.pois || []),
        traffic,
        incidents: { available: !incidents.unavailable, synced: synced.length, error: incidents.error || null },
        weather: weather && weather.lives ? weather.lives[0] : null,
        city: location.city,
        adcode: location.adcode
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

  async function locationContext(center, requestedCity) {
    const location = await providers.amap.reverseGeocode(center);
    const component = location.regeocode && location.regeocode.addressComponent || {};
    const adcode = /^\d{6}$/.test(String(component.adcode || '')) ? String(component.adcode) : '';
    return { adcode, city: requestedCity || adcode || component.citycode || component.city || '' };
  }

  async function trafficIncidents(adcode) {
    if (!adcode || typeof providers.amap.trafficIncidents !== 'function') return { data: [], unavailable: true };
    try { return await providers.amap.trafficIncidents({ adcode }); } catch (error) {
      return { data: [], unavailable: true, error: { code: error.code || 'AMAP_TRAFFIC_FAILED', message: error.message } };
    }
  }

  async function servicesAlongRoute(center, route, requestedRadius) {
    const radius = Math.min(Math.max(Number(requestedRadius || 12000), 1000), 20000);
    const points = routeSamplePoints(center, route, 6);
    const results = await Promise.all(points.map(point => providers.amap.around({
      ...point, radius, types: SERVICE_POI_TYPES, pageSize: 30
    })));
    const unique = new Map();
    for (const result of results) for (const poi of normalizePois(result.pois || [])) {
      if (!Number.isFinite(poi.lng) || !Number.isFinite(poi.lat)) continue;
      const key = poi.id || `${poi.name}:${poi.lng.toFixed(5)}:${poi.lat.toFixed(5)}`;
      if (unique.has(key)) continue;
      unique.set(key, { ...poi, distance: Math.round(distanceMeters(center, poi)) });
    }
    return [...unique.values()].sort((a, b) => a.distance - b.distance).slice(0, 120);
  }

  async function syncTrafficEvents(items) {
    const synced = [];
    for (const item of items) {
      const normalized = normalizeTrafficEvent(item, common.now());
      if (!normalized) continue;
      const existing = await repository.findOne('traffic_events', { provider_id: normalized.provider_id });
      if (existing) {
        if (existing.source !== 'provider') continue;
        synced.push(await repository.update('traffic_events', existing.id, { ...normalized, topic_id: existing.topic_id, created_at: existing.created_at }));
      } else {
        try {
          synced.push(await repository.insert('traffic_events', { id: id('traffic'), ...normalized, topic_id: null, created_at: common.now() }));
        } catch (error) {
          if (error.code !== 'ER_DUP_ENTRY') throw error;
          const concurrent = await repository.findOne('traffic_events', { provider_id: normalized.provider_id });
          if (concurrent) synced.push(concurrent);
        }
      }
    }
    return synced;
  }
}

function routeSamplePoints(center, route, limit) {
  const valid = (route || []).filter(point => Number.isFinite(Number(point.lng)) && Number.isFinite(Number(point.lat)));
  if (!valid.length) return [center];
  const points = [center];
  const slots = Math.max(1, limit - 1);
  for (let index = 0; index < slots; index += 1) {
    const position = slots === 1 ? valid.length - 1 : Math.round(index * (valid.length - 1) / (slots - 1));
    const point = { lng: Number(valid[position].lng), lat: Number(valid[position].lat) };
    if (!points.some(item => distanceMeters(item, point) < 100)) points.push(point);
  }
  while (points.length < limit) {
    let candidate = null;
    let bestSeparation = 0;
    for (const raw of valid) {
      const point = { lng: Number(raw.lng), lat: Number(raw.lat) };
      const separation = Math.min(...points.map(item => distanceMeters(item, point)));
      if (separation >= 100 && separation > bestSeparation) {
        candidate = point;
        bestSeparation = separation;
      }
    }
    if (!candidate) break;
    const endpoint = valid[valid.length - 1];
    const keepsEndpointLast = distanceMeters(points[points.length - 1], endpoint) < 100;
    if (keepsEndpointLast) points.splice(points.length - 1, 0, candidate);
    else points.push(candidate);
  }
  return points.slice(0, limit);
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

function normalizeTrafficEvent(item, now) {
  const providerId = item.eventID == null ? item.eventId : item.eventID;
  const lng = Number(item.x == null ? item.lng : item.x);
  const lat = Number(item.y == null ? item.lat : item.y);
  if (providerId == null || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const text = `${item.brief || ''}${item.eventDesc || ''}${item.roadName || ''}`;
  const code = Number(item.eventType);
  let eventType = 'traffic';
  let severity = 1;
  if (/事故|碰撞|追尾/.test(text) || code >= 100 && code < 200) { eventType = 'accident'; severity = 3; }
  else if (/施工|养护/.test(text) || code >= 200 && code < 300) { eventType = 'construction'; severity = 2; }
  else if (/封闭|封路|管制|中断/.test(text) || code >= 300 && code < 400) { eventType = 'closure'; severity = 3; }
  const label = { accident: '交通事故', construction: '道路施工', closure: '道路封闭', traffic: '交通事件' }[eventType];
  return {
    provider_id: `amap:${providerId}`, source: 'provider', reporter_id: null, event_type: eventType,
    title: String(item.brief || `${item.roadName || ''}${label}`).trim().slice(0, 200) || label,
    description: String(item.eventDesc || item.brief || `${item.roadName || ''}${label}`).trim().slice(0, 1000),
    lng, lat, severity,
    starts_at: providerDate(item.startTime) || now,
    ends_at: providerDate(item.endTime), status: 'active', reviewed_by: null, review_reason: '', reviewed_at: null
  };
}

function providerDate(value) {
  if (!value) return null;
  const text = String(value).trim().replace(/ (\d):/, ' 0$1:').replace(/:(\d):/, ':0$1:').replace(/:(\d)$/, ':0$1');
  const parsed = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? timestamp(`${text.replace(' ', 'T')}+08:00`)
    : timestamp(text);
  return Number.isFinite(parsed) ? dateTime(parsed) : null;
}

module.exports = { createMapService, normalizeTrafficEvent, routeSamplePoints, SERVICE_POI_TYPES, SAFETY_POI_TYPES };
