const test = require('node:test');
const assert = require('node:assert/strict');
const { AMapProvider } = require('../src/providers/amap');
const { normalizeTrafficEvent, routeSamplePoints, SERVICE_POI_TYPES, SAFETY_POI_TYPES } = require('../src/services/maps');

test('AMap commercial traffic request obtains a dynamic digest and forwards authorized parameters', async () => {
  const calls = [];
  const request = async (input, options = {}) => {
    calls.push({ url: String(input), options });
    if (String(input) === 'https://signer.example.test/amap') return response({ digest: 'signed-digest' });
    return response({ code: 1, msg: 'OK', data: [] });
  };
  const provider = new AMapProvider({
    trafficEventUrl: 'https://et-api.amap.com/event/queryByAdcode',
    trafficClientKey: 'authorized-client', trafficSignerUrl: 'https://signer.example.test/amap',
    trafficSignerToken: 'signer-token', trafficEventTypes: '101;201', trafficExpressway: '1'
  }, request, () => 1784016000000);

  const result = await provider.trafficIncidents({ adcode: '330100' });
  assert.equal(result.code, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.authorization, 'Bearer signer-token');
  const unsigned = JSON.parse(calls[0].options.body).params;
  assert.deepEqual(unsigned, {
    adcode: '330100', clientKey: 'authorized-client', timestamp: '1784016000000',
    eventType: '101;201', isExpressway: '1'
  });
  const query = new URL(calls[1].url).searchParams;
  assert.equal(query.get('digest'), 'signed-digest');
  assert.equal(query.get('clientKey'), 'authorized-client');
});

test('traffic event normalization maps official fields and Beijing time correctly', () => {
  const event = normalizeTrafficEvent({
    eventID: 5366913, eventType: 201, brief: '服务区附近正在施工', eventDesc: '右侧车道施工',
    roadName: '测试高速', startTime: '2026-07-17 08:11:00', endTime: '2026-07-17 12:11:00', x: 120.1, y: 30.2
  }, '2026-07-17 00:00:00.000');
  assert.equal(event.provider_id, 'amap:5366913');
  assert.equal(event.event_type, 'construction');
  assert.equal(event.starts_at, '2026-07-17 00:11:00.000');
  assert.equal(event.ends_at, '2026-07-17 04:11:00.000');
  assert.match(SERVICE_POI_TYPES, /030000/);
  assert.match(SERVICE_POI_TYPES, /180300/);
  assert.match(SAFETY_POI_TYPES, /130501/);
});

test('route POI sampling covers the route without duplicating the current position', () => {
  const route = Array.from({ length: 20 }, (_, index) => ({ lng: 120 + index * 0.01, lat: 30 + index * 0.01 }));
  const points = routeSamplePoints({ lng: 120, lat: 30 }, route, 6);
  assert.equal(points.length, 6);
  assert.deepEqual(points[0], { lng: 120, lat: 30 });
  assert.deepEqual(points.at(-1), { lng: 120.19, lat: 30.19 });
});

function response(body, ok = true) {
  return { ok, async json() { return body; } };
}
